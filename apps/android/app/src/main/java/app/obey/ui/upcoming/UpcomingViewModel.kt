package app.obey.ui.upcoming

import androidx.lifecycle.viewModelScope
import app.obey.api.CompleteOccurrenceInput
import app.obey.api.ObeyApi
import app.obey.api.Occurrence
import app.obey.api.OccurrenceStatus
import app.obey.api.RescheduleInput
import app.obey.data.Session
import app.obey.data.SessionRepository
import app.obey.ui.common.BaseViewModel
import app.obey.ui.common.Load
import app.obey.ui.common.loadCatching
import app.obey.ui.common.local
import app.obey.ui.common.parseInstant
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.temporal.TemporalAdjusters
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class WeekData(val weekStart: LocalDate, val days: List<Pair<LocalDate, List<Occurrence>>>)

@HiltViewModel
class UpcomingViewModel @Inject constructor(
    private val api: ObeyApi,
    private val sessions: SessionRepository,
) : BaseViewModel() {
    private val _weekStart = MutableStateFlow(LocalDate.now().with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)))
    val weekStart: StateFlow<LocalDate> = _weekStart.asStateFlow()

    private val _state = MutableStateFlow<Load<WeekData>>(Load.Loading)
    val state: StateFlow<Load<WeekData>> = _state.asStateFlow()

    val session: Session? get() = sessions.session

    fun shiftWeek(weeks: Long) {
        _weekStart.value = _weekStart.value.plusWeeks(weeks)
        refresh()
    }

    fun thisWeek() {
        _weekStart.value = LocalDate.now().with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY))
        refresh()
    }

    fun refresh() {
        val start = _weekStart.value
        viewModelScope.launch {
            val current = _state.value
            if (current !is Load.Ready || current.value.weekStart != start) _state.value = Load.Loading
            val result = loadCatching {
                val end = start.plusDays(6)
                val occ = api.occurrences(sessions.requireRelationshipId(), start.toString(), end.toString())
                    .filter { it.status != OccurrenceStatus.Cancelled }
                val byDay = occ.groupBy { parseInstant(it.dueAt).local().toLocalDate() }
                WeekData(
                    start,
                    (0L..6L).map { i ->
                        val d = start.plusDays(i)
                        d to byDay[d].orEmpty().sortedBy { parseInstant(it.dueAt) }
                    },
                )
            }
            // Ignore stale results if the user paged on.
            if (start == _weekStart.value) _state.value = result
        }
    }

    fun complete(o: Occurrence) = action {
        api.complete(o.id, CompleteOccurrenceInput())
        say("Marked “${o.title}” done")
        refresh()
    }

    fun reschedule(o: Occurrence, input: RescheduleInput) = action {
        val r = api.reschedule(o.id, input)
        say(if (r.applied) "Rescheduled" else "Extension requested; waiting for approval")
        refresh()
    }
}
