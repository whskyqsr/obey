package app.obey.ui.notes

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowLeft
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.EditOff
import androidx.compose.material.icons.outlined.Group
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.MoreHoriz
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Surface
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.sp
import app.obey.ui.common.dayWord
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
import app.obey.ui.common.formatDateTime
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.EditNote
import androidx.compose.material.icons.outlined.PushPin
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material.icons.filled.PushPin
import androidx.compose.material3.AlertDialog
import app.obey.ui.common.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import app.obey.ui.common.ChoiceChip
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
import app.obey.ui.comments.NoteCommentsSection
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
    if (draft.kind == NoteKind.Note) {
        NotePage(vm, snackbar)
        return
    }

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
    var history by remember { mutableStateOf(false) }
    val revisionCount by vm.revisionCount.collectAsStateWithLifecycle()
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
                        if (vm.isAuthor && draft.kind == NoteKind.Note) {
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
                        if (vm.isAuthor) Box {
                            IconButton(onClick = { menu = true }) { Icon(Icons.Outlined.MoreHoriz, "More") }
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
                        if (revisionCount > 0) {
                            TextButton(onClick = { vm.loadRevisions(); history = true }, contentPadding = PaddingValues(horizontal = 0.dp)) {
                                Icon(Icons.Outlined.History, null, Modifier.size(18.dp))
                                Text(" Edited · see earlier versions")
                            }
                        }
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
                        if (vm.isAuthor) Row(
                            Modifier.horizontalScroll(rememberScrollState()),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            ChoiceChip(
                                selected = draft.visibility == NoteVisibility.Private,
                                onClick = {
                                    vm.update {
                                        it.copy(visibility = if (it.visibility == NoteVisibility.Private) NoteVisibility.Shared else NoteVisibility.Private)
                                    }
                                },
                                label = { Text(if (draft.visibility == NoteVisibility.Private) "Private" else "Shared with partner") },
                            )
                            val sub = vm.subName
                            if (sub != null && draft.kind == NoteKind.Note && draft.visibility == NoteVisibility.Shared) {
                                ChoiceChip(
                                    selected = draft.subCanEdit,
                                    onClick = { vm.update { it.copy(subCanEdit = !it.subCanEdit) } },
                                    label = { Text("$sub can edit") },
                                )
                            }
                        }
                        if (draft.kind == NoteKind.Journal) {
                            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                moods.forEach { (n, label) ->
                                    ChoiceChip(
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
                        vm.commentsNoteId?.let { id ->
                            HorizontalDivider(Modifier.padding(top = 8.dp))
                            NoteCommentsSection(id, Modifier.fillMaxWidth().padding(bottom = 16.dp))
                        }
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

    if (history) NoteHistoryDialog(vm) { history = false }

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

/**
 * A note, as in the mockup: a page you write on. Tags, the title in the serif and its small print, then the text,
 * saved as you go. The text shows formatted; tapping it opens the Markdown underneath, with a short toolbar above the
 * keyboard.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun NotePage(vm: NoteEditorViewModel, snackbar: SnackbarHostState) {
    val load by vm.load.collectAsStateWithLifecycle()
    val draft by vm.draft.collectAsStateWithLifecycle()
    val saveState by vm.saveState.collectAsStateWithLifecycle()
    val revisionCount by vm.revisionCount.collectAsStateWithLifecycle()
    var body by remember { mutableStateOf(TextFieldValue("")) }
    var title by remember { mutableStateOf(TextFieldValue("")) }
    LaunchedEffect(load) {
        if (load is Load.Ready) {
            val d = vm.draft.value
            body = TextFieldValue(d.body, TextRange(d.body.length))
            title = TextFieldValue(d.title, TextRange(d.title.length))
        }
    }
    val canEdit = vm.canEdit
    // New notes start in the text; saved ones open formatted until tapped.
    var writing by rememberSaveable { mutableStateOf(!vm.opensForReading) }
    var tagging by remember { mutableStateOf(false) }
    var tagDraft by remember { mutableStateOf("") }
    var menu by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }
    var history by remember { mutableStateOf(false) }
    val bodyFocus = remember { FocusRequester() }
    BackHandler(onBack = vm::leave)

    val tags = draft.tags.split(',').map { it.trim() }.filter { it.isNotEmpty() }
    fun setTags(list: List<String>) = vm.update { it.copy(tags = list.joinToString(", ")) }
    fun addTag() {
        val t = tagDraft.trim().removePrefix("#").take(40)
        if (t.isNotEmpty() && t !in tags && tags.size < 20) setTags(tags + t)
        tagDraft = ""
    }
    fun setBody(v: TextFieldValue) {
        body = v
        vm.update { it.copy(body = v.text) }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {},
                navigationIcon = {
                    TextButton(onClick = vm::leave, colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.onSurfaceVariant)) {
                        Icon(Icons.AutoMirrored.Outlined.KeyboardArrowLeft, null)
                        Text("Notes", style = MaterialTheme.typography.bodyLarge)
                    }
                },
                actions = {
                    if (revisionCount > 0) IconButton(onClick = { vm.loadRevisions(); history = true }) { Icon(Icons.Outlined.History, "Edit history") }
                    if (vm.isAuthor) Box {
                        IconButton(onClick = { menu = true }) { Icon(Icons.Outlined.MoreHoriz, "More") }
                        DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                            if (!vm.isNew) DropdownMenuItem(
                                text = { Text(if (draft.pinned) "Unpin" else "Pin to the top") },
                                leadingIcon = { Icon(Icons.Outlined.PushPin, null) },
                                onClick = { menu = false; vm.update { it.copy(pinned = !it.pinned) } },
                            )
                            val private = draft.visibility == NoteVisibility.Private
                            DropdownMenuItem(
                                text = { Text(if (private) "Share" else "Make private") },
                                leadingIcon = { Icon(if (private) Icons.Outlined.Group else Icons.Outlined.Lock, null) },
                                onClick = {
                                    menu = false
                                    vm.update { it.copy(visibility = if (private) NoteVisibility.Shared else NoteVisibility.Private, subCanEdit = if (private) it.subCanEdit else false) }
                                },
                            )
                            val sub = vm.subName
                            if (sub != null && !private) DropdownMenuItem(
                                text = { Text(if (draft.subCanEdit) "Stop $sub editing" else "Let $sub edit") },
                                leadingIcon = { Icon(if (draft.subCanEdit) Icons.Outlined.EditOff else Icons.Outlined.Edit, null) },
                                onClick = { menu = false; vm.update { it.copy(subCanEdit = !it.subCanEdit) } },
                            )
                            if (!vm.isNew) DropdownMenuItem(
                                text = { Text("Delete", color = MaterialTheme.colorScheme.error) },
                                leadingIcon = { Icon(Icons.Outlined.Delete, null, tint = MaterialTheme.colorScheme.error) },
                                onClick = { menu = false; confirmDelete = true },
                            )
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
                        .padding(horizontal = 20.dp)
                        .padding(top = 4.dp, bottom = 24.dp)
                        .widthIn(max = 720.dp),
                ) {
                    // Tags as pills, and a + pill to add one. While adding, tapping a pill takes it off.
                    Row(
                        Modifier.horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        tags.forEach { t ->
                            Surface(
                                shape = CircleShape,
                                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                                color = Color.Transparent,
                                onClick = { if (tagging) setTags(tags - t) },
                                enabled = tagging,
                            ) {
                                Row(Modifier.padding(horizontal = 14.dp, vertical = 9.dp), verticalAlignment = Alignment.CenterVertically) {
                                    if (tagging) Icon(Icons.Outlined.Close, "Remove", Modifier.size(16.dp).padding(end = 2.dp))
                                    Text(t, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                            }
                        }
                        if (canEdit) {
                            if (tagging) {
                                val tagFocus = remember { FocusRequester() }
                                LaunchedEffect(Unit) { tagFocus.requestFocus() }
                                BasicTextField(
                                    value = tagDraft,
                                    onValueChange = { v -> if (v.endsWith(",")) { tagDraft = v.dropLast(1); addTag() } else tagDraft = v },
                                    singleLine = true,
                                    textStyle = MaterialTheme.typography.labelLarge.copy(color = MaterialTheme.colorScheme.onSurface),
                                    cursorBrush = SolidColor(MaterialTheme.colorScheme.primary),
                                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                                    keyboardActions = KeyboardActions(onDone = { addTag(); tagging = false }),
                                    modifier = Modifier
                                        .width(120.dp)
                                        .focusRequester(tagFocus)
                                        .onFocusChanged { if (!it.isFocused && tagging && tagDraft.isNotEmpty()) addTag() }
                                        .border(1.dp, MaterialTheme.colorScheme.onSurface, CircleShape)
                                        .padding(horizontal = 14.dp, vertical = 9.dp),
                                    decorationBox = { inner ->
                                        Box {
                                            if (tagDraft.isEmpty()) Text("New tag", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                            inner()
                                        }
                                    },
                                )
                                TextButton(onClick = { addTag(); tagging = false }) { Text("Done") }
                            } else {
                                Surface(
                                    shape = CircleShape,
                                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                                    color = Color.Transparent,
                                    onClick = { tagging = true },
                                ) {
                                    Icon(Icons.Outlined.Add, "Add a tag", Modifier.padding(horizontal = 14.dp, vertical = 8.dp).size(20.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                            }
                        }
                    }

                    val titleStyle = MaterialTheme.typography.displaySmall.copy(fontSize = 44.sp, lineHeight = 48.sp, color = MaterialTheme.colorScheme.onSurface)
                    BasicTextField(
                        value = title,
                        onValueChange = { v ->
                            // One line, as in the mockup: Enter goes on to the text.
                            if (v.text.contains('\n')) {
                                writing = true
                                return@BasicTextField
                            }
                            title = v.copy(text = v.text.take(200))
                            vm.update { it.copy(title = title.text) }
                        },
                        readOnly = !canEdit,
                        textStyle = titleStyle,
                        cursorBrush = SolidColor(MaterialTheme.colorScheme.primary),
                        modifier = Modifier.fillMaxWidth().padding(top = 16.dp),
                        decorationBox = { inner ->
                            Box {
                                if (title.text.isEmpty()) Text("Title", style = titleStyle, color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f))
                                inner()
                            }
                        },
                    )
                    val other = vm.subMember
                    val meta = listOfNotNull(
                        if (draft.visibility == NoteVisibility.Private) "Private" else "Shared",
                        if (vm.isAuthor && other != null && draft.visibility == NoteVisibility.Shared && draft.subCanEdit) "$other can edit" else null,
                        if (!vm.isAuthor) (if (canEdit) "you can edit this" else "read only") else null,
                        when (saveState) {
                            NoteEditorViewModel.SaveState.Saving -> "saving…"
                            NoteEditorViewModel.SaveState.Saved -> "saved just now"
                            NoteEditorViewModel.SaveState.Failed -> "not saved yet"
                            NoteEditorViewModel.SaveState.Idle -> vm.updatedAt?.let { "edited ${dayWord(it)}" }
                        },
                    )
                    Text(meta.joinToString(" · "), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 4.dp, bottom = 16.dp))

                    if (writing && canEdit) {
                        LaunchedEffect(Unit) { bodyFocus.requestFocus() }
                        MarkdownField(
                            value = body,
                            onChange = ::setBody,
                            textStyle = LettersBody,
                            modifier = Modifier.fillMaxWidth().heightIn(min = 240.dp).focusRequester(bodyFocus),
                        )
                    } else {
                        MarkdownPreview(
                            markdown = body.text,
                            onToggleCheck = if (canEdit) {
                                { line: Int -> setBody(TextFieldValue(MarkdownEdits.toggleCheckbox(body.text, line), body.selection)) }
                            } else null,
                            letters = true,
                            modifier = Modifier
                                .fillMaxWidth()
                                .heightIn(min = 240.dp)
                                .then(if (canEdit) Modifier.clickable { writing = true } else Modifier),
                        )
                    }
                }
                if (writing && canEdit) {
                    LettersToolbar(value = body, onChange = ::setBody, modifier = Modifier.fillMaxWidth().navigationBarsPadding())
                }
            }
        }
    }

    if (history) NoteHistoryDialog(vm) { history = false }
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

/** A note's earlier versions, newest first, each with who replaced it and when. */
@Composable
private fun NoteHistoryDialog(vm: NoteEditorViewModel, onClose: () -> Unit) {
    val revisions by vm.revisions.collectAsStateWithLifecycle()
    AlertDialog(
        onDismissRequest = onClose,
        title = { Text("Edit history") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("Earlier versions, newest first. The current one is on the page.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                val list = revisions
                if (list == null) Text("Loading…", color = MaterialTheme.colorScheme.onSurfaceVariant)
                list?.forEach { r ->
                    Column(
                        Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surfaceContainer, MaterialTheme.shapes.medium).padding(12.dp),
                        verticalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        Text("Replaced ${formatDateTime(r.createdAt)} by ${vm.editorName(r.editorId)}", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        if (r.title.isNotBlank()) Text(r.title, style = MaterialTheme.typography.titleMedium)
                        MarkdownPreview(markdown = r.bodyMd, onToggleCheck = null, modifier = Modifier.fillMaxWidth())
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = onClose) { Text("Close") } },
    )
}
