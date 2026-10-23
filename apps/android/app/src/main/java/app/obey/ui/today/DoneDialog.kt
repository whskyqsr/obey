package app.obey.ui.today

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.obey.api.Occurrence
import app.obey.ui.common.MoodPicker
import app.obey.ui.common.formatDue
import app.obey.ui.proof.ProofPhotos
import app.obey.ui.proof.proofViewModel

/** True when marking it done needs the Done dialog rather than one tap: it needs proof, or it's a check-in. */
val Occurrence.needsDoneDialog get() = proofRequired || askMood || asksJournal

/**
 * Marks an occurrence done, with an optional note. A task that needs proof asks for a photo or a note, and a
 * check-in asks how they feel first.
 */
@Composable
fun DoneDialog(o: Occurrence, onDismiss: () -> Unit, sendTo: String? = null, onDone: (note: String, mood: Int?, entry: String?) -> Unit) {
    var note by remember(o.id) { mutableStateOf("") }
    var mood by remember(o.id) { mutableStateOf<Int?>(null) }
    var entry by remember(o.id) { mutableStateOf("") }
    val photos by proofViewModel(o.id).photos.collectAsStateWithLifecycle()
    // A journal task is done by writing the entry, which also counts as proof.
    val needsProof = o.proofRequired && photos.isEmpty() && note.isBlank() && !(o.asksJournal && entry.isNotBlank())
    // A count task met its count and is sent once, with what it asks for.
    val sending = o.isCounted
    val sendTitle = (if (o.countMax != null && o.countMax == o.countMin) "${o.count} of ${o.countMax}" else "${o.count} done") +
        ", send it" + (if (o.approvalRequired && sendTo != null) " to $sendTo" else "") + "?"
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (sending) sendTitle else if (o.askMood || o.asksJournal) o.title else "Mark done") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                if (sending) {
                    Text(
                        if (o.approvalRequired) "${sendTo?.replaceFirstChar { it.uppercase() } ?: "Your Dominant"} approves it. Your count is locked until then." else "It's done once you send it.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(bottom = 12.dp),
                    )
                }
                if (o.askMood) {
                    Text("How do you feel?", style = MaterialTheme.typography.titleMedium)
                    MoodPicker(mood, { mood = it }, Modifier.padding(top = 8.dp))
                } else if (!o.asksJournal && !sending) {
                    Text("${o.title} · ${formatDue(o.dueAt)}", style = MaterialTheme.typography.bodyMedium)
                }
                if (o.asksJournal) {
                    o.journalPrompt?.takeIf { it.isNotBlank() }?.let { prompt ->
                        Row(Modifier.padding(top = 12.dp).height(IntrinsicSize.Min)) {
                            Box(Modifier.width(4.dp).fillMaxHeight().background(MaterialTheme.colorScheme.primary))
                            Text(prompt.trim(), style = MaterialTheme.typography.bodyLarge, modifier = Modifier.padding(start = 12.dp))
                        }
                    }
                    OutlinedTextField(
                        value = entry,
                        onValueChange = { entry = it.take(100_000) },
                        label = { Text("Your entry") },
                        minLines = 5,
                        modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
                    )
                    Text(
                        "Saved to your journal and shared with your partner.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 4.dp),
                    )
                } else {
                    if (o.proofRequired) {
                        Text("This one needs proof: add a photo, a note, or both.", style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 8.dp))
                    }
                    ProofPhotos(o.id, canAdd = true, modifier = Modifier.padding(top = 12.dp))
                    OutlinedTextField(
                        value = note,
                        onValueChange = { note = it.take(5000) },
                        label = { Text(if (o.proofRequired) "Note" else if (o.askMood) "Anything to add? (optional)" else "Note for your partner") },
                        minLines = 3,
                        modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
                    )
                }
            }
        },
        confirmButton = {
            Button(
                onClick = { onDone(note, mood, entry.takeIf { o.asksJournal }) },
                enabled = !needsProof && (!o.askMood || mood != null) && (!o.asksJournal || entry.isNotBlank()),
            ) { Text(if (sending) "Send" else if (o.asksJournal) "Save entry" else if (o.askMood) "Check in" else "Done") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(if (sending) "Not yet" else "Cancel") } },
    )
}
