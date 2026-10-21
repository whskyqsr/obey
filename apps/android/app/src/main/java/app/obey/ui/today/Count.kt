package app.obey.ui.today

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Remove
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.obey.api.CountState
import app.obey.api.Occurrence
import app.obey.api.OccurrenceStatus
import app.obey.ui.common.formatDue

/**
 * A count task's count in a ring that fills toward the target. A tap adds one; a long press opens the dialog to fix
 * the count. Done shows as a solid circle with the number; over the limit, the ring goes red.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun CountRing(o: Occurrence, onTap: (() -> Unit)?, onHold: (() -> Unit)?, modifier: Modifier = Modifier) {
    val colors = MaterialTheme.colorScheme
    val state = o.countState()
    val done = o.status == OccurrenceStatus.Completed && state == CountState.Ok
    val target = o.countMin ?: o.countMax ?: 1
    val track = colors.surfaceContainerHighest
    val arc = if (state == CountState.Over) colors.error else colors.primary
    val solid = colors.primary
    Box(
        modifier
            .size(48.dp)
            .clip(CircleShape)
            .combinedClickable(
                enabled = onTap != null || onHold != null,
                onClickLabel = if (onTap != null) "Add one" else "Change the count",
                onLongClickLabel = if (onHold != null) "Change the count" else null,
                onClick = { (onTap ?: onHold)?.invoke() },
                onLongClick = onHold,
            )
            .semantics { contentDescription = "${o.title}: ${o.countLine}" },
        contentAlignment = Alignment.Center,
    ) {
        Canvas(Modifier.size(40.dp)) {
            if (done) {
                drawCircle(solid, radius = 14.dp.toPx())
            } else {
                val stroke = 3.dp.toPx()
                val r = 17.dp.toPx()
                val topLeft = Offset(center.x - r, center.y - r)
                drawCircle(track, radius = r, style = Stroke(stroke))
                val sweep = 360f * (o.count.toFloat() / target).coerceIn(0f, 1f)
                if (sweep > 0f) drawArc(arc, -90f, sweep, false, topLeft, Size(r * 2, r * 2), style = Stroke(stroke, cap = StrokeCap.Round))
            }
        }
        Text(
            if (done) "${o.count}" else "${o.count}/$target",
            fontSize = 11.sp,
            fontWeight = FontWeight.SemiBold,
            color = when {
                done -> colors.onPrimary
                state == CountState.Over -> colors.error
                else -> colors.onSurface
            },
        )
    }
}

/** Sets the count outright, for a mis-tap or one marked late. */
@Composable
fun CountDialog(o: Occurrence, onDismiss: () -> Unit, onSave: (Int) -> Unit) {
    var n by rememberSaveable(o.id) { mutableIntStateOf(o.count) }
    val state = o.countState(n)
    val left = (o.countMin ?: 0) - n
    val colors = MaterialTheme.colorScheme
    val hint = when {
        state == CountState.Over -> "Over by ${n - o.countMax!!}; it counts as failed"
        left > 0 -> "$left more to go"
        o.countMin == null -> "Done at the deadline if it stays here"
        else -> "Done"
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(o.title) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Text(
                    "${o.countBounds.replaceFirstChar { it.uppercase() }}, by ${formatDue(o.dueAt)}. Logged ${o.count} so far.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = colors.onSurfaceVariant,
                )
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
                    FilledTonalIconButton(onClick = { n -= 1 }, enabled = n > 0, modifier = Modifier.size(56.dp)) { Icon(Icons.Outlined.Remove, "One fewer") }
                    Text(
                        "$n",
                        style = MaterialTheme.typography.displayLarge,
                        color = if (state == CountState.Over) colors.error else colors.onSurface,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.widthIn(min = 112.dp),
                    )
                    FilledTonalIconButton(onClick = { n += 1 }, modifier = Modifier.size(56.dp)) { Icon(Icons.Outlined.Add, "One more") }
                }
                Text(
                    hint,
                    style = MaterialTheme.typography.bodyMedium,
                    color = if (state == CountState.Over) colors.error else colors.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        },
        confirmButton = { TextButton(onClick = { onSave(n) }, enabled = n != o.count) { Text("Save") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}
