package app.obey.ui.stats

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.offset
import androidx.compose.material3.HorizontalDivider
import app.obey.ui.common.Eyebrow
import app.obey.ui.common.LettersChip
import app.obey.ui.common.PillToggle
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
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material.icons.outlined.Flag
import androidx.compose.material3.Button
import androidx.compose.material3.IconButton
import androidx.lifecycle.SavedStateHandle
import androidx.navigation.toRoute
import app.obey.api.MonthSummary
import app.obey.ui.StatsRoute
import java.time.YearMonth
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
import androidx.compose.material3.LargeTopAppBar
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

// "Month" (0 here) is a calendar month, the same stretch the monthly review counts, so the two always agree.
private const val MONTH = 0
private val RANGES = listOf(Triple(7, "Week", "the week before"), Triple(MONTH, "Month", "the month before"), Triple(90, "3 months", "the 3 months before"), Triple(365, "Year", "the year before"))
private val WEEKDAYS = listOf("Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday")

@HiltViewModel
class StatsViewModel @Inject constructor(private val api: ObeyApi, private val sessions: SessionRepository, savedState: SavedStateHandle) : BaseViewModel() {
    val session get() = sessions.session
    private val route = savedState.toRoute<StatsRoute>()
    private val _days = MutableStateFlow(MONTH)
    val days: StateFlow<Int> = _days.asStateFlow()
    private val _month = MutableStateFlow(route.month?.takeIf { it <= YearMonth.now().toString() } ?: YearMonth.now().toString())
    val month: StateFlow<String> = _month.asStateFlow()
    private val _who = MutableStateFlow(
        route.who?.takeIf { w -> session?.relationship?.members.orEmpty().any { it.userId == w } }
            ?: session?.relationship?.members?.firstOrNull { it.role == Role.Submissive }?.userId ?: session?.userId,
    )
    val who: StateFlow<String?> = _who.asStateFlow()
    private val _state = MutableStateFlow<Load<DynamicStats>>(Load.Loading)
    val state: StateFlow<Load<DynamicStats>> = _state.asStateFlow()
    /** This month's review, for the way over to it while it's open. */
    private val _review = MutableStateFlow<MonthSummary?>(null)
    val review: StateFlow<MonthSummary?> = _review.asStateFlow()

    fun load(days: Int = _days.value, who: String? = _who.value, month: String = _month.value) {
        _days.value = days
        _who.value = who
        _month.value = month
        viewModelScope.launch {
            val zone = ZoneId.systemDefault().id
            val result = loadCatching {
                if (days == MONTH) api.monthStats(sessions.requireRelationshipId(), month, zone, who) else api.stats(sessions.requireRelationshipId(), days, zone, who)
            }
            if (days == _days.value && who == _who.value && month == _month.value) _state.value = result
        }
    }

    private val _ledger = MutableStateFlow<List<app.obey.api.LedgerEntry>>(emptyList())
    val ledger: StateFlow<List<app.obey.api.LedgerEntry>> = _ledger.asStateFlow()

    fun loadLedger() {
        val rel = session?.relationship ?: return
        if (!rel.features.points) return
        viewModelScope.launch { runCatching { api.ledger(rel.id) }.onSuccess { _ledger.value = it } }
    }

    fun loadReview() {
        val rel = session?.relationship ?: return
        if (!rel.features.review || rel.endedAt != null) return
        viewModelScope.launch { runCatching { api.month(rel.id, YearMonth.now().toString(), ZoneId.systemDefault().id) }.onSuccess { _review.value = it } }
    }
}

private fun pct(rate: Double) = "${(rate * 100).roundToInt()}%"

