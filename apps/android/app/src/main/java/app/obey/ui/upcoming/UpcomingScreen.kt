package app.obey.ui.upcoming

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.automirrored.outlined.ArrowForward
import androidx.compose.material.icons.automirrored.outlined.List
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.obey.api.Occurrence
import app.obey.ui.common.ErrorBox
import app.obey.ui.common.Load
import app.obey.ui.common.LoadingBox
import app.obey.ui.common.MessageEffect
import app.obey.ui.common.SettingsAction
import app.obey.ui.common.formatDate
import app.obey.ui.today.OccurrenceActions
import app.obey.ui.today.OccurrenceRow
import app.obey.ui.today.RescheduleSheet
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.material.icons.outlined.EditCalendar
import app.obey.api.CalendarEvent
import app.obey.ui.common.parseInstant
import app.obey.ui.plans.PlanChip
import app.obey.ui.plans.PlanDialog
import app.obey.ui.plans.PlanRow
import app.obey.ui.plans.isLong
import java.time.Instant
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.temporal.TemporalAdjusters
import java.time.format.DateTimeFormatter

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun UpcomingScreen(
    onNewTask: (LocalDate?) -> Unit,
    onEditTask: (String) -> Unit,
    onOpenTask: (String) -> Unit,
    onAllTasks: () -> Unit,
    onOpenSettings: () -> Unit,
    vm: UpcomingViewModel = hiltViewModel(),
) {
    val state by vm.state.collectAsStateWithLifecycle()
    val view by vm.view.collectAsStateWithLifecycle()
    val anchor by vm.anchor.collectAsStateWithLifecycle()
    val selected by vm.selected.collectAsStateWithLifecycle()
    val message by vm.message.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    MessageEffect(message, snackbar, vm::messageShown)
    // Load on first show and whenever we come back (e.g. from the task editor).
    LifecycleResumeEffect(Unit) {
        vm.refresh()
        onPauseOrDispose { }
    }
    var rescheduling by remember { mutableStateOf<Occurrence?>(null) }
    // A plan to show, or a day to add one on.
    var plan by remember { mutableStateOf<Pair<CalendarEvent?, LocalDate>?>(null) }
    val session = vm.session
    val today = LocalDate.now()
    val canManage = session?.canManage == true

    val occurrenceRow: @Composable (Occurrence) -> Unit = { o ->
        val mine = o.assigneeId == session?.userId
        OccurrenceRow(
            o,
            if (mine) null else session?.nameOf(o.assigneeId),
            OccurrenceActions(
                onComplete = if (mine) ({ vm.complete(o) }) else null,
                onReschedule = { rescheduling = o },
                onEditTask = if (canManage) ({ onEditTask(o.seriesId) }) else null,
            ),
            onOpen = { onOpenTask(o.seriesId) },
        )
    }

    val planRow: @Composable (CalendarEvent, LocalDate) -> Unit = { e, day ->
        PlanRow(e, day, if (e.authorId == session?.userId || e.withPartner) null else session?.nameOf(e.authorId)) { plan = e to day }
    }
    val planChip: @Composable (CalendarEvent, LocalDate) -> Unit = { e, day ->
        PlanChip(e, day, onOpen = { plan = e to day }, modifier = Modifier.padding(horizontal = 16.dp, vertical = 2.dp))
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Calendar") },
                actions = {
                    if (session?.readOnly != true) IconButton(onClick = {
                        val day = if (view == CalendarView.Month && !selected.isBefore(today)) selected else today
                        plan = null to day
                    }) { Icon(Icons.Outlined.EditCalendar, "New plan") }
                    IconButton(onClick = onAllTasks) { Icon(Icons.AutoMirrored.Outlined.List, "All tasks") }
                    SettingsAction(onOpenSettings)
                },
            )
        },
        floatingActionButton = {
            if (canManage) {
                // Like a new calendar event: on the picked day in month view.
                val day = if (view == CalendarView.Month && !selected.isBefore(today)) selected else null
                FloatingActionButton(onClick = { onNewTask(day) }) { Icon(Icons.Outlined.Add, "New task") }
            }
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        Column(Modifier.padding(padding).fillMaxSize()) {
            SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
                CalendarView.entries.forEachIndexed { i, v ->
                    SegmentedButton(
                        selected = view == v,
                        onClick = { vm.setView(v) },
                        shape = SegmentedButtonDefaults.itemShape(i, CalendarView.entries.size),
                    ) { Text(if (v == CalendarView.Week) "Week" else "Month") }
                }
            }
            Row(
                Modifier.padding(horizontal = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                val unit = if (view == CalendarView.Week) "week" else "month"
                IconButton(onClick = { vm.step(-1) }) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Previous $unit") }
                Text(
                    when (view) {
                        CalendarView.Month -> anchor.format(DateTimeFormatter.ofPattern("MMMM yyyy"))
                        CalendarView.Week -> anchor.with(TemporalAdjusters.previousOrSame(session?.weekStart ?: DayOfWeek.SUNDAY)).let {
                            "${it.format(DateTimeFormatter.ofPattern("d MMM"))} – ${it.plusDays(6).format(DateTimeFormatter.ofPattern("d MMM"))}"
                        }
                    },
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.weight(1f),
                )
                TextButton(onClick = vm::goToday) { Text("Today") }
                IconButton(onClick = { vm.step(1) }) { Icon(Icons.AutoMirrored.Outlined.ArrowForward, "Next $unit") }
            }
            when (val s = state) {
                Load.Loading -> LoadingBox()
                is Load.Failed -> ErrorBox(s.message, vm::refresh)
                is Load.Ready -> if (s.value.view == CalendarView.Month) {
                    val items = s.value.days.firstOrNull { it.first == selected }?.second.orEmpty()
                    val events = s.value.eventsOn(selected)
                    LazyColumn(Modifier.fillMaxSize()) {
                        item(key = "grid") {
                            MonthGrid(s.value, selected, today, onSelect = vm::select, Modifier.padding(horizontal = 8.dp))
                        }
                        item(key = "h-selected") {
                            Text(
                                if (selected == today) "Today · ${formatDate(selected)}" else formatDate(selected),
                                style = MaterialTheme.typography.titleSmall,
                                modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 20.dp, bottom = 4.dp),
                            )
                        }
                        if (items.isEmpty() && events.isEmpty()) item(key = "e-selected") {
                            Text(
                                "Nothing scheduled",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
                            )
                        }
                        dayItems(selected, items, events, occurrenceRow, planRow, planChip)
                    }
                } else LazyColumn(Modifier.fillMaxSize()) {
                    s.value.days.forEach { (day, occs) ->
                        val events = s.value.eventsOn(day)
                        item(key = "h-$day") {
                            Row(
                                Modifier.padding(start = 16.dp, end = 8.dp, top = 16.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text(
                                    if (day == today) "Today · ${formatDate(day)}" else formatDate(day),
                                    style = MaterialTheme.typography.titleSmall,
                                    fontWeight = if (day == today) FontWeight.Bold else null,
                                    color = if (day == today) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
                                    modifier = Modifier.weight(1f),
                                )
                                if (canManage && !day.isBefore(today)) {
                                    IconButton(onClick = { onNewTask(day) }) { Icon(Icons.Outlined.Add, "New task on ${formatDate(day)}") }
                                }
                            }
                        }
                        if (occs.isEmpty() && events.isEmpty()) {
                            item(key = "e-$day") {
                                Text(
                                    "Nothing scheduled",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
                                )
                            }
                        }
                        dayItems(day, occs, events, occurrenceRow, planRow, planChip)
                    }
                }
            }
        }
    }

    plan?.let { (e, day) ->
        PlanDialog(e, day, onDismiss = { plan = null }, onChanged = vm::refresh)
    }

    rescheduling?.let { o ->
        RescheduleSheet(o, onDismiss = { rescheduling = null }, onSubmit = { vm.reschedule(o, it) })
    }
}

/** A day's plans and tasks: all-day and long plans first, then timed plans and tasks in time order. */
private fun LazyListScope.dayItems(
    day: LocalDate,
    occs: List<Occurrence>,
    events: List<CalendarEvent>,
    occurrenceRow: @Composable (Occurrence) -> Unit,
    planRow: @Composable (CalendarEvent, LocalDate) -> Unit,
    planChip: @Composable (CalendarEvent, LocalDate) -> Unit,
) {
    val (long, timed) = events.partition { it.isLong }
    items(long, key = { "pl-$day-${it.id}" }) { planChip(it, day) }
    val rows: List<Pair<Instant, Any>> = (timed.map { parseInstant(it.startsAt) to it } + occs.map { parseInstant(it.dueAt) to it }).sortedBy { it.first }
    items(rows, key = { (_, v) -> if (v is CalendarEvent) "pt-$day-${v.id}" else (v as Occurrence).id }) { (_, v) ->
        if (v is CalendarEvent) planRow(v, day) else occurrenceRow(v as Occurrence)
    }
}
