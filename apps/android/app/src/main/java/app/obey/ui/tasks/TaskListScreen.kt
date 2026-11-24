package app.obey.ui.tasks

import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import app.obey.ui.common.LocalFeatures
import androidx.compose.ui.Alignment
import androidx.compose.foundation.layout.Row
import androidx.compose.material3.HorizontalDivider
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.automirrored.outlined.Send
import androidx.compose.material.icons.outlined.Checklist
import androidx.compose.material.icons.outlined.Delete
import app.obey.ui.common.Button
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.Surface
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
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
import androidx.compose.material3.LargeTopAppBar
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
import app.obey.ui.common.MenuButton
import app.obey.ui.common.SafeWordAction
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

    /** Sends the kit tasks under review; whoever they're for hears once. */
    fun sendDrafts(to: String) = action {
        val sent = api.sendDrafts(sessions.requireRelationshipId())
        say("Sent ${sent.size} task${if (sent.size == 1) "" else "s"} to $to")
        refresh()
    }

    fun dropDraft(t: Task) = action {
        api.deleteTask(t.id)
        say("Dropped “${t.title}”")
        refresh()
    }

    /** A count task: [by] 1 for a tap, or [to] to set the count outright. */
    fun count(o: Occurrence, by: Int? = null, to: Int? = null, onMet: ((Occurrence) -> Unit)? = null) = action {
        val r = api.count(o.id, app.obey.api.CountChange(by = by, to = to)).copy(title = o.title)
        // A count that's sent with approval, proof, a mood or an entry opens the send dialog once it's met.
        if (onMet != null && r.readyToSend && !o.readyToSend) onMet(r) else say("${o.title}: ${r.countLine}")
        refresh()
    }

    fun complete(o: Occurrence, note: String? = null, mood: Int? = null, entry: String? = null) = action {
        val r = api.complete(o.id, CompleteOccurrenceInput(noteMd = note?.takeIf { it.isNotBlank() }, mood = mood, journal = entry?.let { app.obey.api.JournalEntryInput(o.title, it) }))
        say(if (r.status == OccurrenceStatus.Submitted) "Sent for approval" else "Marked “${o.title}” done")
        refresh()
    }
}

