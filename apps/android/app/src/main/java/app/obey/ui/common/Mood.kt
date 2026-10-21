package app.obey.ui.common

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.border
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.SentimentDissatisfied
import androidx.compose.material.icons.filled.SentimentNeutral
import androidx.compose.material.icons.filled.SentimentSatisfied
import androidx.compose.material.icons.filled.SentimentVeryDissatisfied
import androidx.compose.material.icons.filled.SentimentVerySatisfied
import androidx.compose.material.icons.outlined.SentimentDissatisfied
import androidx.compose.material.icons.outlined.SentimentNeutral
import androidx.compose.material.icons.outlined.SentimentSatisfied
import androidx.compose.material.icons.outlined.SentimentVeryDissatisfied
import androidx.compose.material.icons.outlined.SentimentVerySatisfied
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.Role as SemanticsRole
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import app.obey.api.MoodEntry
import app.obey.api.ObeyApi
import app.obey.api.Role
import app.obey.data.SessionRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

val MOOD_LABELS = listOf("Awful", "Low", "Okay", "Good", "Great")
private val MOOD_OUTLINED = listOf(
    Icons.Outlined.SentimentVeryDissatisfied, Icons.Outlined.SentimentDissatisfied, Icons.Outlined.SentimentNeutral,
    Icons.Outlined.SentimentSatisfied, Icons.Outlined.SentimentVerySatisfied,
)
private val MOOD_FILLED = listOf(
    Icons.Filled.SentimentVeryDissatisfied, Icons.Filled.SentimentDissatisfied, Icons.Filled.SentimentNeutral,
    Icons.Filled.SentimentSatisfied, Icons.Filled.SentimentVerySatisfied,
)

/** The face for a mood, 1 (awful) to 5 (great). */
fun moodIcon(mood: Int, filled: Boolean = false): ImageVector = (if (filled) MOOD_FILLED else MOOD_OUTLINED)[(mood - 1).coerceIn(0, 4)]
fun moodLabel(mood: Int): String = MOOD_LABELS[(mood - 1).coerceIn(0, 4)]

