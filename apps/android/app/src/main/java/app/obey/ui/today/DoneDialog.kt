package app.obey.ui.today

import androidx.compose.foundation.layout.Column
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
val Occurrence.needsDoneDialog get() = proofRequired || askMood

/**
 * Marks an occurrence done, with an optional note. A task that needs proof asks for a photo or a note, and a
 * check-in asks how they feel first.
 */
@Composable
fun DoneDialog(o: Occurrence, onDismiss: () -> Unit, onDone: (note: String, mood: Int?) -> Unit) {
    var note by remember(o.id) { mutableStateOf("") }
    var mood by remember(o.id) { mutableStateOf<Int?>(null) }
    val photos by proofViewModel(o.id).photos.collectAsStateWithLifecycle()
    val needsProof = o.proofRequired && photos.isEmpty() && note.isBlank()
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (o.askMood) o.title else "Mark done") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                if (o.askMood) {
                    Text("How do you feel?", style = MaterialTheme.typography.titleMedium)
                    MoodPicker(mood, { mood = it }, Modifier.padding(top = 8.dp))
                } else {
                    Text("${o.title} · ${formatDue(o.dueAt)}", style = MaterialTheme.typography.bodyMedium)
                }
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
        },
        confirmButton = {
            Button(onClick = { onDone(note, mood) }, enabled = !needsProof && (!o.askMood || mood != null)) { Text(if (o.askMood) "Check in" else "Done") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}