@OptIn(ExperimentalMaterial3Api::class, androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
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
    var filter by remember { mutableStateOf<String?>(null) }
    // Reload when coming back from the editor.
    LifecycleResumeEffect(Unit) {
        vm.refresh()
        onPauseOrDispose { }
    }
    Scaffold(
        topBar = {
            LargeTopAppBar(
                navigationIcon = { MenuButton() },
                title = { Text("All tasks") },
                actions = {
                    if (vm.session?.canManage == true) IconButton(onClick = onNew) { Icon(Icons.Outlined.Add, "New task") }
                    SafeWordAction()
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        when (val s = state) {
            Load.Loading -> LoadingBox(Modifier.padding(padding))
            is Load.Failed -> ErrorBox(s.message, vm::refresh, Modifier.padding(padding))
            is Load.Ready -> LazyColumn(Modifier.padding(padding).fillMaxSize()) {
                val (drafts, tasks) = s.value.partition { it.draft }
                if (drafts.isNotEmpty()) item(key = "kit-review") { KitReview(drafts, vm.session, onOpen, onSend = vm::sendDrafts, onDrop = vm::dropDraft) }
                if (tasks.isEmpty() && drafts.isEmpty()) item { EmptyBox("No tasks yet", "Create one with the + button.", icon = Icons.Outlined.Checklist) }
                val me = vm.session?.userId
                val others = vm.session?.partners.orEmpty()
                val shown = tasks.filter {
                    when (filter) {
                        "mine" -> it.assigneeId == me
                        "theirs" -> it.assigneeId != me
                        "paused" -> !it.active
                        else -> true
                    }
                }
                item(key = "filters") {
                    androidx.compose.foundation.layout.FlowRow(
                        Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        val chips = buildList {
                            if (vm.session?.canManage == true && others.isNotEmpty()) add("theirs" to if (others.size == 1) "Assigned to ${others[0].displayName}" else "Assigned to others")
                            add("mine" to "Mine")
                            add("paused" to "Paused")
                        }
                        chips.forEach { (key, label) ->
                            app.obey.ui.common.ChoiceChip(selected = filter == key, onClick = { filter = if (filter == key) null else key }, label = { Text(label) })
                        }
                    }
                }
                if (shown.isEmpty() && tasks.isNotEmpty()) item { EmptyBox("No matches", null, icon = Icons.Outlined.Checklist) }
                items(shown, key = { it.id }) { t ->
                    val who = if (others.size > 1 && t.assigneeId != me) vm.session?.nameOf(t.assigneeId) else null
                    Column(Modifier.padding(horizontal = 16.dp)) {
                        Row(
                            Modifier.fillMaxWidth().clickable { onOpen(t.id) }.padding(vertical = 12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Column(Modifier.weight(1f)) {
                                Text(t.title, style = MaterialTheme.typography.bodyLarge, color = if (t.active) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant)
                                Text(
                                    listOfNotNull(t.summary, t.dueTime?.let { formatClock(it) }, who).joinToString(" · "),
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            if (!t.active) Text("paused", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            NowStatus(current[t.id].orEmpty(), mine = t.assigneeId == me, onComplete = { o -> if (o.isRitual) running = o else if (o.needsDoneDialog) noting = o else vm.complete(o) }, onCount = { o -> if (o.readyToSend) noting = o else vm.count(o, by = 1) { noting = it } })
                        }
                        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                    }
                }
            }
        }
    }
    running?.let { o -> app.obey.ui.today.RitualSheet(o, onDismiss = { running = null; vm.refresh() }, onNeedsProof = { running = null; noting = it }) }
    noting?.let { o -> app.obey.ui.today.DoneDialog(o, onDismiss = { noting = null }, onDone = { note, mood, entry -> vm.complete(o, note, mood, entry); noting = null }) }
}

/** Tasks just added from a kit, for the Dominant to look over (open to edit, or drop) before whoever they're for gets them. */
@Composable
private fun KitReview(drafts: List<Task>, session: Session?, onOpen: (String) -> Unit, onSend: (String) -> Unit, onDrop: (Task) -> Unit) {
    val who = drafts.map { session?.nameOf(it.assigneeId) ?: "them" }.distinct().joinToString(" and ")
    val c = MaterialTheme.colorScheme
    Surface(
        color = androidx.compose.ui.graphics.Color.Transparent,
        contentColor = c.onSurface,
        border = androidx.compose.foundation.BorderStroke(1.dp, c.primary),
        shape = MaterialTheme.shapes.medium,
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("Look these over before $who gets them", style = MaterialTheme.typography.titleMedium)
                Text("Added from a kit. Change or drop any of them, then send. $who hears once, when you do.", style = MaterialTheme.typography.bodyMedium)
            }
            Column(Modifier.clip(RoundedCornerShape(16.dp)), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                drafts.forEach { t ->
                    ListItem(
                        modifier = Modifier.clickable { onOpen(t.id) },
                        colors = ListItemDefaults.colors(containerColor = c.surfaceContainerLow),
                        headlineContent = { Text(t.title) },
                        supportingContent = { Text(listOfNotNull(t.summary, t.dueTime?.let { "at ${formatClock(it)}" }).joinToString(" ")) },
                        trailingContent = { IconButton(onClick = { onDrop(t) }) { Icon(Icons.Outlined.Delete, "Drop “${t.title}”") } },
                    )
                }
            }
            Button(onClick = { onSend(who) }) {
                Icon(Icons.AutoMirrored.Outlined.Send, null, Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
                Text("Send to $who")
            }
        }
    }
}

/** Today's state for a task, with a one-tap Done when it's the viewer's to do. */
@Composable
private fun NowStatus(occurrences: List<Occurrence>, mine: Boolean, onComplete: (Occurrence) -> Unit, onCount: (Occurrence) -> Unit = {}) {
    val today = LocalDate.now()
    val now = Instant.now()
    fun day(o: Occurrence) = parseInstant(o.dueAt).local().toLocalDate()
    fun overdue(o: Occurrence) = o.status == OccurrenceStatus.Pending && parseInstant(o.dueAt).isBefore(now)
    val open = occurrences.firstOrNull { it.status == OccurrenceStatus.Pending && (overdue(it) || day(it) == today) }
    val tint = if (open != null && overdue(open)) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary
    when {
        open != null && open.isPlaced -> app.obey.ui.location.PlaceRing(open, null)
        open != null && open.isCounted -> app.obey.ui.today.CountRing(open, if (mine && open.canCount(true, false)) ({ onCount(open) }) else null, null)
        open != null && mine -> IconButton(
            onClick = { onComplete(open) },
            modifier = Modifier.semantics { contentDescription = if (open.isRitual) "Start “${open.title}”" else "Mark “${open.title}” done" },
        ) { app.obey.ui.common.Diamond(if (overdue(open)) app.obey.ui.common.DiamondState.Owed else app.obey.ui.common.DiamondState.Open) }
        occurrences.any { day(it) == today && it.status == OccurrenceStatus.Completed } ->
            Text("done today", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        occurrences.any { it.status == OccurrenceStatus.Submitted } ->
            Text("waiting", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        open != null && overdue(open) -> Text("overdue", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
        else -> Unit
    }
}
