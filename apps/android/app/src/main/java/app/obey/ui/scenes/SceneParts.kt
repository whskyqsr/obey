package app.obey.ui.scenes

import android.graphics.BitmapFactory
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.HealthAndSafety
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import app.obey.api.AFTERCARE
import app.obey.api.ObeyApi
import app.obey.api.Scene
import app.obey.api.SceneInput
import app.obey.data.Session
import app.obey.ui.common.Avatar
import app.obey.ui.common.MoodPicker
import app.obey.ui.common.formatDateTime
import app.obey.ui.common.local
import app.obey.ui.common.moodIcon
import app.obey.ui.common.moodLabel
import app.obey.ui.common.parseInstant
import java.time.Instant
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** "Wed 22 Oct, 21:00", in the viewer's time. */
internal fun whenOf(s: Scene): String = formatDateTime(s.occurredAt)

internal fun sceneName(s: Scene): String = s.title.ifBlank { "Untitled scene" }

/** "Sam", "Sam and Alex". */
internal fun andList(names: List<String>): String = names.joinToString(" and ")

/** Members' pictures for the scene screens, fetched once each. */
internal class AvatarLoader(private val api: ObeyApi) {
    private val cache = mutableMapOf<String, ImageBitmap>()

    suspend fun load(userId: String, version: String): ImageBitmap? {
        val key = "$userId@$version"
        cache[key]?.let { return it }
        return runCatching {
            withContext(Dispatchers.IO) {
                val bytes = api.avatar(userId, version).bytes()
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.asImageBitmap()
            }
        }.getOrNull()?.also { cache[key] = it }
    }
}

/** Someone in the dynamic as a small avatar. */
@Composable
internal fun Person(userId: String, session: Session, avatars: AvatarLoader, size: Dp = 24.dp) {
    val m = session.relationship?.members?.firstOrNull { it.userId == userId }
    Avatar(userId, m?.displayName ?: session.nameOf(userId), m?.avatarVersion, avatars::load, size = size)
}

/** "Yellow called" / "Red called", or nothing. */
@Composable
internal fun SafewordBadge(safeword: String) {
    if (safeword != "yellow" && safeword != "red") return
    val c = MaterialTheme.colorScheme
    val red = safeword == "red"
    Surface(color = if (red) c.errorContainer else c.tertiaryContainer, contentColor = if (red) c.onErrorContainer else c.onTertiaryContainer, shape = MaterialTheme.shapes.large) {
        Row(Modifier.height(28.dp).padding(horizontal = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Outlined.HealthAndSafety, null, Modifier.size(16.dp))
            Spacer(Modifier.width(4.dp))
            Text(if (red) "Red called" else "Yellow called", style = MaterialTheme.typography.labelLarge)
        }
    }
}

/** A read-only chip, like the web's outlined ones. */
@Composable
internal fun Tag(text: String, color: Color = MaterialTheme.colorScheme.onSurfaceVariant) {
    Surface(color = Color.Transparent, contentColor = color, shape = MaterialTheme.shapes.small, border = BorderStroke(1.dp, color.copy(alpha = 0.4f))) {
        Text(text, style = MaterialTheme.typography.labelLarge, modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp))
    }
}

