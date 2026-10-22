package app.obey.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.obey.ui.common.LocalFeatures

private data class NotifyType(val key: String, val label: String, val help: String, val needsPoints: Boolean = false)

private val TYPES = listOf(
    NotifyType("reminders", "Reminders", "Before a task is due"),
    NotifyType("completions", "Done and reviewed", "When a task is completed, sent for review, approved or sent back"),
    NotifyType("missed", "Missed tasks", "When a deadline passes"),
    NotifyType("requests", "More time", "Requests for more time, the answers, and moved deadlines"),
    NotifyType("comments", "Comments", "On a task or journal entry"),
    NotifyType("assigned", "New tasks and consequences", "Tasks given to you, history corrections, logged broken rules, and changes to rules and protocols"),
    NotifyType("plans", "Plans", "When a partner adds or changes a calendar plan"),
    NotifyType("rewards", "Rewards", "When a reward is redeemed", needsPoints = true),
)

/** Which kinds of notification this account gets, on every device; the dynamic's own news always comes through. */
@Composable
fun NotificationTypes(
    muted: List<String>,
    enabled: Boolean,
    onChange: (key: String, on: Boolean) -> Unit,
    details: Boolean = false,
    onDetails: (Boolean) -> Unit = {},
) {
    val colors = MaterialTheme.colorScheme
    val points = LocalFeatures.current.points
    Surface(color = colors.surfaceContainerLow, shape = MaterialTheme.shapes.large, modifier = Modifier.padding(horizontal = 16.dp).padding(top = 8.dp).fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            TYPES.filter { !it.needsPoints || points }.forEach { t ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(t.label, style = MaterialTheme.typography.bodyLarge)
                        Text(t.help, style = MaterialTheme.typography.bodyMedium, color = colors.onSurfaceVariant)
                    }
                    Switch(checked = t.key !in muted, enabled = enabled, onCheckedChange = { onChange(t.key, it) })
                }
            }
            HorizontalDivider(Modifier.padding(vertical = 8.dp), color = colors.outlineVariant)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("Show your partner's words", style = MaterialTheme.typography.bodyLarge)
                    Text(
                        "A reminder written for you, or the line sent with \"I'm home\", shows in the notification. Off, notifications only say who did what, so nothing personal is on your lock screen.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = colors.onSurfaceVariant,
                    )
                }
                Switch(checked = details, enabled = enabled, onCheckedChange = onDetails)
            }
            Text("Someone joining or leaving your dynamic always comes through.", style = MaterialTheme.typography.bodySmall, color = colors.onSurfaceVariant)
        }
    }
}
