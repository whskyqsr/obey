package app.obey.ui.chastity

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.height
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.sp
import app.obey.ui.common.Eyebrow
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
import app.obey.ui.common.Button
import androidx.compose.material3.CircularProgressIndicator
import app.obey.ui.common.TonalButton
import app.obey.ui.common.ChoiceChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import app.obey.ui.common.LettersField
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

private data class Lines(val big: String, val small: String)

private const val MIN = 60_000L

/** "3d 4h", "5h 20m", "12m": the big serif clock. */
fun fmtClock(ms: Long): String {
    val m = maxOf(0L, Math.round(ms / 60_000.0))
    val d = m / 1440
    val h = (m % 1440) / 60
    return when {
        d > 0 -> "${d}d ${h}h"
        h > 0 -> "${h}h ${m % 60}m"
        else -> "${m % 60}m"
    }
}

/** "Thu 1:00 AM" */
fun fmtWhen(iso: String) = zoned(iso).let { "${it.format(DateTimeFormatter.ofPattern("EEE"))} ${it.format(timeFmt)}" }

/** The big clock and the line under it: time left, or time locked so far when there's no end the viewer can see. */
private fun lockLines(l: ChastityLock, now: Long, wearer: String): Lines {
    val started = l.startedAt?.let { parseInstant(it).toEpochMilli() } ?: now
    if (l.status == "break" && l.breakEndsAt != null) {
        val left = parseInstant(l.breakEndsAt).toEpochMilli() - now
        return if (left > 0) Lines(fmtClock(left), "hygiene break · relock by ${clock(l.breakEndsAt)}")
        else Lines("Relock", "the break ended at ${clock(l.breakEndsAt)}")
    }
    if (l.endsAt != null) {
        return Lines(fmtClock(parseInstant(l.endsAt).toEpochMilli() - now), "until ${fmtWhen(l.endsAt)}" + if (l.hideTime) " · hidden from $wearer" else "")
    }
    return Lines(fmtClock(now - started), if (l.timeHidden) "locked so far · the time left is hidden" else "locked so far · until released")
}

/** What the page header says about a lock: an eyebrow for the wearer, a line for everyone else. */
fun lockHeading(l: ChastityLock, me: String, nameOf: (String) -> String): Pair<String?, String?> {
    if (l.wearerId == me) return (l.startedAt?.let { "Locked since ${fmtWhen(it)}" + if (l.keyMode == "keybox") " · keybox" else "" }) to null
    val state = when (l.status) { "break" -> "is on a hygiene break"; "pending" -> "has been asked to lock"; else -> "is locked" }
    val key = if (l.keyholderId == me) (if (l.keyMode == "keybox") " · you hold the keybox code" else " · you hold the key") else ""
    return null to "${nameOf(l.wearerId)} $state$key."
}

/** The outlined button in ink, the second action beside the filled one. */
@Composable
fun InkOutlinedButton(onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true, content: @Composable androidx.compose.foundation.layout.RowScope.() -> Unit) {
    val c = MaterialTheme.colorScheme
    OutlinedButton(
        onClick = onClick,
        modifier = modifier,
        enabled = enabled,
        shape = MaterialTheme.shapes.small,
        colors = androidx.compose.material3.ButtonDefaults.outlinedButtonColors(contentColor = c.onSurface),
        border = androidx.compose.foundation.BorderStroke(1.dp, if (enabled) c.onSurface else c.outlineVariant),
        content = content,
    )
}

