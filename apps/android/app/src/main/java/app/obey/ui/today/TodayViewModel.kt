package app.obey.ui.today

import androidx.lifecycle.viewModelScope
import app.obey.api.CompleteOccurrenceInput
import app.obey.api.DecideInput
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
    val overdue: List<Occurrence>,
    val today: List<Occurrence>,
    val awaitingReview: List<Occurrence>,
    val done: List<Occurrence>,
    /** Pending extension requests, one entry per request; a whole-day request's rows share an entry. */
    val requests: List<List<RescheduleRequest>>,
    /** By task id; empty if streaks couldn't load, so the rest of Today still shows. */
    val streaks: Map<String, TaskStreak> = emptyMap(),
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
        val occ = async { api.occurrences(relId, today.minusDays(14).toString(), today.toString()) }
        val reqs = async { api.reschedules(relId) }
        val streaks = async { runCatching { api.streaks(relId) }.getOrDefault(emptyList()) }
        val all = occ.await()
        val now = Instant.now()
        fun dueDate(o: Occurrence) = parseInstant(o.dueAt).local().toLocalDate()
        val byDue = compareBy<Occurrence> { parseInstant(it.dueAt) }
        TodayData(
            overdue = all.filter {
                (it.status == OccurrenceStatus.Pending && parseInstant(it.dueAt).isBefore(now)) ||
                    it.status == OccurrenceStatus.Missed && dueDate(it) == today
            }.sortedWith(byDue),
            today = all.filter {
                it.status == OccurrenceStatus.Pending && dueDate(it) == today && !parseInstant(it.dueAt).isBefore(now)
            }.sortedWith(byDue),
            awaitingReview = all.filter { it.status == OccurrenceStatus.Submitted }.sortedWith(byDue),
            done = all.filter {
                it.status == OccurrenceStatus.Completed && it.completedAt?.let { c -> parseInstant(c).local().toLocalDate() == today } == true
            },
            requests = reqs.await()
                // A Dom decides other people's requests; everyone else sees only their own, as "waiting".
                .filter { sessions.session?.canManage == true || it.requestedBy == sessions.session?.userId }
                .groupBy { it.groupId ?: it.id }
                .values.toList(),
            streaks = streaks.await().associateBy { it.taskId },
        )
    }

    fun complete(o: Occurrence, note: String? = null) = action {
        api.complete(o.id, CompleteOccurrenceInput(noteMd = note?.takeIf { it.isNotBlank() }))
        say("Marked “${o.title}” done")
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
