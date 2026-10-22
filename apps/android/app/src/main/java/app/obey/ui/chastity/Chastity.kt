package app.obey.ui.chastity

import android.content.Context
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Shower
import androidx.compose.material.icons.outlined.AddAPhoto
import androidx.compose.material.icons.outlined.Key
import androidx.compose.material.icons.outlined.LockClock
import androidx.compose.material.icons.outlined.MoreTime
import androidx.compose.material.icons.outlined.PhotoCamera
import androidx.compose.material.icons.outlined.Shower
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import app.obey.api.ChastityAskInput
import app.obey.api.ChastityDecideInput
import app.obey.api.ChastityEvent
import app.obey.api.ChastityLock
import app.obey.api.ChastityLockInput
import app.obey.api.ChastityPhotoAskInput
import app.obey.api.ChastityTimeInput
import app.obey.api.ChastityView
import app.obey.api.Member
import app.obey.api.ObeyApi
import app.obey.data.Session
import app.obey.data.SessionRepository
import app.obey.ui.common.BaseViewModel
import app.obey.ui.common.Load
import app.obey.ui.common.loadCatching
import app.obey.ui.common.parseInstant
import app.obey.ui.proof.shrinkPhoto
import app.obey.ui.tasks.LabeledSwitch
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.File
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import javax.inject.Inject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody

/** Locks for the dynamic: starting, locking up, time, asks and the sealed keybox photo. Every change reloads the view. */
@HiltViewModel
class ChastityViewModel @Inject constructor(
    private val api: ObeyApi,
    private val sessions: SessionRepository,
    @ApplicationContext private val context: Context,
) : BaseViewModel() {
    val session get() = sessions.session

    private val _state = MutableStateFlow<Load<ChastityView>>(Load.Loading)
    val state: StateFlow<Load<ChastityView>> = _state.asStateFlow()

    fun load() {
        val rel = session?.relationship ?: return
        if (!rel.features.chastity) return
        action { _state.value = loadCatching { api.chastity(rel.id) } }
    }

    private fun change(done: String? = null, block: suspend () -> Unit) = action {
        block()
        _state.value = loadCatching { api.chastity(sessions.requireRelationshipId()) }
        done?.let(::say)
    }

    fun start(input: ChastityLockInput, wearer: String, onDone: () -> Unit) = change("Asked $wearer to lock up") {
        api.startLock(sessions.requireRelationshipId(), input)
        onDone()
    }

    fun lockUp(l: ChastityLock, photo: Uri?, relock: Boolean) = change(if (relock) "Relocked" else "You're locked") {
        if (photo != null) {
            val jpeg = withContext(Dispatchers.Default) { shrinkPhoto(context, photo) }
            api.lockUpWithKeybox(l.id, jpeg.toRequestBody("image/jpeg".toMediaType()))
            context.cacheDir.resolve("proof").listFiles()?.forEach { it.delete() }
        } else api.lockUp(l.id)
    }

    fun end(l: ChastityLock, done: String? = null) = change(done) { api.endLock(l.id) }

    fun time(l: ChastityLock, minutes: Int, note: String) = change(if (minutes > 0) "Added ${fmtMinutes(minutes)}" else "Took off ${fmtMinutes(minutes)}") {
        api.lockTime(l.id, ChastityTimeInput(minutes, note.trim().ifEmpty { null }))
    }

    fun ask(l: ChastityLock, kind: String, minutes: Int?, note: String, keyholder: String) = change("Asked $keyholder") {
        api.chastityAsk(l.id, ChastityAskInput(kind, minutes, note.trim().ifEmpty { null }))
    }

    fun decide(e: ChastityEvent, approve: Boolean, minutes: Int? = null) = change { api.decideChastityAsk(e.id, ChastityDecideInput(approve, minutes)) }

    fun photoAsk(l: ChastityLock, withinMinutes: Int, wearer: String) = change("Asked $wearer") {
        api.chastityPhotoAsk(l.id, ChastityPhotoAskInput(Instant.now().plusSeconds(withinMinutes * 60L).toString(), ZoneId.systemDefault().id))
    }

    suspend fun keybox(l: ChastityLock): ImageBitmap? = runCatching {
        withContext(Dispatchers.IO) {
            val bytes = api.keybox(l.id).bytes()
            BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.asImageBitmap()
        }
    }.getOrNull()
}

