package app.obey.ui.tasks

import app.obey.ui.common.LocalFeatures
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.HourglassTop
import androidx.compose.material.icons.outlined.PlayCircle
import androidx.compose.material.icons.outlined.RadioButtonUnchecked
import androidx.compose.material.icons.outlined.Widgets
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import app.obey.api.CompleteOccurrenceInput
import app.obey.api.ObeyApi
import app.obey.api.Occurrence
import app.obey.api.OccurrenceStatus
import app.obey.api.Task
import app.obey.data.Session
import app.obey.data.SessionRepository
import app.obey.ui.common.BaseViewModel
import app.obey.ui.common.EmptyBox
import app.obey.ui.common.ErrorBox
import app.obey.ui.common.Load
import app.obey.ui.common.LoadingBox
import app.obey.ui.common.MessageEffect
import app.obey.ui.common.formatClock
import app.obey.ui.common.SettingsAction
import app.obey.ui.common.local
import app.obey.ui.common.parseInstant
import app.obey.ui.common.signed
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.Instant
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import javax.inject.Inject
import androidx.compose.ui.unit.dp
import app.obey.api.TaskStreak
import app.obey.ui.common.StreakStrip
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import app.obey.ui.common.loadCatching
import app.obey.ui.today.needsDoneDialog

@HiltViewModel
class TaskListViewModel @Inject constructor(
    private val api: ObeyApi,
    private val sessions: SessionRepository,
) : BaseViewModel() {
    private val _state = MutableStateFlow<Load<List<Task>>>(Load.Loading)
    val state: StateFlow<Load<List<Task>>> = _state.asStateFlow()
    private val _current = MutableStateFlow<Map<String, List<Occurrence>>>(emptyMap())
    /** What's due now for each task, for the status and Done button on each row. */
    val current: StateFlow<Map<String, List<Occurrence>>> = _current.asStateFlow()
    private val _streaks = MutableStateFlow<Map<String, TaskStreak>>(emptyMap())
    val streaks: StateFlow<Map<String, TaskStreak>> = _streaks.asStateFlow()
    val session: Session? get() = sessions.session

    fun refresh() {
        viewModelScope.launch {
            _state.value = loadCatching { api.tasks(sessions.requireRelationshipId()).sortedBy { it.title.lowercase() } }
        }
        viewModelScope.launch {
            val today = LocalDate.now()
            runCatching {
                api.occurrences(sessions.requireRelationshipId(), today.minusDays(CURRENT_DAYS_BACK).toString(), today.plusDays(CURRENT_DAYS_AHEAD).toString())
            }.onSuccess { _current.value = currentByTask(it) }
        }
        viewModelScope.launch {
            runCatching { api.streaks(sessions.requireRelationshipId()) }.onSuccess { list -> _streaks.value = list.associateBy { it.taskId } }
        }
    }

    fun complete(o: Occurrence, note: String? = null, mood: Int? = null, entry: String? = null) = action {
        val r = api.complete(o.id, CompleteOccurrenceInput(noteMd = note?.takeIf { it.isNotBlank() }, mood = mood, journal = entry?.let { app.obey.api.JournalEntryInput(o.title, it) }))
        say(if (r.status == OccurrenceStatus.Submitted) "Sent for approval" else "Marked “${o.title}” done")
        refresh()
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TaskListScreen(
    onOpen: (String) -> Unit,
    onNew: () -> Unit,
    onOpenSettings: () -> Unit,
    onKits: () -> Unit,
    vm: TaskListViewModel = hiltViewModel(),
) {
    val state by vm.state.collectAsStateWithLifecycle()
    val current by vm.current.collectAsStateWithLifecycle()
    val streaks by vm.streaks.collectAsStateWithLifecycle()
    val message by vm.message.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    MessageEffect(message, snackbar, vm::messageShown)
    var running by remember { mutableStateOf<Occurrence?>(null) }
    var noting by remember { mutableStateOf<Occurrence?>(null) }
    // Reload when coming back from the editor.
    LifecycleResumeEffect(Unit) {
        vm.refresh()
        onPauseOrDispose { }
    }
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("All tasks") },
                actions = {
                    if (vm.session?.canManage == true && vm.session?.readOnly != true) IconButton(onClick = onKits) { Icon(Icons.Outlined.Widgets, "Starter kits") }
                    SettingsAction(onOpenSettings)
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbar) },
        floatingActionButton = {
            if (vm.session?.canManage == true) FloatingActionButton(onClick = onNew) { Icon(Icons.Outlined.Add, "New task") }
        },
    ) { padding ->
        when (val s = state) {
            Load.Loading -> LoadingBox(Modifier.padding(padding))
            is Load.Failed -> ErrorBox(s.message, vm::refresh, Modifier.padding(padding))
            is Load.Ready -> LazyColumn(Modifier.padding(padding).fillMaxSize()) {
                if (s.value.isEmpty()) item { EmptyBox("No tasks yet", "Create one with the + button.") }
                items(s.value, key = { it.id }) { t ->
                    val who = vm.session?.nameOf(t.assigneeId)
                    ListItem(
                        modifier = Modifier.clickable { onOpen(t.id) },
                        headlineContent = { Text(t.title) },
                        supportingContent = {
                            Column {
                                Text(
                                    listOfNotNull(
                                        if (t.assignedConsequenceId != null) "Consequence" else null,
                                        t.summary,
                                        t.dueTime?.let { "at ${formatClock(it)}" },
                                        who,
                                        if (LocalFeatures.current.points && t.points != 0) "${signed(t.points)} pts" else null,
                                        if (!t.active) "paused" else null,
                                    ).joinToString(" · "),
                                )
                                StreakStrip(streaks[t.id], Modifier.padding(top = 6.dp))
                            }
                        },
                        trailingContent = {
                            NowStatus(current[t.id].orEmpty(), mine = t.assigneeId == vm.session?.userId, onComplete = { o -> if (o.isRitual) running = o else if (o.needsDoneDialog) noting = o else vm.complete(o) })
                        },
                    )
                }
            }
        }
    }
    running?.let { o -> app.obey.ui.today.RitualSheet(o, onDismiss = { running = null; vm.refresh() }, onNeedsProof = { running = null; noting = it }) }
    noting?.let { o -> app.obey.ui.today.DoneDialog(o, onDismiss = { noting = null }, onDone = { note, mood, entry -> vm.complete(o, note, mood, entry); noting = null }) }
}

