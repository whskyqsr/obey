package app.obey.ui.location

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.outlined.LocationOn
import androidx.compose.material.icons.outlined.WrongLocation
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import app.obey.api.Occurrence
import app.obey.api.OccurrenceStatus
import app.obey.api.Place
import app.obey.ui.common.formatTime
import app.obey.ui.common.parseInstant
import java.time.Instant
import kotlinx.coroutines.delay

/** The selected dynamic's places by id, for showing a task's place by name. */
val LocalPlaces = staticCompositionLocalOf<Map<String, Place>> { emptyMap() }

private fun minutesBetween(from: String, to: Instant) = ((to.toEpochMilli() - parseInstant(from).toEpochMilli()) / 60_000).coerceAtLeast(0).toInt()

/** "30 min", "1 hr", "90 min". */
fun stayLabel(m: Int) = if (m >= 60 && m % 60 == 0) "${m / 60} hr" else "$m min"

/** "Be at Gym", "At Gym · 20 of 60 min", "Left Gym early · 35 of 60 min", "Got to Gym 5:42 PM". */
fun placeLine(o: Occurrence, place: Place?, now: Instant = Instant.now()): String? {
    val name = place?.name ?: "the place"
    val arrived = o.arrivedAt
    return when {
        o.leftAt != null && arrived != null -> "Left $name early · ${minutesBetween(arrived, parseInstant(o.leftAt))} of ${o.stayMinutes} min"
        o.isStaying && arrived != null -> "At $name · ${minOf(o.stayMinutes!!, minutesBetween(arrived, now))} of ${o.stayMinutes} min"
        arrived != null && (o.status == OccurrenceStatus.Completed || o.status == OccurrenceStatus.Submitted) -> "Got to $name ${formatTime(arrived)}"
        o.status == OccurrenceStatus.Pending -> if (o.stayMinutes != null) "Be at $name for ${stayLabel(o.stayMinutes)}" else "Be at $name"
        else -> null
    }
}

/** Whether "I'm here" can work now: their own, still to do, open, not there yet and not past due. */
fun Occurrence.canCheckIn(mine: Boolean) =
    mine && isPlaced && status == OccurrenceStatus.Pending && arrivedAt == null && isOpen() && parseInstant(dueAt).isAfter(Instant.now())

/** A pin in a ring that fills as a stay runs. Tapping it checks in, when [onTap] is set. */
@Composable
fun PlaceRing(o: Occurrence, onTap: (() -> Unit)?, modifier: Modifier = Modifier) {
    val colors = MaterialTheme.colorScheme
    val staying = o.isStaying
    val left = o.leftAt != null
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    if (staying) LaunchedEffect(o.id) {
        while (true) {
            delay(30_000)
            now = System.currentTimeMillis()
        }
    }
    val fraction = if (staying) (minutesBetween(o.arrivedAt!!, Instant.ofEpochMilli(now)).toFloat() / o.stayMinutes!!).coerceIn(0f, 1f) else 0f
    val place = LocalPlaces.current[o.placeId]
    val label = if (onTap != null) "I'm at ${place?.name ?: "the place"} for ${o.title}" else placeLine(o, place) ?: o.title
    Box(
        modifier
            .size(48.dp)
            .clip(CircleShape)
            .then(if (onTap != null) Modifier.clickable(role = Role.Button, onClickLabel = "I'm here", onClick = onTap) else Modifier)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        Box(Modifier.size(40.dp).clip(CircleShape).background(if (left) colors.errorContainer else Color.Transparent))
        Canvas(Modifier.size(40.dp)) {
            val r = 17.dp.toPx()
            when {
                staying -> {
                    val stroke = 3.dp.toPx()
                    drawCircle(colors.surfaceContainerHighest, radius = r, style = Stroke(stroke))
                    if (fraction > 0f) drawArc(colors.primary, -90f, 360f * fraction, false, Offset(center.x - r, center.y - r), Size(r * 2, r * 2), style = Stroke(stroke, cap = StrokeCap.Round))
                }
                !left -> drawCircle(if (onTap != null) colors.primary else colors.outline, radius = r, style = Stroke(2.dp.toPx()))
            }
        }
        Icon(
            when {
                left -> Icons.Outlined.WrongLocation
                staying -> Icons.Filled.LocationOn
                else -> Icons.Outlined.LocationOn
            },
            null,
            Modifier.size(20.dp),
            tint = when {
                left -> colors.onErrorContainer
                staying || onTap != null -> colors.primary
                else -> colors.onSurfaceVariant
            },
        )
    }
}