/** "2 days 4 hours", "3 hours 10 minutes", "12 minutes": the two largest units. */
fun fmtSpan(totalMinutes: Long): String {
    val m = totalMinutes.coerceAtLeast(0)
    val parts = listOf(m / 1440 to "day", (m % 1440) / 60 to "hour", m % 60 to "minute")
    val first = parts.indexOfFirst { it.first > 0 }
    if (first < 0) return "less than a minute"
    return parts.drop(first).take(2).filter { it.first > 0 }.joinToString(" ") { (n, u) -> "$n $u${if (n == 1L) "" else "s"}" }
}

fun fmtMinutes(minutes: Int) = fmtSpan(kotlin.math.abs(minutes).toLong())

/** Lock-time choices for a consequence or reward; null means it doesn't touch the lock. */
val LOCK_TIME_CHOICES = listOf(60, 180, 360, 720, 1440, 2880, 4320, 10080)

private val timeFmt = DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT)
private fun zoned(iso: String) = parseInstant(iso).atZone(ZoneId.systemDefault())

/** "Sat, Oct 25 at 8:00 PM" */
fun fmtLockTime(iso: String) = zoned(iso).let { "${it.format(DateTimeFormatter.ofPattern("EEE, MMM d"))} at ${it.format(timeFmt)}" }
private fun clock(iso: String) = zoned(iso).format(timeFmt)

/** The current time, ticking every half minute, for the countdowns. */
@Composable
private fun rememberNow(): Long {
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) {
        while (true) {
            delay(30_000)
            now = System.currentTimeMillis()
        }
    }
    return now
}

private data class Lines(val big: String, val small: String, val frac: Float?, val onBreak: Boolean)

private const val MIN = 60_000L
private const val DAY = 1440 * MIN

/** What a lock card says: time left (or locked for, when open-ended or hidden), and the end. */
private fun lockLines(l: ChastityLock, now: Long): Lines {
    val started = l.startedAt?.let { parseInstant(it).toEpochMilli() } ?: now
    val day = (now - started) / DAY + 1
    if (l.status == "break" && l.breakEndsAt != null) {
        val left = parseInstant(l.breakEndsAt).toEpochMilli() - now
        return if (left > 0) Lines("Break: ${fmtSpan(left / MIN)} left", "Relock by ${clock(l.breakEndsAt)}", null, true)
        else Lines("Break is over", "It was due back at ${clock(l.breakEndsAt)}", null, true)
    }
    if (l.endsAt != null) {
        val end = parseInstant(l.endsAt).toEpochMilli()
        val total = maxOf(end - started, MIN)
        val days = maxOf(day, (total + DAY - 1) / DAY)
        return Lines("${fmtSpan((end - now) / MIN)} left", "Until ${fmtLockTime(l.endsAt)} · day $day of $days", ((now - started).toFloat() / total).coerceIn(0f, 1f), false)
    }
    return Lines("Locked ${fmtSpan((now - started) / MIN)}", if (l.timeHidden) "The time left is hidden" else "Until released", null, false)
}

@Composable
private fun Ring(frac: Float?, onBreak: Boolean) {
    val c = MaterialTheme.colorScheme
    Box(Modifier.size(72.dp), contentAlignment = Alignment.Center) {
        CircularProgressIndicator(progress = { frac ?: 0f }, modifier = Modifier.size(72.dp), strokeWidth = 6.dp, trackColor = c.secondaryContainer, gapSize = 0.dp)
        Icon(if (onBreak) Icons.Filled.Shower else Icons.Filled.Lock, null, tint = c.primary)
    }
}

@Composable
private fun LockSummary(l: ChastityLock, who: String) {
    val t = lockLines(l, rememberNow())
    val c = MaterialTheme.colorScheme
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
        Ring(t.frac, t.onBreak)
        Column(Modifier.weight(1f)) {
            Text(who, style = MaterialTheme.typography.bodyMedium, color = c.onSurfaceVariant)
            Text(t.big, style = MaterialTheme.typography.titleLarge)
            Text(t.small, style = MaterialTheme.typography.bodyMedium, color = c.onSurfaceVariant)
        }
    }
}

