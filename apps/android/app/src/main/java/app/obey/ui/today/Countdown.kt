package app.obey.ui.today

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Timer
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.MoreTime
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
) {
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) {
        while (true) {
            delay(1000 - System.currentTimeMillis() % 1000)
            now = System.currentTimeMillis()
        }
    }
    val o = nextDeadline(list, me, isDom, now) ?: return
    val left = parseInstant(o.dueAt).toEpochMilli() - now
    val urgent = left <= URGENT
    val mine = o.assigneeId == me
    val c = MaterialTheme.colorScheme
    val (bg, fg, accent) = if (urgent) Triple(c.errorContainer, c.onErrorContainer, c.error) else Triple(c.tertiaryContainer, c.onTertiaryContainer, c.tertiary)
    Surface(color = bg, contentColor = fg, shape = RoundedCornerShape(24.dp), modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Icon(Icons.Filled.Timer, null, Modifier.padding(top = 2.dp))
                Column(Modifier.weight(1f).clickable { onOpen(o) }) {
                    Text(o.title, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(listOfNotNull(who(o), "due ${formatTime(o.dueAt)}").joinToString(" · "), style = MaterialTheme.typography.bodyMedium)
                }
                Text(mmss(left), style = MaterialTheme.typography.displaySmall, modifier = Modifier.semantics { contentDescription = "${(left + 59_999) / 60_000} minutes left" })
            }
            LinearProgressIndicator(
                progress = { (left.toFloat() / HOUR).coerceIn(0f, 1f) },
                modifier = Modifier.fillMaxWidth().height(6.dp),
                color = accent,
                trackColor = fg.copy(alpha = 0.15f),
                strokeCap = StrokeCap.Round,
                drawStopIndicator = {},
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                if (mine && o.isOpen()) {
                    Button(onClick = { onDone(o) }, colors = if (urgent) ButtonDefaults.buttonColors(containerColor = c.error, contentColor = c.onError) else ButtonDefaults.buttonColors()) {
                        Icon(if (o.isRitual) Icons.Outlined.PlayArrow else Icons.Outlined.Check, null, Modifier.size(18.dp))
                        Text(if (o.isRitual) "  Start" else "  Done")
                    }
                }
                if (mine || isDom) {
                    TextButton(onClick = { onMoreTime(o) }, colors = ButtonDefaults.textButtonColors(contentColor = fg)) {
                        Icon(Icons.Outlined.MoreTime, null, Modifier.size(18.dp))
                        Text(if (mine) "  More time" else "  Reschedule")
                    }
                }
            }
        }
    }
}