/**
 * Mockup 26: three serif numbers, then each task as a line with an ink bar, and points earned, spent and lost. Over
 * time, weekdays and mood follow on hairlines.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun StatsScreen(onOpenSettings: () -> Unit, onOpenTask: (String) -> Unit, onOpenReview: () -> Unit, vm: StatsViewModel = hiltViewModel()) {
    LaunchedEffect(Unit) {
        vm.load()
        vm.loadReview()
        vm.loadLedger()
    }
    val state by vm.state.collectAsStateWithLifecycle()
    val days by vm.days.collectAsStateWithLifecycle()
    val month by vm.month.collectAsStateWithLifecycle()
    val who by vm.who.collectAsStateWithLifecycle()
    val review by vm.review.collectAsStateWithLifecycle()
    val ledger by vm.ledger.collectAsStateWithLifecycle()
    val session = vm.session ?: return
    val members = session.relationship?.members.orEmpty()
    val sub = members.firstOrNull { it.role == Role.Submissive }?.userId
    val current = YearMonth.now()
    val shown = YearMonth.parse(month)
    val c = MaterialTheme.colorScheme
    val zone = ZoneId.systemDefault()
    val from = if (days == MONTH) shown.atDay(1) else LocalDate.now().minusDays(days.toLong() - 1)
    val to = if (days == MONTH) shown.atEndOfMonth() else LocalDate.now()
    val points = ledger.filter { e ->
        val d = app.obey.ui.common.parseInstant(e.createdAt).atZone(zone).toLocalDate()
        e.userId == who && !d.isBefore(from) && !d.isAfter(to)
    }
    val spending = setOf(app.obey.api.LedgerKind.Redemption, app.obey.api.LedgerKind.Delay)
    val earned = points.filter { it.delta > 0 }.sumOf { it.delta }
    val spent = -points.filter { it.delta < 0 && it.kind in spending }.sumOf { it.delta }
    val lost = -points.filter { it.delta < 0 && it.kind !in spending }.sumOf { it.delta }

    Scaffold(topBar = { LargeTopAppBar(title = { Text("Stats") }, navigationIcon = { MenuButton() }, actions = { SafeWordAction() }) }) { padding ->
        Column(
            Modifier.padding(padding).fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp).padding(bottom = 32.dp),
            verticalArrangement = Arrangement.spacedBy(32.dp),
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                PillToggle(RANGES.map { it.second }, RANGES.indexOfFirst { it.first == days }) { vm.load(days = RANGES[it].first) }
                if (members.size > 1) {
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        members.forEach { m -> LettersChip(if (m.userId == session.userId) "You" else m.displayName, m.userId == who, { vm.load(who = m.userId) }) }
                    }
                }
                if (days == MONTH) {
                    Row(Modifier.offset(x = (-12).dp), verticalAlignment = Alignment.CenterVertically) {
                        IconButton(onClick = { vm.load(month = shown.minusMonths(1).toString()) }) { Icon(Icons.AutoMirrored.Outlined.KeyboardArrowLeft, "The month before") }
                        Text(shown.format(DateTimeFormatter.ofPattern("MMMM yyyy")), style = MaterialTheme.typography.bodyLarge)
                        if (shown == current) Text(" so far", style = MaterialTheme.typography.bodyLarge, color = c.onSurfaceVariant)
                        IconButton(onClick = { vm.load(month = shown.plusMonths(1).toString()) }, enabled = shown < current) { Icon(Icons.AutoMirrored.Outlined.KeyboardArrowRight, "The month after") }
                    }
                }
                review?.takeIf { it.reviewOpen && session.userId in it.waitingOn }?.let { m ->
                    Text(
                        "${YearMonth.parse(m.month).format(DateTimeFormatter.ofPattern("MMMM"))}'s review is open · Look back ›",
                        style = MaterialTheme.typography.bodyLarge,
                        color = c.primary,
                        modifier = Modifier.clickable(onClick = onOpenReview),
                    )
                }
            }
            when (val s = state) {
                Load.Loading -> LoadingBox()
                is Load.Failed -> ErrorBox(s.message, { vm.load() })
                is Load.Ready -> {
                    val t = s.value.totals
                    if (t.done + t.missed + t.excused == 0) {
                        val empty = if (days == MONTH && shown != current) "Nothing was due in ${shown.format(DateTimeFormatter.ofPattern("MMMM"))}." else "Nothing finished in this stretch yet."
                        Text(empty, style = MaterialTheme.typography.bodyLarge, color = c.onSurfaceVariant)
                    } else {
                        val before = if (days == MONTH) shown.minusMonths(1).format(DateTimeFormatter.ofPattern("MMMM")) else RANGES.first { it.first == days }.third
                        StatsBody(s.value, before, if (who == session.userId) null else session.nameOf(who ?: ""), session.weekStart, onOpenTask)
                    }
                }
            }
            if (points.isNotEmpty()) {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Eyebrow("Points")
                    Text("Earned $earned · spent $spent · lost $lost", style = MaterialTheme.typography.bodyLarge)
                }
            }
            if (days != MONTH || shown == current) MoodCard(header = { Eyebrow("Mood") }, days = if (days == MONTH) 30 else days, person = who)
        }
    }
}

@Composable
private fun Figure(value: String, label: String) {
    Column {
        Text(value, style = MaterialTheme.typography.displayLarge)
        Text(label, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

private fun trend(rate: Double?, previous: Double?, before: String): String? {
    if (rate == null || previous == null) return null
    val diff = ((rate - previous) * 100).roundToInt()
    return if (diff == 0) "same as $before" else "${if (diff > 0) "up" else "down"} ${abs(diff)} ${if (abs(diff) == 1) "point" else "points"} on $before"
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun StatsBody(s: DynamicStats, before: String, name: String?, weekStart: DayOfWeek, onOpenTask: (String) -> Unit) {
    val colors = MaterialTheme.colorScheme
    val t = s.totals
    val due = t.done + t.missed
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        FlowRow(horizontalArrangement = Arrangement.spacedBy(32.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Figure(if (due > 0) pct(t.onTime.toDouble() / due) else "–", "on time")
            Figure("${s.tasks.maxOfOrNull { it.streak } ?: 0}", "best streak")
            Figure("${t.missed}", "missed")
        }
        Text(
            listOfNotNull(
                name?.let { "$it's tasks" },
                t.rate?.let { "${pct(it)} done" },
                trend(t.rate, s.previous.rate, before),
                if (t.excused > 0) "${t.excused} excused" else null,
                if (t.moved > 0) "${t.moved} ${if (t.moved == 1) "deadline" else "deadlines"} moved" else null,
            ).joinToString(" · "),
            style = MaterialTheme.typography.bodyMedium,
            color = colors.onSurfaceVariant,
        )
    }
    Column {
        Eyebrow("By task")
        Tasks(s.tasks, onOpenTask)
    }
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Eyebrow("Over time")
        Bars(s)
    }
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Eyebrow("By weekday")
        Weekdays(s.weekdays, weekStart)
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

/** Stacked bars per day, week or month: done in ink at the bottom, then missed in the accent, then excused. */
@Composable
private fun Bars(s: DynamicStats) {
    val colors = MaterialTheme.colorScheme
    val first = s.buckets.indexOfFirst { it.done + it.missed + it.excused > 0 }
    val buckets = if (s.bucket == "day") s.buckets else s.buckets.drop(first.coerceAtLeast(0))
    val max = (buckets.maxOfOrNull { it.done + it.missed + it.excused } ?: 0).coerceAtLeast(1)
    val every = if (buckets.size > 16) 5 else if (buckets.size > 8) 2 else 1
    Column {
        Row(Modifier.fillMaxWidth().height(120.dp).semantics { contentDescription = "Done and missed by ${s.bucket}" }, horizontalArrangement = Arrangement.spacedBy(3.dp), verticalAlignment = Alignment.Bottom) {
            buckets.forEach { b ->
                val total = b.done + b.missed + b.excused
                Column(Modifier.weight(1f).fillMaxHeight(), verticalArrangement = Arrangement.Bottom) {
                    if (total > 0) {
                        Column(Modifier.fillMaxWidth().fillMaxHeight(total.toFloat() / max)) {
                            if (b.excused > 0) Box(Modifier.fillMaxWidth().weight(b.excused.toFloat()).background(colors.outlineVariant))
                            if (b.missed > 0) Box(Modifier.fillMaxWidth().weight(b.missed.toFloat()).background(colors.primary))
                            if (b.done > 0) Box(Modifier.fillMaxWidth().weight(b.done.toFloat()).background(colors.onSurface))
                        }
                    }
                }
            }
        }
        HorizontalDivider(color = colors.outlineVariant)
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
        Row(Modifier.padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            listOf(colors.onSurface to "done", colors.primary to "missed", colors.outlineVariant to "excused").forEach { (color, label) ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(10.dp).background(color))
                    Text("  $label", style = MaterialTheme.typography.bodyMedium, color = colors.onSurfaceVariant)
                }
            }
        }
    }
}

