package app.obey.ui.today

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import app.obey.api.Occurrence
import app.obey.ui.common.formatTime
import app.obey.ui.common.moodLabel
import app.obey.ui.proof.ProofPhotos

/**
 * A finished task waiting on the Dominant, written as a sentence from the partner: what they finished and what they
 * sent, the photo and their note, then Approve, Send back and Add a word.
 */
@Composable
fun ReviewCard(o: Occurrence, who: String, busy: Boolean, onApprove: () -> Unit, onSendBack: () -> Unit, onAddWord: () -> Unit, onOpen: () -> Unit) {
    val c = MaterialTheme.colorScheme
    val sent = listOfNotNull(
        when {
            o.photoCount == 1 -> "a photo"
            o.photoCount > 1 -> "${o.photoCount} photos"
            else -> null
        },
        if (!o.noteMd.isNullOrBlank()) "a note" else null,
    )
    Column(Modifier.fillMaxWidth().padding(vertical = 16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(
            buildAnnotatedString {
                append("$who finished ")
                withStyle(SpanStyle(fontWeight = FontWeight.Medium)) { append(o.title) }
                if (sent.isNotEmpty()) append(" and sent ${sent.joinToString(" and ")}")
                append(".")
                o.completedAt?.let { at -> withStyle(SpanStyle(color = c.onSurfaceVariant)) { append("  ${formatTime(at)}") } }
            },
            style = MaterialTheme.typography.bodyLarge,
            modifier = Modifier.clickable(onClick = onOpen),
        )
        if (o.photoCount > 0) ProofPhotos(o.id, canAdd = false)
        o.noteMd?.takeIf { it.isNotBlank() }?.let { note ->
            Text("“${note.trim()}”", style = MaterialTheme.typography.titleLarge.copy(fontStyle = FontStyle.Italic), color = c.onSurfaceVariant)
        }
        o.mood?.let { m -> Text("Felt ${moodLabel(m).lowercase()}", style = MaterialTheme.typography.bodyMedium, color = c.onSurfaceVariant) }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = onApprove, enabled = !busy) { Text("Approve") }
            OutlinedButton(onClick = onSendBack, enabled = !busy) { Text("Send back") }
            Spacer(Modifier.weight(1f))
            TextButton(onClick = onAddWord) { Text("Add a word") }
        }
    }
}