/** Five faces to pick how you feel. */
@Composable
fun MoodPicker(value: Int?, onChange: (Int) -> Unit, modifier: Modifier = Modifier) {
    val colors = MaterialTheme.colorScheme
    Row(modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        (1..5).forEach { m ->
            val on = value == m
            Column(
                Modifier
                    .weight(1f)
                    .background(if (on) colors.secondaryContainer else androidx.compose.ui.graphics.Color.Transparent, MaterialTheme.shapes.medium)
                    .clickable(role = SemanticsRole.RadioButton) { onChange(m) }
                    .padding(vertical = 8.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Icon(moodIcon(m, on), null, Modifier.size(28.dp), tint = if (on) colors.onSecondaryContainer else colors.onSurfaceVariant)
                Text(moodLabel(m), style = MaterialTheme.typography.labelMedium, color = if (on) colors.onSecondaryContainer else colors.onSurfaceVariant)
            }
        }
    }
}

@HiltViewModel
class MoodViewModel @Inject constructor(private val api: ObeyApi, private val sessions: SessionRepository) : BaseViewModel() {
    private val _entries = MutableStateFlow<List<MoodEntry>?>(null)
    val entries: StateFlow<List<MoodEntry>?> = _entries.asStateFlow()
    private val _days = MutableStateFlow(30)
    val days: StateFlow<Int> = _days.asStateFlow()
    val session get() = sessions.session

    fun load(days: Int = _days.value) {
        _days.value = days
        viewModelScope.launch {
            runCatching { api.moods(sessions.requireRelationshipId(), days) }.onSuccess { if (days == _days.value) _entries.value = it }
        }
    }
}

private val RANGES = listOf(7 to "Week", 30 to "Month", 365 to "Year")

/**
 * Mood over time for one person: check-ins and journal moods as a line with a point per answer. Hidden, header
 * included, until there's something to show.
 */
@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
fun MoodCard(modifier: Modifier = Modifier, header: (@Composable () -> Unit)? = null, vm: MoodViewModel = hiltViewModel(key = "moods")) {
    LaunchedEffect(Unit) { vm.load() }
    val all by vm.entries.collectAsStateWithLifecycle()
    val days by vm.days.collectAsStateWithLifecycle()
    val session = vm.session ?: return
    val data = all ?: return
    if (data.isEmpty() && days == 30) return
    val people = data.map { it.userId }.distinct()
    var picked by remember { mutableStateOf<String?>(null) }
    val sub = session.relationship?.members?.firstOrNull { it.role == Role.Submissive }?.userId
    val who = picked?.takeIf { it in people } ?: sub?.takeIf { it in people } ?: people.firstOrNull() ?: session.userId
    val entries = data.filter { it.userId == who }
    val avg = entries.takeIf { it.isNotEmpty() }?.map { it.mood }?.average()
    val colors = MaterialTheme.colorScheme

    header?.invoke()
    Surface(color = colors.surfaceContainerLow, shape = MaterialTheme.shapes.large, modifier = modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            if (people.size > 1) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    people.forEach { id ->
                        FilterChip(selected = id == who, onClick = { picked = id }, label = { Text(if (id == session.userId) "You" else session.nameOf(id)) })
                    }
                }
            }
            SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                RANGES.forEachIndexed { i, (d, label) ->
                    SegmentedButton(selected = d == days, onClick = { vm.load(d) }, shape = SegmentedButtonDefaults.itemShape(i, RANGES.size)) { Text(label) }
                }
            }
            if (avg != null) {
                val rounded = Math.round(avg).toInt()
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(moodIcon(rounded), null, Modifier.size(36.dp), tint = colors.primary)
                    Spacer(Modifier.width(12.dp))
                    Column {
                        Text("${moodLabel(rounded)} on average", style = MaterialTheme.typography.titleLarge)
                        Text(
                            "%.1f out of 5 from %d %s".format(avg, entries.size, if (entries.size == 1) "answer" else "answers") +
                                if (who != session.userId) " by ${session.nameOf(who)}" else "",
                            style = MaterialTheme.typography.bodyMedium,
                            color = colors.onSurfaceVariant,
                        )
                    }
                }
                MoodChart(entries, days)
            } else {
                Text("No moods in this stretch.", style = MaterialTheme.typography.bodyMedium, color = colors.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun MoodChart(entries: List<MoodEntry>, days: Int) {
    val colors = MaterialTheme.colorScheme
    val end = remember(entries) { Instant.now().toEpochMilli() }
    val start = end - days * 86_400_000L
    var selected by remember(entries) { mutableStateOf<Int?>(null) }
    val chartH = 140.dp
    val pad = 12.dp
    val times = entries.map { Instant.parse(it.at).toEpochMilli() }
    Column {
        Row {
            Column(Modifier.height(chartH + 0.dp), verticalArrangement = Arrangement.SpaceBetween) {
                (5 downTo 1).forEach { Icon(moodIcon(it), null, Modifier.size(24.dp), tint = colors.onSurfaceVariant) }
            }
            Spacer(Modifier.width(6.dp))
            var widthPx by remember { mutableStateOf(1f) }
            fun xOf(t: Long, w: Float) = w * (t - start).toFloat() / (end - start).toFloat()
            fun nearest(x: Float) = times.indices.minByOrNull { kotlin.math.abs(xOf(times[it], widthPx) - x) }
            Canvas(
                Modifier
                    .weight(1f)
                    .height(chartH)
                    .semantics { contentDescription = "Mood chart, ${entries.size} answers" }
                    .pointerInput(entries) { detectTapGestures { selected = nearest(it.x) } }
                    .pointerInput(entries) { detectDragGestures { change, _ -> selected = nearest(change.position.x) } },
            ) {
                widthPx = size.width
                val top = pad.toPx()
                val h = size.height - 2 * top
                fun y(m: Int) = top + (5 - m) / 4f * h
                (1..5).forEach { m ->
                    drawLine(
                        colors.outlineVariant, Offset(0f, y(m)), Offset(size.width, y(m)), strokeWidth = 1.dp.toPx(),
                        pathEffect = if (m == 3) null else PathEffect.dashPathEffect(floatArrayOf(2.dp.toPx(), 4.dp.toPx())),
                    )
                }
                selected?.let { i -> val x = xOf(times[i], size.width); drawLine(colors.outline, Offset(x, top), Offset(x, top + h), 1.dp.toPx()) }
                val pts = entries.mapIndexed { i, e -> Offset(xOf(times[i], size.width), y(e.mood)) }
                if (pts.size > 1) {
                    val path = Path().apply { pts.forEachIndexed { i, p -> if (i == 0) moveTo(p.x, p.y) else lineTo(p.x, p.y) } }
                    drawPath(path, colors.primary, style = Stroke(2.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round))
                }
                pts.forEachIndexed { i, p ->
                    val r = (if (i == selected) 6f else 4.5f).dp.toPx()
                    if (entries[i].source == "checkin") {
                        drawCircle(colors.surfaceContainerLow, r + 2.dp.toPx(), p)
                        drawCircle(colors.primary, r, p)
                    } else {
                        drawCircle(colors.surfaceContainerLow, r, p)
                        drawCircle(colors.primary, r, p, style = Stroke(2.dp.toPx()))
                    }
                }
            }
        }
        Row(Modifier.fillMaxWidth().padding(start = 30.dp, top = 4.dp)) {
            val fmt = DateTimeFormatter.ofPattern("MMM d")
            val zone = ZoneId.systemDefault()
            Text(Instant.ofEpochMilli(start).atZone(zone).format(fmt), style = MaterialTheme.typography.labelSmall, color = colors.onSurfaceVariant, modifier = Modifier.weight(1f))
            Text(Instant.ofEpochMilli((start + end) / 2).atZone(zone).format(fmt), style = MaterialTheme.typography.labelSmall, color = colors.onSurfaceVariant, modifier = Modifier.weight(1f), textAlign = androidx.compose.ui.text.style.TextAlign.Center)
            Text("Today", style = MaterialTheme.typography.labelSmall, color = colors.onSurfaceVariant, modifier = Modifier.weight(1f), textAlign = androidx.compose.ui.text.style.TextAlign.End)
        }
        if (entries.any { it.source == "journal" } && entries.any { it.source == "checkin" }) {
            Row(Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(16.dp), verticalAlignment = Alignment.CenterVertically) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(10.dp).background(colors.primary, CircleShape))
                    Text("  Check-in", style = MaterialTheme.typography.labelMedium, color = colors.onSurfaceVariant)
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(10.dp).border(2.dp, colors.primary, CircleShape))
                    Text("  Journal", style = MaterialTheme.typography.labelMedium, color = colors.onSurfaceVariant)
                }
            }
        }
        val s = selected?.let { entries[it] }
        Surface(color = if (s != null) colors.inverseSurface else colors.surfaceContainer, shape = MaterialTheme.shapes.medium, modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) {
            if (s == null) {
                Text("Tap the chart to see an answer", style = MaterialTheme.typography.bodySmall, color = colors.onSurfaceVariant, modifier = Modifier.padding(12.dp))
            } else {
                Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(moodIcon(s.mood, true), null, tint = colors.inverseOnSurface)
                    Spacer(Modifier.width(12.dp))
                    Column {
                        Text(
                            "${moodLabel(s.mood)} · ${s.title.ifBlank { if (s.source == "journal") "Journal entry" else "Check-in" }}",
                            style = MaterialTheme.typography.labelLarge,
                            color = colors.inverseOnSurface,
                        )
                        s.note?.takeIf { it.isNotBlank() }?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = colors.inverseOnSurface, maxLines = 2) }
                        Text(formatDateTime(s.at), style = MaterialTheme.typography.bodySmall, color = colors.inverseOnSurface.copy(alpha = 0.8f))
                    }
                }
            }
        }
    }
}
