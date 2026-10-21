package app.obey.ui.tasks

import app.obey.ui.comments.CommentsSheet
import app.obey.ui.comments.SendBackDialog
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.outlined.MoreVert
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SuggestionChip
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.navigation.toRoute
import app.obey.api.CompleteOccurrenceInput
import app.obey.api.EditOccurrenceInput
import app.obey.api.HistoryEntry
import app.obey.api.ObeyApi
import app.obey.api.Occurrence
import app.obey.api.OccurrenceStatus
import app.obey.api.RescheduleInput
import app.obey.api.Task
import app.obey.api.TaskStats
import app.obey.data.Session
import app.obey.data.SessionRepository
import app.obey.ui.TaskDetailRoute
import app.obey.ui.TaskHistoryRoute
import app.obey.ui.common.BaseViewModel
import app.obey.ui.common.ErrorBox
import app.obey.ui.common.Load
import app.obey.ui.common.LoadingBox
import app.obey.ui.common.LocalFeatures
import app.obey.ui.common.MessageEffect
import app.obey.ui.common.SectionHeader
import app.obey.ui.common.formatClock
import app.obey.ui.common.formatDate
import app.obey.ui.common.formatDue
import app.obey.ui.common.loadCatching
import app.obey.ui.common.local
import app.obey.ui.common.parseInstant
import app.obey.ui.common.signed
import app.obey.ui.notes.MarkdownPreview
import app.obey.ui.today.needsDoneDialog
import app.obey.ui.today.OccurrenceActions
import app.obey.ui.today.OccurrenceRow
import app.obey.ui.today.RescheduleSheet
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.Instant
import java.time.LocalDate
import javax.inject.Inject
import kotlinx.coroutines.async
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch

data class TaskDetail(val task: Task, val stats: TaskStats?, val current: List<Occurrence>)

@HiltViewModel
class TaskDetailViewModel @Inject constructor(
    savedState: SavedStateHandle,
    private val api: ObeyApi,
    private val sessions: SessionRepository,
) : BaseViewModel() {
    val taskId: String = savedState.toRoute<TaskDetailRoute>().taskId

    private val _state = MutableStateFlow<Load<TaskDetail>>(Load.Loading)
    val state: StateFlow<Load<TaskDetail>> = _state.asStateFlow()
    val session: Session? get() = sessions.session

    private val _deleted = Channel<Unit>(Channel.CONFLATED)
    val deleted = _deleted.receiveAsFlow()

    fun refresh() {
        viewModelScope.launch {
            if (_state.value !is Load.Ready) _state.value = Load.Loading
            _state.value = loadCatching { fetch() }
        }
    }

    private suspend fun fetch(): TaskDetail = coroutineScope {
        val relId = sessions.requireRelationshipId()
        val today = LocalDate.now()
        val stats = async { runCatching { api.taskStats(taskId) }.getOrNull() }
        val occ = async { api.occurrences(relId, today.minusDays(CURRENT_DAYS_BACK).toString(), today.plusDays(CURRENT_DAYS_AHEAD).toString()) }
        val task = api.tasks(relId).firstOrNull { it.id == taskId } ?: error("That task doesn't exist any more.")
        TaskDetail(task, stats.await(), currentByTask(occ.await().filter { it.seriesId == taskId })[taskId].orEmpty())
    }

    fun complete(o: Occurrence, note: String? = null, mood: Int? = null) = action {
        val r = api.complete(o.id, CompleteOccurrenceInput(noteMd = note?.takeIf { it.isNotBlank() }, mood = mood))
        say(if (r.status == OccurrenceStatus.Submitted) "Sent for approval" else if (mood != null) "Checked in" else "Marked done")
        refresh()
    }

    fun review(o: Occurrence, approve: Boolean, comment: String? = null) = action {
        api.review(o.id, app.obey.api.ReviewOccurrenceInput(approve = approve, comment = comment))
        say(if (approve) "Approved" else "Sent back")
        refresh()
    }

    fun reschedule(o: Occurrence, input: RescheduleInput) = action {
        val r = api.reschedule(o.id, input)
        say(if (r.applied) "Moved to ${formatDue(r.occurrence.dueAt)}" else "Extension requested; waiting for approval")
        refresh()
    }

    fun delete() = action {
        api.deleteTask(taskId)
        _deleted.trySend(Unit)
    }
}

