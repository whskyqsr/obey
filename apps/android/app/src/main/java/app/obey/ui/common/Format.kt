package app.obey.ui.common

import java.time.Instant
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.time.temporal.ChronoUnit

fun parseInstant(iso: String): Instant = OffsetDateTime.parse(iso).toInstant()

fun Instant.local(): ZonedDateTime = atZone(ZoneId.systemDefault())

private val timeFmt = DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT)
private val dateFmt = DateTimeFormatter.ofPattern("EEE d MMM")
private val dateTimeFmt = DateTimeFormatter.ofPattern("EEE d MMM, ")

/** All-day tasks are due at 23:59:59 local time; show "all day" rather than 23:59. */
private fun ZonedDateTime.timeLabel(): String =
    if (hour == 23 && minute == 59 && second == 59) "all day" else format(timeFmt)

/** A task's wall-clock due time ("21:00") in the same style as other times. */
fun formatClock(hhmm: String): String = java.time.LocalTime.parse(hhmm).format(timeFmt)

fun formatTime(iso: String): String = parseInstant(iso).local().timeLabel().replaceFirstChar { it.uppercase() }

/** "Today 18:00", "Tomorrow 09:00", "Mon 3 Nov, 18:00". */
fun formatDue(iso: String, today: LocalDate = LocalDate.now()): String {
    val z = parseInstant(iso).local()
    val d = z.toLocalDate()
    val time = z.timeLabel()
    return when (ChronoUnit.DAYS.between(today, d)) {
        0L -> "Today $time"
        1L -> "Tomorrow $time"
        -1L -> "Yesterday $time"
        else -> z.format(dateTimeFmt) + time
    }
}

fun formatDate(date: LocalDate): String = date.format(dateFmt)

fun formatDateTime(iso: String): String = parseInstant(iso).local().let { it.format(dateTimeFmt) + it.timeLabel() }

fun signed(points: Int): String = if (points > 0) "+$points" else points.toString()

/** "just now", "5 min ago", "2 h ago", then the day: how long since something happened. */
fun ago(iso: String, now: Instant = Instant.now()): String {
    val d = java.time.Duration.between(parseInstant(iso), now)
    return when {
        d.toMinutes() < 1 -> "just now"
        d.toHours() < 1 -> "${d.toMinutes()} min ago"
        d.toHours() < 24 -> "${d.toHours()} h ago"
        else -> formatDateTime(iso)
    }
}
