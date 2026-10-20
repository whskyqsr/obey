package app.obey.ui.upcoming

import androidx.lifecycle.viewModelScope
import app.obey.api.CompleteOccurrenceInput
import app.obey.api.ObeyApi
import app.obey.api.Occurrence
import app.obey.api.OccurrenceStatus
import app.obey.api.RescheduleInput
import app.obey.data.Session
import app.obey.data.SessionRepository
import app.obey.data.SettingsStore
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

enum class CalendarView { Week, Month }

/** What's on screen: a week, or a month padded out to whole weeks. */
data class CalendarData(val view: CalendarView, val anchor: LocalDate, val days: List<Pair<LocalDate, List<Occurrence>>>) {
    val from: LocalDate get() = days.first().first
    val to: LocalDate get() = days.last().first
}

@HiltViewModel
class UpcomingViewModel @Inject constructor(
    private val api: ObeyApi,
    private val sessions: SessionRepository,
    private val settings: SettingsStore,
) : BaseViewModel() {
    private val firstDay get() = sessions.session?.weekStart ?: DayOfWeek.SUNDAY
    private fun startOf(day: LocalDate) = day.with(TemporalAdjusters.previousOrSame(firstDay))

    private val _view = MutableStateFlow(CalendarView.Week)
    val view: StateFlow<CalendarView> = _view.asStateFlow()

    /** Any day inside the week or month in view. */
    private val _anchor = MutableStateFlow(LocalDate.now())
    val anchor: StateFlow<LocalDate> = _anchor.asStateFlow()

    /** The day whose tasks show under the month grid. */
    private val _selected = MutableStateFlow(LocalDate.now())
    val selected: StateFlow<LocalDate> = _selected.asStateFlow()

    private val _state = MutableStateFlow<Load<CalendarData>>(Load.Loading)
    val state: StateFlow<Load<CalendarData>> = _state.asStateFlow()

    val session: Session? get() = sessions.session

    init {
        viewModelScope.launch {
            if (settings.calendarView() == "month" && _view.value != CalendarView.Month) {
                _view.value = CalendarView.Month
                refresh()
            }
        }
    }

    fun setView(v: CalendarView) {
        if (v == _view.value) return
        _view.value = v
        // Keep the picked day in view when switching.
        _anchor.value = _selected.value
        viewModelScope.launch { settings.setCalendarView(if (v == CalendarView.Month) "month" else "week") }
        refresh()
    }

    fun step(dir: Long) {
        _anchor.value = if (_view.value == CalendarView.Week) _anchor.value.plusWeeks(dir) else _anchor.value.plusMonths(dir)
        refresh()
    }

    fun goToday() {
        _anchor.value = LocalDate.now()
        _selected.value = LocalDate.now()
        refresh()
    }

    fun select(day: LocalDate) {
        _selected.value = day
    }

    private fun range(view: CalendarView, anchor: LocalDate): Pair<LocalDate, LocalDate> = when (view) {
        CalendarView.Week -> startOf(anchor).let { it to it.plusDays(6) }
        CalendarView.Month -> {
            val first = anchor.withDayOfMonth(1)
            val last = anchor.withDayOfMonth(anchor.lengthOfMonth())
            startOf(first) to startOf(last).plusDays(6)
        }
    }

    fun refresh() {
        val view = _view.value
        val anchor = _anchor.value
        val (from, to) = range(view, anchor)
        viewModelScope.launch {
            val current = _state.value
            if (current !is Load.Ready || current.value.view != view || current.value.from != from) _state.value = Load.Loading
            val result = loadCatching {
                val occ = api.occurrences(sessions.requireRelationshipId(), from.toString(), to.toString())
                    .filter { it.status != OccurrenceStatus.Cancelled }
                val byDay = occ.groupBy { parseInstant(it.dueAt).local().toLocalDate() }
                CalendarData(
                    view,
                    anchor,
                    generateSequence(from) { it.plusDays(1) }.takeWhile { !it.isAfter(to) }
                        .map { d -> d to byDay[d].orEmpty().sortedBy { parseInstant(it.dueAt) } }
                        .toList(),
                )
            }
            // Ignore stale results if the user paged on.
            if (view == _view.value && anchor == _anchor.value) _state.value = result
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
