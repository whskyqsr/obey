package app.obey.ui.today

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.DirectionsWalk
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.WrongLocation
import androidx.compose.material.icons.outlined.Bedtime
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.EventAvailable
import androidx.compose.material.icons.outlined.EventBusy
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.MoreTime
import androidx.compose.material3.Button
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import app.obey.api.CurfewClash
import app.obey.api.CurfewNight
import app.obey.api.OccurrenceStatus
import app.obey.ui.common.formatTime
import app.obey.ui.common.local
import app.obey.ui.common.parseInstant
import java.time.Duration
import java.time.Instant
import java.time.format.DateTimeFormatter

private enum class Tone { Neutral, Soon, Home, Broken }

@Composable
private fun Strip(tone: Tone, icon: ImageVector, title: String, body: String, actions: @Composable () -> Unit = {}) {
    val c = MaterialTheme.colorScheme
    val (box, onBox) = when (tone) {
        Tone.Soon -> c.tertiaryContainer to c.onTertiaryContainer
        Tone.Broken -> c.errorContainer to c.onErrorContainer
        else -> c.surfaceContainerHigh to c.onSurface
    }
    val badge: Pair<Color, Color>? = when (tone) {
        Tone.Soon -> c.tertiary to c.onTertiary
        Tone.Home -> c.primary to c.onPrimary
        Tone.Broken -> c.error to c.onError
        Tone.Neutral -> null
    }
    Surface(color = box, contentColor = onBox, shape = RoundedCornerShape(24.dp), modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp)) {
        Row(Modifier.padding(start = 16.dp, end = 8.dp, top = 12.dp, bottom = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier.size(48.dp).clip(CircleShape).let { if (badge != null) it.background(badge.first) else it },
                contentAlignment = Alignment.Center,
            ) { Icon(icon, null, tint = badge?.second ?: onBox) }
            Spacer(Modifier.width(16.dp))
            Column(Modifier.weight(1f)) {
                Text(title, style = MaterialTheme.typography.titleMedium)
                Text(body, style = MaterialTheme.typography.bodyMedium, color = onBox.copy(alpha = 0.8f))
            }
            actions()
        }
    }
}

/**
 * Today's curfew strip: coming up, home, or broken. [name] is the sub's name when it isn't the viewer's own curfew;
 * [cost] is what a broken night costs ("−10 pts, Early bedtime"), shown to the Dominant.
 */
@Composable
fun CurfewStrip(
    night: CurfewNight,
    mine: Boolean,
    name: String,
    canDecide: Boolean,
    cost: String?,
    onHome: () -> Unit,
    onExcuse: () -> Unit,
    onConfirm: () -> Unit,
    /** " · asked Sam for 11:00 PM" while an ask is waiting. */
    waiting: String = "",
    /** " · Sam: “Text me when you leave”", a Dominant's note about tonight, for the sub. */
    note: String = "",
    /** Set when the sub may still ask for more time tonight. */
    onMoreTime: (() -> Unit)? = null,
) {
    val due = formatTime(night.dueAt)
    val until = formatTime(night.endsAt)
    val now = Instant.now()
    val started = !parseInstant(night.dueAt).isAfter(now)
    when {
        night.status == OccurrenceStatus.Missed -> Strip(
            Tone.Broken,
            Icons.Filled.WrongLocation,
            if (mine) "You broke curfew" else "$name broke curfew",
            listOfNotNull(night.leftAt?.let { "Left home at ${formatTime(it)}" } ?: "Not home by $due", cost).joinToString(" · ") + note,
        ) {
            if (canDecide && !mine) {
                IconButton(onClick = onExcuse) { Icon(Icons.Outlined.EventAvailable, "Excuse this night") }
                IconButton(onClick = onConfirm) { Icon(Icons.Outlined.Check, "Leave it missed") }
            }
        }
        night.arrivedAt != null -> Strip(
            Tone.Home,
            Icons.Filled.Home,
            if (mine) "Home for curfew" else "$name is home for curfew",
            "Since ${formatTime(night.arrivedAt)} · ${if (mine) "stay" else "in"} until $until$note",
        )
        !mine -> Strip(Tone.Neutral, Icons.Outlined.Bedtime, if (started) "Curfew started at $due" else "Curfew at $due", "$name isn't home yet · in until $until")
        night.canTap && !started -> Strip(Tone.Neutral, Icons.Outlined.Bedtime, "Curfew at $due", "Stay in until $until$waiting$note") {
            onMoreTime?.let { IconButton(onClick = it) { Icon(Icons.Outlined.MoreTime, "More time") } }
            FilledTonalButton(onClick = onHome) {
                Icon(Icons.Outlined.Home, null, Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
                Text("I'm home")
            }
        }
        else -> {
            val mins = Duration.between(now, parseInstant(night.dueAt)).toMinutes().coerceAtLeast(1)
            Strip(
                Tone.Soon,
                Icons.AutoMirrored.Filled.DirectionsWalk,
                if (started) "Curfew started at $due" else "Curfew in $mins min",
                (if (waiting.isNotEmpty()) "Be home by $due$waiting" else "Be home by $due, stay in until $until") + note,
            ) {
                onMoreTime?.let {
                    FilledTonalButton(onClick = it) {
                        Icon(Icons.Outlined.MoreTime, null, Modifier.size(18.dp))
                        Spacer(Modifier.width(8.dp))
                        Text("More time")
                    }
                }
            }
        }
    }
}

private val clashDay = DateTimeFormatter.ofPattern("EEE, MMM d")

/** A plan that runs past curfew, for a Dominant to excuse that night, move the plan's end, or leave it. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun CurfewClashCard(clash: CurfewClash, onExcuse: () -> Unit, onChangeEnd: () -> Unit, onLeave: () -> Unit) {
    Surface(
        color = MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.5f),
        shape = RoundedCornerShape(24.dp),
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
    ) {
        Row(Modifier.padding(16.dp)) {
            Icon(Icons.Outlined.EventBusy, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.width(16.dp))
            Column(Modifier.weight(1f)) {
                Text(clash.eventTitle, style = MaterialTheme.typography.titleMedium)
                Text(
                    "${parseInstant(clash.eventStartsAt).local().format(clashDay)}, ${formatTime(clash.eventStartsAt)} – ${formatTime(clash.eventEndsAt)} · runs past curfew (${formatTime(clash.dueAt)})",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                FlowRow(Modifier.padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(4.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Button(onClick = onExcuse) { Text("Excuse that night") }
                    OutlinedButton(onClick = onChangeEnd) { Text("Change the end") }
                    TextButton(onClick = onLeave) { Text("Leave it") }
                }
            }
        }
    }
}
