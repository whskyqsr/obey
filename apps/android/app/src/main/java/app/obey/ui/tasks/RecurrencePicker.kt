package app.obey.ui.tasks

import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.EventRepeat
import androidx.compose.material.icons.outlined.Remove
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import app.obey.api.Weekday
import app.obey.recurrence.MonthlyMode
import app.obey.recurrence.RecurrenceDraft
import app.obey.recurrence.RepeatKind
import app.obey.recurrence.describe
import java.time.LocalDate

private val dayLetters = mapOf(
    Weekday.MO to "M", Weekday.TU to "T", Weekday.WE to "W", Weekday.TH to "T",
    Weekday.FR to "F", Weekday.SA to "S", Weekday.SU to "S",
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RecurrencePicker(
    draft: RecurrenceDraft,
    start: LocalDate,
    onChange: (RecurrenceDraft) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            RepeatKind.entries.forEach { kind ->
                FilterChip(
                    selected = draft.kind == kind && draft.passthrough == null,
                    onClick = { onChange(draft.copy(kind = kind, passthrough = null)) },
                    label = { Text(kind.label) },
                )
            }
        }

        when (draft.kind) {
            RepeatKind.Once -> Unit
            RepeatKind.Daily -> Stepper("Every", draft.interval, if (draft.interval == 1) "day" else "days", 1..365) {
                onChange(draft.copy(interval = it))
            }
            RepeatKind.Weekly -> {
                Stepper("Every", draft.interval, if (draft.interval == 1) "week" else "weeks", 1..52) {
                    onChange(draft.copy(interval = it))
                }
                val selected = draft.weekdays.ifEmpty { setOf(Weekday.entries[start.dayOfWeek.value - 1]) }
                WeekdayToggles(selected = selected, onToggle = { d ->
                    val next = if (d in selected) selected - d else selected + d
                    if (next.isNotEmpty()) onChange(draft.copy(weekdays = next))
                })
            }
            RepeatKind.Monthly -> {
                Stepper("Every", draft.interval, if (draft.interval == 1) "month" else "months", 1..24) {
                    onChange(draft.copy(interval = it))
                }
                SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                    MonthlyMode.entries.forEachIndexed { i, mode ->
                        SegmentedButton(
                            selected = draft.monthlyMode == mode,
                            onClick = { onChange(draft.copy(monthlyMode = mode)) },
                            shape = SegmentedButtonDefaults.itemShape(i, MonthlyMode.entries.size),
                        ) { Text(mode.label) }
                    }
                }
                when (draft.monthlyMode) {
                    MonthlyMode.DayOfMonth -> {
                        Stepper("On day", draft.monthDay, "of the month", 1..31) { onChange(draft.copy(monthDay = it)) }
                        if (draft.monthDay > 28) {
                            Text(
                                "Shorter months use their last day.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                    MonthlyMode.NthWeekday -> {
                        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            listOf(1 to "1st", 2 to "2nd", 3 to "3rd", 4 to "4th", 5 to "5th", -1 to "Last").forEach { (n, label) ->
                                FilterChip(selected = draft.nth == n, onClick = { onChange(draft.copy(nth = n)) }, label = { Text(label) })
                            }
                        }
                        WeekdayToggles(selected = setOf(draft.nthWeekday), onToggle = { onChange(draft.copy(nthWeekday = it)) })
                    }
                    MonthlyMode.LastDay -> Unit
                }
            }
            RepeatKind.Cycle -> {
                Stepper("", draft.cycleOn, if (draft.cycleOn == 1) "day on" else "days on", 1..60) { onChange(draft.copy(cycleOn = it)) }
                Stepper("then", draft.cycleOff, if (draft.cycleOff == 1) "day off" else "days off", 0..60) { onChange(draft.copy(cycleOff = it)) }
            }
        }

        if (draft.kind != RepeatKind.Once || draft.passthrough != null) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("Count from when it's done", style = MaterialTheme.typography.bodyLarge)
                    Text(
                        "On: the next one is due after the last is completed, so finishing late moves the rest. Off: it stays on a fixed schedule.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Switch(checked = draft.afterCompletion, onCheckedChange = { onChange(draft.copy(afterCompletion = it)) })
            }
        }

        Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer)) {
            Row(Modifier.padding(16.dp).fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Outlined.EventRepeat, contentDescription = null)
                Text(
                    describe(draft.toSchedule(start)) + if (draft.kind == RepeatKind.Once && draft.passthrough == null) " on ${app.obey.ui.common.formatDate(start)}" else ", starting ${app.obey.ui.common.formatDate(start)}",
                    style = MaterialTheme.typography.bodyLarge,
                    modifier = Modifier.padding(start = 12.dp),
                )
            }
        }
    }
}

@Composable
private fun WeekdayToggles(selected: Set<Weekday>, onToggle: (Weekday) -> Unit) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        Weekday.entries.forEach { d ->
            val on = d in selected
            Surface(
                shape = CircleShape,
                color = if (on) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceContainerHigh,
                contentColor = if (on) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface,
                modifier = Modifier
                    .weight(1f)
                    .aspectRatio(1f)
                    .semantics {
                        role = Role.Checkbox
                        this.selected = on
                        contentDescription = d.short
                    }
                    .clickable { onToggle(d) },
            ) {
                Box(contentAlignment = Alignment.Center) { Text(dayLetters.getValue(d), style = MaterialTheme.typography.labelLarge) }
            }
        }
    }
}

@Composable
fun Stepper(prefix: String, value: Int, suffix: String, range: IntRange, onChange: (Int) -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        if (prefix.isNotEmpty()) Text(prefix, modifier = Modifier.padding(end = 8.dp))
        IconButton(onClick = { onChange((value - 1).coerceIn(range)) }, enabled = value > range.first) {
            Icon(Icons.Outlined.Remove, "Fewer")
        }
        Text("$value", style = MaterialTheme.typography.titleLarge)
        IconButton(onClick = { onChange((value + 1).coerceIn(range)) }, enabled = value < range.last) {
            Icon(Icons.Outlined.Add, "More")
        }
        Text(suffix)
    }
}
