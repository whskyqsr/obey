package app.obey.ui.today

import app.obey.ui.comments.CommentsSheet
import app.obey.ui.comments.SendBackDialog
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
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
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Event
import androidx.compose.material.icons.outlined.EventBusy
import androidx.compose.material.icons.outlined.FavoriteBorder
import androidx.compose.material.icons.outlined.Gavel
import androidx.compose.material.icons.outlined.Handshake
import androidx.compose.material.icons.outlined.MoreTime
import androidx.compose.material.icons.outlined.Redeem
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material.icons.outlined.SentimentDissatisfied
import androidx.compose.material.icons.outlined.TaskAlt
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
import app.obey.ui.location.canCheckIn
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
    onInvite: () -> Unit = {},
    onOpenTasks: () -> Unit = {},
    onOpenLocation: () -> Unit = {},
    onOpenAgreement: (edit: Boolean) -> Unit = {},
    onOpenRules: () -> Unit = {},
    onOpenProtocol: (String) -> Unit = {},
    vm: TodayViewModel = hiltViewModel(),
) {
    val state by vm.state.collectAsStateWithLifecycle()
    val refreshing by vm.refreshing.collectAsStateWithLifecycle()
    val offlineSince by vm.offlineSince.collectAsStateWithLifecycle()
    val locationReady by vm.locationReady.collectAsStateWithLifecycle()
    val curfew by vm.curfew.collectAsStateWithLifecycle()
    var askingMore by remember { mutableStateOf<app.obey.api.CurfewNight?>(null) }
    var approvingOther by remember { mutableStateOf<app.obey.api.CurfewRequest?>(null) }
    var changingEnd by remember { mutableStateOf<app.obey.api.CurfewClash?>(null) }
    val planChanges by vm.planChanges.collectAsStateWithLifecycle()
    val delays by vm.delays.collectAsStateWithLifecycle()
    val redemptions by vm.redemptions.collectAsStateWithLifecycle()
    val agreement by vm.agreement.collectAsStateWithLifecycle()
    val libraryChanges by vm.libraryChanges.collectAsStateWithLifecycle()
    val scenes by vm.scenes.collectAsStateWithLifecycle()
    val busy by vm.busy.collectAsStateWithLifecycle()
    var telling by remember { mutableStateOf<app.obey.api.CurfewNight?>(null) }
    var redeeming by remember { mutableStateOf<app.obey.api.LedgerEntry?>(null) }
    var replying by remember { mutableStateOf<NoteTarget?>(null) }
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
    var counting by remember { mutableStateOf<Occurrence?>(null) }
    var commenting by remember { mutableStateOf<Occurrence?>(null) }
    var sendingBack by remember { mutableStateOf<Occurrence?>(null) }
    var plan by remember { mutableStateOf<CalendarEvent?>(null) }
    var dayTasks by remember { mutableStateOf<List<Occurrence>?>(null) }
    var instead by remember { mutableStateOf<app.obey.api.RescheduleRequest?>(null) }
    val session = vm.session
    val partnerNames = session?.partners.orEmpty().joinToString(" and ") { it.displayName }.ifEmpty { "them" }
    val askWho = session?.partners.orEmpty().filter { it.role != app.obey.api.Role.Submissive }.let { if (it.size == 1) it[0].displayName else "your Dominant" }

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
                    onComplete = if (o.assigneeId == me && !o.isPlaced) ({ if (o.isRitual) running = o else if (o.needsDoneDialog) noting = o else vm.complete(o) }) else null,
                    onCompleteWithNote = if (o.assigneeId == me) ({ noting = o }) else null,
                    onReschedule = { rescheduling = o },
                    onEditTask = if (session?.canManage == true) ({ onEditTask(o.seriesId) }) else null,
                    onComments = { commenting = o },
                    onCount = if (o.assigneeId == me && o.canCount(true, session?.canManage == true)) ({ if (o.readyToSend) noting = o else vm.count(o, by = 1) { noting = it } }) else null,
                    onCountHold = if (o.canCount(o.assigneeId == me, session?.canManage == true)) ({ counting = o }) else null,
                    onCheckIn = if (o.canCheckIn(o.assigneeId == me)) ({ vm.checkIn(o) }) else null,
                )

                val isDom = session?.canManage == true
                val reviewIds = d.awaitingReview.map { it.id }.toSet()
                val missIds = d.recentMisses.map { it.id }.toSet()
                val restOfToday = if (isDom) d.today.filter { it.id !in reviewIds && it.id !in missIds } else d.today
                fun row(o: Occurrence, actions: OccurrenceActions = actionsFor(o)): @Composable () -> Unit = {
                    SwipeableRow(
                        o,
                        onDone = if (o.isPlaced) {
                            if (o.canCheckIn(o.assigneeId == me)) ({ vm.checkIn(o) }) else null
                        } else if (o.isCounted) {
                            if (o.assigneeId == me && o.canCount(true, isDom)) ({ if (o.readyToSend) noting = o else vm.count(o, by = 1) { noting = it } }) else null
                        } else if (o.assigneeId == me && o.status == OccurrenceStatus.Pending && o.isOpen()) ({ if (o.isRitual) running = o else if (o.needsDoneDialog) noting = o else vm.complete(o) }) else null,
                        // A Dominant moves anyone's deadline the same way a sub asks for more time on their own.
                        onMoreTime = if ((o.assigneeId == me || isDom) && o.status == OccurrenceStatus.Pending) ({ rescheduling = o }) else null,
                        moreTimeLabel = if (o.assigneeId == me) "More time" else "Reschedule",
                    ) {
                        OccurrenceRow(o, nameFor(o), actions, onOpen = { onOpenTask(o.seriesId) }, streak = d.streaks[o.seriesId])
                    }
                }

                fun nameOr(userId: String?) = userId?.let { session?.nameOf(it) } ?: "Someone"
                // Everything waiting on this person, one row per kind, in the same order as the web.
                val inbox = buildList {
                    if (d.requests.isNotEmpty()) add(
                        InboxGroup(
                            key = "requests",
                            icon = Icons.Outlined.MoreTime,
                            tone = InboxTone.Tertiary,
                            title = if (isDom) "${plural(d.requests.size, "request")} for more time" else "Waiting for approval",
                            subtitle = d.requests.joinToString(", ") { rows -> if (rows.size == 1) rows.first().title else plural(rows.size, "task") },
                            count = d.requests.size,
                            body = {
                                d.requests.forEach { rows ->
                                    ExtensionRequestCard(
                                        rows = rows,
                                        requester = if (rows.first().requestedBy == me) null else session?.nameOf(rows.first().requestedBy),
                                        canDecide = isDom && rows.first().requestedBy != me,
                                        onDecide = { vm.decide(rows, it) },
                                        onInstead = { instead = it },
                                    )
                                }
                            },
                        ),
                    )
                    if (isDom && d.awaitingReview.isNotEmpty()) add(
                        InboxGroup(
                            key = "review",
                            icon = Icons.Outlined.TaskAlt,
                            tone = InboxTone.Primary,
                            title = "Approve ${plural(d.awaitingReview.size, "task")}",
                            subtitle = d.awaitingReview.joinToString(", ") { it.title },
                            count = d.awaitingReview.size,
                            action = if (d.awaitingReview.size > 1) "Approve all" to { vm.approveAll(d.awaitingReview) } else null,
                            body = {
                                InboxRows {
                                    d.awaitingReview.forEach { o ->
                                        Column(Modifier.background(MaterialTheme.colorScheme.surface)) {
                                            row(o, OccurrenceActions(onApprove = { vm.review(o, true) }, onReject = { sendingBack = o }, onComments = { commenting = o }))()
                                            if (o.photoCount > 0) ProofPhotos(o.id, canAdd = false, modifier = Modifier.padding(start = 64.dp, end = 16.dp, bottom = 8.dp))
                                        }
                                    }
                                }
                            },
                        ),
                    )
                    if (isDom && d.recentMisses.isNotEmpty()) add(
                        InboxGroup(
                            key = "missed",
                            icon = Icons.Outlined.Close,
                            tone = InboxTone.Error,
                            title = plural(d.recentMisses.size, "missed task"),
                            subtitle = d.recentMisses.joinToString(", ") { o ->
                                o.title + if (parseInstant(o.dueAt).local().toLocalDate() != LocalDate.now()) ", yesterday" else ""
                            },
                            count = d.recentMisses.size,
                            body = {
                                InboxRows {
                                    d.recentMisses.forEach { o ->
                                        OccurrenceRow(o, nameFor(o), OccurrenceActions(onExcuse = { vm.excuse(o) }, onConfirmMiss = { vm.confirmMiss(o) }, onDropConsequence = if (o.missConsequence != null) ({ vm.dropConsequence(o) }) else null, onComments = { commenting = o }), onOpen = { onOpenTask(o.seriesId) }, streak = d.streaks[o.seriesId])
                                    }
                                }
                            },
                        ),
                    )
                    val curfewClashes = if (isDom) curfew?.clashes.orEmpty() else emptyList()
                    if (curfewClashes.isNotEmpty()) add(
                        InboxGroup(
                            key = "curfew",
                            icon = Icons.Outlined.EventBusy,
                            tone = InboxTone.Secondary,
                            title = if (curfewClashes.size == 1) "1 plan runs past curfew" else "${curfewClashes.size} plans run past curfew",
                            subtitle = curfewClashes.joinToString(", ") { it.eventTitle },
                            count = curfewClashes.size,
                            body = {
                                curfewClashes.forEach { c ->
                                    CurfewClashCard(c, onExcuse = { vm.excuseCurfew(c.occurrenceId, "Curfew excused that night") }, onChangeEnd = { changingEnd = c }, onLeave = { vm.leaveClash(c) })
                                }
                            },
                        ),
                    )
                    if (d.clashingPlans.isNotEmpty()) add(
                        InboxGroup(
                            key = "clashes",
                            icon = Icons.Outlined.EventBusy,
                            tone = InboxTone.Secondary,
                            title = if (d.clashingPlans.size == 1) "1 plan overlaps tasks" else "${d.clashingPlans.size} plans overlap tasks",
                            subtitle = d.clashingPlans.joinToString(", ") { it.title },
                            count = d.clashingPlans.size,
                            body = {
                                d.clashingPlans.forEach { e -> PlanHeadsUp(e, planTone(e, session?.relationship)) { plan = e } }
                            },
                        ),
                    )
                    agreement?.let { v ->
                        val mine = v.proposedBy == me
                        val quote = (if (mine) v.feedback?.note else v.note)?.takeIf { it.isNotBlank() }?.let { " · “$it”" } ?: ""
                        add(
                            InboxGroup(
                                key = "agreement",
                                icon = Icons.Outlined.Handshake,
                                tone = InboxTone.Secondary,
                                title = "Agreement version ${v.number}",
                                subtitle = (if (mine) "${nameOr(v.feedback?.userId)} asked for changes" else "Proposed by ${v.proposedBy?.let { session?.nameOf(it) } ?: "someone"}") + quote,
                                count = 1,
                                onOpen = { onOpenAgreement(mine) },
                            ),
                        )
                    }
                    // Scene check-ins that ask for the others reach anyone, not just a Dominant.
                    val sceneChecks = scenes?.scenes.orEmpty()
                        .flatMap { s -> s.checks.map { s to it } }
                        .filter { (_, c) ->
                            c.userId != me && !c.seen && c.wantsPartner &&
                                !parseInstant(c.at).local().toLocalDate().isBefore(LocalDate.now().minusDays(1))
                        }
                        .sortedByDescending { it.second.at }
                    if (sceneChecks.isNotEmpty()) add(
                        InboxGroup(
                            key = "sceneChecks",
                            icon = Icons.Outlined.FavoriteBorder,
                            tone = InboxTone.Error,
                            title = if (sceneChecks.size == 1) "Check in with ${nameOr(sceneChecks[0].second.userId)}" else plural(sceneChecks.size, "check-in") + " after a scene",
                            subtitle = sceneChecks.joinToString(", ") { (_, c) ->
                                if (c.note.isNotBlank()) "${nameOr(c.userId)} still needs something" else "${nameOr(c.userId)} felt ${app.obey.ui.common.moodLabel(c.mood).lowercase()}"
                            },
                            count = sceneChecks.size,
                            body = {
                                InboxRows {
                                    sceneChecks.forEach { (s, c) ->
                                        val who = nameOr(c.userId)
                                        SceneCheckRow(
                                            s,
                                            c,
                                            who,
                                            onSeen = { vm.sceneCheckSeen(s, c) },
                                            onReply = { replying = NoteTarget("", "", who, "$who feeling ${app.obey.ui.common.moodLabel(c.mood).lowercase()} after ${s.title.ifBlank { "the scene" }}", sceneId = s.id) },
                                        )
                                    }
                                }
                            },
                        ),
                    )
                    if (isDom && d.lowMoods.isNotEmpty()) add(
                        InboxGroup(
                            key = "moods",
                            icon = Icons.Outlined.SentimentDissatisfied,
                            tone = InboxTone.Error,
                            title = plural(d.lowMoods.size, "low check-in"),
                            subtitle = d.lowMoods.joinToString(", ") { o ->
                                "${session?.nameOf(o.assigneeId) ?: "Your partner"} felt ${app.obey.ui.common.moodLabel(o.mood ?: 1).lowercase()} after ${o.title}"
                            },
                            count = d.lowMoods.size,
                            body = {
                                InboxRows {
                                    d.lowMoods.forEach { o ->
                                        val who = session?.nameOf(o.assigneeId) ?: "Your partner"
                                        MoodRow(
                                            o,
                                            who,
                                            onSeen = { vm.moodSeen(o) },
                                            onReply = { replying = NoteTarget("", o.id, who, "$who feeling ${app.obey.ui.common.moodLabel(o.mood ?: 1).lowercase()} (${o.title})") },
                                        )
                                    }
                                }
                            },
                        ),
                    )
                    if (isDom && redemptions.isNotEmpty()) add(
                        InboxGroup(
                            key = "rewards",
                            icon = Icons.Outlined.Redeem,
                            tone = InboxTone.Primary,
                            title = "${plural(redemptions.size, "reward")} to give",
                            subtitle = redemptions.joinToString(", ") { it.note },
                            count = redemptions.size,
                            body = {
                                InboxRows {
                                    redemptions.forEach { e -> RedemptionRow(e, session?.nameOf(e.userId) ?: "Your partner") { redeeming = e } }
                                }
                            },
                        ),
                    )
                    // Updates: nothing to decide, so each kind clears in one tap.
                    if (isDom && delays.isNotEmpty()) add(
                        InboxGroup(
                            key = "delays",
                            icon = Icons.Outlined.Schedule,
                            tone = InboxTone.Neutral,
                            title = if (delays.map { it.requestedBy }.toSet().size == 1) {
                                "${session?.nameOf(delays.first().requestedBy) ?: "Your partner"} used ${plural(delays.size, "delay")}"
                            } else {
                                plural(delays.size, "delay used", "delays used")
                            },
                            subtitle = delays.flatMap { it.items }.joinToString(", ") { it.title },
                            count = delays.size,
                            action = "Mark all seen" to { vm.seenDelays(delays) },
                            body = {
                                delays.forEach { x -> DelayCard(x, session?.nameOf(x.requestedBy) ?: "Your partner") { vm.seenDelay(x) } }
                            },
                        ),
                    )
                    if (planChanges.isNotEmpty()) add(
                        InboxGroup(
                            key = "plans",
                            icon = Icons.Outlined.Event,
                            tone = InboxTone.Neutral,
                            title = if (planChanges.size == 1) "1 plan changed" else "${planChanges.size} plans changed",
                            subtitle = planChanges.joinToString(", ") { e -> if (e.previousEndsAt != null) "${e.title} now ends ${app.obey.ui.common.formatTime(e.endsAt)}" else e.title },
                            count = planChanges.size,
                            action = "Mark all seen" to { vm.seenPlanChanges(planChanges) },
                            body = {
                                planChanges.forEach { e -> PlanChangeCard(e, nameOr(e.changedBy)) { vm.seenPlanChange(e) } }
                            },
                        ),
                    )
                    if (libraryChanges.isNotEmpty()) {
                        val kinds = libraryChanges.map { it.kind }.toSet()
                        add(
                            InboxGroup(
                                key = "library",
                                icon = Icons.Outlined.Gavel,
                                tone = InboxTone.Neutral,
                                title = if (kinds.size == 2) "Rules and protocols changed" else if ("rules" in kinds) "Rules changed" else "Protocols changed",
                                subtitle = librarySummary(libraryChanges) { nameOr(it) },
                                count = libraryChanges.size,
                                action = "Mark all seen" to { vm.seenLibraryChanges(libraryChanges.map { it.id }, "Marked seen") },
                                body = {
                                    InboxRows {
                                        libraryChanges.forEach { c ->
                                            LibraryChangeRow(
                                                c,
                                                nameOr(c.changedBy),
                                                onOpen = when {
                                                    c.verb == "removed" -> null
                                                    c.kind == "protocols" -> ({ onOpenProtocol(c.itemId) })
                                                    else -> onOpenRules
                                                },
                                                onSeen = { vm.seenLibraryChanges(listOf(c.id)) },
                                            )
                                        }
                                    }
                                },
                            ),
                        )
                    }
                }
                val waiting = inbox.sumOf { it.count }

                LazyColumn(Modifier.fillMaxSize()) {
                    offlineSince?.let { at -> item(key = "offline") { OfflineBanner(at) } }
                    if (session?.readOnly == true) item(key = "ended") { EndedBanner(onOpenSettings) }
                    if (session?.relationship?.roleSwap != null) item(key = "role-swap") { app.obey.ui.roles.RoleSwapCard(session) }
                    if (session?.readOnly != true) {
                        item(key = "countdown") {
                            val other = session?.partners?.firstOrNull()
                            CountdownCard(
                                list = d.today + d.later.flatMap { it.second },
                                me = me,
                                isDom = isDom,
                                who = { o ->
                                    when {
                                        session?.solo == true -> null
                                        o.assigneeId == me -> other?.let { "From ${it.displayName}" }
                                        else -> "For ${session?.nameOf(o.assigneeId)}"
                                    }
                                },
                                onDone = { o -> if (o.isRitual) running = o else if (o.needsDoneDialog) noting = o else vm.complete(o) },
                                onMoreTime = { o -> rescheduling = o },
                                onOpen = { o -> onOpenTask(o.seriesId) },
                            )
                        }
                    }
                    if (session != null && !session.readOnly) item(key = "solo") { SoloCards(session, onInvite, onOpenTasks) }
                    if (session != null && session.relationship?.features?.chastity == true && !session.readOnly && !session.solo) item(key = "chastity") { app.obey.ui.chastity.ChastityTodayCard(session) }
                    curfew?.night?.let { n ->
                        item(key = "curfew") {
                            val mine = n.assigneeId == me
                            val asked = curfew?.requests?.firstOrNull { it.occurrenceId == n.occurrenceId }
                            val beforeCurfew = runCatching { java.time.Instant.parse(n.dueAt).isAfter(java.time.Instant.now()) }.getOrDefault(false)
                            CurfewStrip(
                                night = n,
                                mine = mine,
                                name = session?.nameOf(n.assigneeId) ?: "Your partner",
                                canDecide = session?.canManage == true,
                                cost = curfew?.cost,
                                onHome = { if (n.reportHome) telling = n else vm.homeForCurfew(n) },
                                askWho = askWho,
                                onTell = { telling = n },
                                onReply = {
                                    val who = session?.nameOf(n.assigneeId) ?: "them"
                                    replying = NoteTarget("", n.occurrenceId, who, "$who getting home tonight")
                                },
                                onExcuse = { vm.excuseCurfew(n.occurrenceId, "Excused", session?.nameOf(n.assigneeId)) },
                                onConfirm = { vm.confirmCurfewMiss(n) },
                                waiting = if (asked != null && beforeCurfew) " · asked ${if (mine) askWho else "you"} for ${app.obey.ui.common.formatTime(asked.untilAt)}" else "",
                                note = n.note?.takeIf { mine }?.let { " · $askWho: “$it”" } ?: "",
                                onMoreTime = if (mine && beforeCurfew && n.arrivedAt == null && n.status == OccurrenceStatus.Pending && asked == null) ({ askingMore = n }) else null,
                            )
                        }
                    }
                    if (session != null) scenes?.let { t ->
                        item(key = "scenes") { app.obey.ui.scenes.SceneCards(t, session, busy, onAftercareDone = vm::aftercareDone, onCheck = vm::checkInOnScene) }
                    }
                    if (isDom) items(curfew?.requests.orEmpty(), key = { "ask-${it.id}" }) { r ->
                        CurfewAskCard(
                            r,
                            session?.nameOf(r.requestedBy) ?: "Your partner",
                            onApprove = { vm.approveCurfew(r, null) },
                            onChange = { approvingOther = r },
                            onDecline = { vm.declineCurfew(r) },
                        )
                    }
                    if (isDom && d.noTasks && session?.readOnly != true) item(key = "kits") { KitPrompt(onKits) }
                    // Someone with location tasks whose phone can't notice them arriving.
                    val paused = session?.myMember?.locationPaused == true
                    if (!locationReady && !paused && (d.overdue + d.today + d.later.flatMap { it.second }).any { it.assigneeId == me && it.isPlaced && it.status == OccurrenceStatus.Pending }) {
                        item(key = "location") { app.obey.ui.location.LocationSetupPrompt(onOpenLocation) }
                    }
                    if (!isDom || session?.solo == true) {
                        val counted = d.today.filter { it.status != OccurrenceStatus.Excused }
                        if (counted.isNotEmpty()) item(key = "progress") { ProgressCard(counted) }
                    }
                    if (inbox.isNotEmpty()) item(key = "inbox") { TodayInbox(if (isDom) "Needs you" else "For you", inbox, busy) }
                    if (d.overdue.isNotEmpty()) {
                        item(key = "h-over") { SectionHeader("Overdue") }
                        items(d.overdue, key = { "o-" + it.id }) { o -> row(o)() }
                    }
                    item(key = "h-today") { SectionHeader(if (isDom && waiting > 0) "Rest of today" else "Today") }
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
    counting?.let { o -> CountDialog(o, onDismiss = { counting = null }, onSave = { n -> vm.count(o, to = n); counting = null }) }
    // "I'm here" needs the phone's location once; the full setup lives on the Location screen.
    val askLocation by vm.askLocation.collectAsStateWithLifecycle()
    val locationPermission = androidx.activity.compose.rememberLauncherForActivityResult(androidx.activity.result.contract.ActivityResultContracts.RequestMultiplePermissions()) {
        askLocation?.let { o -> vm.checkIn(o, afterAsking = true) }
    }
    LaunchedEffect(askLocation) {
        if (askLocation != null) locationPermission.launch(arrayOf(android.Manifest.permission.ACCESS_FINE_LOCATION, android.Manifest.permission.ACCESS_COARSE_LOCATION))
    }

    noting?.let { o -> DoneDialog(o, onDismiss = { noting = null }, sendTo = askWho, onDone = { note, mood, entry -> vm.complete(o, note, mood, entry); noting = null }) }
    askingMore?.let { n ->
        MoreTimeSheet(n, askWho, busy, onDismiss = { askingMore = null }) { until, reason -> vm.askCurfew(n, until, reason, askWho) { askingMore = null } }
    }
    approvingOther?.let { r ->
        ApproveOtherTimeSheet(r, session?.nameOf(r.requestedBy) ?: "They", busy, onDismiss = { approvingOther = null }) { until, note -> vm.approveCurfew(r, until, note) { approvingOther = null } }
    }
    changingEnd?.let { c ->
        PlanEndSheet(c, partnerNames, busy, onDismiss = { changingEnd = null }) { endsAt, note -> vm.changePlanEnd(c, endsAt, note) { changingEnd = null } }
    }

    // The "I'm home" app shortcut: once tonight's curfew has loaded, do what its I'm home button does.
    val pending by app.obey.push.PendingNav.target.collectAsStateWithLifecycle()
    LaunchedEffect(pending, curfew) {
        if (pending != app.obey.push.PendingNav.HOME) return@LaunchedEffect
        val located = session?.relationship?.features?.location == true
        val c = curfew
        if (located && c == null) return@LaunchedEffect
        app.obey.push.PendingNav.target.value = null
        val n = c?.night?.takeIf { it.assigneeId == session?.userId }
        when {
            n != null && n.arrivedAt == null && n.canTap -> if (n.reportHome) telling = n else vm.homeForCurfew(n)
            n != null && n.arrivedAt != null && n.reportHome && n.toldAt == null -> telling = n
            else -> vm.nothingToReport(n?.arrivedAt != null)
        }
    }

    // A one-tap decision's snackbar offers "Add a note" for a few seconds.
    val noteFor by vm.noteFor.collectAsStateWithLifecycle()
    var writingNote by remember { mutableStateOf<NoteTarget?>(null) }
    LaunchedEffect(noteFor) {
        val t = noteFor ?: return@LaunchedEffect
        vm.noteForShown()
        if (snackbar.showSnackbar(t.text, actionLabel = "Add a note", duration = SnackbarDuration.Long) == SnackbarResult.ActionPerformed) writingNote = t
    }
    replying?.let { t -> NoteDialog(t, busy, title = "Reply to ${t.to}", onDismiss = { replying = null }) { body -> vm.addNote(t, body) { replying = null } } }
    telling?.let { n ->
        TellHomeDialog(askWho, busy, onDismiss = { telling = null }) { note ->
            if (n.arrivedAt != null) vm.tellHome(n, note, askWho) { telling = null } else vm.homeForCurfew(n, note, askWho) { telling = null }
        }
    }
    redeeming?.let { e ->
        RedeemedDialog(e, session?.nameOf(e.userId) ?: "them", busy, onDismiss = { redeeming = null }) { note -> vm.markRedeemed(e, note) { redeeming = null } }
    }
    writingNote?.let { t -> NoteDialog(t, busy, onDismiss = { writingNote = null }) { body -> vm.addNote(t, body) { writingNote = null } } }
}
