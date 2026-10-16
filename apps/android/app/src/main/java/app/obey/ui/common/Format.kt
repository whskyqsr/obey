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

fun formatTime(iso: String): String = parseInstant(iso).local().format(timeFmt)

/** "Today 18:00", "Tomorrow 09:00", "Mon 3 Nov, 18:00". */
fun formatDue(iso: String, today: LocalDate = LocalDate.now()): String {
    val z = parseInstant(iso).local()
    val d = z.toLocalDate()
    val time = z.format(timeFmt)
    return when (ChronoUnit.DAYS.between(today, d)) {
        0L -> "Today $time"
        1L -> "Tomorrow $time"
        -1L -> "Yesterday $time"
        else -> z.format(dateTimeFmt) + time
    }
}

fun formatDate(date: LocalDate): String = date.format(dateFmt)

fun formatDateTime(iso: String): String = parseInstant(iso).local().let { it.format(dateTimeFmt) + it.format(timeFmt) }

fun signed(points: Int): String = if (points > 0) "+$points" else points.toString()
