package app.obey.ui.common

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.unit.dp
import app.obey.api.TaskStreak

private const val SLOTS = 7

/** The last few results as small diamonds (done filled, excused muted, missed in the accent) and the current streak. Draws nothing without history. */
@Composable
fun StreakStrip(streak: TaskStreak?, modifier: Modifier = Modifier) {
    if (streak == null || streak.recent.isEmpty()) return
    val words = streak.recent.map { if (it == "completed") "done" else it }
    val colors = MaterialTheme.colorScheme
    Row(
        modifier.clearAndSetSemantics { contentDescription = "Streak ${streak.streak}. Last ${words.size}: ${words.joinToString()}" },
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
            repeat(SLOTS - streak.recent.size.coerceAtMost(SLOTS)) {
                Diamond(DiamondState.Off, Modifier.alpha(0.5f), size = 7.dp)
            }
            streak.recent.takeLast(SLOTS).forEach { r ->
                Diamond(
                    when (r) {
                        "completed" -> DiamondState.Done
                        "missed" -> DiamondState.Owed
                        else -> DiamondState.Off
                    },
                    size = 7.dp,
                )
            }
        }
        Text(
            "${streak.streak} in a row",
            style = MaterialTheme.typography.labelMedium,
            color = if (streak.streak > 0) colors.primary else colors.onSurfaceVariant,
        )
    }
}
