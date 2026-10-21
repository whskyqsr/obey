package app.obey.ui.today

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.outlined.Inventory2
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.ExpandLess
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material.icons.outlined.MoreTime
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SwipeToDismissBox
import androidx.compose.material3.SwipeToDismissBoxValue
import androidx.compose.material3.Text
import androidx.compose.material3.rememberSwipeToDismissBoxState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import app.obey.api.Occurrence
import app.obey.api.OccurrenceStatus
import app.obey.ui.common.LocalFeatures
import app.obey.ui.common.parseInstant
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.format.DateTimeFormatter

/**
 * Swipe right to mark done, left for more time. The row springs back; the action runs and Done gets an
 * Undo snackbar. Tapping still works, and TalkBack gets the same two actions.
 */
@Composable
fun SwipeableRow(o: Occurrence, onDone: (() -> Unit)?, onMoreTime: (() -> Unit)?, moreTimeLabel: String = "More time", content: @Composable () -> Unit) {
    if (onDone == null && onMoreTime == null) {
        content()
        return
    }
    val state = rememberSwipeToDismissBoxState(
        confirmValueChange = { value ->
            when (value) {
                SwipeToDismissBoxValue.StartToEnd -> onDone?.invoke()
                SwipeToDismissBoxValue.EndToStart -> onMoreTime?.invoke()
                SwipeToDismissBoxValue.Settled -> Unit
            }
            false
        },
    )
    val colors = MaterialTheme.colorScheme
    SwipeToDismissBox(
        state = state,
        enableDismissFromStartToEnd = onDone != null,
        enableDismissFromEndToStart = onMoreTime != null,
        modifier = Modifier.semantics {
            customActions = listOfNotNull(
                onDone?.let { CustomAccessibilityAction("Mark done") { it(); true } },
                onMoreTime?.let { CustomAccessibilityAction(moreTimeLabel) { it(); true } },
            )
        },
        backgroundContent = {
            val toDone = state.dismissDirection == SwipeToDismissBoxValue.StartToEnd
            Row(
                Modifier
                    .fillMaxSize()
                    .background(if (toDone) colors.primary else colors.tertiaryContainer)
                    .padding(horizontal = 24.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = if (toDone) Arrangement.Start else Arrangement.End,
            ) {
                if (toDone) {
                    Icon(Icons.Outlined.Check, null, tint = colors.onPrimary)
                    Text("  Done", color = colors.onPrimary, style = MaterialTheme.typography.labelLarge)
                } else {
                    Text("$moreTimeLabel  ", color = colors.onTertiaryContainer, style = MaterialTheme.typography.labelLarge)
                    Icon(Icons.Outlined.MoreTime, null, tint = colors.onTertiaryContainer)
                }
            }
        },
    ) {
        Box(Modifier.background(colors.surface)) { content() }
    }
}

/** "1 of 5 done", what's next and the points still on the table today. */
@Composable
fun ProgressCard(today: List<Occurrence>) {
    val done = today.count { it.status == OccurrenceStatus.Completed || it.status == OccurrenceStatus.Submitted }
    val open = today.filter { it.status == OccurrenceStatus.Pending }
    val now = Instant.now()
    val next = open.firstOrNull { !parseInstant(it.dueAt).isBefore(now) }
    val left = open.sumOf { maxOf(0, it.points) }
    val showPoints = LocalFeatures.current.points
    val colors = MaterialTheme.colorScheme
    Row(
        Modifier
            .padding(horizontal = 16.dp, vertical = 8.dp)
            .fillMaxWidth()
            .background(colors.primaryContainer, RoundedCornerShape(24.dp))
            .padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        CircularProgressIndicator(
            progress = { if (today.isEmpty()) 0f else done.toFloat() / today.size },
            modifier = Modifier.size(48.dp),
            strokeWidth = 6.dp,
            trackColor = colors.onPrimaryContainer.copy(alpha = 0.15f),
        )
        Column {
            Text(
                if (done == today.size) "All done for today" else "$done of ${today.size} done",
                style = MaterialTheme.typography.titleLarge,
                color = colors.onPrimaryContainer,
            )
            val parts = listOfNotNull(
                next?.let { "Next: ${it.title} in ${untilText(Duration.between(now, parseInstant(it.dueAt)))}" }
                    ?: if (open.isNotEmpty()) "${open.size} still open" else null,
                if (showPoints && left > 0) "$left pts left today" else null,
            )
            if (parts.isNotEmpty()) Text(parts.joinToString(" · "), style = MaterialTheme.typography.bodyMedium, color = colors.onPrimaryContainer)
        }
    }
}

private fun untilText(d: Duration): String {
    val h = d.toHours()
    val m = d.toMinutes() % 60
    return when {
        h >= 1 && m > 0 -> "${h}h ${m}m"
        h >= 1 -> "${h}h"
        else -> "${maxOf(1, d.toMinutes())}m"
    }
}

/** A later day, collapsed to its task names until opened. */
@Composable
fun LaterDay(day: LocalDate, items: List<Occurrence>, row: @Composable (Occurrence) -> Unit) {
    var open by rememberSaveable(day.toString()) { mutableStateOf(false) }
    val label = if (day == LocalDate.now().plusDays(1)) "Tomorrow" else day.format(DateTimeFormatter.ofPattern("EEEE, MMM d"))
    Column(
        Modifier
            .padding(horizontal = 16.dp, vertical = 4.dp)
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surfaceContainerLow, RoundedCornerShape(16.dp)),
    ) {
        Row(
            Modifier.fillMaxWidth().clickable { open = !open }.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text("$label · ${items.size} ${if (items.size == 1) "task" else "tasks"}", style = MaterialTheme.typography.titleMedium)
                if (!open) {
                    Text(
                        items.joinToString(", ") { it.title },
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                    )
                }
            }
            Icon(if (open) Icons.Outlined.ExpandLess else Icons.Outlined.ExpandMore, if (open) "Collapse" else "Expand")
        }
        AnimatedVisibility(open) {
            Column { items.forEach { row(it) } }
        }
    }
}

/** At the top of Today in a dynamic that has ended: it's an archive now. */
@Composable
fun EndedBanner(onOpen: () -> Unit) {
    androidx.compose.material3.Surface(
        onClick = onOpen,
        color = MaterialTheme.colorScheme.surfaceContainerHigh,
        shape = MaterialTheme.shapes.large,
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
    ) {
        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(androidx.compose.material.icons.Icons.Outlined.Inventory2, null)
            androidx.compose.foundation.layout.Spacer(Modifier.width(12.dp))
            Text("This dynamic has ended. It's kept here read-only.", style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
        }
    }
}

/** No signal: Today is the copy saved at [savedAt], and anything marked done waits on the phone. */
@Composable
fun OfflineBanner(savedAt: java.time.Instant) {
    androidx.compose.material3.Surface(
        color = MaterialTheme.colorScheme.surfaceContainerHigh,
        shape = MaterialTheme.shapes.large,
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
    ) {
        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(androidx.compose.material.icons.Icons.Outlined.CloudOff, null)
            androidx.compose.foundation.layout.Spacer(Modifier.width(12.dp))
            Text(
                "You're offline. This is Today as of ${app.obey.ui.common.formatDateTime(savedAt.toString())}. Tasks you finish sync when you're back.",
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.weight(1f),
            )
        }
    }
}
