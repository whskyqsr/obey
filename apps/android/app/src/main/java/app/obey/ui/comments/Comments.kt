package app.obey.ui.comments

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Send
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.obey.api.CommentInput
import app.obey.api.ObeyApi
import app.obey.api.Occurrence
import app.obey.api.OccurrenceComment
import app.obey.data.SessionRepository
import app.obey.ui.common.BaseViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.Duration
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** The conversation on one due date ("why was this late"), so it stays with the task instead of another app. */
@HiltViewModel
class CommentsViewModel @Inject constructor(private val api: ObeyApi, private val sessions: SessionRepository) : BaseViewModel() {
    private val _comments = MutableStateFlow<List<OccurrenceComment>?>(null)
    val comments: StateFlow<List<OccurrenceComment>?> = _comments.asStateFlow()
    val session get() = sessions.session
    private var occurrenceId: String? = null

    fun load(id: String) {
        if (occurrenceId == id && _comments.value != null) return
        occurrenceId = id
        _comments.value = null
        action { _comments.value = api.comments(id) }
    }

    fun add(body: String, done: () -> Unit) = action {
        val id = occurrenceId ?: return@action
        val c = api.addComment(id, CommentInput(body.trim()))
        _comments.value = _comments.value.orEmpty() + c
        done()
    }

    fun delete(c: OccurrenceComment, done: () -> Unit) = action {
        api.deleteComment(c.id)
        _comments.value = _comments.value.orEmpty().filter { it.id != c.id }
        done()
    }
}

private fun parse(iso: String): Instant? = runCatching { Instant.parse(iso) }.getOrNull() ?: runCatching { OffsetDateTime.parse(iso).toInstant() }.getOrNull()

private fun whenLabel(iso: String): String {
    val at = parse(iso) ?: return ""
    val d = Duration.between(at, Instant.now())
    return when {
        d.toMinutes() < 1 -> "just now"
        d.toHours() < 1 -> "${d.toMinutes()} min ago"
        d.toHours() < 24 -> "${d.toHours()} h ago"
        else -> DateTimeFormatter.ofPattern("MMM d, h:mm a").format(at.atZone(ZoneId.systemDefault()))
    }
}

/** Comments on [occurrence] in a sheet; [onChanged] runs after one is added or deleted so lists can refresh their counts. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CommentsSheet(occurrence: Occurrence, onDismiss: () -> Unit, onChanged: () -> Unit, vm: CommentsViewModel = hiltViewModel()) {
    LaunchedEffect(occurrence.id) { vm.load(occurrence.id) }
    val comments by vm.comments.collectAsStateWithLifecycle()
    val busy by vm.busy.collectAsStateWithLifecycle()
    val message by vm.message.collectAsStateWithLifecycle()
    val session = vm.session
    val me = session?.userId
    val readOnly = session?.readOnly == true
    var text by rememberSaveable(occurrence.id) { mutableStateOf("") }
    val colors = MaterialTheme.colorScheme

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(Modifier.navigationBarsPadding().imePadding().padding(horizontal = 16.dp).padding(bottom = 16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("Comments", style = MaterialTheme.typography.titleLarge)
            Text(occurrence.title, style = MaterialTheme.typography.bodyMedium, color = colors.onSurfaceVariant)
            val list = comments
            when {
                list == null -> Text("Loading…", color = colors.onSurfaceVariant)
                list.isEmpty() -> Text("No comments yet. Ask a question or say why it was late.", color = colors.onSurfaceVariant)
                else -> LazyColumn(Modifier.heightIn(max = 420.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(list, key = { it.id }) { c ->
                        val mine = c.authorId == me
                        Row(verticalAlignment = Alignment.Top) {
                            Column(Modifier.weight(1f).background(colors.surfaceContainer, MaterialTheme.shapes.medium).padding(horizontal = 12.dp, vertical = 8.dp)) {
                                Text(
                                    "${if (mine) "You" else session?.nameOf(c.authorId) ?: "Someone"} · ${whenLabel(c.createdAt)}",
                                    style = MaterialTheme.typography.labelMedium,
                                    color = colors.onSurfaceVariant,
                                )
                                Text(c.body, style = MaterialTheme.typography.bodyMedium)
                            }
                            if (mine && !readOnly) {
                                IconButton(onClick = { vm.delete(c, onChanged) }, enabled = !busy) { Icon(Icons.Outlined.DeleteOutline, "Delete comment") }
                            }
                        }
                    }
                }
            }
            message?.let { Text(it, color = colors.error, style = MaterialTheme.typography.bodyMedium) }
            if (!readOnly) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = text,
                        onValueChange = { if (it.length <= 2000) text = it },
                        label = { Text("Add a comment") },
                        modifier = Modifier.weight(1f),
                        maxLines = 5,
                    )
                    FilledIconButton(onClick = { vm.add(text) { text = ""; onChanged() } }, enabled = text.isNotBlank() && !busy) {
                        Icon(Icons.AutoMirrored.Outlined.Send, "Send comment")
                    }
                }
            }
        }
    }
}

/** Sending a task back to be redone, with an optional note on what to fix that's posted as a comment. */
@Composable
fun SendBackDialog(occurrence: Occurrence, onDismiss: () -> Unit, onConfirm: (comment: String?) -> Unit) {
    var text by remember(occurrence.id) { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Send back?") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("\"${occurrence.title}\" goes back to the to-do list to be done again.")
                OutlinedTextField(
                    value = text,
                    onValueChange = { if (it.length <= 2000) text = it },
                    label = { Text("What needs fixing? (optional)") },
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 2,
                    maxLines = 5,
                )
            }
        },
        confirmButton = { TextButton(onClick = { onConfirm(text.trim().ifEmpty { null }) }) { Text("Send back") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}
