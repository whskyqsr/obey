package app.obey.ui.upcoming

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.obey.ui.common.Diamond
import app.obey.ui.common.DiamondState
import app.obey.ui.today.diamondState
import app.obey.api.Occurrence
import app.obey.api.Relationship
import app.obey.api.OccurrenceStatus
import app.obey.ui.common.formatDate
import java.time.Instant
import java.time.LocalDate
import java.time.format.TextStyle
import java.util.Locale

/**
 * A month as in mockup 13: serif dates, one diamond for the day's tasks and an accent bar when it has plans. The chosen
 * day is filled in ink; days outside the month are left blank. Tapping a day lists it below.
 */
@Composable
fun MonthGrid(data: CalendarData, selected: LocalDate, today: LocalDate, @Suppress("UNUSED_PARAMETER") rel: Relationship?, onSelect: (LocalDate) -> Unit, modifier: Modifier = Modifier) {
    val colors = MaterialTheme.colorScheme
    val month = data.anchor.month
    val now = Instant.now()
    Column(modifier) {
        Row(Modifier.fillMaxWidth()) {
            data.days.take(7).forEach { (d, _) ->
                Text(
                    d.dayOfWeek.getDisplayName(TextStyle.NARROW, Locale.getDefault()),
                    style = MaterialTheme.typography.labelMedium,
                    color = colors.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.weight(1f).padding(vertical = 8.dp),
                )
            }
        }
        data.days.chunked(7).forEach { week ->
            Row(Modifier.fillMaxWidth().padding(vertical = 2.dp)) {
                week.forEach { (d, all) ->
                    if (d.month != month) Spacer(Modifier.weight(1f)) else {
                    val items = all.filter { it.status != OccurrenceStatus.Cancelled }
                    val plans = data.eventsOn(d)
                    val on = d == selected
                    val label = buildString {
                        append(formatDate(d))
                        if (items.isEmpty() && plans.isEmpty()) append(", nothing scheduled")
                        if (plans.isNotEmpty()) append(", ${plans.size} plan${if (plans.size == 1) "" else "s"}")
                        if (items.isNotEmpty()) append(", ${items.size} task${if (items.size == 1) "" else "s"}")
                    }
                    Box(Modifier.weight(1f), contentAlignment = Alignment.Center) {
                        Column(
                            Modifier
                                .size(48.dp, 52.dp)
                                .clip(RoundedCornerShape(8.dp))
                                .background(if (on) colors.onSurface else Color.Transparent)
                                .clickable { onSelect(d) }
                                .semantics(mergeDescendants = true) {
                                    contentDescription = label
                                    this.selected = on
                                }
                                .padding(top = 4.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                        ) {
                            Text(
                                "${d.dayOfMonth}",
                                style = MaterialTheme.typography.headlineMedium.copy(fontSize = 22.sp, lineHeight = 28.sp),
                                color = when {
                                    on -> colors.surface
                                    d == today -> colors.primary
                                    else -> colors.onSurface
                                },
                            )
                            Row(Modifier.height(8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                                monthState(items, now)?.let { st ->
                                    if (on) Box(Modifier.size(5.dp).rotate(45f).background(colors.surface)) else Diamond(st, size = 6.dp)
                                }
                                if (plans.isNotEmpty()) Box(Modifier.width(12.dp).height(3.dp).clip(RoundedCornerShape(2.dp)).background(if (on) colors.surface else colors.primary))
                            }
                        }
                    }
                    }
                }
            }
        }
    }
}

/** One diamond for a day: owed if anything was missed, filled once all is done, open while some are to do. */
private fun monthState(items: List<Occurrence>, now: Instant): DiamondState? {
    if (items.isEmpty()) return null
    val states = items.map { it.diamondState(now) }
    return when {
        DiamondState.Owed in states -> DiamondState.Owed
        states.all { it == DiamondState.Done || it == DiamondState.Off } -> DiamondState.Done
        DiamondState.Waiting in states -> DiamondState.Waiting
        else -> DiamondState.Open
    }
}
