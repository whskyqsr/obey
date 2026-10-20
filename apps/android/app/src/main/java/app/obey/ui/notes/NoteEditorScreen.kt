package app.obey.ui.notes

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.EditNote
import androidx.compose.material.icons.outlined.MoreVert
import androidx.compose.material.icons.outlined.PushPin
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material.icons.filled.PushPin
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.obey.api.NoteKind
import app.obey.api.NoteVisibility
import app.obey.markdown.MarkdownEdits
import app.obey.ui.common.ErrorBox
import app.obey.ui.common.Load
import app.obey.ui.common.LoadingBox
import app.obey.ui.common.MessageEffect

internal val moods = listOf(1 to "Low", 2 to "Meh", 3 to "OK", 4 to "Good", 5 to "Great")

/**
 * The notes editor: a real formatting toolbar over Markdown source, list/checklist continuation on Enter,
 * and a rendered preview where checklist items can be ticked.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NoteEditorScreen(onDone: () -> Unit, vm: NoteEditorViewModel = hiltViewModel()) {
    val load by vm.load.collectAsStateWithLifecycle()
    val draft by vm.draft.collectAsStateWithLifecycle()
    val busy by vm.busy.collectAsStateWithLifecycle()
    val message by vm.message.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    MessageEffect(message, snackbar, vm::messageShown)
    LaunchedEffect(Unit) { vm.closed.collect { onDone() } }

    var body by remember { mutableStateOf(TextFieldValue("")) }
    var title by remember { mutableStateOf(TextFieldValue("")) }
    // Seed the text fields from the ViewModel once the note has loaded (and after recreation).
    LaunchedEffect(load) {
        if (load is Load.Ready) {
            val d = vm.draft.value
            body = TextFieldValue(d.body, TextRange(d.body.length))
            title = TextFieldValue(d.title, TextRange(d.title.length))
        }
    }
    val canEdit = vm.canEdit
    // Existing notes open for reading; Edit switches to the editor.
    var preview by rememberSaveable { mutableStateOf(vm.opensForReading) }
    var menu by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }
    val showPreview = preview || !canEdit

    fun close() {
        if (canEdit && vm.dirty) vm.save(close = true) else onDone()
    }
    BackHandler(onBack = ::close)

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (draft.kind == NoteKind.Journal) "Journal entry" else "Note") },
                navigationIcon = { IconButton(onClick = ::close) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Save and close") } },
                actions = {
                    if (canEdit) {
                        if (draft.kind == NoteKind.Note) {
                            IconButton(onClick = { vm.update { it.copy(pinned = !it.pinned) } }) {
                                if (draft.pinned) Icon(Icons.Filled.PushPin, "Unpin") else Icon(Icons.Outlined.PushPin, "Pin")
                            }
                        }
                        if (preview) {
                            TextButton(onClick = { preview = false }) {
                                Icon(Icons.Outlined.EditNote, null)
                                Text(" Edit")
                            }
                        } else {
                            IconButton(onClick = { preview = true }) { Icon(Icons.Outlined.Visibility, "Preview") }
                            TextButton(
                                onClick = { vm.save(close = false); if (draft.title.isNotBlank() || draft.body.isNotBlank()) preview = true },
                                enabled = !busy && vm.dirty,
                            ) { Text("Save") }
                        }
                        Box {
                            IconButton(onClick = { menu = true }) { Icon(Icons.Outlined.MoreVert, "More") }
                            DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                                DropdownMenuItem(
                                    text = { Text("Delete") },
                                    leadingIcon = { Icon(Icons.Outlined.Delete, null) },
                                    onClick = { menu = false; confirmDelete = true },
                                )
                            }
                        }
                    }
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        when (val l = load) {
            Load.Loading -> LoadingBox(Modifier.padding(padding))
            is Load.Failed -> ErrorBox(l.message, vm::load, Modifier.padding(padding))
            is Load.Ready -> Column(Modifier.padding(padding).fillMaxSize().imePadding()) {
                Column(
                    Modifier
                        .weight(1f)
                        .fillMaxWidth()
                        .verticalScroll(rememberScrollState())
                        .padding(horizontal = 20.dp, vertical = 8.dp)
                        .widthIn(max = 720.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    val titleStyle = MaterialTheme.typography.headlineSmall.copy(color = MaterialTheme.colorScheme.onSurface)
                    if (showPreview) {
                        Text(draft.title.ifBlank { "Untitled" }, style = titleStyle)
                    } else {
                        BasicTextField(
                            value = title,
                            onValueChange = { v ->
                                title = v.copy(text = v.text.replace("\n", "").take(200))
                                vm.update { it.copy(title = title.text) }
                            },
                            textStyle = titleStyle,
                            singleLine = true,
                            cursorBrush = SolidColor(MaterialTheme.colorScheme.primary),
                            modifier = Modifier.fillMaxWidth(),
                            decorationBox = { inner ->
                                Box {
                                    if (title.text.isEmpty()) Text("Title", style = titleStyle, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    inner()
                                }
                            },
                        )
                    }

                    if (canEdit && !showPreview) {
                        Row(
                            Modifier.horizontalScroll(rememberScrollState()),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            FilterChip(
                                selected = draft.visibility == NoteVisibility.Private,
                                onClick = {
                                    vm.update {
                                        it.copy(visibility = if (it.visibility == NoteVisibility.Private) NoteVisibility.Shared else NoteVisibility.Private)
                                    }
                                },
                                label = { Text(if (draft.visibility == NoteVisibility.Private) "Private" else "Shared with partner") },
                            )
                        }
                        if (draft.kind == NoteKind.Journal) {
                            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                moods.forEach { (n, label) ->
                                    FilterChip(
                                        selected = draft.mood == n,
                                        onClick = { vm.update { it.copy(mood = if (it.mood == n) null else n) } },
                                        label = { Text(label) },
                                    )
                                }
                            }
                        }
                        BasicTextField(
                            value = draft.tags,
                            onValueChange = { v -> vm.update { it.copy(tags = v) } },
                            textStyle = MaterialTheme.typography.bodyMedium.copy(color = MaterialTheme.colorScheme.primary),
                            singleLine = true,
                            cursorBrush = SolidColor(MaterialTheme.colorScheme.primary),
                            modifier = Modifier.fillMaxWidth(),
                            decorationBox = { inner ->
                                Box {
                                    if (draft.tags.isEmpty()) {
                                        Text("Tags, comma separated", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    }
                                    inner()
                                }
                            },
                        )
                    }
                    HorizontalDivider()

                    if (showPreview) {
                        MarkdownPreview(
                            markdown = body.text,
                            onToggleCheck = if (canEdit) {
                                { line: Int ->
                                    val next = MarkdownEdits.toggleCheckbox(body.text, line)
                                    body = TextFieldValue(next, TextRange(next.length))
                                    vm.update { it.copy(body = next) }
                                }
                            } else null,
                            modifier = Modifier.fillMaxWidth(),
                        )
                    } else {
                        MarkdownField(
                            value = body,
                            onChange = { v ->
                                body = v
                                vm.update { it.copy(body = v.text) }
                            },
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                }
                if (canEdit && !showPreview) {
                    MarkdownToolbar(
                        value = body,
                        onChange = { v ->
                            body = v
                            vm.update { it.copy(body = v.text) }
                        },
                        modifier = Modifier.fillMaxWidth().navigationBarsPadding(),
                    )
                }
            }
        }
    }

    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            title = { Text("Delete this note?") },
            text = { Text("This can't be undone.") },
            confirmButton = { Button(onClick = { confirmDelete = false; vm.delete() }) { Text("Delete") } },
            dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text("Cancel") } },
        )
    }
}
