package app.obey.ui.today

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.obey.api.Occurrence
import app.obey.api.RescheduleInput
import app.obey.api.RescheduleScope
import app.obey.ui.common.formatDue
import app.obey.ui.common.local
import app.obey.ui.common.parseInstant
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter

/**
 * Delay or set a new deadline for one occurrence, or for it and the rest of its series.
 * Whether it applies immediately or becomes a request is the server's call (relationship policy).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RescheduleSheet(
    occurrence: Occurrence,
    onDismiss: () -> Unit,
    onSubmit: (RescheduleInput) -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var scope by rememberSaveable { mutableStateOf(RescheduleScope.This) }
    var reason by rememberSaveable { mutableStateOf("") }
    var pickDate by remember { mutableStateOf(false) }
    var pickTime by remember { mutableStateOf<LocalDate?>(null) }
    val current = parseInstant(occurrence.dueAt).local()

    fun submit(delayHours: Int? = null, dueAt: String? = null) {
        onSubmit(RescheduleInput(scope = scope, delayHours = delayHours, dueAt = dueAt, reason = reason.takeIf { it.isNotBlank() }))
        onDismiss()
    }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(
            Modifier.fillMaxWidth().padding(horizontal = 24.dp).padding(bottom = 24.dp).navigationBarsPadding(),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text("Reschedule", style = MaterialTheme.typography.titleLarge)
            Text(
                "${occurrence.title} · due ${formatDue(occurrence.dueAt)}",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                SegmentedButton(
                    selected = scope == RescheduleScope.This,
                    onClick = { scope = RescheduleScope.This },
                    shape = SegmentedButtonDefaults.itemShape(0, 2),
                ) { Text("This one") }
                SegmentedButton(
                    selected = scope == RescheduleScope.Following,
                    onClick = { scope = RescheduleScope.Following },
                    shape = SegmentedButtonDefaults.itemShape(1, 2),
                ) { Text("This & following") }
            }

            Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
                FilledTonalButton(onClick = { submit(delayHours = 1) }, modifier = Modifier.weight(1f)) {
                    Icon(Icons.Outlined.Schedule, contentDescription = null)
                    Text("  +1 hour")
                }
                FilledTonalButton(onClick = { submit(delayHours = 24) }, modifier = Modifier.weight(1f)) {
                    Icon(Icons.Outlined.Schedule, contentDescription = null)
                    Text("  +24 hours")
                }
            }
            OutlinedButton(onClick = { pickDate = true }, modifier = Modifier.fillMaxWidth()) {
                Icon(Icons.Outlined.CalendarMonth, contentDescription = null)
                Text("  Pick a new date and time")
            }
            OutlinedTextField(
                value = reason,
                onValueChange = { reason = it.take(1000) },
                label = { Text("Reason (optional)") },
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }

    if (pickDate) {
        val dateState = rememberDatePickerState(
            initialSelectedDateMillis = current.toLocalDate().atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli(),
        )
        DatePickerDialog(
            onDismissRequest = { pickDate = false },
            confirmButton = {
                TextButton(onClick = {
                    val millis = dateState.selectedDateMillis
                    pickDate = false
                    // DatePicker reports midnight UTC of the chosen day.
                    if (millis != null) pickTime = Instant.ofEpochMilli(millis).atZone(ZoneOffset.UTC).toLocalDate()
                }) { Text("Next") }
            },
            dismissButton = { TextButton(onClick = { pickDate = false }) { Text("Cancel") } },
        ) { DatePicker(state = dateState) }
    }

    pickTime?.let { date ->
        val timeState = rememberTimePickerState(initialHour = current.hour, initialMinute = current.minute)
        AlertDialog(
            onDismissRequest = { pickTime = null },
            title = { Text("New time") },
            text = { TimePicker(state = timeState) },
            confirmButton = {
                Button(onClick = {
                    val due = ZonedDateTime.of(date, LocalTime.of(timeState.hour, timeState.minute), ZoneId.systemDefault())
                    pickTime = null
                    submit(dueAt = due.format(DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ssXXX")))
                }) { Text("Set deadline") }
            },
            dismissButton = { TextButton(onClick = { pickTime = null }) { Text("Cancel") } },
        )
    }
}