/** One task: what it is, how it's going and what's due now. History and editing live under the ⋮ menu. */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun TaskDetailScreen(
    onBack: () -> Unit,
    onEdit: (String) -> Unit,
    onHistory: (String) -> Unit,
    vm: TaskDetailViewModel = hiltViewModel(),
) {
    val state by vm.state.collectAsStateWithLifecycle()
    val message by vm.message.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    MessageEffect(message, snackbar, vm::messageShown)
    LaunchedEffect(Unit) { vm.deleted.collect { onBack() } }
    // Reload on return from the editor or history.
    LifecycleResumeEffect(Unit) {
        vm.refresh()
        onPauseOrDispose { }
    }
    val session = vm.session
    val canManage = session?.canManage == true
    val features = LocalFeatures.current
    var menu by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }
    var rescheduling by remember { mutableStateOf<Occurrence?>(null) }
    var noting by remember { mutableStateOf<Occurrence?>(null) }
    var running by remember { mutableStateOf<Occurrence?>(null) }
    var commenting by remember { mutableStateOf<Occurrence?>(null) }
    var sendingBack by remember { mutableStateOf<Occurrence?>(null) }
    val title = (state as? Load.Ready)?.value?.task?.title.orEmpty()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(title, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Back") } },
                actions = {
                    if (canManage) IconButton(onClick = { onEdit(vm.taskId) }) { Icon(Icons.Outlined.Edit, "Edit") }
                    Box {
                        IconButton(onClick = { menu = true }) { Icon(Icons.Outlined.MoreVert, "More options") }
                        DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                            DropdownMenuItem(
                                text = { Text("History") },
                                leadingIcon = { Icon(Icons.Outlined.History, null) },
                                onClick = { menu = false; onHistory(vm.taskId) },
                            )
                            if (canManage) {
                                DropdownMenuItem(
                                    text = { Text("Delete", color = MaterialTheme.colorScheme.error) },
                                    leadingIcon = { Icon(Icons.Outlined.Delete, null, tint = MaterialTheme.colorScheme.error) },
                                    onClick = { menu = false; confirmDelete = true },
                                )
                            }
                        }
                    }
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        when (val s = state) {
            Load.Loading -> LoadingBox(Modifier.padding(padding))
            is Load.Failed -> ErrorBox(s.message, vm::refresh, Modifier.padding(padding))
            is Load.Ready -> Box(Modifier.padding(padding).fillMaxSize(), contentAlignment = Alignment.TopCenter) {
                val (task, stats, current) = s.value
                Column(Modifier.widthIn(max = 720.dp).fillMaxWidth().verticalScroll(rememberScrollState())) {
                    Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(
                            listOfNotNull(task.summary + (task.dueTime?.let { " at ${formatClock(it)}" } ?: ", all day"), session?.nameOf(task.assigneeId)).joinToString(" · "),
                            style = MaterialTheme.typography.bodyLarge,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        val tags = listOfNotNull(
                            if (task.assignedConsequenceId != null) "Consequence" else null,
                            if (!task.active) "Paused" else null,
                            if (features.points && task.points != 0) "${signed(task.points)} pts" else null,
                            if (task.approvalRequired) "Needs approval" else null,
                            if (task.proofRequired) "Proof required" else null,
                        )
                        if (tags.isNotEmpty()) {
                            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                tags.forEach { SuggestionChip(onClick = {}, enabled = false, label = { Text(it) }) }
                            }
                        }
                    }

                    stats?.let { st ->
                        Row(Modifier.padding(16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            StatCard("Done", st.rate?.let { "${Math.round(it * 100)}%" } ?: "–", "${st.done} of ${st.done + st.missed}", Modifier.weight(1f))
                            StatCard("Streak", st.streak.toString(), "Best ${st.bestStreak}", Modifier.weight(1f))
                            StatCard(
                                "Last done",
                                st.lastDoneAt?.let { formatDate(parseInstant(it).local().toLocalDate()) } ?: "Never",
                                if (st.missed > 0) "${st.missed} missed" else "None missed",
                                Modifier.weight(1f),
                            )
                        }
                    }

                    // Named by what's in it: today's, overdue ones, or the next one coming up.
                    val days = current.map { parseInstant(it.dueAt).local().toLocalDate() }
                    SectionHeader(
                        when {
                            LocalDate.now() in days -> "Today"
                            days.any { it.isBefore(LocalDate.now()) } -> "Overdue"
                            else -> "Up next"
                        },
                    )
                    if (current.isEmpty()) {
                        Text(
                            "Nothing due in the next week.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(horizontal = 16.dp),
                        )
                    }
                    current.forEach { o ->
                        val mine = o.assigneeId == session?.userId
                        OccurrenceRow(
                            o,
                            if (mine) null else session?.nameOf(o.assigneeId),
                            if (canManage && o.status == OccurrenceStatus.Submitted) {
                                OccurrenceActions(onApprove = { vm.review(o, true) }, onReject = { sendingBack = o }, onComments = { commenting = o })
                            } else {
                                OccurrenceActions(
                                    onComplete = if (mine) ({ if (o.isRitual) running = o else if (o.needsDoneDialog) noting = o else vm.complete(o) }) else null,
                                    onCompleteWithNote = if (mine) ({ noting = o }) else null,
                                    onReschedule = { rescheduling = o },
                                    onComments = { commenting = o },
                                )
                            },
                        )
                        if (o.isRitual && o.status == OccurrenceStatus.Pending) app.obey.ui.today.StepList(o, Modifier.padding(start = 72.dp, end = 16.dp, bottom = 8.dp))
                    }

                    if (task.bodyMd.isNotBlank()) {
                        SectionHeader("Details")
                        MarkdownPreview(task.bodyMd, onToggleCheck = null, modifier = Modifier.padding(horizontal = 16.dp))
                    }
                    Spacer(Modifier.height(32.dp))
                }
            }
        }
    }

    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            title = { Text("Delete this task?") },
            text = { Text("Upcoming occurrences are removed. Finished ones stay in the history.") },
            confirmButton = { TextButton(onClick = { confirmDelete = false; vm.delete() }) { Text("Delete", color = MaterialTheme.colorScheme.error) } },
            dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text("Cancel") } },
        )
    }
    commenting?.let { o -> CommentsSheet(o, onDismiss = { commenting = null }, onChanged = vm::refresh) }
    sendingBack?.let { o ->
        SendBackDialog(o, onDismiss = { sendingBack = null }, onConfirm = { vm.review(o, false, it); sendingBack = null })
    }
    rescheduling?.let { o -> RescheduleSheet(o, onDismiss = { rescheduling = null }, onSubmit = { vm.reschedule(o, it) }) }
    running?.let { o -> app.obey.ui.today.RitualSheet(o, onDismiss = { running = null; vm.refresh() }, onNeedsProof = { running = null; noting = it }) }
    noting?.let { o -> app.obey.ui.today.DoneDialog(o, onDismiss = { noting = null }, onDone = { note, mood -> vm.complete(o, note, mood); noting = null }) }
}

