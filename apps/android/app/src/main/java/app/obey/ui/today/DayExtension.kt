package app.obey.ui.today

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.EditCalendar
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.obey.api.Occurrence
import app.obey.api.RescheduleRequest
import app.obey.api.RescheduleScope
import app.obey.ui.common.formatDateTime
import app.obey.ui.common.formatTime
import app.obey.ui.common.parseInstant
import java.time.Duration

private val DELAYS = listOf(2, 12, 24, 48)

/**
 * "More time for today": delay several of today's tasks together. Under the `request` policy this
 * becomes one request the Dom approves or declines as a whole.
 */
@OptIn(ExperimentalMaterial3Api::class, androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
fun DayRescheduleSheet(
    tasks: List<Occurrence>,
    onDismiss: () -> Unit,
    onSubmit: (ids: List<String>, delayHours: Int, reason: String?) -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var hours by rememberSaveable { mutableStateOf(24) }
    var reason by rememberSaveable { mutableStateOf("") }
    var selected by remember { mutableStateOf(tasks.map { it.id }.toSet()) }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(
            Modifier.fillMaxWidth().padding(horizontal = 24.dp).padding(bottom = 24.dp).navigationBarsPadding(),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text("More time for today", style = MaterialTheme.typography.titleLarge)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                DELAYS.forEach { h ->
                    FilterChip(selected = hours == h, onClick = { hours = h }, label = { Text("+$h hours") })
                }
            }
            tasks.forEach { t ->
                val on = t.id in selected
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(checked = on, onCheckedChange = { selected = if (it) selected + t.id else selected - t.id })
                    Column {
                        Text(t.title, style = MaterialTheme.typography.bodyLarge)
                        val moved = parseInstant(t.dueAt).plus(Duration.ofHours(hours.toLong())).toString()
                        Text(
                            "${formatTime(t.dueAt)} → ${if (on) formatDateTime(moved) else "unchanged"}",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
            OutlinedTextField(
                value = reason,
                onValueChange = { reason = it.take(1000) },
                label = { Text("Reason (optional)") },
                modifier = Modifier.fillMaxWidth(),
            )
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                TextButton(onClick = onDismiss) { Text("Cancel") }
                Button(
                    enabled = selected.isNotEmpty(),
                    onClick = {
                        onSubmit(tasks.map { it.id }.filter { it in selected }, hours, reason)
                        onDismiss()
                    },
                ) { Text("Ask for ${selected.size}") }
            }
        }
    }
}

/** One pending extension request. A whole-day request lists every task it covers. */
@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
fun ExtensionRequestCard(
    rows: List<RescheduleRequest>,
    /** Null when the request is the viewer's own. */
    requester: String?,
    canDecide: Boolean,
    onDecide: (approve: Boolean) -> Unit,
    /** "Reschedule instead": the Dominant picks a new deadline for one task. */
    onInstead: (RescheduleRequest) -> Unit = {},
) {
    fun change(x: RescheduleRequest) = if (x.kind == "cancel") "Call off" else "${formatDateTime(x.fromDueAt)} → ${formatDateTime(x.toDueAt)}"
    val r = rows.first()
    val who = requester?.let { "$it asks" } ?: "You asked"
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.tertiaryContainer,
            contentColor = MaterialTheme.colorScheme.onTertiaryContainer,
        ),
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            if (rows.size == 1 && r.kind == "cancel") {
                Text("$who to call off “${r.title}”", style = MaterialTheme.typography.titleMedium)
                Text("Due ${formatDateTime(r.fromDueAt)}", style = MaterialTheme.typography.bodyMedium)
            } else if (rows.size == 1) {
                val following = if (r.scope == RescheduleScope.Following) " (this and following)" else ""
                Text("$who for more time on “${r.title}”$following", style = MaterialTheme.typography.titleMedium)
                Text(change(r), style = MaterialTheme.typography.bodyMedium)
            } else {
                val title = if (rows.any { it.kind == "cancel" }) "$who about ${rows.size} tasks" else "$who for more time on ${rows.size} tasks today"
                Text(title, style = MaterialTheme.typography.titleMedium)
                rows.forEach { x ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(x.title, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
                            Text(change(x), style = MaterialTheme.typography.bodySmall)
                        }
                        if (canDecide) IconButton(onClick = { onInstead(x) }) { Icon(Icons.Outlined.EditCalendar, "Pick a time for ${x.title}") }
                    }
                }
            }
            r.reason?.let { Text("“$it”", style = MaterialTheme.typography.bodyMedium) }
            if (canDecide) {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = { onDecide(true) }) { Text(if (rows.size == 1) "Approve" else "Approve all") }
                    if (rows.size == 1) FilledTonalButton(onClick = { onInstead(r) }) { Text(if (r.kind == "cancel") "Reschedule instead" else "Other time") }
                    TextButton(onClick = { onDecide(false) }) { Text("Decline") }
                }
            }
        }
    }
}
