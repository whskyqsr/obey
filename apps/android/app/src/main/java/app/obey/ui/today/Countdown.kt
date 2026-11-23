package app.obey.ui.today

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Timer
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.MoreTime
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.obey.api.Occurrence
import app.obey.api.OccurrenceStatus
import app.obey.ui.common.formatTime
import app.obey.ui.common.parseInstant
import kotlinx.coroutines.delay

private const val HOUR = 60 * 60_000L
private const val URGENT = 15 * 60_000L

/** The soonest open deadline in the next hour that this person does or hands out; counted and location tasks have their own rings. */
fun nextDeadline(list: List<Occurrence>, me: String?, isDom: Boolean, now: Long): Occurrence? =
    list.asSequence()
        .filter { it.status == OccurrenceStatus.Pending && !it.curfew && !it.isCounted && !it.isPlaced && !isAllDayDue(it.dueAt) }
        .filter { it.assigneeId == me || isDom }
        .filter { (parseInstant(it.dueAt).toEpochMilli() - now) in 1..HOUR }
        .minByOrNull { it.dueAt }

/** All-day tasks are due at 23:59:59 local time. */
private fun isAllDayDue(iso: String) = parseInstant(iso).atZone(java.time.ZoneId.systemDefault()).let { it.hour == 23 && it.minute == 59 && it.second == 59 }

fun mmss(ms: Long): String {
    val s = ((ms + 999) / 1000).coerceAtLeast(0)
    return "${s / 60}:${(s % 60).toString().padStart(2, '0')}"
}

/** A live countdown on Today for anything due within the hour. It turns red in the last 15 minutes. */
@Composable
fun CountdownCard(
    list: List<Occurrence>,
    me: String?,
    isDom: Boolean,
    who: (Occurrence) -> String?,
    onDone: (Occurrence) -> Unit,
    onMoreTime: (Occurrence) -> Unit,
    onOpen: (Occurrence) -> Unit,
    /** The task the Next block already counts down. */
    skip: String? = null,
) {
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) {
        while (true) {
            delay(1000 - System.currentTimeMillis() % 1000)
            now = System.currentTimeMillis()
        }
    }
    val o = nextDeadline(list, me, isDom, now)?.takeIf { it.id != skip } ?: return
    val left = parseInstant(o.dueAt).toEpochMilli() - now
    val urgent = left <= URGENT
    val mine = o.assigneeId == me
    val c = MaterialTheme.colorScheme
    val (bg, fg, accent) = if (urgent) Triple(c.errorContainer, c.onErrorContainer, c.error) else Triple(c.tertiaryContainer, c.onTertiaryContainer, c.tertiary)
    Surface(color = bg, contentColor = fg, shape = RoundedCornerShape(24.dp), modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp)) {
        Box {
            Row(
                Modifier.padding(start = 16.dp, end = 8.dp, top = 10.dp, bottom = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Icon(Icons.Filled.Timer, null)
                Column(Modifier.weight(1f).padding(start = 4.dp).clickable { onOpen(o) }) {
                    Text(o.title, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(listOfNotNull(who(o), "due ${formatTime(o.dueAt)}").joinToString(" · "), style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                Text(mmss(left), style = MaterialTheme.typography.titleLarge, modifier = Modifier.semantics { contentDescription = "${(left + 59_999) / 60_000} minutes left" })
                if (mine || isDom) {
                    IconButton(onClick = { onMoreTime(o) }) {
                        Icon(Icons.Outlined.MoreTime, if (mine) "More time" else "Reschedule")
                    }
                }
                if (mine && o.isOpen()) {
                    FilledIconButton(
                        onClick = { onDone(o) },
                        colors = if (urgent) IconButtonDefaults.filledIconButtonColors(containerColor = c.error, contentColor = c.onError) else IconButtonDefaults.filledIconButtonColors(),
                    ) {
                        Icon(if (o.isRitual) Icons.Outlined.PlayArrow else Icons.Outlined.Check, if (o.isRitual) "Start" else "Done")
                    }
                }
            }
            // Time left, as a thin bar along the bottom edge.
            LinearProgressIndicator(
                progress = { (left.toFloat() / HOUR).coerceIn(0f, 1f) },
                modifier = Modifier.fillMaxWidth().height(4.dp).align(Alignment.BottomCenter),
                color = accent,
                trackColor = fg.copy(alpha = 0.15f),
                strokeCap = StrokeCap.Butt,
                gapSize = 0.dp,
                drawStopIndicator = {},
            )
        }
    }
}


/** The one thing to do next: today's soonest open task of this person's own. Counted, location and curfew tasks keep their rings in the list. */
fun pickNext(today: List<Occurrence>, me: String?): Occurrence? {
    val now = java.time.Instant.now()
    return today.asSequence()
        .filter { it.assigneeId == me && it.status == OccurrenceStatus.Pending && it.isOpen() && !it.isCounted && !it.isPlaced && !it.curfew }
        .filter { !parseInstant(it.dueAt).isBefore(now) }
        .minByOrNull { it.dueAt }
}

/**
 * Today leads with this for whoever has tasks: what's next, when, and Done or More time. Inside the last hour the
 * "when" becomes a live countdown, red in the last 15 minutes.
 */
@Composable
fun NextUp(o: Occurrence, by: String?, onDone: () -> Unit, onMoreTime: () -> Unit, onOpen: () -> Unit) {
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) {
        while (true) {
            delay(1000 - System.currentTimeMillis() % 1000)
            now = System.currentTimeMillis()
        }
    }
    val c = MaterialTheme.colorScheme
    val left = parseInstant(o.dueAt).toEpochMilli() - now
    val allDay = isAllDayDue(o.dueAt)
    val soon = !allDay && left in 1..HOUR
    val urgent = soon && left <= URGENT
    val minutes = left / 60_000
    val whenText = when {
        soon -> "${mmss(left)} left"
        allDay -> "today"
        minutes >= 60 -> "in ${minutes / 60}h"
        else -> "in ${minutes.coerceAtLeast(1)} min"
    }
    val meta = listOfNotNull(
        if (allDay) "Any time today" else formatTime(o.dueAt),
        if (o.isRitual && o.stepsDone.isNotEmpty()) o.stepProgress else null,
        if (o.proofRequired) (by?.let { "$it wants a photo" } ?: "Photo") else null,
        if (o.approvalRequired && !o.proofRequired) (by?.let { "$it approves it" } ?: "Needs approval") else null,
    ).joinToString(" · ")
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp).padding(top = 8.dp, bottom = 16.dp)) {
        Text(
            "NEXT · ${whenText.uppercase()}",
            style = MaterialTheme.typography.labelMedium.copy(letterSpacing = 1.2.sp),
            color = if (urgent) c.error else c.onSurfaceVariant,
        )
        Text(
            o.title,
            style = MaterialTheme.typography.headlineMedium,
            color = c.onSurface,
            modifier = Modifier.padding(top = 4.dp).clickable(onClick = onOpen),
        )
        Text(meta, style = MaterialTheme.typography.bodyMedium, color = c.onSurfaceVariant, modifier = Modifier.padding(top = 2.dp))
        Row(Modifier.fillMaxWidth().padding(top = 16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            androidx.compose.material3.Button(onClick = onDone, modifier = Modifier.weight(1f).height(48.dp)) {
                Text(if (o.isRitual) (if (o.stepsDone.isNotEmpty()) "Carry on" else "Start") else "Done")
            }
            androidx.compose.material3.OutlinedButton(onClick = onMoreTime, modifier = Modifier.weight(1f).height(48.dp)) {
                Text("More time")
            }
        }
    }
}
