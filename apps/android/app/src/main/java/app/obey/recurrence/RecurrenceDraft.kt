package app.obey.recurrence

import app.obey.api.Anchor
import app.obey.api.Frequency
import app.obey.api.RecurrenceRule
import app.obey.api.Schedule
import app.obey.api.Weekday
import java.time.LocalDate

/** The repeat options the task editor offers. Yearly is "every 12 months", which repeats on the same dates. */
enum class RepeatKind(val label: String) {
    Once("Once"),
    Daily("Daily"),
    Weekly("Weekly"),
    Monthly("Monthly"),
    Cycle("On/off cycle"),
}

enum class MonthlyMode(val label: String) {
    DayOfMonth("On day"),
    NthWeekday("On weekday"),
    LastDay("Last day"),
}

/**
 * Editor-friendly view of a [Schedule]. Convert with [fromSchedule] and [toSchedule].
 * All numbers are clamped to sane ranges in [toSchedule] so the API's validation won't reject them.
 */
data class RecurrenceDraft(
    val kind: RepeatKind = RepeatKind.Once,
    val interval: Int = 1,
    val weekdays: Set<Weekday> = emptySet(),
    val monthlyMode: MonthlyMode = MonthlyMode.DayOfMonth,
    val monthDay: Int = 1,
    /** 1..5, or -1 for "last". */
    val nth: Int = 1,
    val nthWeekday: Weekday = Weekday.MO,
    val cycleOn: Int = 3,
    val cycleOff: Int = 4,
    val afterCompletion: Boolean = false,
    /** A rule the editor can't represent. Preserved unless the user changes kind. */
    val passthrough: RecurrenceRule? = null,
) {
    fun toSchedule(start: LocalDate): Schedule {
        val n = interval.coerceIn(1, 999)
        val rule: RecurrenceRule? = when (kind) {
            RepeatKind.Once -> null
            RepeatKind.Daily -> RecurrenceRule(freq = Frequency.Daily, interval = n)
            RepeatKind.Weekly -> RecurrenceRule(
                freq = Frequency.Weekly,
                interval = n,
                byWeekday = weekdays.ifEmpty { setOf(start.weekday()) }.sortedBy { it.ordinal },
            )
            RepeatKind.Monthly -> when (monthlyMode) {
                MonthlyMode.DayOfMonth -> RecurrenceRule(Frequency.Monthly, interval = n, byMonthDay = listOf(monthDay.coerceIn(1, 31)))
                MonthlyMode.NthWeekday -> RecurrenceRule(
                    Frequency.Monthly, interval = n, byWeekday = listOf(nthWeekday),
                    nth = if (nth == -1) -1 else nth.coerceIn(1, 5),
                )
                MonthlyMode.LastDay -> RecurrenceRule(Frequency.Monthly, interval = n, byMonthDay = listOf(-1))
            }
            RepeatKind.Cycle -> {
                val on = cycleOn.coerceIn(1, 365)
                val off = cycleOff.coerceIn(0, 365)
                RecurrenceRule(Frequency.Cycle, cycleLength = on + off, cycleDays = (0 until on).toList())
            }
        }
        val finalRule = passthrough?.takeIf { kind == RepeatKind.Once && it.freq == Frequency.Yearly } ?: rule
        return Schedule(
            start = start.toString(),
            rule = finalRule,
            anchor = if (finalRule != null && afterCompletion) Anchor.Completion else null,
        )
    }

    companion object {
        fun fromSchedule(schedule: Schedule): RecurrenceDraft {
            val rule = schedule.rule ?: return RecurrenceDraft()
            val after = schedule.anchor == Anchor.Completion
            val n = rule.interval ?: 1
            return when (rule.freq) {
                Frequency.Daily -> RecurrenceDraft(RepeatKind.Daily, interval = n, afterCompletion = after)
                Frequency.Weekly -> RecurrenceDraft(
                    RepeatKind.Weekly, interval = n, weekdays = rule.byWeekday.orEmpty().toSet(), afterCompletion = after,
                )
                Frequency.Monthly -> {
                    val wd = rule.byWeekday?.firstOrNull()
                    val md = rule.byMonthDay?.firstOrNull()
                    when {
                        wd != null && rule.nth != null -> RecurrenceDraft(
                            RepeatKind.Monthly, interval = n, monthlyMode = MonthlyMode.NthWeekday,
                            nth = rule.nth, nthWeekday = wd, afterCompletion = after,
                        )
                        md == -1 -> RecurrenceDraft(RepeatKind.Monthly, interval = n, monthlyMode = MonthlyMode.LastDay, afterCompletion = after)
                        else -> RecurrenceDraft(
                            RepeatKind.Monthly, interval = n, monthlyMode = MonthlyMode.DayOfMonth,
                            monthDay = (md ?: LocalDate.parse(schedule.start).dayOfMonth).coerceIn(1, 31),
                            afterCompletion = after,
                        )
                    }
                }
                Frequency.Cycle -> {
                    val length = rule.cycleLength ?: 7
                    val on = rule.cycleDays?.size ?: 1
                    RecurrenceDraft(RepeatKind.Cycle, cycleOn = on, cycleOff = (length - on).coerceAtLeast(0), afterCompletion = after)
                }
                // Shown as every 12 months on the start date's day, which repeats on the same dates.
                Frequency.Yearly -> RecurrenceDraft(
                    RepeatKind.Monthly, interval = n * 12, monthlyMode = MonthlyMode.DayOfMonth,
                    monthDay = LocalDate.parse(schedule.start).dayOfMonth, afterCompletion = after,
                )
            }
        }
    }
}

fun LocalDate.weekday(): Weekday = Weekday.entries[dayOfWeek.value - 1]

private fun ordinal(n: Int): String {
    if (n == -1) return "last"
    val suffix = when {
        n % 10 == 1 && n % 100 != 11 -> "st"
        n % 10 == 2 && n % 100 != 12 -> "nd"
        n % 10 == 3 && n % 100 != 13 -> "rd"
        else -> "th"
    }
    return "$n$suffix"
}

/** Port of `describe` in packages/recurrence/src/rule.ts. Keep the wording identical. */
fun describe(schedule: Schedule): String {
    val rule = schedule.rule ?: return "Once"
    val n = rule.interval ?: 1
    fun every(unit: String) = if (n == 1) "Every $unit" else "Every $n ${unit}s"
    var text = when (rule.freq) {
        Frequency.Daily -> if (n == 1) "Daily" else every("day")
        Frequency.Weekly -> (if (n == 1) "Weekly" else every("week")) +
            (rule.byWeekday?.let { days -> " on ${days.joinToString(", ") { it.short }}" } ?: "")
        Frequency.Monthly -> {
            var t = if (n == 1) "Monthly" else every("month")
            val wd = rule.byWeekday
            val md = rule.byMonthDay
            if (wd != null && rule.nth != null) {
                t += " on the ${ordinal(rule.nth)} ${wd.joinToString("/") { it.short }}"
            } else if (md != null) {
                t += " on the " + md.joinToString(", ") { d ->
                    if (d < 0) (if (d == -1) "last day" else "${ordinal(-d)}-to-last day") else ordinal(d)
                }
            }
            t
        }
        Frequency.Yearly -> if (n == 1) "Yearly" else every("year")
        Frequency.Cycle -> "${rule.cycleDays?.size ?: 0} of every ${rule.cycleLength ?: 0} days"
    }
    if (schedule.anchor == Anchor.Completion) text += " after completion"
    rule.count?.let { text += ", $it times" }
    rule.until?.let { text += ", until $it" }
    return text
}
