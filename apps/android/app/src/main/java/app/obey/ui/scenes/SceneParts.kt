package app.obey.ui.scenes

import android.graphics.BitmapFactory
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
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
import app.obey.ui.common.FormScreen
import app.obey.ui.common.LettersChip
import app.obey.ui.common.LettersField
import app.obey.ui.common.MoodPicker
import app.obey.ui.common.Pill
import app.obey.ui.common.formatDateTime
import app.obey.ui.common.inkButtonColors
import app.obey.ui.common.local
import app.obey.ui.common.moodLabel
import app.obey.ui.common.parseInstant
import java.time.Instant
import java.time.LocalDate
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

/** "no safeword used" / "yellow called". */
internal fun safewordLine(w: String): String = if (w == "none") "no safeword used" else "$w called"

/** "feeling good". */
internal fun feeling(mood: Int): String = "feeling ${moodLabel(mood).lowercase()}"

/** "Nov 19", with the year when it isn't this one. */
internal fun shortDay(s: Scene): String {
    val d = parseInstant(s.occurredAt).local().toLocalDate()
    return d.format(DateTimeFormatter.ofPattern(if (d.year == LocalDate.now().year) "MMM d" else "MMM d, yyyy"))
}

/** "Thursday, Nov 19". */
internal fun longDay(s: Scene): String = parseInstant(s.occurredAt).local().toLocalDate().format(DateTimeFormatter.ofPattern("EEEE, MMM d"))

/** Capitalised, as aftercare reads in a pill. */
internal fun cap(t: String) = t.replaceFirstChar { it.uppercase() }

/** Aftercare as pills, the first reading "Aftercare: water". */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun AftercarePills(items: List<String>) {
    if (items.isEmpty()) return
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        items.forEachIndexed { i, a -> Pill(if (i == 0) "Aftercare: ${a.lowercase()}" else a.lowercase()) }
    }
}

/** Aftercare to pick from: the usual ones plus anything already chosen, and "+ Other" for the rest. */
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
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            options.forEach { a -> LettersChip(cap(a), a in value, { onChange(if (a in value) value - a else value + a) }) }
            if (!adding && value.size < 20) LettersChip("+ Other", false, { adding = true })
        }
        if (adding) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                LettersField(
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
private val dayFmt = DateTimeFormatter.ofPattern("EEE, MMM d")
private val timeFmt = DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT)

/** A label over a value on a hairline, tappable, as the form's "When" row. */
@Composable
private fun FieldRow(label: String, value: String, onClick: () -> Unit) {
    Column(Modifier.fillMaxWidth().clickable(onClick = onClick)) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.padding(vertical = 8.dp))
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
    }
}

/** Logging a scene, or changing [scene] (mockup 76). [others] are asked to add their side of a new one. */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
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

    FormScreen(if (scene == null) "Log a scene" else "Edit scene", onCancel = onDismiss, onSave = ::save, canSave = !busy) {
        LettersField(title, { title = it.take(120) }, label = { Text("Name (optional)") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            Box(Modifier.weight(1f)) { FieldRow("When", at.format(dayFmt)) { picking = "date" } }
            Box(Modifier.weight(1f)) { FieldRow("At", at.format(timeFmt)) { picking = "time" } }
        }
        LettersField(what, { what = it.take(4000) }, label = { Text("What we did (optional)") }, minLines = 2, modifier = Modifier.fillMaxWidth())
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Safeword", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                SAFEWORDS.forEach { (v, label) -> LettersChip(label, safeword == v, { safeword = v }) }
            }
        }
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Aftercare given", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            AftercarePicker(aftercare) { aftercare = it }
        }
        if (scene == null && others.isNotEmpty()) {
            Text(
                "Next, each of you writes your own side. You won't see ${andList(others)}'s until you share yours. The next morning you'll each be asked how you feel.",
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
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
    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        MoodPicker(mood, { mood = it })
        LettersField(note, { note = it.take(500) }, label = { Text("Anything you still need? (optional)") }, modifier = Modifier.fillMaxWidth())
        Button(onClick = { mood?.let { onSave(it, note.trim()) } }, enabled = mood != null && !busy, colors = inkButtonColors(), shape = MaterialTheme.shapes.small) { Text("Send") }
    }
}
