package app.obey.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Diamond
import androidx.compose.material.icons.outlined.Event
import androidx.compose.material.icons.outlined.FavoriteBorder
import androidx.compose.material.icons.outlined.WavingHand
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import app.obey.api.DynamicDate
import app.obey.ui.common.formatDate
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.time.temporal.ChronoUnit

val DATE_PRESETS = listOf("Anniversary", "Collaring", "First met")

fun dateIcon(label: String): ImageVector = when (label) {
    "Anniversary" -> Icons.Outlined.FavoriteBorder
    "Collaring" -> Icons.Outlined.Diamond
    "First met" -> Icons.Outlined.WavingHand
    else -> Icons.Outlined.Event
}

/** Days until [date] next comes round from [today] (0 = today); Feb 29 falls on Feb 28 in other years. */
fun daysUntilNext(date: LocalDate, today: LocalDate): Long {
    if (date > today) return ChronoUnit.DAYS.between(today, date)
    var next = date.withYear(today.year)
    if (next < today) next = date.withYear(today.year + 1)
    return ChronoUnit.DAYS.between(today, next)
}

/** "Mar 4, 2023 · 3 years · next in 135 days"; future dates count down. Matches the web. */
fun describeDate(date: LocalDate, today: LocalDate): String {
    val days = daysUntilNext(date, today)
    if (date > today) return "${formatDate(date)} · in $days ${if (days == 1L) "day" else "days"}"
    val years = ChronoUnit.YEARS.between(date, today)
    val age = if (years == 0L) null else "$years ${if (years == 1L) "year" else "years"}"
    val next = when (days) {
        0L -> if (years > 0) "today 🎉" else "today"
        1L -> "tomorrow"
        else -> "next in $days days"
    }
    return listOfNotNull(formatDate(date), age, next).joinToString(" · ")
}

/** Add or change one of the dynamic's dates: a preset label or any other, and the day. */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun DynamicDateDialog(value: DynamicDate, onDismiss: () -> Unit, onSave: (DynamicDate) -> Unit, onDelete: () -> Unit) {
    val isNew = value.id.isEmpty()
    var label by rememberSaveable { mutableStateOf(value.label.ifEmpty { "Anniversary" }) }
    var date by rememberSaveable { mutableStateOf(value.date) }
    var picking by rememberSaveable { mutableStateOf(false) }
    val parsed = runCatching { LocalDate.parse(date) }.getOrNull()

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (isNew) "Add a date" else "Edit date") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    DATE_PRESETS.forEach { p -> FilterChip(selected = label == p, onClick = { label = p }, label = { Text(p) }) }
                }
                OutlinedTextField(value = label, onValueChange = { label = it.take(40) }, label = { Text("Name") }, singleLine = true)
                OutlinedButton(onClick = { picking = true }) { Text(parsed?.let { formatDate(it) } ?: "Choose the date") }
            }
        },
        confirmButton = {
            Row {
                if (!isNew) TextButton(onClick = onDelete) { Text("Remove") }
                TextButton(onClick = onDismiss) { Text("Cancel") }
                TextButton(enabled = label.isNotBlank() && parsed != null, onClick = { onSave(value.copy(label = label.trim(), date = date)) }) { Text("Save") }
            }
        },
    )

    if (picking) {
        val state = rememberDatePickerState(initialSelectedDateMillis = (parsed ?: LocalDate.now()).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli())
        DatePickerDialog(
            onDismissRequest = { picking = false },
            confirmButton = {
                TextButton(onClick = {
                    state.selectedDateMillis?.let { date = Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate().toString() }
                    picking = false
                }) { Text("OK") }
            },
            dismissButton = { TextButton(onClick = { picking = false }) { Text("Cancel") } },
        ) { DatePicker(state = state) }
    }
}
