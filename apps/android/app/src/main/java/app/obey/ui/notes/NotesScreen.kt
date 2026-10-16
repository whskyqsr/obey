package app.obey.ui.notes

import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.PushPin
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.obey.api.Note
import app.obey.api.NoteKind
import app.obey.api.NoteVisibility
import app.obey.ui.common.EmptyBox
import app.obey.ui.common.ErrorBox
import app.obey.ui.common.Load
import app.obey.ui.common.LoadingBox
import app.obey.ui.common.MessageEffect
import app.obey.ui.common.SettingsAction
import app.obey.ui.common.formatDateTime

private enum class NoteFilter(val label: String) { All("All"), Notes("Notes"), Journal("Journal"), Pinned("Pinned") }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotesScreen(
    onOpen: (String) -> Unit,
    onNew: () -> Unit,
    onOpenSettings: () -> Unit,
    vm: NotesViewModel = hiltViewModel(),
) {
    val state by vm.state.collectAsStateWithLifecycle()
    val message by vm.message.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    MessageEffect(message, snackbar, vm::messageShown)
    LifecycleResumeEffect(Unit) {
        vm.refresh()
        onPauseOrDispose { }
    }
    var query by rememberSaveable { mutableStateOf("") }
    var filter by rememberSaveable { mutableStateOf(NoteFilter.All) }
    var searching by rememberSaveable { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Notes") },
                actions = {
                    IconButton(onClick = { searching = !searching; if (!searching) query = "" }) { Icon(Icons.Outlined.Search, "Search") }
                    SettingsAction(onOpenSettings)
                },
            )
        },
        floatingActionButton = {
            ExtendedFloatingActionButton(onClick = onNew, icon = { Icon(Icons.Outlined.Edit, null) }, text = { Text("Write") })
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        Column(Modifier.padding(padding).fillMaxSize()) {
            if (searching) {
                OutlinedTextField(
                    value = query,
                    onValueChange = { query = it },
                    placeholder = { Text("Search notes and tags") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
                )
            }
            Row(
                Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                NoteFilter.entries.forEach { f ->
                    FilterChip(selected = filter == f, onClick = { filter = f }, label = { Text(f.label) })
                }
            }
            when (val s = state) {
                Load.Loading -> LoadingBox()
                is Load.Failed -> ErrorBox(s.message, vm::refresh)
                is Load.Ready -> {
                    val q = query.trim().lowercase()
                    val shown = s.value.filter { n ->
                        when (filter) {
                            NoteFilter.All -> true
                            NoteFilter.Notes -> n.kind == NoteKind.Note
                            NoteFilter.Journal -> n.kind == NoteKind.Journal
                            NoteFilter.Pinned -> n.pinned
                        } && (q.isEmpty() || n.title.lowercase().contains(q) || n.bodyMd.lowercase().contains(q) ||
                            n.tags.any { it.lowercase().contains(q) })
                    }
                    LazyColumn(
                        Modifier.fillMaxSize(),
                        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        if (shown.isEmpty()) {
                            item { EmptyBox(if (q.isEmpty()) "No notes yet" else "Nothing matches", "Notes support headings, lists and checklists.") }
                        }
                        items(shown, key = { it.id }) { n ->
                            NoteCard(
                                n,
                                author = vm.session?.let { if (n.authorId == it.userId) null else it.nameOf(n.authorId) },
                                onOpen = { onOpen(n.id) },
                                onToggleCheck = if (n.authorId == vm.session?.userId) ({ line: Int -> vm.toggleCheck(n, line) }) else null,
                            )
                        }
                        item { androidx.compose.foundation.layout.Spacer(Modifier.padding(32.dp)) }
                    }
                }
            }
        }
    }
}

@Composable
private fun NoteCard(note: Note, author: String?, onOpen: () -> Unit, onToggleCheck: ((Int) -> Unit)?) {
    ElevatedCard(Modifier.fillMaxWidth().clickable(onClick = onOpen)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    note.title.ifBlank { if (note.kind == NoteKind.Journal) "Journal entry" else "Untitled" },
                    style = MaterialTheme.typography.titleMedium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                if (note.visibility == NoteVisibility.Private) Icon(Icons.Outlined.Lock, "Private", Modifier.padding(start = 4.dp))
                if (note.pinned) Icon(Icons.Outlined.PushPin, "Pinned", Modifier.padding(start = 4.dp))
            }
            // A short rendered preview; checklists can be ticked right here.
            MarkdownPreview(
                markdown = note.bodyMd.lineSequence().take(8).joinToString("\n"),
                onToggleCheck = onToggleCheck,
                modifier = Modifier.heightIn(max = 220.dp).clipToBounds(),
            )
            Text(
                listOfNotNull(
                    author,
                    formatDateTime(note.updatedAt),
                    note.tags.takeIf { it.isNotEmpty() }?.joinToString(" ") { "#$it" },
                ).joinToString(" · "),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
