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

/** How a count task's bounds are set: one number for the first three, two for a range. */
enum class CountKind(val label: String) { Exactly("Exactly"), AtLeast("At least"), AtMost("At most"), Range("Range") }

/** Grace chips. [Midnight] follows the due time, so moving the time keeps it meaning "until midnight". */
enum class Grace(val label: String) { None("None"), Quarter("15 min"), Hour("1 hour"), Midnight("Until midnight"), Custom("Custom") }

data class TaskForm(
    val title: String = "",
    val bodyMd: String = "",
    val assigneeId: String = "",
    val points: String = "10",
    val missPenalty: String = "0",
    val grace: Grace = Grace.None,
    /** Only used for [Grace.Custom]. */
    val graceMinutes: String = "30",
    val timezone: String = ZoneId.systemDefault().id,
    val approvalRequired: Boolean = false,
    val proofRequired: Boolean = false,
    val allDay: Boolean = false,
    val dueTime: LocalTime = LocalTime.of(20, 0),
    val start: LocalDate = LocalDate.now(),
    val recurrence: RecurrenceDraft = RecurrenceDraft(),
    val consequenceId: String? = null,
    val consequenceDueDays: Int = 1,
    /** Null means any time that day. */
    val consequenceDueTime: LocalTime? = null,
    /** A ritual's steps; empty for an ordinary task. */
    val steps: List<app.obey.api.TaskStep> = emptyList(),
    /** Only doable this many minutes before it's due; null for any time. */
    val windowMinutes: Int? = null,
    val askMood: Boolean = false,
    val asksJournal: Boolean = false,
    /** A count task: marked once each time, done when the count is in bounds. */
    val counted: Boolean = false,
    val countKind: CountKind = CountKind.Exactly,
    val countN: String = "3",
    val countTo: String = "5",
    /** "task" or "count": points and penalties once, or for each one. */
    val countPer: String = "task",
    /** A location task: done by getting to this place by the due time, and staying [stayMinutes] if set. */
    val placeId: String? = null,
    val stayMinutes: Int? = null,
    /** "default" (Fealty's reminder), "custom" ([reminderText], in the Dominant's words) or "none". */
    val reminder: String = "default",
    val reminderText: String = "",
) {
    /** The bounds this form describes; both null for an ordinary task. */
    val countBounds: Pair<Int?, Int?> get() {
        if (!counted) return null to null
        val n = (countN.toIntOrNull() ?: 1).coerceIn(1, 1000)
        return when (countKind) {
            CountKind.Exactly -> n to n
            CountKind.AtLeast -> n to null
            CountKind.AtMost -> null to n
            CountKind.Range -> n to (countTo.toIntOrNull() ?: n).coerceIn(n, 1000)
        }
    }

    val titleError: String? get() = when {
        title.isBlank() -> "Give it a title"
        reminder == "custom" && reminderText.isBlank() -> "Write the reminder, or pick another"
        else -> null
    }
    val valid: Boolean get() = titleError == null && assigneeId.isNotEmpty() &&
        points.toIntOrNull() != null && missPenalty.toIntOrNull() != null && (grace != Grace.Custom || graceMinutes.toIntOrNull() != null)

    val effectiveGrace: Int get() = when (grace) {
        Grace.None -> 0
        Grace.Quarter -> 15
        Grace.Hour -> 60
        Grace.Midnight -> if (allDay) 0 else minutesToMidnight(dueTime)
        Grace.Custom -> graceMinutes.toIntOrNull()?.coerceAtLeast(0) ?: 0
    }
}

fun minutesToMidnight(t: LocalTime) = 24 * 60 - (t.hour * 60 + t.minute)

private fun graceOf(t: Task): Grace = when {
    t.graceMinutes == 0 -> Grace.None
    t.graceMinutes == 15 -> Grace.Quarter
    t.graceMinutes == 60 -> Grace.Hour
    t.dueTime != null && t.graceMinutes == minutesToMidnight(LocalTime.parse(t.dueTime)) -> Grace.Midnight
    else -> Grace.Custom
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
    /** Weekday buttons follow the person's calendar. */
    val weekStart: java.time.DayOfWeek get() = sessions.session?.weekStart ?: java.time.DayOfWeek.SUNDAY

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
        grace = graceOf(t),
        graceMinutes = t.graceMinutes.toString(),
        timezone = t.timezone,
        approvalRequired = t.approvalRequired,
        proofRequired = t.proofRequired,
        allDay = t.dueTime == null,
        dueTime = t.dueTime?.let { LocalTime.parse(it) } ?: LocalTime.of(20, 0),
        start = LocalDate.parse(t.schedule.start),
        recurrence = RecurrenceDraft.fromSchedule(t.schedule),
        consequenceId = t.consequenceId,
        consequenceDueDays = t.consequenceDueDays,
        consequenceDueTime = t.consequenceDueTime?.let { LocalTime.parse(it) },
        steps = t.steps,
        windowMinutes = t.windowMinutes,
        askMood = t.askMood,
        asksJournal = t.asksJournal,
        counted = t.countMin != null || t.countMax != null,
        countKind = when {
            t.countMin != null && t.countMax != null -> if (t.countMin == t.countMax) CountKind.Exactly else CountKind.Range
            t.countMax != null -> CountKind.AtMost
            else -> CountKind.AtLeast.takeIf { t.countMin != null } ?: CountKind.Exactly
        },
        countN = (t.countMin ?: t.countMax ?: 3).toString(),
        countTo = (t.countMax ?: 5).toString(),
        countPer = t.countPer,
        placeId = t.placeId,
        stayMinutes = t.stayMinutes,
        reminder = t.reminder,
        reminderText = t.reminderText.orEmpty(),
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
            consequenceDueDays = f.consequenceDueDays,
            consequenceDueTime = f.consequenceDueTime?.format(DateTimeFormatter.ofPattern("HH:mm")),
            // Getting there is the proof; a location task takes no proof, mood or journal entry.
            proofRequired = f.proofRequired && f.placeId == null,
            approvalRequired = f.approvalRequired,
            schedule = f.recurrence.toSchedule(f.start),
            dueTime = if (f.allDay) null else f.dueTime.format(DateTimeFormatter.ofPattern("HH:mm")),
            timezone = f.timezone,
            graceMinutes = f.effectiveGrace,
            steps = if (f.placeId != null) emptyList() else f.steps.map { it.copy(title = it.title.trim()) }.filter { it.title.isNotEmpty() },
            // A window counts back from a due time, so an all-day task has none.
            windowMinutes = if (f.allDay) null else f.windowMinutes,
            askMood = f.askMood && f.placeId == null,
            asksJournal = f.asksJournal && f.placeId == null,
            countMin = if (f.placeId != null) null else f.countBounds.first,
            countMax = if (f.placeId != null) null else f.countBounds.second,
            countPer = f.countPer,
            placeId = f.placeId,
            stayMinutes = f.placeId?.let { f.stayMinutes?.coerceIn(5, 720) },
            reminder = f.reminder,
            reminderText = if (f.reminder == "custom") f.reminderText.trim().take(140) else null,
        )
        action {
            if (original == null) api.createTask(sessions.requireRelationshipId(), input)
            else api.updateTask(original.id, input)
            _done.trySend(Unit)
        }
    }
}