/** Takes a photo of the keybox code with the camera; the preview stays blurred so the wearer doesn't read it. */
@Composable
private fun KeyboxPicker(photo: Uri?, onPhoto: (Uri) -> Unit) {
    val context = LocalContext.current
    var pending by remember { mutableStateOf<Uri?>(null) }
    val camera = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok -> pending?.takeIf { ok }?.let(onPhoto) }
    fun take() {
        val dir = File(context.cacheDir, "proof").apply { mkdirs() }
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.files", File.createTempFile("keybox", ".jpg", dir))
        pending = uri
        camera.launch(uri)
    }
    if (photo == null) {
        FilledTonalButton(onClick = { take() }, modifier = Modifier.fillMaxWidth()) {
            Icon(Icons.Outlined.AddAPhoto, null)
            Text("Photograph the keybox code", Modifier.padding(start = 8.dp))
        }
    } else {
        val bitmap by produceState<ImageBitmap?>(null, photo) {
            value = withContext(Dispatchers.IO) { runCatching { context.contentResolver.openInputStream(photo).use { BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = 8 }) }?.asImageBitmap() }.getOrNull() }
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            bitmap?.let { Image(it, null, Modifier.size(64.dp).blur(16.dp), contentScale = ContentScale.Crop) }
            Text("Photo taken. It stays hidden from you.", Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
            TextButton(onClick = { take() }) { Text("Retake") }
        }
    }
}

/** The wearer locking up, or relocking after a break. */
@Composable
private fun LockUp(l: ChastityLock, keyholder: String, relock: Boolean, busy: Boolean, vm: ChastityViewModel) {
    var photo by remember { mutableStateOf<Uri?>(null) }
    val keybox = l.keyMode == "keybox"
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        if (keybox) {
            Text(
                "Scramble the keybox to a new code without looking, then photograph it. You won't see the code until you're released. $keyholder can see it any time, and a Red safe call shows it to you at once.",
                style = MaterialTheme.typography.bodyMedium,
            )
            KeyboxPicker(photo) { photo = it }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = { vm.lockUp(l, photo, relock) }, enabled = !busy && (!keybox || photo != null)) {
                Icon(Icons.Filled.Lock, null, Modifier.size(18.dp))
                Text(if (relock) "I've relocked" else "I'm locked", Modifier.padding(start = 8.dp))
            }
            if (!relock) TextButton(onClick = { vm.end(l) }, enabled = !busy) { Text("Not now") }
        }
    }
}

@Composable
private fun Card(container: Boolean = false, content: @Composable () -> Unit) {
    val c = MaterialTheme.colorScheme
    Surface(
        color = if (container) c.secondaryContainer else c.surfaceContainerLow,
        contentColor = if (container) c.onSecondaryContainer else c.onSurface,
        shape = RoundedCornerShape(24.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) { content() }
    }
}