@Composable
private fun StatCard(label: String, value: String, sub: String, modifier: Modifier = Modifier) {
    Card(modifier, colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow)) {
        Column(Modifier.padding(12.dp)) {
            Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(value, style = MaterialTheme.typography.titleLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(sub, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
        }
    }
}

@HiltViewModel
class TaskHistoryViewModel @Inject constructor(
    savedState: SavedStateHandle,
    private val api: ObeyApi,
    private val sessions: SessionRepository,
) : BaseViewModel() {
    private val taskId: String = savedState.toRoute<TaskHistoryRoute>().taskId

    private val _state = MutableStateFlow<Load<Pair<String, List<HistoryEntry>>>>(Load.Loading)
    val state: StateFlow<Load<Pair<String, List<HistoryEntry>>>> = _state.asStateFlow()
    val canManage: Boolean get() = sessions.session?.canManage == true

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            _state.value = loadCatching {
                coroutineScope {
                    val history = async { api.taskHistory(taskId) }
                    val title = api.tasks(sessions.requireRelationshipId()).firstOrNull { it.id == taskId }?.title.orEmpty()
                    title to history.await()
                }
            }
        }
    }

    /** [completedAt] only matters when [status] is completed; points are rebooked by the server. */
    fun edit(entry: HistoryEntry, status: OccurrenceStatus, completedAt: Instant?, note: String) = action {
        api.editOccurrence(
            entry.id,
            EditOccurrenceInput(
                status = status,
                completedAt = if (status == OccurrenceStatus.Completed) completedAt?.toString() else null,
                noteMd = note.takeIf { it != entry.noteMd.orEmpty() },
            ),
        )
        say("History updated")
        refresh()
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TaskHistoryScreen(onBack: () -> Unit, vm: TaskHistoryViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    val message by vm.message.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    MessageEffect(message, snackbar, vm::messageShown)
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text((state as? Load.Ready)?.value?.first.orEmpty(), maxLines = 1, overflow = TextOverflow.Ellipsis) },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Back") } },
            )
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        when (val s = state) {
            Load.Loading -> LoadingBox(Modifier.padding(padding))
            is Load.Failed -> ErrorBox(s.message, vm::refresh, Modifier.padding(padding))
            is Load.Ready -> Column(
                Modifier.padding(padding).fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp),
            ) {
                TaskHistorySection(s.value.second, if (vm.canManage) vm::edit else null)
                Spacer(Modifier.height(32.dp))
            }
        }
    }
}