/** Today's state for a task, with a one-tap Done when it's the viewer's to do. */
@Composable
private fun NowStatus(occurrences: List<Occurrence>, mine: Boolean, onComplete: (Occurrence) -> Unit) {
    val today = LocalDate.now()
    val now = Instant.now()
    fun day(o: Occurrence) = parseInstant(o.dueAt).local().toLocalDate()
    fun overdue(o: Occurrence) = o.status == OccurrenceStatus.Pending && parseInstant(o.dueAt).isBefore(now)
    val open = occurrences.firstOrNull { it.status == OccurrenceStatus.Pending && (overdue(it) || day(it) == today) }
    val tint = if (open != null && overdue(open)) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary
    when {
        open != null && mine && open.isRitual -> IconButton(onClick = { onComplete(open) }) { Icon(Icons.Outlined.PlayCircle, "Start “${open.title}”", tint = tint) }
        open != null && mine -> IconButton(onClick = { onComplete(open) }) { Icon(Icons.Outlined.RadioButtonUnchecked, "Mark “${open.title}” done", tint = tint) }
        occurrences.any { day(it) == today && it.status == OccurrenceStatus.Completed } ->
            Icon(Icons.Filled.CheckCircle, "Done today", tint = MaterialTheme.colorScheme.primary)
        occurrences.any { it.status == OccurrenceStatus.Submitted } -> Icon(Icons.Outlined.HourglassTop, "Awaiting approval")
        open != null -> Icon(Icons.Outlined.RadioButtonUnchecked, "Due", tint = tint)
        else -> occurrences.firstOrNull { it.status == OccurrenceStatus.Pending }?.let { next ->
            Text(day(next).format(DateTimeFormatter.ofPattern("EEE")), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
