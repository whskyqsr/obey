package app.obey.ui.today

import androidx.lifecycle.viewModelScope
import app.obey.api.CalendarEvent
import app.obey.api.CompleteOccurrenceInput
import app.obey.api.DecideInput
import app.obey.api.EditOccurrenceInput
import app.obey.api.ObeyApi
import app.obey.api.Occurrence
import app.obey.api.OccurrenceStatus
import app.obey.api.RescheduleDayInput
import app.obey.api.RescheduleInput
import app.obey.api.RescheduleRequest
import app.obey.api.ReviewOccurrenceInput
import app.obey.api.TaskStreak
import app.obey.data.Session
import app.obey.data.SessionRepository
import app.obey.ui.common.BaseViewModel
import app.obey.ui.common.Load
import app.obey.ui.common.formatDue
import app.obey.ui.common.loadCatching
import app.obey.ui.common.local
import app.obey.ui.common.parseInstant
import app.obey.ui.plans.covers
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.Instant
import java.time.LocalDate
import javax.inject.Inject
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class TodayData(
    /** Before today and still open (not yet marked missed). */
    val overdue: List<Occurrence>,
    /** Everything due today, any status, by due time. */
    val today: List<Occurrence>,
    val awaitingReview: List<Occurrence>,
    /** Misses from today and yesterday, for a Dominant to excuse. */
    val recentMisses: List<Occurrence>,
    /** The next few days with something pending. */
    val later: List<Pair<LocalDate, List<Occurrence>>>,
    /** Pending extension requests, one entry per request; a whole-day request's rows share an entry. */
    val requests: List<List<RescheduleRequest>>,
    /** By task id; empty if streaks couldn't load, so the rest of Today still shows. */
    val streaks: Map<String, TaskStreak> = emptyMap(),
    /** Plans today or tomorrow that run into a task, for a heads-up at the top. */
    val clashingPlans: List<CalendarEvent> = emptyList(),
)

@HiltViewModel
class TodayViewModel @Inject constructor(
    private val api: ObeyApi,
    private val sessions: SessionRepository,
) : BaseViewModel() {
    private val _state = MutableStateFlow<Load<TodayData>>(Load.Loading)
    val state: StateFlow<Load<TodayData>> = _state.asStateFlow()

    private val _refreshing = MutableStateFlow(false)
    val refreshing: StateFlow<Boolean> = _refreshing.asStateFlow()

    val session: Session? get() = sessions.session

    fun refresh() {
        viewModelScope.launch {
            if (_state.value !is Load.Ready) _state.value = Load.Loading else _refreshing.value = true
            _state.value = loadCatching { fetch() }
            _refreshing.value = false
        }
    }

    private suspend fun fetch(): TodayData = coroutineScope {
        val relId = sessions.requireRelationshipId()
        val today = LocalDate.now()
        // Overdue items can be up to the grace window old; two weeks back is plenty for a Today view.
        val occ = async { api.occurrences(relId, today.minusDays(14).toString(), today.plusDays(7).toString()) }
        val reqs = async { api.reschedules(relId) }
        val streaks = async { runCatching { api.streaks(relId) }.getOrDefault(emptyList()) }
        val events = async { runCatching { api.events(relId, today.toString(), today.plusDays(1).toString()) }.getOrDefault(emptyList()) }
        val all = occ.await()
        val now = Instant.now()
        fun dueDate(o: Occurrence) = parseInstant(o.dueAt).local().toLocalDate()
        val byDue = compareBy<Occurrence> { parseInstant(it.dueAt) }
        val live = all.filter { it.status != OccurrenceStatus.Cancelled }
        TodayData(
            overdue = live.filter { it.status == OccurrenceStatus.Pending && parseInstant(it.dueAt).isBefore(now) && dueDate(it) < today }.sortedWith(byDue),
            today = live.filter { dueDate(it) == today }.sortedWith(byDue),
            awaitingReview = live.filter { it.status == OccurrenceStatus.Submitted }.sortedWith(byDue),
            recentMisses = live.filter { it.status == OccurrenceStatus.Missed && !dueDate(it).isBefore(today.minusDays(1)) }.sortedWith(byDue),
            later = live.filter { it.status == OccurrenceStatus.Pending && dueDate(it) > today }
                .sortedWith(byDue).groupBy { dueDate(it) }.toList().take(3),
            requests = reqs.await()
                // A Dom decides other people's requests; everyone else sees only their own, as "waiting".
                .filter { sessions.session?.canManage == true || it.requestedBy == sessions.session?.userId }
                .groupBy { it.groupId ?: it.id }
                .values.toList(),
            streaks = streaks.await().associateBy { it.taskId },
            clashingPlans = events.await().filter {
                // The server pads the range by a day; keep only today's and tomorrow's, and only ones not over yet.
                it.conflictIds.isNotEmpty() && parseInstant(it.endsAt).isAfter(now) && (it.covers(today) || it.covers(today.plusDays(1)))
            },
        )
    }

    private val _completed = MutableStateFlow<Occurrence?>(null)
    /** The occurrence just completed, for the screen's snackbar with Undo. */
    val completed: StateFlow<Occurrence?> = _completed.asStateFlow()
    fun completedShown() { _completed.value = null }

    fun complete(o: Occurrence, note: String? = null) = action {
        val r = api.complete(o.id, CompleteOccurrenceInput(noteMd = note?.takeIf { it.isNotBlank() }))
        _completed.value = r.copy(title = o.title)
        refresh()
    }

    fun undoComplete(o: Occurrence) = action {
        api.undoComplete(o.id)
        refresh()
    }

    fun excuse(o: Occurrence) = action {
        api.editOccurrence(o.id, EditOccurrenceInput(status = OccurrenceStatus.Excused))
        say("Excused")
        refresh()
    }

    fun review(o: Occurrence, approve: Boolean) = action {
        api.review(o.id, ReviewOccurrenceInput(approve = approve))
        say(if (approve) "Approved" else "Sent back")
        refresh()
    }

    fun reschedule(o: Occurrence, input: RescheduleInput) = action {
        val result = api.reschedule(o.id, input)
        say(
            if (result.applied) "Moved to ${formatDue(result.occurrence.dueAt)}"
            else "Extension requested; waiting for approval"
        )
        refresh()
    }

    fun rescheduleDay(ids: List<String>, delayHours: Int, reason: String?) = action {
        val relId = sessions.requireRelationshipId()
        val result = api.rescheduleDay(relId, RescheduleDayInput(ids, delayHours, reason?.takeIf { it.isNotBlank() }))
        say(if (result.applied) "Moved ${ids.size} tasks" else "Request sent; waiting for approval")
        refresh()
    }

    /** Deciding any row of a whole-day request decides all of it. */
    fun decide(rows: List<RescheduleRequest>, approve: Boolean) = action {
        api.decideReschedule(rows.first().id, DecideInput(approve))
        val n = if (rows.size > 1) " for ${rows.size} tasks" else ""
        say(if (approve) "Extension$n approved" else "Extension$n declined")
        refresh()
    }
}