@Composable
private fun LockClock(l: ChastityLock, wearer: String, page: Boolean) {
    val t = lockLines(l, rememberNow(), wearer)
    val c = MaterialTheme.colorScheme
    Column(Modifier.fillMaxWidth(), horizontalAlignment = if (page) Alignment.CenterHorizontally else Alignment.Start) {
        Text(t.big, style = MaterialTheme.typography.displayLarge.copy(fontSize = if (page) 88.sp else 44.sp, lineHeight = if (page) 92.sp else 48.sp), color = c.onSurface)
        Text(t.small, style = MaterialTheme.typography.bodyMedium, color = c.onSurfaceVariant, modifier = Modifier.padding(top = 8.dp))
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
        Button(onClick = { take() }) {
            Icon(Icons.Outlined.PhotoCamera, null, Modifier.size(18.dp))
            Text("Take the photo", Modifier.padding(start = 8.dp))
        }
    } else {
        val bitmap by produceState<ImageBitmap?>(null, photo) {
            value = withContext(Dispatchers.IO) { runCatching { context.contentResolver.openInputStream(photo).use { BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = 8 }) }?.asImageBitmap() }.getOrNull() }
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            bitmap?.let { Image(it, null, Modifier.size(64.dp).blur(16.dp), contentScale = ContentScale.Crop) }
            Text("Sealed. It stays hidden from you.", Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            InkOutlinedButton(onClick = { take() }) { Text("Retake") }
        }
    }
}

/** A bordered prompt on paper, such as an ask to answer or a keybox step. */
@Composable
private fun LockBox(content: @Composable androidx.compose.foundation.layout.ColumnScope.() -> Unit) {
    val c = MaterialTheme.colorScheme
    val shape = RoundedCornerShape(8.dp)
    Column(
        Modifier.fillMaxWidth().clip(shape).border(1.dp, c.outlineVariant, shape).background(c.surfaceContainerLowest).padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        content = content,
    )
}

/** The wearer locking up, or relocking after a break: the keybox steps (mockup 96), then "I'm locked". */
@Composable
private fun LockUp(l: ChastityLock, keyholder: String, relock: Boolean, busy: Boolean, vm: ChastityViewModel) {
    var photo by remember { mutableStateOf<Uri?>(null) }
    val keybox = l.keyMode == "keybox"
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        if (keybox) {
            LockBox {
                Eyebrow("Step 1")
                Text("Scramble the keybox code without looking.", style = MaterialTheme.typography.bodyLarge)
            }
            LockBox {
                Eyebrow("Step 2")
                Text("Photograph the code. It's sealed straight away: only $keyholder can see it, until the lock ends or you call red.", style = MaterialTheme.typography.bodyLarge)
                KeyboxPicker(photo) { photo = it }
            }
        }
        Button(onClick = { vm.lockUp(l, photo, relock) }, enabled = !busy && (!keybox || photo != null), modifier = Modifier.fillMaxWidth().padding(top = 12.dp).height(48.dp)) {
            Text(if (relock) "I've relocked" else "I'm locked")
        }
        if (!relock) {
            TextButton(onClick = { vm.end(l) }, enabled = !busy, modifier = Modifier.fillMaxWidth().height(48.dp)) {
                Text("Not now", color = MaterialTheme.colorScheme.onSurface)
            }
        }
    }
}

/** A pending ask, for the keyholder to answer (mockup 78). */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun AskToAnswer(e: ChastityEvent, l: ChastityLock, wearer: String, busy: Boolean, vm: ChastityViewModel) {
    var changing by remember { mutableStateOf(false) }
    var minutes by remember { mutableStateOf(e.minutes ?: 20) }
    val isBreak = e.kind == "break"
    LockBox {
        Text(
            androidx.compose.ui.text.buildAnnotatedString {
                append(if (isBreak) "$wearer asks for a " else "$wearer asks to be ")
                withStyle(androidx.compose.ui.text.SpanStyle(fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold)) { append(if (isBreak) "hygiene break" else "released") }
                append(if (isBreak) ", ${e.minutes} minutes." else ".")
            },
            style = MaterialTheme.typography.bodyLarge,
        )
        e.note?.let { Text("“$it”", style = MaterialTheme.typography.bodyMedium, fontStyle = FontStyle.Italic, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        if (changing) {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf(10, 15, 20, 30, 45).forEach { m -> ChoiceChip(selected = minutes == m, onClick = { minutes = m }, label = { Text("$m min") }) }
            }
        }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (isBreak) {
                Button(onClick = { vm.decide(e, true, if (changing) minutes else e.minutes ?: 20) }, enabled = !busy) { Text(if (changing) "Allow $minutes min" else "Allow") }
                if (!changing) InkOutlinedButton(onClick = { changing = true }) { Text("Change") }
            } else {
                Button(onClick = { vm.decide(e, true) }, enabled = !busy) { Text("Release") }
            }
            InkOutlinedButton(onClick = { vm.decide(e, false) }, enabled = !busy) { Text("Not now") }
        }
    }
}

