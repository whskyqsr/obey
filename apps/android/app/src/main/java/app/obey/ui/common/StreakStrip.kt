package app.obey.ui.common

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.unit.dp
import app.obey.api.TaskStreak

private const val SLOTS = 7

/** The last few results as dots (done filled, excused hollow, missed red) and the current streak. Draws nothing without history. */
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
        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            repeat(SLOTS - streak.recent.size.coerceAtMost(SLOTS)) {
                Box(Modifier.size(8.dp).background(colors.outlineVariant.copy(alpha = 0.5f), CircleShape))
            }
            streak.recent.takeLast(SLOTS).forEach { r ->
                val dot = Modifier.size(8.dp)
                Box(
                    when (r) {
                        "completed" -> dot.background(colors.primary, CircleShape)
                        "missed" -> dot.background(colors.error, CircleShape)
                        else -> dot.border(1.5.dp, colors.outline, CircleShape)
                    },
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
