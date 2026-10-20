package app.obey.ui.upcoming

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import app.obey.api.Occurrence
import app.obey.api.OccurrenceStatus
import app.obey.ui.common.formatDate
import app.obey.ui.common.parseInstant
import java.time.Instant
import java.time.LocalDate
import java.time.format.TextStyle
import java.util.Locale

/** A month as a grid of whole weeks, with a dot per task. Tapping a day shows its tasks below, as on the web. */
@Composable
fun MonthGrid(data: CalendarData, selected: LocalDate, today: LocalDate, onSelect: (LocalDate) -> Unit, modifier: Modifier = Modifier) {
    val colors = MaterialTheme.colorScheme
    val month = data.anchor.month
    val now = Instant.now()
    Column(modifier) {
        Row(Modifier.fillMaxWidth()) {
            data.days.take(7).forEach { (d, _) ->
                Text(
                    d.dayOfWeek.getDisplayName(TextStyle.SHORT, Locale.getDefault()),
                    style = MaterialTheme.typography.labelMedium,
                    color = colors.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.weight(1f).padding(vertical = 8.dp),
                )
            }
        }
        Column(
            Modifier.clip(RoundedCornerShape(12.dp)).background(colors.outlineVariant),
            verticalArrangement = Arrangement.spacedBy(1.dp),
        ) {
            data.days.chunked(7).forEach { week ->
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(1.dp)) {
                    week.forEach { (d, items) ->
                        val inMonth = d.month == month
                        val label = buildString {
                            append(formatDate(d))
                            append(if (items.isEmpty()) ", nothing scheduled" else ", ${items.size} task${if (items.size == 1) "" else "s"}")
                        }
                        Column(
                            Modifier
                                .weight(1f)
                                .heightIn(min = 64.dp)
                                .background(if (d == selected) colors.secondaryContainer else if (inMonth) colors.surfaceContainerLow else colors.surface)
                                .clickable { onSelect(d) }
                                .semantics(mergeDescendants = true) {
                                    contentDescription = label
                                    this.selected = d == selected
                                }
                                .padding(4.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                        ) {
                            Box(
                                Modifier.size(28.dp).clip(CircleShape).background(if (d == today) colors.primary else Color.Transparent),
                                contentAlignment = Alignment.Center,
                            ) {
                                Text(
                                    "${d.dayOfMonth}",
                                    style = MaterialTheme.typography.labelLarge,
                                    color = when {
                                        d == today -> colors.onPrimary
                                        inMonth -> colors.onSurface
                                        else -> colors.onSurfaceVariant.copy(alpha = 0.6f)
                                    },
                                )
                            }
                            Row(
                                Modifier.padding(top = 4.dp),
                                horizontalArrangement = Arrangement.spacedBy(2.dp),
                            ) {
                                items.take(4).forEach { StatusDot(it, now) }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun StatusDot(o: Occurrence, now: Instant) {
    val c = MaterialTheme.colorScheme
    val overdue = o.status == OccurrenceStatus.Pending && parseInstant(o.dueAt).isBefore(now)
    val base = Modifier.size(6.dp).clip(CircleShape)
    val m = when {
        o.status == OccurrenceStatus.Completed -> base.background(c.primary)
        o.status == OccurrenceStatus.Missed || overdue -> base.background(c.error)
        o.status == OccurrenceStatus.Submitted -> base.background(c.tertiary)
        o.status == OccurrenceStatus.Excused || o.status == OccurrenceStatus.Cancelled -> base.background(c.outline)
        // Still to do: an open ring, so it reads differently from done at dot size.
        else -> base.border(1.5.dp, c.onSurfaceVariant, CircleShape)
    }
    Box(m)
}
