package app.obey.ui.tasks

import app.obey.api.Occurrence
import app.obey.api.OccurrenceStatus
import app.obey.ui.common.local
import app.obey.ui.common.parseInstant
import java.time.Instant
import java.time.LocalDate

/** How far back and ahead "what's due now" looks; matches the web. */
internal const val CURRENT_DAYS_BACK = 30L
internal const val CURRENT_DAYS_AHEAD = 7L

/**
 * What's due now for each task, keyed by task id: anything overdue or awaiting review,
 * today's, and otherwise the next one coming up.
 */
internal fun currentByTask(all: List<Occurrence>, today: LocalDate = LocalDate.now(), now: Instant = Instant.now()): Map<String, List<Occurrence>> {
    val out = linkedMapOf<String, MutableList<Occurrence>>()
    for (o in all.sortedBy { parseInstant(it.dueAt) }) {
        val due = parseInstant(o.dueAt)
        val day = due.local().toLocalDate()
        val list = out.getOrPut(o.seriesId) { mutableListOf() }
        val overdue = o.status == OccurrenceStatus.Pending && due.isBefore(now) && day.isBefore(today)
        val hasCurrent = list.any { !parseInstant(it.dueAt).local().toLocalDate().isBefore(today) }
        val current = overdue || o.status == OccurrenceStatus.Submitted ||
            (day == today && o.status != OccurrenceStatus.Cancelled) ||
            (day.isAfter(today) && o.status == OccurrenceStatus.Pending && !hasCurrent)
        if (current) list += o
    }
    return out.filterValues { it.isNotEmpty() }
}