private enum class LockDialog { Add, Remove, Photo, Release, Keybox, AskRelease, AskBreak }

/**
 * One lock, from the side of whoever is looking (mockups 27, 78, 96): the big clock, any ask to answer, the sealed
 * keybox, and the wearer's asks or the keyholder's controls in outlined buttons over an ink Release.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun LockCard(l: ChastityLock, events: List<ChastityEvent>, session: Session, busy: Boolean, vm: ChastityViewModel, page: Boolean = true) {
    val me = session.userId
    val readOnly = session.readOnly
    val wearer = l.wearerId == me
    val keyholder = l.keyholderId == me
    val wearerName = session.nameOf(l.wearerId)
    val keyholderName = session.nameOf(l.keyholderId)
    val asks = events.filter { it.lockId == l.id && it.status == "pending" && (it.kind == "break" || it.kind == "release_ask") }
    fun asked(kind: String) = asks.any { it.kind == kind }
    var dialog by remember { mutableStateOf<LockDialog?>(null) }
    val c = MaterialTheme.colorScheme

    if (l.status == "pending") {
        if (wearer && !readOnly) {
            Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Text("$keyholderName asked you to lock.", style = if (page) MaterialTheme.typography.headlineLarge else MaterialTheme.typography.headlineMedium)
                val length = l.minutes?.let { "For ${fmtMinutes(it)}" } ?: if (l.timeHidden) "For a time" else "Until released"
                Text(
                    length + (if (l.keyMode == "keybox") ", keybox." else ", $keyholderName keeps the key.") + if (l.timeHidden) " The time left will be hidden from you." else "",
                    style = MaterialTheme.typography.bodyLarge,
                    color = c.onSurfaceVariant,
                )
                LockUp(l, keyholderName, relock = false, busy = busy, vm = vm)
            }
        } else {
            Column {
                androidx.compose.material3.HorizontalDivider(color = c.outlineVariant)
                Row(Modifier.padding(vertical = 12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Column(Modifier.weight(1f)) {
                        Text(if (keyholder) "Waiting for $wearerName to lock up" else "$wearerName has been asked to lock up", style = MaterialTheme.typography.bodyLarge)
                        Text(
                            (l.minutes?.let { "For ${fmtMinutes(it)}" } ?: "Until released") + if (l.keyMode == "keybox") " · keybox" else "",
                            style = MaterialTheme.typography.bodySmall,
                            color = c.onSurfaceVariant,
                        )
                    }
                    if (keyholder && !readOnly) InkOutlinedButton(onClick = { vm.end(l) }, enabled = !busy) { Text("Take back") }
                }
                androidx.compose.material3.HorizontalDivider(color = c.outlineVariant)
            }
        }
        return
    }

    Column(verticalArrangement = Arrangement.spacedBy(20.dp)) {
        val onBreak = l.status == "break"
        LockClock(l, wearerName, page)
        if (keyholder && !readOnly) asks.forEach { AskToAnswer(it, l, wearerName, busy, vm) }
        if (wearer && l.hasKeybox && !l.canSeeKeybox) {
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).border(1.dp, c.outlineVariant, RoundedCornerShape(8.dp)).background(c.surfaceContainerLowest).padding(16.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                Box(Modifier.size(64.dp).clip(RoundedCornerShape(4.dp)).background(c.outlineVariant).blur(3.dp))
                Column {
                    Text("Keybox code is sealed.", style = MaterialTheme.typography.bodyLarge)
                    Text("Only $keyholderName can see it until the lock ends.", style = MaterialTheme.typography.bodyMedium, color = c.onSurfaceVariant)
                }
            }
        }
        if (wearer && onBreak && !readOnly) LockUp(l, keyholderName, relock = true, busy = busy, vm = vm)
        if (!readOnly) {
            if (wearer && l.status == "active") {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    InkOutlinedButton(onClick = { dialog = LockDialog.AskBreak }, enabled = !asked("break"), modifier = Modifier.fillMaxWidth().height(48.dp)) {
                        Text(if (asked("break")) "Hygiene break asked" else "Ask for a hygiene break")
                    }
                    InkOutlinedButton(onClick = { dialog = LockDialog.AskRelease }, enabled = !asked("release_ask"), modifier = Modifier.fillMaxWidth().height(48.dp)) {
                        Text(if (asked("release_ask")) "Release asked" else "Ask to be released")
                    }
                }
            }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (keyholder && l.endsAt != null) {
                    InkOutlinedButton(onClick = { dialog = LockDialog.Add }) { Text("Add time") }
                    InkOutlinedButton(onClick = { dialog = LockDialog.Remove }) { Text("Take off time") }
                }
                if (keyholder && l.status == "active") InkOutlinedButton(onClick = { dialog = LockDialog.Photo }) { Text("Ask for a photo") }
                if (l.canSeeKeybox) InkOutlinedButton(onClick = { dialog = LockDialog.Keybox }) { Text("Show keybox code") }
            }
            if (keyholder) Button(onClick = { dialog = LockDialog.Release }) { Text("Release") }
        }
        if (wearer && asks.isNotEmpty()) Text("Waiting for $keyholderName to answer.", style = MaterialTheme.typography.bodySmall, color = c.onSurfaceVariant)
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

/** On Today: a line per running lock that opens the Chastity page, with the clock on the right. */
@Composable
fun LockLine(l: ChastityLock, session: Session, onOpen: () -> Unit) {
    val c = MaterialTheme.colorScheme
    val wearerName = session.nameOf(l.wearerId)
    val t = lockLines(l, rememberNow(), wearerName)
    val onBreak = l.status == "break"
    Column {
        androidx.compose.material3.HorizontalDivider(color = c.outlineVariant)
        Row(Modifier.fillMaxWidth().clickable(onClick = onOpen).padding(vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(
                    if (l.wearerId == session.userId) (if (onBreak) "You're on a hygiene break" else "You're locked") else "$wearerName is ${if (onBreak) "on a hygiene break" else "locked"}",
                    style = MaterialTheme.typography.bodyLarge,
                )
                Text(t.small, style = MaterialTheme.typography.bodyMedium, color = c.onSurfaceVariant)
            }
            Text(t.big, style = MaterialTheme.typography.headlineLarge.copy(fontSize = 28.sp))
        }
        androidx.compose.material3.HorizontalDivider(color = c.outlineVariant)
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
                    listOf(60, 360, 1440, 4320).forEach { m -> ChoiceChip(selected = minutes == m, onClick = { minutes = m }, label = { Text(fmtMinutes(m)) }) }
                }
                LettersField(note, { note = it.take(500) }, label = { Text("Why (optional)") }, singleLine = true)
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
                    listOf(30, 60, 180).forEach { m -> ChoiceChip(selected = minutes == m, onClick = { minutes = m }, label = { Text(fmtMinutes(m)) }) }
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
                        listOf(10, 20, 30).forEach { m -> ChoiceChip(selected = minutes == m, onClick = { minutes = m }, label = { Text("$m minutes") }) }
                    }
                    Text(
                        "The lock's clock keeps running. When the break is over, you relock${if (l.keyMode == "keybox") " and seal a new code" else ""}.",
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
                LettersField(note, { note = it.take(500) }, label = { Text("Tell $keyholder why (optional)") })
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

/** The keyholder asking to lock someone (mockup 79): a sheet with lengths, hiding the time, and who has the key. */
@OptIn(ExperimentalLayoutApi::class, androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
fun StartLockDialog(wearers: List<Member>, busy: Boolean, onDismiss: () -> Unit, onStart: (ChastityLockInput, String) -> Unit) {
    var wearerId by remember { mutableStateOf(wearers.first().userId) }
    var minutes by remember { mutableStateOf<Int?>(3 * 1440) }
    var hide by remember { mutableStateOf(false) }
    var keybox by remember { mutableStateOf(false) }
    val name = wearers.first { it.userId == wearerId }.displayName
    val c = MaterialTheme.colorScheme
    androidx.compose.material3.ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = c.surface,
        sheetState = androidx.compose.material3.rememberModalBottomSheetState(skipPartiallyExpanded = true),
    ) {
        Column(Modifier.verticalScroll(rememberScrollState()).padding(horizontal = 24.dp).padding(bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Text("Lock $name", style = MaterialTheme.typography.headlineLarge)
            if (wearers.size > 1) {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    wearers.forEach { w -> ChoiceChip(selected = w.userId == wearerId, onClick = { wearerId = w.userId }, label = { Text(w.displayName) }) }
                }
            }
            Text("For how long", style = MaterialTheme.typography.bodyMedium, color = c.onSurfaceVariant)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf(1440, 3 * 1440, 7 * 1440, 14 * 1440).forEach { m -> ChoiceChip(selected = minutes == m, onClick = { minutes = m }, label = { Text(fmtMinutes(m)) }) }
                ChoiceChip(selected = minutes == null, onClick = { minutes = null }, label = { Text("Until I release") })
            }
            if (minutes != null) {
                Column {
                    LabeledSwitch("Hide the time left from $name", null, hide) { hide = it }
                    androidx.compose.material3.HorizontalDivider(color = c.outlineVariant, modifier = Modifier.padding(top = 12.dp))
                }
            }
            Column {
                Text("Who has the key?", style = MaterialTheme.typography.bodyMedium, color = c.onSurfaceVariant)
                listOf(false to ("I keep it" to null), true to ("Keybox" to "$name scrambles the code without looking and photographs it. Only you see the photo.")).forEach { (k, t) ->
                    Row(Modifier.fillMaxWidth().clickable { keybox = k }.padding(vertical = 12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                        app.obey.ui.common.Diamond(if (keybox == k) app.obey.ui.common.DiamondState.Done else app.obey.ui.common.DiamondState.Open, size = 14.dp)
                        Column(Modifier.weight(1f)) {
                            Text(t.first, style = MaterialTheme.typography.bodyLarge)
                            t.second?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = c.onSurfaceVariant) }
                        }
                    }
                    androidx.compose.material3.HorizontalDivider(color = c.outlineVariant)
                }
            }
            Text("$name taps “I'm locked” to start the clock. Asks lapse after 7 days.", style = MaterialTheme.typography.bodyMedium, color = c.onSurfaceVariant)
            Button(
                onClick = { onStart(ChastityLockInput(wearerId, minutes, minutes != null && hide, if (keybox) "keybox" else "keyholder"), name) },
                enabled = !busy,
                modifier = Modifier.fillMaxWidth().height(48.dp),
            ) { Text("Ask $name to lock") }
        }
    }
}

/** One line of a lock's history: what happened, and any reason given. */
fun eventText(e: ChastityEvent, wearer: String): Pair<String, String?> = when (e.kind) {
    "started" -> (e.minutes?.let { "Locked for ${fmtMinutes(it)}" } ?: "Locked") to null
    "time" -> (e.minutes?.let { "${if (it > 0) "+" else "−"}${fmtMinutes(it)}" } ?: "Time changed") to e.note
    "release_ask" -> "$wearer asked to be released${when (e.status) { "declined" -> ": not yet"; "approved" -> ": released"; else -> "" }}" to e.note
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
            ChoiceChip(selected = value == null, onClick = { onChange(null) }, label = { Text("None") })
            LOCK_TIME_CHOICES.forEach { m -> ChoiceChip(selected = value == m, onClick = { onChange(m) }, label = { Text(fmtMinutes(m)) }) }
        }
    }
}
