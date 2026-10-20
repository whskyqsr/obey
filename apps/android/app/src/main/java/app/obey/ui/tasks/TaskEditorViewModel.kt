package app.obey.ui.tasks

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.viewModelScope
import androidx.navigation.toRoute
import app.obey.api.Consequence
import app.obey.api.Member
import app.obey.api.ObeyApi
import app.obey.api.Role
import app.obey.api.Task
import app.obey.api.TaskInput
import app.obey.data.SessionRepository
import app.obey.recurrence.RecurrenceDraft
import app.obey.ui.TaskEditorRoute
import app.obey.ui.common.BaseViewModel
import app.obey.ui.common.Load
import app.obey.ui.common.loadCatching
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import javax.inject.Inject
import kotlinx.coroutines.async
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class TaskForm(
    val title: String = "",
    val bodyMd: String = "",
    val assigneeId: String = "",
    val points: String = "10",
    val missPenalty: String = "0",
    val graceMinutes: String = "0",
    val approvalRequired: Boolean = false,
    val proofRequired: Boolean = false,
    val allDay: Boolean = false,
    val dueTime: LocalTime = LocalTime.of(20, 0),
    val start: LocalDate = LocalDate.now(),
    val recurrence: RecurrenceDraft = RecurrenceDraft(),
    val consequenceId: String? = null,
) {
    val titleError: String? get() = if (title.isBlank()) "Give it a title" else null
    val valid: Boolean get() = titleError == null && assigneeId.isNotEmpty() &&
        points.toIntOrNull() != null && missPenalty.toIntOrNull() != null && graceMinutes.toIntOrNull() != null
}

data class EditorData(val members: List<Member>, val consequences: List<Consequence>, val original: Task?)

@HiltViewModel
class TaskEditorViewModel @Inject constructor(
    savedState: SavedStateHandle,
    private val api: ObeyApi,
    private val sessions: SessionRepository,
) : BaseViewModel() {
    private val route = savedState.toRoute<TaskEditorRoute>()
    val isNew: Boolean = route.taskId == null

    private val _data = MutableStateFlow<Load<EditorData>>(Load.Loading)
    val data: StateFlow<Load<EditorData>> = _data.asStateFlow()

    private val _form = MutableStateFlow(TaskForm())
    val form: StateFlow<TaskForm> = _form.asStateFlow()

    private val _done = Channel<Unit>(Channel.CONFLATED)
    val done = _done.receiveAsFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _data.value = Load.Loading
            _data.value = loadCatching { fetch() }
        }
    }

    private suspend fun fetch(): EditorData = coroutineScope {
        val session = sessions.session ?: error("Not signed in")
        val relId = sessions.requireRelationshipId()
        val consequences = async { runCatching { api.consequences(relId) }.getOrDefault(emptyList()) }
        val task = route.taskId?.let { id -> api.tasks(relId).firstOrNull { it.id == id } ?: error("That task no longer exists") }
        val members = session.relationship?.members.orEmpty()
        if (task != null) {
            _form.value = formFrom(task)
        } else {
            // Default to a submissive partner, else myself.
            val assignee = members.firstOrNull { it.role == Role.Submissive && it.userId != session.userId }
                ?: members.firstOrNull { it.userId != session.userId && it.role != Role.Dominant }
                ?: members.firstOrNull { it.userId == session.userId }
            _form.update {
                it.copy(
                    assigneeId = assignee?.userId.orEmpty(),
                    start = route.date?.let { d -> LocalDate.parse(d) } ?: LocalDate.now(),
                )
            }
        }
        EditorData(members, consequences.await(), task)
    }

    private fun formFrom(t: Task) = TaskForm(
        title = t.title,
        bodyMd = t.bodyMd,
        assigneeId = t.assigneeId,
        points = t.points.toString(),
        missPenalty = t.missPenalty.toString(),
        graceMinutes = t.graceMinutes.toString(),
        approvalRequired = t.approvalRequired,
        proofRequired = t.proofRequired,
        allDay = t.dueTime == null,
        dueTime = t.dueTime?.let { LocalTime.parse(it) } ?: LocalTime.of(20, 0),
        start = LocalDate.parse(t.schedule.start),
        recurrence = RecurrenceDraft.fromSchedule(t.schedule),
        consequenceId = t.consequenceId,
    )

    fun update(change: (TaskForm) -> TaskForm) = _form.update(change)

    fun save() {
        val f = _form.value
        if (!f.valid) {
            say(f.titleError ?: "Check the highlighted fields")
            return
        }
        val original = (_data.value as? Load.Ready)?.value?.original
        val input = TaskInput(
            title = f.title.trim(),
            bodyMd = f.bodyMd,
            assigneeId = f.assigneeId,
            points = f.points.toInt(),
            missPenalty = f.missPenalty.toInt(),
            rewardId = original?.rewardId,
            consequenceId = f.consequenceId,
            proofRequired = f.proofRequired,
            approvalRequired = f.approvalRequired,
            schedule = f.recurrence.toSchedule(f.start),
            dueTime = if (f.allDay) null else f.dueTime.format(DateTimeFormatter.ofPattern("HH:mm")),
            timezone = original?.timezone ?: ZoneId.systemDefault().id,
            graceMinutes = f.graceMinutes.toInt(),
        )
        action {
            if (original == null) api.createTask(sessions.requireRelationshipId(), input)
            else api.updateTask(original.id, input)
            _done.trySend(Unit)
        }
    }

    fun delete() {
        val original = (_data.value as? Load.Ready)?.value?.original ?: return
        action {
            api.deleteTask(original.id)
            _done.trySend(Unit)
        }
    }
}
