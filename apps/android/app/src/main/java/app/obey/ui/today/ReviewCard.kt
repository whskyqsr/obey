package app.obey.ui.today

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import app.obey.ui.common.Button
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
import app.obey.ui.common.formatDateTime
import app.obey.ui.common.formatTime
import app.obey.ui.common.local
import app.obey.ui.common.parseInstant
import app.obey.ui.common.moodLabel
import app.obey.ui.proof.ProofPhotos

/**
 * A finished task waiting on the Dominant, written as a sentence from the partner: what they finished and what they
 * sent, the photo and their note, then Approve, Send back and Add a word.
 */
@Composable
fun ReviewCard(o: Occurrence, who: String, busy: Boolean, onApprove: () -> Unit, onSendBack: () -> Unit, onAddWord: () -> Unit, onOpen: () -> Unit, padded: Boolean = true) {
    val c = MaterialTheme.colorScheme
    val sent = listOfNotNull(
        when {
            o.photoCount == 1 -> "a photo"
            o.photoCount > 1 -> "${o.photoCount} photos"
            else -> null
        },
        if (!o.noteMd.isNullOrBlank()) "a note" else null,
    )
    Column(Modifier.fillMaxWidth().padding(vertical = if (padded) 16.dp else 0.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(
            buildAnnotatedString {
                append("$who finished ")
                withStyle(SpanStyle(fontWeight = FontWeight.Medium)) { append(o.title) }
                if (sent.isNotEmpty()) append(" and sent ${sent.joinToString(" and ")}")
                append(".")
                // Only worth saying when it wasn't today; the mockup's card is just the sentence.
                o.completedAt?.takeIf { parseInstant(it).local().toLocalDate() != java.time.LocalDate.now() }?.let { at ->
                    withStyle(SpanStyle(color = c.onSurfaceVariant)) { append("  ${formatDateTime(at)}") }
                }
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

/** When a missed task was due, in words: "at 9:00 PM", "yesterday at 9:00 PM", "Sat 21 Nov at 9:00 PM", or "yesterday". */
private fun missedWhen(o: Occurrence): String {
    val due = parseInstant(o.dueAt).local()
    val today = java.time.LocalDate.now()
    val day = when (due.toLocalDate()) {
        today -> null
        today.minusDays(1) -> "yesterday"
        else -> due.format(java.time.format.DateTimeFormatter.ofPattern("EEE d MMM"))
    }
    val allDay = due.hour == 23 && due.minute == 59
    return when {
        allDay -> day ?: "today"
        day == null -> "at ${formatTime(o.dueAt)}"
        else -> "$day at ${formatTime(o.dueAt)}"
    }
}

/**
 * A Dominant's call on a miss, as a sentence: "Kitten missed Hydration yesterday at 10 PM. That costs no phone at dinner."
 * Keep it missed (the consequence stands), excuse it (no penalty, streak intact), or drop only the consequence.
 */
@Composable
fun MissCard(o: Occurrence, who: String, busy: Boolean, onKeep: () -> Unit, onExcuse: () -> Unit, onDropConsequence: (() -> Unit)?, onOpen: () -> Unit) {
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(
            buildAnnotatedString {
                append("$who missed ")
                withStyle(SpanStyle(fontWeight = FontWeight.Medium)) { append(o.title) }
                append(" ${missedWhen(o)}.")
                o.missConsequence?.let { c ->
                    append(" That costs ")
                    withStyle(SpanStyle(fontStyle = FontStyle.Italic)) { append(c) }
                    append(".")
                }
            },
            style = MaterialTheme.typography.bodyLarge,
            modifier = Modifier.clickable(onClick = onOpen),
        )
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = onKeep, enabled = !busy) { Text("Keep as missed") }
            OutlinedButton(onClick = onExcuse, enabled = !busy) { Text("Excuse") }
        }
        if (onDropConsequence != null) {
            TextButton(onClick = onDropConsequence, enabled = !busy, contentPadding = androidx.compose.foundation.layout.PaddingValues(0.dp)) {
                Text("Drop the consequence only")
            }
        }
    }
}
