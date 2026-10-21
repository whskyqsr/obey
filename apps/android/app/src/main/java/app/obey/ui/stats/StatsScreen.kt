package app.obey.ui.stats

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.TrendingDown
import androidx.compose.material.icons.automirrored.outlined.TrendingFlat
import androidx.compose.material.icons.automirrored.outlined.TrendingUp
import androidx.compose.material.icons.outlined.LocalFireDepartment
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import app.obey.api.DynamicStats
import app.obey.api.ObeyApi
import app.obey.api.Role
import app.obey.api.Tally
import app.obey.api.TaskTally
import app.obey.data.SessionRepository
import app.obey.ui.common.BaseViewModel
import app.obey.ui.common.ErrorBox
import app.obey.ui.common.Load
import app.obey.ui.common.LoadingBox
import app.obey.ui.common.MoodCard
import app.obey.ui.common.MenuButton
import app.obey.ui.common.SafeWordAction
import app.obey.ui.common.SettingsAction
import app.obey.ui.common.loadCatching
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import javax.inject.Inject
import kotlin.math.abs
import kotlin.math.roundToInt
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

private val RANGES = listOf(Triple(7, "Week", "the week before"), Triple(30, "Month", "the month before"), Triple(90, "3 months", "the 3 months before"), Triple(365, "Year", "the year before"))
private val WEEKDAYS = listOf("Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday")

@HiltViewModel
class StatsViewModel @Inject constructor(private val api: ObeyApi, private val sessions: SessionRepository) : BaseViewModel() {
    val session get() = sessions.session
    private val _days = MutableStateFlow(30)
    val days: StateFlow<Int> = _days.asStateFlow()
    private val _who = MutableStateFlow(session?.relationship?.members?.firstOrNull { it.role == Role.Submissive }?.userId ?: session?.userId)
    val who: StateFlow<String?> = _who.asStateFlow()
    private val _state = MutableStateFlow<Load<DynamicStats>>(Load.Loading)
    val state: StateFlow<Load<DynamicStats>> = _state.asStateFlow()

    fun load(days: Int = _days.value, who: String? = _who.value) {
        _days.value = days
        _who.value = who
        viewModelScope.launch {
            val result = loadCatching { api.stats(sessions.requireRelationshipId(), days, ZoneId.systemDefault().id, who) }
            if (days == _days.value && who == _who.value) _state.value = result
        }
    }
}

private fun pct(rate: Double) = "${(rate * 100).roundToInt()}%"