/** A pending ask, for the keyholder to answer. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun AskToAnswer(e: ChastityEvent, l: ChastityLock, wearer: String, busy: Boolean, vm: ChastityViewModel) {
    var changing by remember { mutableStateOf(false) }
    var minutes by remember { mutableStateOf(e.minutes ?: 20) }
    val isBreak = e.kind == "break"
    Card(container = true) {
        Text(if (isBreak) "$wearer asked for a hygiene break" else "$wearer asked to be released", style = MaterialTheme.typography.titleMedium)
        Text(
            if (isBreak) "${e.minutes} minutes, then they relock${if (l.keyMode == "keybox") " and seal a new code" else ""}. The lock's clock keeps running."
            else "Releasing ends the lock now.",
            style = MaterialTheme.typography.bodyMedium,
        )
        e.note?.let { Text("“$it”", style = MaterialTheme.typography.bodyMedium, fontStyle = FontStyle.Italic) }
        if (changing) {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf(10, 15, 20, 30, 45).forEach { m -> FilterChip(selected = minutes == m, onClick = { minutes = m }, label = { Text("$m min") }) }
            }
        }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (isBreak) {
                val m = if (changing) minutes else e.minutes ?: 20
                Button(onClick = { vm.decide(e, true, m) }, enabled = !busy) { Text("Allow $m min") }
                if (!changing) OutlinedButton(onClick = { changing = true }) { Text("Change") }
            } else {
                Button(onClick = { vm.decide(e, true) }, enabled = !busy) { Text("Release") }
            }
            TextButton(onClick = { vm.decide(e, false) }, enabled = !busy) { Text(if (isBreak) "Decline" else "Not yet") }
        }
    }
}

private enum class LockDialog { Add, Remove, Photo, Release, Keybox, AskRelease, AskBreak }

/** One lock, from the side of whoever is looking: the wearer's asks, or the keyholder's controls. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun LockCard(l: ChastityLock, events: List<ChastityEvent>, session: Session, busy: Boolean, vm: ChastityViewModel) {
    val me = session.userId
    val readOnly = session.readOnly
    val wearer = l.wearerId == me
    val keyholder = l.keyholderId == me
    val wearerName = session.nameOf(l.wearerId)
    val keyholderName = session.nameOf(l.keyholderId)
    val asks = events.filter { it.lockId == l.id && it.status == "pending" && (it.kind == "break" || it.kind == "release_ask") }
    fun asked(kind: String) = asks.any { it.kind == kind }
    var dialog by remember { mutableStateOf<LockDialog?>(null) }

    if (l.status == "pending") {
        if (wearer && !readOnly) {
            Card(container = true) {
                val length = l.minutes?.let { " for ${fmtMinutes(it)}" } ?: if (l.timeHidden) "" else " until they release you"
                Text("$keyholderName wants you locked$length", style = MaterialTheme.typography.titleMedium)
                if (l.keyMode == "keyholder") Text("$keyholderName keeps the key. Tap when you're locked.", style = MaterialTheme.typography.bodyMedium)
                LockUp(l, keyholderName, relock = false, busy = busy, vm = vm)
            }
        } else {
            Card {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Icon(Icons.Outlined.LockClock, null, tint = MaterialTheme.colorScheme.primary)
                    Column(Modifier.weight(1f)) {
                        Text(if (keyholder) "Waiting for $wearerName to lock up" else "$wearerName has been asked to lock up", style = MaterialTheme.typography.titleSmall)
                        Text(
                            (l.minutes?.let { "For ${fmtMinutes(it)}" } ?: "Until released") + if (l.keyMode == "keybox") " · keybox" else "",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    if (keyholder && !readOnly) TextButton(onClick = { vm.end(l) }, enabled = !busy) { Text("Take back") }
                }
            }
        }
        return
    }

    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        if (keyholder && !readOnly) asks.forEach { AskToAnswer(it, l, wearerName, busy, vm) }
        Card {
            val onBreak = l.status == "break"
            LockSummary(l, if (wearer) (if (onBreak) "You're on a hygiene break" else "You're locked") else "$wearerName is ${if (onBreak) "on a hygiene break" else "locked"}")
            if (wearer && onBreak && !readOnly) LockUp(l, keyholderName, relock = true, busy = busy, vm = vm)
            if (!readOnly) {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (wearer && l.status == "active") {
                        FilledTonalButton(onClick = { dialog = LockDialog.AskRelease }, enabled = !asked("release_ask")) {
                            Text(if (asked("release_ask")) "Release asked" else "Ask for release")
                        }
                        OutlinedButton(onClick = { dialog = LockDialog.AskBreak }, enabled = !asked("break")) {
                            Icon(Icons.Outlined.Shower, null, Modifier.size(18.dp))
                            Text(if (asked("break")) "Break asked" else "Hygiene break", Modifier.padding(start = 8.dp))
                        }
                    }
                    if (keyholder) {
                        if (l.endsAt != null) {
                            FilledTonalButton(onClick = { dialog = LockDialog.Add }) {
                                Icon(Icons.Outlined.MoreTime, null, Modifier.size(18.dp))
                                Text("Add time", Modifier.padding(start = 8.dp))
                            }
                            OutlinedButton(onClick = { dialog = LockDialog.Remove }) { Text("Take off time") }
                        }
                        if (l.status == "active") {
                            TextButton(onClick = { dialog = LockDialog.Photo }) {
                                Icon(Icons.Outlined.PhotoCamera, null, Modifier.size(18.dp))
                                Text("Ask for a photo", Modifier.padding(start = 8.dp))
                            }
                        }
                        TextButton(onClick = { dialog = LockDialog.Release }) { Text("Release") }
                    }
                    if (l.canSeeKeybox) {
                        TextButton(onClick = { dialog = LockDialog.Keybox }) {
                            Icon(Icons.Outlined.Key, null, Modifier.size(18.dp))
                            Text("Show keybox code", Modifier.padding(start = 8.dp))
                        }
                    }
                }
            }
            if (wearer && asks.isNotEmpty()) Text("Waiting for $keyholderName to answer.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }

    val close = { dialog = null }
    when (dialog) {
        LockDialog.Add -> TimeDialog(1, close) { m, note -> vm.time(l, m, note); close() }
        LockDialog.Remove -> TimeDialog(-1, close) { m, note -> vm.time(l, m, note); close() }
        LockDialog.Photo -> PhotoAskDialog(wearerName, close) { m -> vm.photoAsk(l, m, wearerName); close() }
        LockDialog.Release -> AlertDialog(
            onDismissRequest = close,
            title = { Text("Release $wearerName?") },
            text = { Text("The lock ends now${if (l.keyMode == "keybox") " and $wearerName can see the keybox code" else ""}.") },
            confirmButton = { TextButton(onClick = { vm.end(l, "Released"); close() }) { Text("Release") } },
            dismissButton = { TextButton(onClick = close) { Text("Keep locked") } },
        )
        LockDialog.Keybox -> KeyboxDialog(l, vm, close)
        LockDialog.AskRelease -> AskDialog("release", l, keyholderName, close) { m, note -> vm.ask(l, "release", m, note, keyholderName); close() }
        LockDialog.AskBreak -> AskDialog("break", l, keyholderName, close) { m, note -> vm.ask(l, "break", m, note, keyholderName); close() }
        null -> {}
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun TimeDialog(sign: Int, onDismiss: () -> Unit, onSave: (Int, String) -> Unit) {
    var minutes by remember { mutableStateOf(1440) }
    var note by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (sign > 0) "Add time" else "Take off time") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf(60, 360, 1440, 4320).forEach { m -> FilterChip(selected = minutes == m, onClick = { minutes = m }, label = { Text(fmtMinutes(m)) }) }
                }
                OutlinedTextField(note, { note = it.take(500) }, label = { Text("Why (optional)") }, singleLine = true)
            }
        },
        confirmButton = { Button(onClick = { onSave(sign * minutes, note) }) { Text("${if (sign > 0) "Add" else "Take off"} ${fmtMinutes(minutes)}") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun PhotoAskDialog(wearer: String, onDismiss: () -> Unit, onAsk: (Int) -> Unit) {
    var minutes by remember { mutableStateOf(60) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Ask for a photo") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("Within", style = MaterialTheme.typography.titleSmall)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf(30, 60, 180).forEach { m -> FilterChip(selected = minutes == m, onClick = { minutes = m }, label = { Text(fmtMinutes(m)) }) }
                }
                Text("$wearer gets a task with photo proof, and you approve it. Missing it counts like any missed task.", style = MaterialTheme.typography.bodySmall)
            }
        },
        confirmButton = { Button(onClick = { onAsk(minutes) }) { Text("Ask") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun AskDialog(kind: String, l: ChastityLock, keyholder: String, onDismiss: () -> Unit, onAsk: (Int?, String) -> Unit) {
    var minutes by remember { mutableStateOf(20) }
    var note by remember { mutableStateOf("") }
    val isBreak = kind == "break"
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (isBreak) "Ask for a hygiene break" else "Ask to be released") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                if (isBreak) {
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        listOf(10, 20, 30).forEach { m -> FilterChip(selected = minutes == m, onClick = { minutes = m }, label = { Text("$m minutes") }) }
                    }
                    Text(
                        "The lock's clock keeps running. When the break is over, you relock${if (l.keyMode == "keybox") " and seal a new code" else ""}.",
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
                OutlinedTextField(note, { note = it.take(500) }, label = { Text("Tell $keyholder why (optional)") })
            }
        },
        confirmButton = { Button(onClick = { onAsk(if (isBreak) minutes else null, note) }) { Text("Ask $keyholder") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

@Composable
private fun KeyboxDialog(l: ChastityLock, vm: ChastityViewModel, onDismiss: () -> Unit) {
    val image by produceState<Load<ImageBitmap>>(Load.Loading, l.id) { value = vm.keybox(l)?.let { Load.Ready(it) } ?: Load.Failed("The photo couldn't load.") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Keybox code") },
        text = {
            Box(Modifier.fillMaxWidth().heightIn(min = 160.dp), contentAlignment = Alignment.Center) {
                when (val i = image) {
                    Load.Loading -> CircularProgressIndicator()
                    is Load.Failed -> Text(i.message)
                    is Load.Ready -> Image(i.value, "Keybox code", Modifier.fillMaxWidth(), contentScale = ContentScale.Fit)
                }
            }
        },
        confirmButton = { Button(onClick = onDismiss) { Text("Close") } },
    )
}

/** The keyholder asking to lock someone. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun StartLockDialog(wearers: List<Member>, busy: Boolean, onDismiss: () -> Unit, onStart: (ChastityLockInput, String) -> Unit) {
    var wearerId by remember { mutableStateOf(wearers.first().userId) }
    var timed by remember { mutableStateOf(true) }
    var minutes by remember { mutableStateOf(3 * 1440) }
    var hide by remember { mutableStateOf(false) }
    var keybox by remember { mutableStateOf(false) }
    val name = wearers.first { it.userId == wearerId }.displayName
    val c = MaterialTheme.colorScheme
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Lock $name") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                if (wearers.size > 1) {
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        wearers.forEach { w -> FilterChip(selected = w.userId == wearerId, onClick = { wearerId = w.userId }, label = { Text(w.displayName) }) }
                    }
                }
                Text("For how long", style = MaterialTheme.typography.titleSmall)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(selected = timed, onClick = { timed = true }, label = { Text("Set time") })
                    FilterChip(selected = !timed, onClick = { timed = false }, label = { Text("Until I release") })
                }
                if (timed) {
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        listOf(1440, 3 * 1440, 7 * 1440, 14 * 1440).forEach { m -> FilterChip(selected = minutes == m, onClick = { minutes = m }, label = { Text(fmtMinutes(m)) }) }
                    }
                    Text(
                        "Unlocks about ${fmtLockTime(Instant.now().plusSeconds(minutes * 60L).toString())}, counted from when $name locks up.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = c.onSurfaceVariant,
                    )
                }
                Text("Who has the key?", style = MaterialTheme.typography.titleSmall)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(selected = !keybox, onClick = { keybox = false }, label = { Text("I keep it") })
                    FilterChip(selected = keybox, onClick = { keybox = true }, label = { Text("Keybox") })
                }
                Text(
                    if (keybox) "$name scrambles the keybox code without looking and seals a photo of it. You can see it any time; $name sees it when released."
                    else "You keep the physical key.",
                    style = MaterialTheme.typography.bodySmall,
                )
                if (timed) LabeledSwitch("Hide the time left from $name", "$name sees only that they're locked", hide) { hide = it }
                Text(
                    "You can add or take off time later, and consequences and rewards can too. A Red safe call always shows $name the keybox code.",
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        },
        confirmButton = {
            Button(
                onClick = { onStart(ChastityLockInput(wearerId, if (timed) minutes else null, timed && hide, if (keybox) "keybox" else "keyholder"), name) },
                enabled = !busy,
            ) { Text("Ask $name to lock up") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

/** One line of a lock's history: title, and the time added or taken off when the viewer may see it. */
fun eventText(e: ChastityEvent, wearer: String): Pair<String, String?> = when (e.kind) {
    "started" -> (e.minutes?.let { "Locked for ${fmtMinutes(it)}" } ?: "Locked") to null
    "time" -> (e.note ?: when { e.minutes == null -> "Time changed"; e.minutes > 0 -> "Time added"; else -> "Time taken off" }) to
        e.minutes?.let { "${if (it > 0) "+" else "−"}${fmtMinutes(it)}" }
    "release_ask" -> "$wearer asked to be released${when (e.status) { "declined" -> ": not yet"; "approved" -> ": released"; else -> "" }}" to null
    "break" -> "Hygiene break, ${e.minutes} min${when (e.status) { "pending" -> " (asked)"; "declined" -> ": declined"; "overdue" -> ": not relocked in time"; else -> "" }}" to null
    "photo_ask" -> "Photo asked for" to null
    "relocked" -> (e.note?.let { "Relocked, ${it.lowercase()}" } ?: "Relocked") to null
    else -> (e.note ?: "Released") to null
}

/** For a consequence or reward: how much time it adds to or takes off their lock, or none. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun LockTimeField(label: String, value: Int?, onChange: (Int?) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(label, style = MaterialTheme.typography.titleSmall)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(selected = value == null, onClick = { onChange(null) }, label = { Text("None") })
            LOCK_TIME_CHOICES.forEach { m -> FilterChip(selected = value == m, onClick = { onChange(m) }, label = { Text(fmtMinutes(m)) }) }
        }
    }
}
