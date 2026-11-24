package app.obey.ui.tasks

import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import app.obey.ui.common.LettersChip
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Remove
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
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

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun RecurrencePicker(
    draft: RecurrenceDraft,
    start: LocalDate,
    onChange: (RecurrenceDraft) -> Unit,
    modifier: Modifier = Modifier,
    weekStart: java.time.DayOfWeek = java.time.DayOfWeek.SUNDAY,
) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(12.dp)) {
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            RepeatKind.entries.forEach { kind ->
                LettersChip(kind.label, draft.kind == kind && draft.passthrough == null, { onChange(draft.copy(kind = kind, passthrough = null)) })
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
                WeekdayToggles(weekStart, selected = selected, onToggle = { d ->
                    val next = if (d in selected) selected - d else selected + d
                    if (next.isNotEmpty()) onChange(draft.copy(weekdays = next))
                })
            }
            RepeatKind.Monthly -> {
                Stepper("Every", draft.interval, if (draft.interval == 1) "month" else "months", 1..120) {
                    onChange(draft.copy(interval = it))
                }
                // Shortcuts, so a yearly task is one tap rather than eleven.
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf(3 to "Quarterly", 6 to "Twice a year", 12 to "Yearly").forEach { (n, label) ->
                        LettersChip(label, draft.interval == n, { onChange(draft.copy(interval = n)) })
                    }
                }
                Text("Monthly on", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    MonthlyMode.entries.forEach { mode ->
                        LettersChip(mode.label, draft.monthlyMode == mode, { onChange(draft.copy(monthlyMode = mode)) })
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
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            listOf(1 to "First", 2 to "Second", 3 to "Third", 4 to "Fourth", 5 to "Fifth", -1 to "Last").forEach { (n, label) ->
                                LettersChip(label, draft.nth == n, { onChange(draft.copy(nth = n)) })
                            }
                        }
                        WeekdayToggles(weekStart, selected = setOf(draft.nthWeekday), onToggle = { onChange(draft.copy(nthWeekday = it)) })
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
                        "The next one is due after finishing",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Switch(checked = draft.afterCompletion, onCheckedChange = { onChange(draft.copy(afterCompletion = it)) })
            }
        }

        Text(
            describe(draft.toSchedule(start)) + if (draft.kind == RepeatKind.Once && draft.passthrough == null) " on ${app.obey.ui.common.formatDate(start)}" else ", starting ${app.obey.ui.common.formatDate(start)}",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun WeekdayToggles(weekStart: java.time.DayOfWeek, selected: Set<Weekday>, onToggle: (Weekday) -> Unit) {
    // In the order the person's calendar uses: Sunday first unless they chose Monday.
    val first = weekStart.value - 1
    val days = Weekday.entries.drop(first) + Weekday.entries.take(first)
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        days.forEach { d ->
            val on = d in selected
            Surface(
                shape = CircleShape,
                color = if (on) MaterialTheme.colorScheme.onSurface else androidx.compose.ui.graphics.Color.Transparent,
                contentColor = if (on) MaterialTheme.colorScheme.surface else MaterialTheme.colorScheme.onSurfaceVariant,
                border = if (on) null else androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
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
