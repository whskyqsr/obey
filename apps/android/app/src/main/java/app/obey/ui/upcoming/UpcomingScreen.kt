package app.obey.ui.upcoming

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.width
import androidx.compose.material3.HorizontalDivider
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.sp
import app.obey.ui.common.Diamond
import app.obey.ui.common.DiamondState
import app.obey.ui.common.formatTime
import app.obey.ui.today.diamondState
import app.obey.ui.today.needsDoneDialog
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
import app.obey.ui.common.MenuButton
import app.obey.ui.common.SafeWordAction
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
import app.obey.ui.plans.PlanLegend
import app.obey.ui.plans.planTone
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
    var running by remember { mutableStateOf<Occurrence?>(null) }
    var counting by remember { mutableStateOf<Occurrence?>(null) }
    var noting by remember { mutableStateOf<Occurrence?>(null) }
    // A plan to show, or a day to add one on.
    var plan by remember { mutableStateOf<Pair<CalendarEvent?, LocalDate>?>(null) }
    val session = vm.session
    val today = LocalDate.now()
    val canManage = session?.canManage == true
    // Week view opens today by default; any day can be opened or closed.
    var openDays by remember { mutableStateOf(setOf(today)) }

    val occurrenceRow: @Composable (Occurrence) -> Unit = { o ->
        val mine = o.assigneeId == session?.userId
        OccurrenceRow(
            o,
            if (mine) null else session?.nameOf(o.assigneeId),
            OccurrenceActions(
                onComplete = if (mine) ({ if (o.isRitual) running = o else if (o.needsDoneDialog) noting = o else vm.complete(o) }) else null,
                onReschedule = { rescheduling = o },
                onEditTask = if (canManage) ({ onEditTask(o.seriesId) }) else null,
                onCount = if (mine && o.canCount(true, canManage)) ({ if (o.readyToSend) noting = o else vm.count(o, by = 1) { noting = it } }) else null,
                onCountHold = if (o.canCount(mine, canManage)) ({ counting = o }) else null,
            ),
            onOpen = { onOpenTask(o.seriesId) },
        )
    }

    val planRow: @Composable (CalendarEvent, LocalDate) -> Unit = { e, day ->
        PlanRow(e, day, if (e.authorId == session?.userId || e.withPartner) null else session?.nameOf(e.authorId), planTone(e, session?.relationship)) { plan = e to day }
    }
    val planChip: @Composable (CalendarEvent, LocalDate) -> Unit = { e, day ->
        PlanChip(e, day, planTone(e, session?.relationship), onOpen = { plan = e to day }, modifier = Modifier.padding(horizontal = 16.dp, vertical = 2.dp))
    }

    Scaffold(
        topBar = {
            TopAppBar(
                navigationIcon = { MenuButton() },
                title = { Text("Week") },
                actions = {
                    if (session?.readOnly != true) IconButton(onClick = {
                        val day = if (view == CalendarView.Month && !selected.isBefore(today)) selected else today
                        plan = null to day
                    }) { Icon(Icons.Outlined.EditCalendar, "New plan") }
                    IconButton(onClick = onAllTasks) { Icon(Icons.AutoMirrored.Outlined.List, "All tasks") }
                    if (canManage) {
                        // Like a new calendar event: on the picked day in month view.
                        val day = if (view == CalendarView.Month && !selected.isBefore(today)) selected else null
                        IconButton(onClick = { onNewTask(day) }) { Icon(Icons.Outlined.Add, "New task") }
                    }
                    SafeWordAction()
                },
            )
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
            PlanLegend(session?.relationship, session?.userId, Modifier.padding(start = 24.dp, end = 24.dp, bottom = 8.dp))
            when (val s = state) {
                Load.Loading -> LoadingBox()
                is Load.Failed -> ErrorBox(s.message, vm::refresh)
                is Load.Ready -> if (s.value.view == CalendarView.Month) {
                    val items = s.value.days.firstOrNull { it.first == selected }?.second.orEmpty()
                    val events = s.value.eventsOn(selected)
                    LazyColumn(Modifier.fillMaxSize()) {
                        item(key = "grid") {
                            MonthGrid(s.value, selected, today, session?.relationship, onSelect = vm::select, Modifier.padding(horizontal = 8.dp))
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
                    // Letters: one hairline row per day, a diamond for each task and a word on how it went. Tap a day to open it.
                    item(key = "top") { HorizontalDivider(Modifier.padding(horizontal = 16.dp), color = MaterialTheme.colorScheme.outlineVariant) }
                    s.value.days.forEach { (day, all) ->
                        val occs = all.filter { it.status != app.obey.api.OccurrenceStatus.Cancelled }
                        val events = s.value.eventsOn(day)
                        val isOpen = day in openDays
                        item(key = "h-$day") {
                            WeekDayRow(day, today, occs, events, isOpen) { openDays = if (isOpen) openDays - day else openDays + day }
                        }
                        if (isOpen) {
                            dayItems(day, occs, events, occurrenceRow, planRow, planChip)
                            if (canManage && !day.isBefore(today)) item(key = "add-$day") {
                                TextButton(onClick = { onNewTask(day) }, modifier = Modifier.padding(start = 64.dp)) { Text("Add a task") }
                            }
                        }
                        item(key = "rule-$day") { HorizontalDivider(Modifier.padding(horizontal = 16.dp), color = MaterialTheme.colorScheme.outlineVariant) }
                    }
                }
            }
        }
    }

    plan?.let { (e, day) ->
        PlanDialog(e, day, onDismiss = { plan = null }, onChanged = vm::refresh)
    }

    running?.let { o -> app.obey.ui.today.RitualSheet(o, onDismiss = { running = null; vm.refresh() }, onNeedsProof = { running = null; noting = it }) }
    counting?.let { o -> app.obey.ui.today.CountDialog(o, onDismiss = { counting = null }, onSave = { n -> vm.count(o, to = n); counting = null }) }
    noting?.let { o -> app.obey.ui.today.DoneDialog(o, onDismiss = { noting = null }, onDone = { note, mood, entry -> vm.complete(o, note, mood, entry); noting = null }) }
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

/** A day in the week: short weekday over the date in the serif, a diamond per task, then "1 missed", "all done", "2 of 6", a plan or "Off day". */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun WeekDayRow(day: LocalDate, today: LocalDate, occs: List<Occurrence>, events: List<CalendarEvent>, open: Boolean, onToggle: () -> Unit) {
    val c = MaterialTheme.colorScheme
    val now = Instant.now()
    val states = occs.map { it.diamondState(now) }
    val missed = states.count { it == DiamondState.Owed }
    val done = occs.count { it.status == app.obey.api.OccurrenceStatus.Completed || it.status == app.obey.api.OccurrenceStatus.Excused }
    val plan = events.firstOrNull()?.let { e -> e.title + if (e.allDay) "" else " " + formatTime(e.startsAt) }
    val summary = when {
        occs.isEmpty() -> plan ?: "Off day"
        missed > 0 -> "$missed missed"
        done == occs.size -> "all done"
        day == today -> "$done of ${occs.size}"
        else -> plan ?: if (day.isBefore(today)) "$done of ${occs.size}" else ""
    }
    val isToday = day == today
    Row(
        Modifier.fillMaxWidth()
            .then(if (isToday) Modifier.background(c.surfaceContainerLowest).drawBehind { drawRect(c.primary, size = androidx.compose.ui.geometry.Size(2.dp.toPx(), size.height)) } else Modifier)
            .clickable(onClickLabel = if (open) "Close" else "Open") { onToggle() }
            .semantics { stateDescription = if (open) "Open" else "Closed"; contentDescription = "${formatDate(day)}, ${occs.size} tasks, $summary" }
            .heightIn(min = 68.dp)
            .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Column(Modifier.width(40.dp)) {
            Text(day.format(DateTimeFormatter.ofPattern("EEE")), style = MaterialTheme.typography.labelMedium, color = c.onSurfaceVariant)
            Text("${day.dayOfMonth}", style = MaterialTheme.typography.headlineMedium.copy(fontSize = 28.sp, lineHeight = 28.sp), color = if (isToday) c.primary else c.onSurface)
        }
        FlowRow(Modifier.weight(1f), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            states.forEach { Diamond(it, size = 12.dp) }
        }
        Text(summary, style = MaterialTheme.typography.bodyMedium, color = if (missed > 0) c.error else c.onSurfaceVariant)
    }
}