/** Done rate for each weekday as a thin ink bar, with the day that slips most called out. */
@Composable
private fun Weekdays(days: List<Tally>, weekStart: DayOfWeek) {
    val colors = MaterialTheme.colorScheme
    val order = if (weekStart == DayOfWeek.MONDAY) listOf(1, 2, 3, 4, 5, 6, 0) else (0..6).toList()
    val worst = days.indices.filter { days[it].missed > 0 }.maxByOrNull { days[it].missed }
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        order.forEach { i ->
            val d = days[i]
            Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Box(Modifier.fillMaxWidth().height(64.dp), contentAlignment = Alignment.BottomCenter) {
                    d.rate?.let { Box(Modifier.width(8.dp).fillMaxHeight(it.toFloat().coerceAtLeast(0.04f)).background(colors.onSurface)) }
                }
                HorizontalDivider(color = colors.outlineVariant)
                Text(WEEKDAYS[i].take(3), style = MaterialTheme.typography.labelMedium, color = if (i == worst) colors.primary else colors.onSurfaceVariant)
                Text(d.rate?.let(::pct) ?: "–", style = MaterialTheme.typography.labelSmall, color = colors.onSurfaceVariant)
            }
        }
    }
    worst?.let { Text("Most misses on ${WEEKDAYS[it]}s (${days[it].missed}).", style = MaterialTheme.typography.bodyMedium, color = colors.onSurfaceVariant) }
}