/** Aftercare or needs as a row of chips; [lead] goes first, like the safeword badge. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun Tags(items: List<String>, color: Color = MaterialTheme.colorScheme.onSurfaceVariant, lead: (@Composable () -> Unit)? = null) {
    if (items.isEmpty() && lead == null) return
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        lead?.invoke()
        items.forEach { Tag(it, color) }
    }
}

/** A mood's face and word. */
@Composable
internal fun MoodMark(mood: Int, size: Dp = 18.dp) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(moodIcon(mood, filled = true), null, Modifier.size(size), tint = MaterialTheme.colorScheme.primary)
        Spacer(Modifier.width(4.dp))
        Text(moodLabel(mood), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

/** Aftercare to pick from: the usual ones plus anything already chosen, and "Other" for the rest. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun AftercarePicker(value: List<String>, onChange: (List<String>) -> Unit) {
    var adding by remember { mutableStateOf(false) }
    var text by remember { mutableStateOf("") }
    val options = AFTERCARE + value.filter { it !in AFTERCARE }
    fun add() {
        val t = text.trim()
        if (t.isNotEmpty() && t !in value) onChange(value + t)
        text = ""
        adding = false
    }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            options.forEach { a ->
                FilterChip(selected = a in value, onClick = { onChange(if (a in value) value - a else value + a) }, label = { Text(a) })
            }
            if (!adding && value.size < 20) {
                FilterChip(
                    selected = false,
                    onClick = { adding = true },
                    label = { Text("Other") },
                    leadingIcon = { Icon(Icons.Outlined.Add, null, Modifier.size(FilterChipDefaults.IconSize)) },
                )
            }
        }
        if (adding) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    text,
                    { text = it.take(60) },
                    label = { Text("Other") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                    keyboardActions = KeyboardActions(onDone = { add() }),
                    modifier = Modifier.weight(1f),
                )
                TextButton(onClick = ::add) { Text("Add") }
            }
        }
    }
}

private val SAFEWORDS = listOf("none" to "None", "yellow" to "Yellow", "red" to "Red")
private val dayFmt = DateTimeFormatter.ofPattern("EEE d MMM yyyy")
private val timeFmt = DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT)

/** Logging a scene, or changing [scene]. Kept short: only when is needed. [others] are asked to add their side of a new one. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun SceneSheet(scene: Scene?, others: List<String>, busy: Boolean, onDismiss: () -> Unit, onSave: (SceneInput) -> Unit) {
    var title by remember { mutableStateOf(scene?.title ?: "") }
    var at by remember { mutableStateOf(scene?.let { parseInstant(it.occurredAt).local().toLocalDateTime() } ?: LocalDateTime.now().withSecond(0).withNano(0)) }
    var what by remember { mutableStateOf(scene?.what ?: "") }
    var safeword by remember { mutableStateOf(scene?.safeword ?: "none") }
    var aftercare by remember { mutableStateOf(scene?.aftercare ?: emptyList()) }
    var picking by remember { mutableStateOf<String?>(null) }
    fun save() = onSave(
        SceneInput(
            title = title.trim(),
            occurredAt = at.atZone(ZoneId.systemDefault()).toInstant().toString(),
            // Where it happened: this phone's zone for a new scene, and kept when changing one.
            timezone = scene?.timezone ?: ZoneId.systemDefault().id,
            what = what.trim(),
            safeword = safeword,
            aftercare = aftercare,
        ),
    )

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(
            Modifier.imePadding().verticalScroll(rememberScrollState()).padding(start = 24.dp, end = 24.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Icon(Icons.Outlined.AutoAwesome, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(if (scene == null) "Log a scene" else "Edit scene", style = MaterialTheme.typography.headlineSmall)
            OutlinedTextField(title, { title = it.take(120) }, label = { Text("Name (optional)") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("When", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { picking = "date" }, modifier = Modifier.weight(1f)) { Text(at.format(dayFmt), maxLines = 1) }
                    OutlinedButton(onClick = { picking = "time" }) { Text(at.format(timeFmt), maxLines = 1) }
                }
            }
            OutlinedTextField(what, { what = it.take(4000) }, label = { Text("What we did (optional)") }, minLines = 3, modifier = Modifier.fillMaxWidth())
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Safeword", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                    SAFEWORDS.forEachIndexed { i, (v, label) ->
                        SegmentedButton(selected = safeword == v, onClick = { safeword = v }, shape = SegmentedButtonDefaults.itemShape(i, SAFEWORDS.size)) { Text(label) }
                    }
                }
            }
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Aftercare given", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                AftercarePicker(aftercare) { aftercare = it }
            }
            if (scene == null && others.isNotEmpty()) {
                Text(
                    "${andList(others)} ${if (others.size == 1) "is" else "are"} asked to add their side. You each see the other's once you've both written.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End)) {
                TextButton(onClick = onDismiss) { Text("Cancel") }
                Button(onClick = ::save, enabled = !busy) { Text("Save") }
            }
        }
    }

    when (picking) {
        "date" -> {
            val state = rememberDatePickerState(initialSelectedDateMillis = at.toLocalDate().atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli())
            DatePickerDialog(
                onDismissRequest = { picking = null },
                confirmButton = {
                    TextButton(onClick = {
                        // DatePicker reports midnight UTC of the chosen day.
                        state.selectedDateMillis?.let { at = Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate().atTime(at.toLocalTime()) }
                        picking = null
                    }) { Text("OK") }
                },
                dismissButton = { TextButton(onClick = { picking = null }) { Text("Cancel") } },
            ) { DatePicker(state = state) }
        }
        "time" -> {
            val state = rememberTimePickerState(initialHour = at.hour, initialMinute = at.minute)
            AlertDialog(
                onDismissRequest = { picking = null },
                text = { TimePicker(state = state) },
                confirmButton = {
                    TextButton(onClick = {
                        at = at.toLocalDate().atTime(LocalTime.of(state.hour, state.minute))
                        picking = null
                    }) { Text("OK") }
                },
                dismissButton = { TextButton(onClick = { picking = null }) { Text("Cancel") } },
            )
        }
    }
}

/** "How are you feeling after last night?": a mood, and a note if you like. Used on a scene and on Today. */
@Composable
internal fun SceneCheckIn(busy: Boolean, onSave: (mood: Int, note: String) -> Unit) {
    var mood by remember { mutableStateOf<Int?>(null) }
    var note by remember { mutableStateOf("") }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        MoodPicker(mood, { mood = it })
        mood?.let { m ->
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(note, { note = it.take(500) }, label = { Text("Anything to add (optional)") }, modifier = Modifier.weight(1f))
                Button(onClick = { onSave(m, note.trim()) }, enabled = !busy) { Text("Save") }
            }
        }
    }
}

/** A tappable surface card, as the scene list uses. */
@Composable
internal fun SceneSurface(modifier: Modifier = Modifier, onClick: (() -> Unit)? = null, content: @Composable () -> Unit) {
    Surface(
        color = MaterialTheme.colorScheme.surfaceContainerLow,
        shape = MaterialTheme.shapes.large,
        modifier = modifier.fillMaxWidth(),
    ) {
        Box(Modifier.fillMaxWidth().then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) { content() }
        }
    }
}
