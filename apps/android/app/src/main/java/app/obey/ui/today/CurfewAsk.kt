package app.obey.ui.today

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowForward
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.outlined.Bedtime
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Event
import androidx.compose.material.icons.outlined.MoreTime
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.unit.dp
import app.obey.api.CalendarEvent
import app.obey.api.CurfewClash
import app.obey.api.CurfewNight
import app.obey.api.CurfewRequest
import app.obey.ui.common.formatTime
import app.obey.ui.common.local
import app.obey.ui.common.parseInstant
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

private fun Instant.iso() = toString()

/** The first local time of day [hour]:[minute] after [after] (1:00 AM after 10:00 PM is the next morning). */
fun timeAfter(after: Instant, hour: Int, minute: Int): Instant {
    val start = after.atZone(ZoneId.systemDefault())
    var at = start.withHour(hour).withMinute(minute).withSecond(0).withNano(0)
    if (!at.toInstant().isAfter(after)) at = at.plusDays(1)
    return at.toInstant()
}

/** "+30 min", "+1 hour", "+2 hours". */
private fun plusLabel(minutes: Long) = when {
    minutes < 60 -> "+$minutes min"
    minutes % 60 == 0L -> "+${minutes / 60} ${if (minutes == 60L) "hour" else "hours"}"
    else -> "+${minutes / 60} h ${minutes % 60} min"
}

private val weekday = DateTimeFormatter.ofPattern("EEEE")

/** "tonight", or "on Friday night" for a night further off. */
fun nightLabel(dueAt: String): String {
    val night = parseInstant(dueAt).minus(Duration.ofHours(12)).local().toLocalDate()
    val now = Instant.now().minus(Duration.ofHours(6)).local().toLocalDate()
    return if (night == now) "tonight" else "on ${night.format(weekday)} night"
}

/** Ready-made times plus "Pick a time". Times outside (after, before) are left out or refused. */
@OptIn(ExperimentalLayoutApi::class, ExperimentalMaterial3Api::class)
@Composable
private fun TimeChoices(options: List<Pair<String, Instant>>, value: Instant?, after: Instant, before: Instant?, onChange: (Instant) -> Unit) {
    var picking by remember { mutableStateOf(false) }
    val valid = { at: Instant -> at.isAfter(after) && (before == null || at.isBefore(before)) }
    val custom = value != null && options.none { it.second == value }
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        options.filter { valid(it.second) }.forEach { (label, at) ->
            FilterChip(
                selected = value == at,
                onClick = { onChange(at) },
                label = { Text(label) },
                leadingIcon = if (value == at) ({ Icon(Icons.Outlined.Check, null, Modifier.size(18.dp)) }) else null,
            )
        }
        FilterChip(
            selected = custom,
            onClick = { picking = true },
            label = { Text(if (custom) formatTime(value!!.iso()) else "Pick a time") },
            leadingIcon = { Icon(Icons.Outlined.Schedule, null, Modifier.size(18.dp)) },
        )
    }
    if (picking) {
        val start = (value ?: after).local()
        val state = rememberTimePickerState(initialHour = start.hour, initialMinute = start.minute)
        AlertDialog(
            onDismissRequest = { picking = false },
            text = { TimePicker(state = state) },
            confirmButton = {
                Button(onClick = {
                    val at = timeAfter(after, state.hour, state.minute)
                    if (valid(at)) onChange(at)
                    picking = false
                }) { Text("OK") }
            },
            dismissButton = { TextButton(onClick = { picking = false }) { Text("Cancel") } },
        )
    }
}