/** Each task as a line with an ink bar, lowest done rate first, so what's slipping is at the top. */
@Composable
private fun Tasks(tasks: List<TaskTally>, onOpenTask: (String) -> Unit) {
    val colors = MaterialTheme.colorScheme
    val sorted = tasks.sortedWith(compareBy<TaskTally> { it.rate ?: 2.0 }.thenByDescending { it.done + it.missed })
    Column {
        sorted.forEach { t ->
            Column(Modifier.fillMaxWidth().clickable(enabled = t.active) { onOpenTask(t.taskId) }.padding(vertical = 14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(verticalAlignment = Alignment.Bottom) {
                    Text(t.title + if (!t.active) " · ended" else "", style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                    Spacer(Modifier.width(12.dp))
                    Text(
                        "${t.done} of ${t.done + t.missed}" + if (t.excused > 0) " · ${t.excused} excused" else "",
                        style = MaterialTheme.typography.bodyMedium,
                        color = colors.onSurfaceVariant,
                    )
                }
                Box(Modifier.fillMaxWidth().height(4.dp).background(colors.outlineVariant.copy(alpha = 0.6f))) {
                    t.rate?.let { Box(Modifier.fillMaxWidth(it.toFloat()).fillMaxHeight().background(colors.onSurface)) }
                }
            }
            HorizontalDivider(color = colors.outlineVariant)
        }
    }
}