/** How one person's tasks have gone: rate and trend, done and missed over time, weekdays, and each task. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StatsScreen(onOpenSettings: () -> Unit, onOpenTask: (String) -> Unit, vm: StatsViewModel = hiltViewModel()) {
    LaunchedEffect(Unit) { vm.load() }
    val state by vm.state.collectAsStateWithLifecycle()
    val days by vm.days.collectAsStateWithLifecycle()
    val who by vm.who.collectAsStateWithLifecycle()
    val session = vm.session ?: return
    val members = session.relationship?.members.orEmpty()
    val sub = members.firstOrNull { it.role == Role.Submissive }?.userId

    Scaffold(topBar = { TopAppBar(title = { Text("Stats") }, navigationIcon = { MenuButton() }, actions = { SafeWordAction(); SettingsAction(onOpenSettings) }) }) { padding ->
        Column(
            Modifier.padding(padding).fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp).padding(bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            if (members.size > 1) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    members.forEach { m ->
                        FilterChip(selected = m.userId == who, onClick = { vm.load(who = m.userId) }, label = { Text(if (m.userId == session.userId) "You" else m.displayName) })
                    }
                }
            }
            SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                RANGES.forEachIndexed { i, (d, label) ->
                    SegmentedButton(selected = d == days, onClick = { vm.load(days = d) }, shape = SegmentedButtonDefaults.itemShape(i, RANGES.size)) {
                        Text(label, maxLines = 1, softWrap = false)
                    }
                }
            }
            when (val s = state) {
                Load.Loading -> LoadingBox()
                is Load.Failed -> ErrorBox(s.message, { vm.load() })
                is Load.Ready -> {
                    val t = s.value.totals
                    if (t.done + t.missed + t.excused == 0) {
                        Text("Nothing finished in this stretch. Stats fill in as tasks are done or missed.", style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(vertical = 24.dp))
                    } else {
                        StatsBody(s.value, RANGES.first { it.first == days }.third, session.weekStart, onOpenTask)
                    }
                }
            }
            if (who == sub) MoodCard(header = { Text("Mood", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 8.dp)) })
        }
    }
}

@Composable
private fun StatsCard(title: String? = null, flush: Boolean = false, content: @Composable () -> Unit) {
    Surface(color = MaterialTheme.colorScheme.surfaceContainerLow, shape = MaterialTheme.shapes.large, modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(if (flush) PaddingFlush else PaddingFull), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            title?.let { Text(it, style = MaterialTheme.typography.titleMedium, modifier = if (flush) Modifier.padding(horizontal = 16.dp) else Modifier) }
            content()
        }
    }
}

private val PaddingFull = androidx.compose.foundation.layout.PaddingValues(16.dp)
private val PaddingFlush = androidx.compose.foundation.layout.PaddingValues(top = 16.dp, bottom = 8.dp)

@Composable
private fun StatsBody(s: DynamicStats, before: String, weekStart: DayOfWeek, onOpenTask: (String) -> Unit) {
    val colors = MaterialTheme.colorScheme
    val t = s.totals
    StatsCard {
        Text(t.rate?.let(::pct) ?: "–", style = MaterialTheme.typography.displayMedium)
        Text("done of what was due", style = MaterialTheme.typography.bodyMedium, color = colors.onSurfaceVariant, modifier = Modifier.padding(top = 0.dp))
        Trend(t.rate, s.previous.rate, before)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Count("Done", t.done, colors.primary)
            Count("Missed", t.missed, colors.outline)
            Count("Excused", t.excused, colors.outlineVariant)
        }
        if (t.done > 0 || t.moved > 0) {
            val parts = listOfNotNull(
                if (t.done > 0) "${pct(t.onTime.toDouble() / t.done)} of done tasks were on time" else null,
                if (t.moved > 0) "${t.moved} ${if (t.moved == 1) "deadline" else "deadlines"} moved" else null,
            )
            Text(parts.joinToString(" · "), style = MaterialTheme.typography.bodyMedium, color = colors.onSurfaceVariant)
        }
    }
    StatsCard("Over time") { Bars(s) }
    StatsCard("By weekday") { Weekdays(s.weekdays, weekStart) }
    StatsCard("By task", flush = true) { Tasks(s.tasks, onOpenTask) }
}

@Composable
private fun Trend(rate: Double?, previous: Double?, before: String) {
    if (rate == null || previous == null) return
    val diff = ((rate - previous) * 100).roundToInt()
    val colors = MaterialTheme.colorScheme
    val tint = when {
        diff == 0 -> colors.onSurfaceVariant
        diff > 0 -> colors.primary
        else -> colors.error
    }
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        Icon(
            when {
                diff == 0 -> Icons.AutoMirrored.Outlined.TrendingFlat
                diff > 0 -> Icons.AutoMirrored.Outlined.TrendingUp
                else -> Icons.AutoMirrored.Outlined.TrendingDown
            },
            null,
            Modifier.size(20.dp),
            tint = tint,
        )
        Text(
            if (diff == 0) "Same as $before" else "${if (diff > 0) "Up" else "Down"} ${abs(diff)} ${if (abs(diff) == 1) "point" else "points"} on $before",
            style = MaterialTheme.typography.labelLarge,
            color = tint,
        )
    }
}

@Composable
private fun Count(label: String, value: Int, dot: Color) {
    val colors = MaterialTheme.colorScheme
    Surface(color = colors.surfaceContainer, shape = MaterialTheme.shapes.medium) {
        Column(Modifier.widthIn(min = 72.dp).padding(horizontal = 12.dp, vertical = 8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text("$value", style = MaterialTheme.typography.titleLarge)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(8.dp).background(dot, CircleShape))
                Text("  $label", style = MaterialTheme.typography.labelMedium, color = colors.onSurfaceVariant)
            }
        }
    }
}

private fun bucketLabel(start: String, bucket: String, days: Int): String {
    val d = LocalDate.parse(start)
    return when {
        bucket == "month" -> d.format(DateTimeFormatter.ofPattern("MMM"))
        bucket == "week" -> d.format(DateTimeFormatter.ofPattern("MMM d"))
        days <= 7 -> d.format(DateTimeFormatter.ofPattern("EEE"))
        else -> "${d.dayOfMonth}"
    }
}

/** Stacked bars per day, week or month: done at the bottom, then missed, then excused. Empty stretches before the first task are left off. */
@Composable
private fun Bars(s: DynamicStats) {
    val colors = MaterialTheme.colorScheme
    val first = s.buckets.indexOfFirst { it.done + it.missed + it.excused > 0 }
    val buckets = if (s.bucket == "day") s.buckets else s.buckets.drop(first.coerceAtLeast(0))
    val max = (buckets.maxOfOrNull { it.done + it.missed + it.excused } ?: 0).coerceAtLeast(1)
    val every = if (buckets.size > 16) 5 else if (buckets.size > 8) 2 else 1
    Column {
        Row(Modifier.fillMaxWidth().height(140.dp).semantics { contentDescription = "Done and missed by ${s.bucket}" }, horizontalArrangement = Arrangement.spacedBy(3.dp), verticalAlignment = Alignment.Bottom) {
            buckets.forEach { b ->
                val total = b.done + b.missed + b.excused
                Column(Modifier.weight(1f).fillMaxHeight(), verticalArrangement = Arrangement.Bottom) {
                    if (total == 0) {
                        Box(Modifier.fillMaxWidth().height(2.dp).background(colors.outlineVariant.copy(alpha = 0.6f), CircleShape))
                    } else {
                        Column(Modifier.fillMaxWidth().fillMaxHeight(total.toFloat() / max).clip(RoundedCornerShape(topStart = 2.dp, topEnd = 2.dp))) {
                            if (b.excused > 0) Box(Modifier.fillMaxWidth().weight(b.excused.toFloat()).background(colors.outlineVariant))
                            if (b.missed > 0) Box(Modifier.fillMaxWidth().weight(b.missed.toFloat()).background(colors.outline))
                            if (b.done > 0) Box(Modifier.fillMaxWidth().weight(b.done.toFloat()).background(colors.primary))
                        }
                    }
                }
            }
        }
        Row(Modifier.fillMaxWidth().padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(3.dp)) {
            buckets.forEachIndexed { i, b ->
                Text(
                    if (i % every == 0) bucketLabel(b.start, s.bucket, s.days) else "",
                    style = MaterialTheme.typography.labelSmall,
                    color = colors.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                    maxLines = 1,
                    softWrap = false,
                    overflow = TextOverflow.Visible,
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

/** Done rate for each weekday, with the day that slips most called out. */
@Composable
private fun Weekdays(days: List<Tally>, weekStart: DayOfWeek) {
    val colors = MaterialTheme.colorScheme
    val order = if (weekStart == DayOfWeek.MONDAY) listOf(1, 2, 3, 4, 5, 6, 0) else (0..6).toList()
    val worst = days.indices.filter { days[it].missed > 0 }.maxByOrNull { days[it].missed }
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        order.forEach { i ->
            val d = days[i]
            Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Box(Modifier.fillMaxWidth().height(72.dp).clip(RoundedCornerShape(4.dp)).background(colors.surfaceContainer), contentAlignment = Alignment.BottomCenter) {
                    d.rate?.let { Box(Modifier.fillMaxWidth().fillMaxHeight(it.toFloat().coerceAtLeast(0.04f)).background(colors.primary)) }
                }
                Text(
                    WEEKDAYS[i].take(3),
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = if (i == worst) FontWeight.Bold else null,
                    color = if (i == worst) colors.onSurface else colors.onSurfaceVariant,
                )
                Text(d.rate?.let(::pct) ?: "–", style = MaterialTheme.typography.labelSmall, color = colors.onSurfaceVariant)
            }
        }
    }
    worst?.let { Text("Most misses on ${WEEKDAYS[it]}s (${days[it].missed}).", style = MaterialTheme.typography.bodyMedium, color = colors.onSurfaceVariant) }
}

/** Each task, lowest done rate first, so what's slipping is at the top. */
@Composable
private fun Tasks(tasks: List<TaskTally>, onOpenTask: (String) -> Unit) {
    val colors = MaterialTheme.colorScheme
    val sorted = tasks.sortedWith(compareBy<TaskTally> { it.rate ?: 2.0 }.thenByDescending { it.done + it.missed })
    Column {
        sorted.forEach { t ->
            Row(
                Modifier.fillMaxWidth().clickable(enabled = t.active) { onOpenTask(t.taskId) }.padding(horizontal = 16.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text(t.title, style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(
                        "${t.done} of ${t.done + t.missed} done" + (if (t.excused > 0) ", ${t.excused} excused" else "") + (if (!t.active) " · ended" else ""),
                        style = MaterialTheme.typography.bodyMedium,
                        color = colors.onSurfaceVariant,
                    )
                    Box(Modifier.padding(top = 6.dp).fillMaxWidth().height(6.dp).clip(CircleShape).background(colors.surfaceContainerHighest)) {
                        t.rate?.let { Box(Modifier.fillMaxWidth(it.toFloat()).fillMaxHeight().clip(CircleShape).background(colors.primary)) }
                    }
                }
                Spacer(Modifier.width(16.dp))
                Column(Modifier.width(56.dp), horizontalAlignment = Alignment.End) {
                    Text(t.rate?.let(::pct) ?: "–", style = MaterialTheme.typography.titleMedium)
                    if (t.streak > 1) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Outlined.LocalFireDepartment, "Streak", Modifier.size(14.dp), tint = colors.onSurfaceVariant)
                            Text("${t.streak}", style = MaterialTheme.typography.labelSmall, color = colors.onSurfaceVariant)
                        }
                    }
                }
            }
        }
    }
}
