package app.obey.ui.today

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Chat
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.MoreTime
import androidx.compose.material.icons.outlined.Redeem
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.unit.dp
import app.obey.api.DelayUsed
import app.obey.api.LedgerEntry
import app.obey.api.Occurrence
import app.obey.ui.common.ago
import app.obey.ui.common.formatDateTime
import app.obey.ui.common.formatTime
import app.obey.ui.common.local
import app.obey.ui.common.moodIcon
import app.obey.ui.common.moodLabel
import app.obey.ui.common.parseInstant
import java.time.LocalDate

/** A low check-in in a Dominant's Needs you: what they said, a reply in its comments, or just "seen". */
@Composable
fun MoodRow(o: Occurrence, name: String, onSeen: () -> Unit, onReply: () -> Unit) {
    val mood = o.mood ?: return
    ListItem(
        colors = ListItemDefaults.colors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
        leadingContent = { Icon(moodIcon(mood, filled = true), null, tint = MaterialTheme.colorScheme.tertiary) },
        headlineContent = { Text("$name checked in feeling ${moodLabel(mood).lowercase()}") },
        supportingContent = {
            Text(
                (o.noteMd?.let { "“$it”" } ?: o.title) + (o.completedAt?.let { " · ${ago(it)}" } ?: ""),
                fontStyle = if (o.noteMd != null) FontStyle.Italic else null,
            )
        },
        trailingContent = {
            Row {
                IconButton(onClick = onSeen) { Icon(Icons.Outlined.Check, "Seen") }
                FilledTonalIconButton(onClick = onReply) { Icon(Icons.AutoMirrored.Outlined.Chat, "Reply") }
            }
        },
    )
}

/** A next-day scene check-in that asks for this person: how they feel, what they still need, and Seen or Reply. */
@Composable
fun SceneCheckRow(scene: app.obey.api.Scene, c: app.obey.api.SceneCheck, name: String, onSeen: () -> Unit, onReply: () -> Unit) {
    ListItem(
        colors = ListItemDefaults.colors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
        leadingContent = { Icon(moodIcon(c.mood, filled = true), null, tint = MaterialTheme.colorScheme.tertiary) },
        headlineContent = { Text("$name feels ${moodLabel(c.mood).lowercase()} after ${scene.title.ifBlank { null }?.let { "“$it”" } ?: "the scene"}") },
        supportingContent = {
            Text(
                (if (c.note.isNotBlank()) "Still needs: “${c.note}”" else "Checked in") + " · ${ago(c.at)}",
                fontStyle = if (c.note.isNotBlank()) FontStyle.Italic else null,
            )
        },
        trailingContent = {
            Row {
                IconButton(onClick = onSeen) { Icon(Icons.Outlined.Check, "Seen") }
                FilledTonalIconButton(onClick = onReply) { Icon(Icons.AutoMirrored.Outlined.Chat, "Reply") }
            }
        },
    )
}

/** A reward the sub spent points on, waiting for a Dominant to give it and mark it redeemed. */
@Composable
fun RedemptionRow(e: LedgerEntry, name: String, onRedeemed: () -> Unit) {
    ListItem(
        colors = ListItemDefaults.colors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
        leadingContent = { Icon(Icons.Outlined.Redeem, null, tint = MaterialTheme.colorScheme.primary) },
        headlineContent = { Text(e.note) },
        supportingContent = { Text("$name spent ${-e.delta} pts${e.consequenceTitle?.let { " to get out of $it" } ?: ""} · ${ago(e.createdAt)}") },
        trailingContent = { FilledTonalButton(onClick = onRedeemed) { Text("Redeemed") } },
    )
}

/** Marking a reward given, with an optional note to the sub; a "lets off" reward's consequence is excused then. */
@Composable
fun RedeemedDialog(e: LedgerEntry, name: String, busy: Boolean, onDismiss: () -> Unit, onConfirm: (String?) -> Unit) {
    var note by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        icon = { Icon(Icons.Outlined.Redeem, null) },
        title = { Text("Redeem “${e.note}”") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Text(
                    "$name spent ${-e.delta} points on this. Mark it once you've given it, and $name is told." +
                        (e.consequenceTitle?.let { " $it is excused then, with no penalty." } ?: ""),
                    style = MaterialTheme.typography.bodyMedium,
                )
                OutlinedTextField(note, { note = it.take(500) }, label = { Text("Note to $name (optional)") }, modifier = Modifier.fillMaxWidth())
            }
        },
        confirmButton = { Button(onClick = { onConfirm(note.trim().ifEmpty { null }) }, enabled = !busy) { Text("Redeemed") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

/** "6:00 PM" today, "Thu 22 Oct, 6:00 PM" another day. */
internal fun dayAndTime(iso: String) =
    if (parseInstant(iso).local().toLocalDate() == LocalDate.now()) formatTime(iso) else formatDateTime(iso)

/** A delay the sub took from their weekly allowance: no decision needed, but the Dominant hears about it. */
@Composable
fun DelayCard(d: DelayUsed, name: String, onSeen: () -> Unit) {
    val c = MaterialTheme.colorScheme
    val one = d.items.singleOrNull()
    Surface(color = c.surfaceContainerHigh, shape = RoundedCornerShape(24.dp), modifier = Modifier.fillMaxWidth()) {
        Row(Modifier.padding(start = 16.dp, top = 12.dp, bottom = 12.dp, end = 4.dp)) {
            Icon(Icons.Outlined.MoreTime, null, tint = c.primary, modifier = Modifier.padding(top = 2.dp))
            Spacer(Modifier.width(16.dp))
            Column(Modifier.weight(1f)) {
                Text("$name used a delay", style = MaterialTheme.typography.titleMedium)
                val left = "${d.left} of ${d.allowance} left this week"
                Text(
                    (if (one != null) "${one.title} · ${dayAndTime(one.fromDueAt)} → ${formatTime(one.toDueAt)}" else "${d.items.size} tasks moved") + " · $left",
                    style = MaterialTheme.typography.bodyMedium,
                    color = c.onSurfaceVariant,
                )
                d.reason?.let { Text("“$it”", style = MaterialTheme.typography.bodyMedium, fontStyle = FontStyle.Italic, color = c.onSurfaceVariant, modifier = Modifier.padding(top = 2.dp)) }
            }
            IconButton(onClick = onSeen) { Icon(Icons.Outlined.Close, "Got it") }
        }
    }
}

/** A sub telling the Dominant they're home, with an optional line that starts tonight's comments. */
@Composable
fun TellHomeDialog(who: String, busy: Boolean, onDismiss: () -> Unit, onSend: (String?) -> Unit) {
    var note by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        icon = { Icon(Icons.Outlined.Home, null) },
        title = { Text("Tell $who you're home") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                OutlinedTextField(note, { note = it.take(280) }, label = { Text("Add a line (optional)") }, modifier = Modifier.fillMaxWidth())
                Text(
                    "$who gets a notification that you're home. Your line goes with it when $who has details turned on, and it starts tonight's comments.",
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        },
        confirmButton = { Button(onClick = { onSend(note.trim().ifEmpty { null }) }, enabled = !busy) { Text("Tell $who") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}
