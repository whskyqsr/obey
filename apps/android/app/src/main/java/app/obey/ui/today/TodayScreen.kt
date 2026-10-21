package app.obey.ui.today

import app.obey.ui.comments.CommentsSheet
import app.obey.ui.comments.SendBackDialog
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import app.obey.ui.plans.PlanDialog
import app.obey.ui.plans.PlanHeadsUp
import app.obey.ui.plans.planTone
import app.obey.ui.plans.firstDay
import app.obey.ui.plans.iso
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.MoreTime
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.obey.api.CalendarEvent
import app.obey.api.Occurrence
import app.obey.api.OccurrenceStatus
import app.obey.ui.common.EmptyBox
import app.obey.ui.kits.KitPrompt
import app.obey.ui.common.ErrorBox
import app.obey.ui.common.Load
import app.obey.ui.common.LoadingBox
import app.obey.ui.common.MessageEffect
import app.obey.ui.common.SectionHeader
import app.obey.ui.common.MenuButton
import app.obey.ui.common.SafeWordAction
import app.obey.ui.common.SettingsAction
import app.obey.ui.common.local
import app.obey.ui.proof.ProofPhotos
import app.obey.ui.proof.proofViewModel
import app.obey.ui.common.parseInstant
import app.obey.ui.common.formatDue
import java.time.LocalDate
import java.time.format.DateTimeFormatter

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TodayScreen(
    onNewTask: () -> Unit,
    onEditTask: (String) -> Unit,
    onOpenTask: (String) -> Unit,
    onOpenSettings: () -> Unit,
    onKits: () -> Unit,
    vm: TodayViewModel = hiltViewModel(),
) {
    val state by vm.state.collectAsStateWithLifecycle()
    val refreshing by vm.refreshing.collectAsStateWithLifecycle()
    val offlineSince by vm.offlineSince.collectAsStateWithLifecycle()
    val message by vm.message.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    MessageEffect(message, snackbar, vm::messageShown)
    // Load on first show and whenever we come back (e.g. from the task editor).
    LifecycleResumeEffect(Unit) {
        vm.refresh()
        onPauseOrDispose { }
    }

    var rescheduling by remember { mutableStateOf<Occurrence?>(null) }
    var noting by remember { mutableStateOf<Occurrence?>(null) }
    var running by remember { mutableStateOf<Occurrence?>(null) }
    var commenting by remember { mutableStateOf<Occurrence?>(null) }
    var sendingBack by remember { mutableStateOf<Occurrence?>(null) }
    var plan by remember { mutableStateOf<CalendarEvent?>(null) }
    var dayTasks by remember { mutableStateOf<List<Occurrence>?>(null) }
    var instead by remember { mutableStateOf<app.obey.api.RescheduleRequest?>(null) }
    val session = vm.session

    Scaffold(
        topBar = {
            TopAppBar(
                navigationIcon = { MenuButton() },
                title = {
                    Text(LocalDate.now().format(DateTimeFormatter.ofPattern("EEEE d MMMM")))
                },
                actions = { SafeWordAction(); SettingsAction(onOpenSettings) },
            )
        },
        floatingActionButton = {
            if (session?.canManage == true) {
                ExtendedFloatingActionButton(
                    onClick = onNewTask,
                    icon = { Icon(Icons.Outlined.Add, null) },
                    text = { Text("Task") },
                )
            }
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        when (val s = state) {
            Load.Loading -> LoadingBox(Modifier.padding(padding))
            is Load.Failed -> ErrorBox(s.message, vm::refresh, Modifier.padding(padding))
            is Load.Ready -> PullToRefreshBox(
                isRefreshing = refreshing,
                onRefresh = vm::refresh,
                modifier = Modifier.padding(padding).fillMaxSize(),
            ) {
                val d = s.value
                val me = session?.userId
                fun nameFor(o: Occurrence) = if (o.assigneeId == me) null else session?.nameOf(o.assigneeId)
                fun actionsFor(o: Occurrence) = OccurrenceActions(
                    // A task that needs proof opens the Done sheet instead of completing in one tap.
                    onComplete = if (o.assigneeId == me) ({ if (o.isRitual) running = o else if (o.needsDoneDialog) noting = o else vm.complete(o) }) else null,
                    onCompleteWithNote = if (o.assigneeId == me) ({ noting = o }) else null,
                    onReschedule = { rescheduling = o },
                    onEditTask = if (session?.canManage == true) ({ onEditTask(o.seriesId) }) else null,
                    onComments = { commenting = o },
                )

                val isDom = session?.canManage == true
                val reviewIds = d.awaitingReview.map { it.id }.toSet()
                val missIds = d.recentMisses.map { it.id }.toSet()
                val needs = if (isDom) d.requests.size + d.awaitingReview.size + d.recentMisses.size else 0
                val restOfToday = if (isDom) d.today.filter { it.id !in reviewIds && it.id !in missIds } else d.today
                fun row(o: Occurrence, actions: OccurrenceActions = actionsFor(o)): @Composable () -> Unit = {
                    SwipeableRow(
                        o,
                        onDone = if (o.assigneeId == me && o.status == OccurrenceStatus.Pending && o.isOpen()) ({ if (o.isRitual) running = o else if (o.needsDoneDialog) noting = o else vm.complete(o) }) else null,
                        // A Dominant moves anyone's deadline the same way a sub asks for more time on their own.
                        onMoreTime = if ((o.assigneeId == me || isDom) && o.status == OccurrenceStatus.Pending) ({ rescheduling = o }) else null,
                        moreTimeLabel = if (o.assigneeId == me) "More time" else "Reschedule",
                    ) {
                        OccurrenceRow(o, nameFor(o), actions, onOpen = { onOpenTask(o.seriesId) }, streak = d.streaks[o.seriesId])
                    }
                }

                LazyColumn(Modifier.fillMaxSize()) {
                    offlineSince?.let { at -> item(key = "offline") { OfflineBanner(at) } }
                    if (session?.readOnly == true) item(key = "ended") { EndedBanner(onOpenSettings) }
                    items(d.clashingPlans, key = { "plan-${it.id}" }) { e -> PlanHeadsUp(e, planTone(e, session?.relationship)) { plan = e } }
                    if (isDom && d.noTasks && session?.readOnly != true) item(key = "kits") { KitPrompt(onKits) }
                    if (!isDom) {
                        val counted = d.today.filter { it.status != OccurrenceStatus.Excused }
                        if (counted.isNotEmpty()) item(key = "progress") { ProgressCard(counted) }
                    }
                    if (isDom && needs > 0) {
                        item(key = "h-needs") { SectionHeader("Needs you · $needs") }
                    }
                    if (d.requests.isNotEmpty()) {
                        if (!isDom) item(key = "h-req") { SectionHeader("Waiting for approval") }
                        items(d.requests, key = { "r-" + (it.first().groupId ?: it.first().id) }) { rows ->
                            ExtensionRequestCard(
                                rows = rows,
                                requester = if (rows.first().requestedBy == me) null else session?.nameOf(rows.first().requestedBy),
                                canDecide = isDom && rows.first().requestedBy != me,
                                onDecide = { vm.decide(rows, it) },
                                onInstead = { instead = it },
                            )
                        }
                    }
                    if (isDom) {
                        items(d.awaitingReview, key = { "v-" + it.id }) { o ->
                            androidx.compose.foundation.layout.Column {
                                row(o, OccurrenceActions(onApprove = { vm.review(o, true) }, onReject = { sendingBack = o }, onComments = { commenting = o }))()
                                if (o.photoCount > 0) ProofPhotos(o.id, canAdd = false, modifier = Modifier.padding(start = 64.dp, end = 16.dp, bottom = 8.dp))
                            }
                        }
                        items(d.recentMisses, key = { "m-" + it.id }) { o ->
                            OccurrenceRow(o, nameFor(o), OccurrenceActions(onExcuse = { vm.excuse(o) }, onConfirmMiss = { vm.confirmMiss(o) }, onComments = { commenting = o }), onOpen = { onOpenTask(o.seriesId) }, streak = d.streaks[o.seriesId])
                        }
                    }
                    if (d.overdue.isNotEmpty()) {
                        item(key = "h-over") { SectionHeader("Overdue") }
                        items(d.overdue, key = { "o-" + it.id }) { o -> row(o)() }
                    }
                    item(key = "h-today") { SectionHeader(if (isDom && needs > 0) "Rest of today" else "Today") }
                    // Whole-day extension: the user's own open tasks for today, plus today's that already slipped.
                    // Tasks that already have a request waiting aren't offered again.
                    val asked = d.requests.flatten().map { it.occurrenceId }.toSet()
                    val mine = (d.overdue + d.today).filter {
                        it.assigneeId == me && it.status == OccurrenceStatus.Pending && it.id !in asked &&
                            parseInstant(it.dueAt).local().toLocalDate() == LocalDate.now()
                    }
                    if (mine.size > 1) {
                        item(key = "a-day") {
                            FilledTonalButton(onClick = { dayTasks = mine }, modifier = Modifier.padding(horizontal = 16.dp)) {
                                Icon(Icons.Outlined.MoreTime, contentDescription = null)
                                Text("  More time for today")
                            }
                        }
                    }
                    if (restOfToday.isEmpty()) {
                        item(key = "e-today") {
                            EmptyBox("Nothing else due today", if (d.overdue.isEmpty()) "Enjoy it, or ask for more." else null)
                        }
                    } else {
                        items(restOfToday, key = { "t-" + it.id }) { o -> row(o)() }
                    }
                    if (d.later.isNotEmpty()) {
                        item(key = "h-later") { SectionHeader("Later") }
                        items(d.later, key = { "l-" + it.first }) { (day, list) ->
                            LaterDay(day, list) { o -> OccurrenceRow(o, nameFor(o), actionsFor(o), onOpen = { onOpenTask(o.seriesId) }, streak = d.streaks[o.seriesId]) }
                        }
                    }
                    item(key = "spacer") { androidx.compose.foundation.layout.Spacer(Modifier.padding(48.dp)) }
                }
            }
        }
    }

    // A completion gets a snackbar with Undo, like a swipe in Gmail.
    val completed by vm.completed.collectAsStateWithLifecycle()
    LaunchedEffect(completed) {
        val o = completed ?: return@LaunchedEffect
        vm.completedShown()
        val sent = o.status == OccurrenceStatus.Submitted
        val result = snackbar.showSnackbar(
            if (o.waitingToSync) "Done offline: ${o.title}. It'll sync when you're back online." else "${if (sent) "Sent for approval" else "Done"}: ${o.title}",
            actionLabel = "Undo",
            duration = SnackbarDuration.Long,
        )
        if (result == SnackbarResult.ActionPerformed) vm.undoComplete(o)
    }

    commenting?.let { o -> CommentsSheet(o, onDismiss = { commenting = null }, onChanged = vm::refresh) }
    instead?.let { r ->
        val from = parseInstant(if (r.kind == "cancel") r.fromDueAt else r.toDueAt).local()
        DeadlinePicker(
            initial = if (r.kind == "cancel") from.plusDays(1) else from,
            onPicked = { vm.decideInstead(r, it.iso()); instead = null },
            onDismiss = { instead = null },
        )
    }
    sendingBack?.let { o ->
        SendBackDialog(o, onDismiss = { sendingBack = null }, onConfirm = { vm.review(o, false, it); sendingBack = null })
    }
    rescheduling?.let { o ->
        RescheduleSheet(o, onDismiss = { rescheduling = null }, onSubmit = { vm.reschedule(o, it) })
    }

    plan?.let { e ->
        PlanDialog(e, e.firstDay(), onDismiss = { plan = null }, onChanged = vm::refresh)
    }

    dayTasks?.let { tasks ->
        DayRescheduleSheet(
            tasks = tasks,
            onDismiss = { dayTasks = null },
            onSubmit = { ids, hours, reason -> vm.rescheduleDay(ids, hours, reason) },
        )
    }

    running?.let { o -> RitualSheet(o, onDismiss = { running = null; vm.refresh() }, onNeedsProof = { running = null; noting = it }) }
    noting?.let { o -> DoneDialog(o, onDismiss = { noting = null }, onDone = { note, mood, entry -> vm.complete(o, note, mood, entry); noting = null }) }
}
