package app.obey.ui.tasks

import app.obey.ui.common.LocalFeatures
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.obey.api.HistoryEntry
import app.obey.api.OccurrenceStatus
import app.obey.ui.common.SectionHeader
import app.obey.ui.common.formatDate
import app.obey.ui.common.formatDateTime
import app.obey.ui.common.parseInstant
import app.obey.ui.common.signed
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle

private val HistoryEntry.label: String
    get() = when (status) {
        OccurrenceStatus.Completed -> "Done"
        OccurrenceStatus.Missed -> "Missed"
        OccurrenceStatus.Excused -> "Excused"
        OccurrenceStatus.Submitted -> "Awaiting review"
        else -> status.name
    }

/** Past occurrences of a task; with [onEdit] (a Dominant), tapping one opens a correction dialog. */
@Composable
fun TaskHistorySection(history: List<HistoryEntry>, onEdit: ((HistoryEntry, OccurrenceStatus, Instant?, String) -> Unit)?) {
    var editing by remember { mutableStateOf<HistoryEntry?>(null) }
    val showPoints = LocalFeatures.current.points
    SectionHeader("History", horizontalPadding = 0.dp)
    if (history.isEmpty()) {
        Text(
            "Nothing yet. Finished and missed occurrences show up here.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
    history.forEach { h ->
        ListItem(
            modifier = if (onEdit != null) Modifier.clickable { editing = h } else Modifier,
            colors = ListItemDefaults.colors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
            headlineContent = { Text(formatDate(LocalDate.parse(h.originalDate))) },
            supportingContent = {
                Text(
                    (h.completedAt?.let { "Done ${formatDateTime(it)}" } ?: "Due ${formatDateTime(h.dueAt)}") +
                        if (h.editedBy != null) " · edited" else "",
                )
            },
            trailingContent = {
                Text(
                    listOfNotNull(h.pointsDelta.takeIf { it != 0 && showPoints }?.let(::signed), h.label).joinToString("  "),
                    color = if (h.status == OccurrenceStatus.Missed) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary,
                    style = MaterialTheme.typography.labelLarge,
                )
            },
        )
    }
    editing?.let { h -> EditHistoryDialog(h, onDismiss = { editing = null }) { s, at, note -> onEdit?.invoke(h, s, at, note); editing = null } }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun EditHistoryDialog(entry: HistoryEntry, onDismiss: () -> Unit, onSave: (OccurrenceStatus, Instant?, String) -> Unit) {
    val zone = ZoneId.systemDefault()
    var status by remember { mutableStateOf(if (entry.status == OccurrenceStatus.Submitted) OccurrenceStatus.Completed else entry.status) }
    var doneAt by remember { mutableStateOf(parseInstant(entry.completedAt ?: entry.dueAt).atZone(zone).toLocalDateTime()) }
    var note by remember { mutableStateOf(entry.noteMd.orEmpty()) }
    var pickDate by remember { mutableStateOf(false) }
    var pickTime by remember { mutableStateOf(false) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(formatDate(LocalDate.parse(entry.originalDate))) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf(OccurrenceStatus.Completed to "Done", OccurrenceStatus.Missed to "Missed", OccurrenceStatus.Excused to "Excused")
                        .forEach { (s, label) -> FilterChip(selected = status == s, onClick = { status = s }, label = { Text(label) }) }
                }
                if (status == OccurrenceStatus.Completed) {
                    Text("Done at", style = MaterialTheme.typography.labelLarge)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedButton(onClick = { pickDate = true }) { Text(formatDate(doneAt.toLocalDate())) }
                        OutlinedButton(onClick = { pickTime = true }) {
                            Text(doneAt.toLocalTime().format(DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT)))
                        }
                    }
                }
                OutlinedTextField(value = note, onValueChange = { note = it.take(5000) }, label = { Text("Note") }, modifier = Modifier.fillMaxWidth())
                if (LocalFeatures.current.points) {
                    Text(
                        "Points follow the status: done earns the task's points, missed costs its penalty, excused is neither.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        },
        confirmButton = { Button(onClick = { onSave(status, doneAt.atZone(zone).toInstant(), note) }) { Text("Save") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )

    if (pickDate) {
        val state = rememberDatePickerState(initialSelectedDateMillis = doneAt.toLocalDate().atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli())
        DatePickerDialog(
            onDismissRequest = { pickDate = false },
            confirmButton = {
                TextButton(onClick = {
                    state.selectedDateMillis?.let { ms ->
                        doneAt = doneAt.with(Instant.ofEpochMilli(ms).atZone(ZoneOffset.UTC).toLocalDate())
                    }
                    pickDate = false
                }) { Text("OK") }
            },
            dismissButton = { TextButton(onClick = { pickDate = false }) { Text("Cancel") } },
        ) { DatePicker(state = state) }
    }
    if (pickTime) {
        val state = rememberTimePickerState(initialHour = doneAt.hour, initialMinute = doneAt.minute)
        AlertDialog(
            onDismissRequest = { pickTime = false },
            title = { Text("Done at") },
            text = { TimePicker(state = state) },
            confirmButton = {
                Button(onClick = {
                    doneAt = doneAt.with(LocalTime.of(state.hour, state.minute))
                    pickTime = false
                }) { Text("OK") }
            },
            dismissButton = { TextButton(onClick = { pickTime = false }) { Text("Cancel") } },
        )
    }
}
