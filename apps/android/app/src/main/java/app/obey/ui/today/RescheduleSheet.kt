package app.obey.ui.today

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
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
import app.obey.api.CalendarEvent
import app.obey.api.Occurrence
import app.obey.api.RescheduleInput
import app.obey.api.ReschedulePolicy
import app.obey.api.RescheduleScope
import app.obey.api.Role
import app.obey.data.Session
import app.obey.ui.common.ChoiceChip
import app.obey.ui.common.LettersField
import app.obey.ui.common.PillRow
import app.obey.ui.common.PillSegment
import app.obey.ui.common.formatDateTime
import app.obey.ui.common.formatTime
import app.obey.ui.common.inkButtonColors
import app.obey.ui.common.local
import app.obey.ui.common.parseInstant
import app.obey.ui.plans.afterPlan
import app.obey.ui.plans.iso
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.ZonedDateTime

private enum class MoreTime(val label: String, val minutes: Long) {
    HalfHour("+30 min", 30), Hour("+1 hour", 60), TwoHours("+2 hours", 120), Tomorrow("Tomorrow, same time", 24 * 60), After("", 0), Custom("Pick a time…", 0)
}

/** "9:00 PM tonight", "8:30 AM today", or the date and time on another day. */
private fun dueLine(iso: String): String {
    val z = parseInstant(iso).local()
    if (z.toLocalDate() != LocalDate.now()) return formatDateTime(iso)
    return "${formatTime(iso)} ${if (z.hour >= 17) "tonight" else "today"}"
}

/**
 * More time for one task (mockup 40): quick amounts, this one or later ones too, a reason, and who is asked.
 * Whether it applies immediately or becomes a request is the server's call (relationship policy).
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun RescheduleSheet(
    occurrence: Occurrence,
    onDismiss: () -> Unit,
    onSubmit: (RescheduleInput) -> Unit,
    session: Session? = null,
    /** A plan it runs into, for a one-tap "After the plan". */
    after: CalendarEvent? = null,
    /** Offers "More time for everything today instead". */
    onWholeDay: (() -> Unit)? = null,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var choice by rememberSaveable { mutableStateOf(if (after != null) MoreTime.After else MoreTime.Tomorrow) }
    var custom by remember { mutableStateOf<ZonedDateTime?>(null) }
    var scope by rememberSaveable { mutableStateOf(RescheduleScope.This) }
    var reason by rememberSaveable { mutableStateOf("") }
    var picking by remember { mutableStateOf(false) }
    val current = parseInstant(occurrence.dueAt).local()

    val isDom = session?.canManage == true
    val policy = session?.relationship?.reschedulePolicy
    val willRequest = !isDom && policy == ReschedulePolicy.Request
    val subBlocked = !isDom && policy == ReschedulePolicy.DominantOnly
    val domName = session?.partners?.firstOrNull { it.role == Role.Dominant }?.displayName ?: "your Dominant"
    val status = when {
        subBlocked -> "Only $domName can move deadlines here."
        !isDom && policy == ReschedulePolicy.Allowance ->
            "You have ${session?.relationship?.weeklyDelayAllowance ?: 0} free delays a week. Past that, $domName is asked."
        else -> null
    }
    val newDue: ZonedDateTime? = when (choice) {
        MoreTime.After -> after?.let { afterPlan(occurrence.dueAt, it) }
        MoreTime.Custom -> custom
        else -> current.plusMinutes(choice.minutes)
    }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(
            Modifier.fillMaxWidth().padding(horizontal = 24.dp).padding(bottom = 24.dp).navigationBarsPadding(),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("More time for ${occurrence.title}", style = MaterialTheme.typography.headlineSmall)
                Text(
                    "Due ${dueLine(occurrence.dueAt)}." + if (willRequest) " $domName will be asked." else "",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf(MoreTime.HalfHour, MoreTime.Hour, MoreTime.TwoHours, MoreTime.Tomorrow).forEach { m ->
                    ChoiceChip(selected = choice == m, onClick = { choice = m }, label = { Text(m.label) })
                }
                if (after != null) ChoiceChip(selected = choice == MoreTime.After, onClick = { choice = MoreTime.After }, label = { Text("After ${after.title}") })
                ChoiceChip(
                    selected = choice == MoreTime.Custom,
                    onClick = { picking = true },
                    label = { Text(custom?.takeIf { choice == MoreTime.Custom }?.let { formatDateTime(it.iso()) } ?: MoreTime.Custom.label) },
                )
            }
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Move", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                PillRow {
                    PillSegment(selected = scope == RescheduleScope.This, onClick = { scope = RescheduleScope.This }) { Text("This one", maxLines = 1) }
                    PillSegment(selected = scope == RescheduleScope.Following, onClick = { scope = RescheduleScope.Following }) {
                        Text("This and later ones", maxLines = 1)
                    }
                }
            }
            LettersField(
                value = reason,
                onValueChange = { reason = it.take(1000) },
                label = { Text("Reason (optional)") },
                modifier = Modifier.fillMaxWidth(),
            )
            if (status != null) {
                Text(
                    status,
                    style = if (subBlocked) MaterialTheme.typography.bodyMedium else MaterialTheme.typography.bodySmall,
                    color = if (subBlocked) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Button(
                onClick = {
                    val due = newDue ?: return@Button
                    onSubmit(RescheduleInput(scope = scope, dueAt = due.iso(), reason = reason.trim().takeIf { it.isNotEmpty() }))
                    onDismiss()
                },
                enabled = !subBlocked && newDue != null,
                colors = inkButtonColors(),
                modifier = Modifier.fillMaxWidth().height(48.dp),
            ) { Text(if (willRequest) "Ask $domName" else "Move it") }
            if (onWholeDay != null) {
                TextButton(onClick = { onDismiss(); onWholeDay() }, modifier = Modifier.fillMaxWidth()) {
                    Text("More time for everything today instead", style = MaterialTheme.typography.bodyLarge)
                }
            }
        }
    }

    if (picking) {
        DeadlinePicker(
            initial = custom ?: current.plusDays(1),
            onPicked = { custom = it; choice = MoreTime.Custom; picking = false },
            onDismiss = { picking = false },
        )
    }
}

/** Pick a new deadline: a date, then a time. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DeadlinePicker(initial: ZonedDateTime, onPicked: (ZonedDateTime) -> Unit, onDismiss: () -> Unit) {
    var date by remember { mutableStateOf<LocalDate?>(null) }
    val picked = date
    if (picked == null) {
        val dateState = rememberDatePickerState(initialSelectedDateMillis = initial.toLocalDate().atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli())
        DatePickerDialog(
            onDismissRequest = onDismiss,
            confirmButton = {
                TextButton(onClick = {
                    // DatePicker reports midnight UTC of the chosen day.
                    dateState.selectedDateMillis?.let { date = Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate() }
                }) { Text("Next") }
            },
            dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
        ) { DatePicker(state = dateState) }
    } else {
        val timeState = rememberTimePickerState(initialHour = initial.hour, initialMinute = initial.minute)
        AlertDialog(
            onDismissRequest = onDismiss,
            title = { Text("New time") },
            text = { TimePicker(state = timeState) },
            confirmButton = {
                Button(onClick = { onPicked(ZonedDateTime.of(picked, LocalTime.of(timeState.hour, timeState.minute), ZoneId.systemDefault())) }) { Text("Set deadline") }
            },
            dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
        )
    }
}