@Composable
private fun Summary(icon: ImageVector, title: String, body: String) {
    Surface(color = MaterialTheme.colorScheme.surfaceContainerHigh, shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth()) {
        Row(Modifier.padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(icon, null, tint = MaterialTheme.colorScheme.primary)
            Spacer(Modifier.width(12.dp))
            Column {
                Text(title, style = MaterialTheme.typography.titleMedium)
                Text(body, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun Sheet(icon: ImageVector, title: String, onDismiss: () -> Unit, actions: @Composable () -> Unit, content: @Composable () -> Unit) {
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(Modifier.padding(start = 24.dp, end = 24.dp, bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Icon(icon, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(title, style = MaterialTheme.typography.headlineSmall)
            content()
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End)) { actions() }
        }
    }
}

/** "More time tonight": a sub asks [who] for a later home-by. */
@Composable
fun MoreTimeSheet(night: CurfewNight, who: String, busy: Boolean, onDismiss: () -> Unit, onAsk: (until: String, reason: String?) -> Unit) {
    val due = parseInstant(night.dueAt)
    val end = parseInstant(night.endsAt)
    val options = listOf(30L, 60L, 120L).map { plusLabel(it) to due.plus(Duration.ofMinutes(it)) }
    var until by remember { mutableStateOf<Instant?>(options[1].second.takeIf { it.isBefore(end) }) }
    var reason by remember { mutableStateOf("") }
    val dueLabel = formatTime(night.dueAt)
    Sheet(
        Icons.Outlined.MoreTime,
        "More time tonight",
        onDismiss,
        actions = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
            Button(onClick = { until?.let { onAsk(it.iso(), reason.trim().ifEmpty { null }) } }, enabled = until != null && !busy) { Text("Ask $who") }
        },
    ) {
        Text("Curfew is $dueLabel. Ask $who to make it:", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        TimeChoices(options, until, due, end) { until = it }
        until?.let { Summary(Icons.Filled.Home, "Home by ${formatTime(it.iso())} tonight", "Still in until ${formatTime(night.endsAt)}") }
        OutlinedTextField(reason, { reason = it.take(280) }, label = { Text("Reason (optional)") }, modifier = Modifier.fillMaxWidth())
        Text(
            "Only tonight. If $who hasn't answered by $dueLabel, curfew stays at $dueLabel.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

/** A sub's ask, for a Dominant: approve, approve a different time, or decline. */
@Composable
fun CurfewAskCard(request: CurfewRequest, name: String, onApprove: () -> Unit, onChange: () -> Unit, onDecline: () -> Unit) {
    val c = MaterialTheme.colorScheme
    Surface(color = c.secondaryContainer, contentColor = c.onSecondaryContainer, shape = RoundedCornerShape(24.dp), modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("$name asks to be home by ${formatTime(request.untilAt)} ${nightLabel(request.fromDueAt)}", style = MaterialTheme.typography.titleMedium)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Curfew ${formatTime(request.fromDueAt)} ", style = MaterialTheme.typography.bodyMedium)
                Icon(Icons.AutoMirrored.Outlined.ArrowForward, null, Modifier.size(16.dp))
                Text(" ${formatTime(request.untilAt)}" + (request.eventTitle?.let { " · for $it" } ?: ""), style = MaterialTheme.typography.bodyMedium)
            }
            request.reason?.let { Text("\"$it\"", style = MaterialTheme.typography.bodyMedium, fontStyle = FontStyle.Italic) }
            Row(Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                Button(onClick = onApprove) {
                    Icon(Icons.Outlined.Check, null, Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text("Approve")
                }
                OutlinedButton(onClick = onChange) { Text("Change") }
                TextButton(onClick = onDecline) { Text("Decline", color = c.onSecondaryContainer) }
            }
        }
    }
}

/** Approving a different time than asked: half-hour steps up to it, or any time in between. */
@Composable
fun ApproveOtherTimeSheet(request: CurfewRequest, name: String, busy: Boolean, onDismiss: () -> Unit, onApprove: (until: String, note: String?) -> Unit) {
    val from = parseInstant(request.fromDueAt)
    val asked = parseInstant(request.untilAt)
    val steps = generateSequence(30L) { it + 30 }.map { from.plus(Duration.ofMinutes(it)) }.takeWhile { it.isBefore(asked) }.take(3).map { formatTime(it.iso()) to it }.toList()
    val options = steps + ("${formatTime(request.untilAt)} · asked" to asked)
    var until by remember { mutableStateOf<Instant?>(options.first().second) }
    var note by remember { mutableStateOf("") }
    Sheet(
        Icons.Outlined.Bedtime,
        "Home by, ${nightLabel(request.fromDueAt)}",
        onDismiss,
        actions = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
            Button(onClick = { until?.let { onApprove(it.iso(), note.trim().ifEmpty { null }) } }, enabled = until != null && !busy) { Text("Approve ${until?.let { formatTime(it.iso()) } ?: ""}") }
        },
    ) {
        TimeChoices(options, until, from, null) { until = it }
        until?.let { Summary(Icons.Filled.Home, "Home by ${formatTime(it.iso())}", "$name asked for ${formatTime(request.untilAt)}") }
        OutlinedTextField(note, { note = it.take(1000) }, label = { Text("Note to $name (optional)") }, modifier = Modifier.fillMaxWidth())
    }
}

private val planDay = DateTimeFormatter.ofPattern("EEE, MMM d")

/** A Dominant moving when a plan ends, to curfew or earlier; its author is told. */
@Composable
fun PlanEndSheet(clash: CurfewClash, to: String, busy: Boolean, onDismiss: () -> Unit, onChange: (endsAt: String, note: String?) -> Unit) {
    val due = parseInstant(clash.dueAt)
    val starts = parseInstant(clash.eventStartsAt)
    val ends = parseInstant(clash.eventEndsAt)
    val earlier = due.minus(Duration.ofMinutes(30))
    val options = listOf("At curfew · ${formatTime(clash.dueAt)}" to due, formatTime(earlier.iso()) to earlier)
    var endsAt by remember { mutableStateOf<Instant?>(due) }
    var note by remember { mutableStateOf("") }
    Sheet(
        Icons.Outlined.Event,
        "When does ${clash.eventTitle} end?",
        onDismiss,
        actions = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
            Button(onClick = { endsAt?.let { onChange(it.iso(), note.trim().ifEmpty { null }) } }, enabled = endsAt != null && !busy) { Text("Change end") }
        },
    ) {
        TimeChoices(options, endsAt, starts, ends) { endsAt = it }
        endsAt?.let {
            Summary(Icons.Outlined.Event, "${starts.local().format(planDay)}, ${formatTime(clash.eventStartsAt)} – ${formatTime(it.iso())}", "Was until ${formatTime(clash.eventEndsAt)}")
        }
        OutlinedTextField(note, { note = it.take(280) }, label = { Text("Note to $to (optional)") }, modifier = Modifier.fillMaxWidth())
        Text(
            "They're told the plan now ends at ${endsAt?.let { formatTime(it.iso()) } ?: "the new time"}. " +
                if (endsAt?.isAfter(due) == true) "Curfew moves to ${formatTime(endsAt!!.iso())} that night." else "Curfew stays at ${formatTime(clash.dueAt)}.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

/** One of my plans someone else changed, until I close it. */
@Composable
fun PlanChangeCard(event: CalendarEvent, name: String, onSeen: () -> Unit) {
    val c = MaterialTheme.colorScheme
    Surface(color = c.surfaceContainerHigh, shape = RoundedCornerShape(24.dp), modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp)) {
        Row(Modifier.padding(start = 16.dp, top = 12.dp, bottom = 12.dp, end = 4.dp)) {
            Icon(Icons.Outlined.Event, null, tint = c.primary, modifier = Modifier.padding(top = 2.dp))
            Spacer(Modifier.width(16.dp))
            Column(Modifier.weight(1f)) {
                Text("$name changed ${event.title}", style = MaterialTheme.typography.titleMedium)
                Text(
                    "${parseInstant(event.startsAt).local().format(planDay)}, ${formatTime(event.startsAt)} – ${formatTime(event.endsAt)}" +
                        (event.previousEndsAt?.let { " · was until ${formatTime(it)}" } ?: ""),
                    style = MaterialTheme.typography.bodyMedium,
                    color = c.onSurfaceVariant,
                )
                event.changeNote?.let { Text("“$it”", style = MaterialTheme.typography.bodyMedium, fontStyle = FontStyle.Italic, modifier = Modifier.padding(top = 4.dp)) }
            }
            IconButton(onClick = onSeen) { Icon(Icons.Outlined.Close, "Got it") }
        }
    }
}

/** "Note to …" after a one-tap decision: a comment on that task or curfew night, with a notification. */
@Composable
fun NoteDialog(target: NoteTarget, busy: Boolean, onDismiss: () -> Unit, onSend: (String) -> Unit) {
    var body by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Note to ${target.to}") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Text("About ${target.about}. ${target.to} is sent a notification.", style = MaterialTheme.typography.bodyMedium)
                OutlinedTextField(body, { body = it.take(1000) }, label = { Text("Note") }, minLines = 3, modifier = Modifier.fillMaxWidth())
            }
        },
        confirmButton = { Button(onClick = { onSend(body.trim()) }, enabled = body.isNotBlank() && !busy) { Text("Send") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}
