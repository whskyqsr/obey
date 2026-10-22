package app.obey.ui.rewards

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
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
import app.obey.api.AssignConsequenceInput
import app.obey.api.Consequence
import app.obey.ui.common.formatDate
import app.obey.ui.tasks.LabeledSwitch
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle

/** Hands out a consequence on its own; it shows up on their Today like a one-off task. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AssignConsequenceDialog(consequence: Consequence, assigneeId: String, chastity: Boolean, onDismiss: () -> Unit, onAssign: (AssignConsequenceInput) -> Unit) {
    val today = LocalDate.now()
    var date by remember { mutableStateOf(today) }
    var anyTime by remember { mutableStateOf(true) }
    var time by remember { mutableStateOf(LocalTime.of(21, 0)) }
    var reason by remember { mutableStateOf("") }
    var approval by remember { mutableStateOf(false) }
    var pickDate by remember { mutableStateOf(false) }
    var pickTime by remember { mutableStateOf(false) }
    // A lock-time consequence goes straight onto their running lock: there's nothing to schedule.
    val lockTime = consequence.lockMinutes?.takeIf { chastity }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Assign “${consequence.title}”") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(reason, { reason = it.take(2000) }, label = { Text("Reason (optional)") }, minLines = 2, modifier = Modifier.fillMaxWidth())
                if (lockTime != null) {
                    Text("This adds ${app.obey.ui.chastity.fmtMinutes(lockTime)} to their lock straight away. It needs a running lock with an end time.")
                } else {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(selected = date == today, onClick = { date = today }, label = { Text("Today") })
                    FilterChip(selected = date == today.plusDays(1), onClick = { date = today.plusDays(1) }, label = { Text("Tomorrow") })
                    FilterChip(
                        selected = date.isAfter(today.plusDays(1)),
                        onClick = { pickDate = true },
                        label = { Text(if (date.isAfter(today.plusDays(1))) formatDate(date) else "Pick a day") },
                    )
                }
                LabeledSwitch("Any time that day", null, anyTime) { anyTime = it }
                if (!anyTime) {
                    OutlinedButton(onClick = { pickTime = true }) { Text("Due at ${time.format(DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT))}") }
                }
                LabeledSwitch("Needs approval", "It counts as served only after you approve it", approval) { approval = it }
                }
            }
        },
        confirmButton = {
            Button(onClick = {
                onAssign(
                    AssignConsequenceInput(
                        assigneeId = assigneeId,
                        date = date.toString(),
                        dueTime = if (anyTime) null else time.format(DateTimeFormatter.ofPattern("HH:mm")),
                        timezone = ZoneId.systemDefault().id,
                        reason = reason.trim(),
                        approvalRequired = approval,
                    ),
                )
            }) { Text("Assign") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )

    if (pickDate) {
        val state = rememberDatePickerState(initialSelectedDateMillis = date.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli())
        DatePickerDialog(
            onDismissRequest = { pickDate = false },
            confirmButton = {
                TextButton(onClick = {
                    state.selectedDateMillis?.let { ms ->
                        Instant.ofEpochMilli(ms).atZone(ZoneOffset.UTC).toLocalDate().takeIf { !it.isBefore(today) }?.let { date = it }
                    }
                    pickDate = false
                }) { Text("OK") }
            },
            dismissButton = { TextButton(onClick = { pickDate = false }) { Text("Cancel") } },
        ) { DatePicker(state = state) }
    }
    if (pickTime) {
        val state = rememberTimePickerState(initialHour = time.hour, initialMinute = time.minute)
        AlertDialog(
            onDismissRequest = { pickTime = false },
            title = { Text("Due time") },
            text = { TimePicker(state = state) },
            confirmButton = { Button(onClick = { time = LocalTime.of(state.hour, state.minute); pickTime = false }) { Text("OK") } },
            dismissButton = { TextButton(onClick = { pickTime = false }) { Text("Cancel") } },
        )
    }
}
