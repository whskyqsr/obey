package app.obey.ui.notes

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ShowChart
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.StickyNote2
import androidx.compose.material.icons.outlined.AutoStories
import androidx.compose.material.icons.outlined.SearchOff
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.PushPin
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import app.obey.ui.common.LettersField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.LargeTopAppBar
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
import androidx.compose.ui.unit.sp
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
import app.obey.ui.common.MenuButton
import app.obey.ui.common.SafeWordAction
import app.obey.ui.common.formatDateTime


@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotesScreen(
    journal: Boolean,
    onOpen: (String) -> Unit,
    onNew: () -> Unit,
    onOpenSettings: () -> Unit,
    vm: NotesViewModel = hiltViewModel(),
) {
    val state by vm.state.collectAsStateWithLifecycle()
    val message by vm.message.collectAsStateWithLifecycle()
    val replies by vm.replies.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    MessageEffect(message, snackbar, vm::messageShown)
    LifecycleResumeEffect(Unit) {
        vm.refresh()
        onPauseOrDispose { }
    }
    var query by rememberSaveable { mutableStateOf("") }
    var tag by rememberSaveable { mutableStateOf<String?>(null) }
    var searching by rememberSaveable { mutableStateOf(false) }
    // The mood chart sits behind its own header button, as in the mockup; the entries lead.
    var chart by rememberSaveable { mutableStateOf(false) }

    Scaffold(
        topBar = {
            LargeTopAppBar(
                navigationIcon = { MenuButton() },
                title = { Text(if (journal) "Journal" else "Notes") },
                actions = {
                    IconButton(onClick = { searching = !searching; if (!searching) query = "" }) { Icon(Icons.Outlined.Search, "Search") }
                    if (journal) IconButton(onClick = { chart = !chart }) {
                        Icon(Icons.AutoMirrored.Outlined.ShowChart, if (chart) "Hide the mood chart" else "Show the mood chart")
                    }
                    if (vm.canWrite(journal)) IconButton(onClick = onNew) { Icon(Icons.Outlined.Add, "Write") }
                    SafeWordAction()
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbar) },
        // Tonight's entry starts from a bar above the tabs, as in the mockup.
        bottomBar = {
            if (journal && vm.canWrite(true)) {
                Column {
                    androidx.compose.material3.HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                    Row(
                        Modifier.fillMaxWidth().clickable(onClick = onNew).padding(horizontal = 20.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            "Write tonight's entry…",
                            style = MaterialTheme.typography.titleLarge.copy(fontSize = 22.sp, fontStyle = androidx.compose.ui.text.font.FontStyle.Italic),
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.weight(1f),
                        )
                        androidx.compose.material3.OutlinedButton(onClick = onNew, contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp)) { Text("Mood") }
                    }
                }
            }
        },
    ) { padding ->
        Column(Modifier.padding(padding).fillMaxSize()) {
            if (searching) {
                LettersField(
                    value = query,
                    onValueChange = { query = it },
                    placeholder = { Text(if (journal) "Search entries and tags" else "Search notes and tags") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
                )
            }
            val tags = (state as? Load.Ready)?.value.orEmpty().filter { it.kind == (if (journal) NoteKind.Journal else NoteKind.Note) }.flatMap { it.tags }.distinct().sorted()
            if (!journal && tags.isNotEmpty()) {
                Row(
                    Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    FilterChip(selected = tag == null, onClick = { tag = null }, label = { Text("All") })
                    tags.forEach { t ->
                        FilterChip(selected = tag == t, onClick = { tag = if (tag == t) null else t }, label = { Text(t) })
                    }
                }
            }
            when (val s = state) {
                Load.Loading -> LoadingBox()
                is Load.Failed -> ErrorBox(s.message, vm::refresh)
                is Load.Ready -> {
                    val q = query.trim().lowercase()
                    val kind = if (journal) NoteKind.Journal else NoteKind.Note
                    val mine = s.value.filter { it.kind == kind }
                    // Journal entries read newest-written first; notes keep pinned-then-recently-edited.
                    val ordered = if (journal) mine.sortedByDescending { it.createdAt } else mine
                    val shown = ordered.filter { n ->
                        (journal || tag == null || tag in n.tags) && (q.isEmpty() || n.title.lowercase().contains(q) || n.bodyMd.lowercase().contains(q) ||
                            n.tags.any { it.lowercase().contains(q) })
                    }
                    LazyColumn(
                        Modifier.fillMaxSize(),
                        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
                    ) {
                        if (journal && chart && q.isEmpty()) item(key = "mood") { app.obey.ui.common.MoodCard(Modifier.padding(bottom = 12.dp)) }
                        if (shown.isEmpty()) {
                            item {
                                when {
                                    q.isNotEmpty() -> EmptyBox("Nothing matches", icon = Icons.Outlined.SearchOff)
                                    journal -> EmptyBox("No entries yet", "Write about your day, and how you felt.", icon = Icons.Outlined.AutoStories)
                                    else -> EmptyBox("No notes yet", "Plans, ideas, anything worth keeping. Notes support headings, lists and checklists.", icon = Icons.Outlined.StickyNote2)
                                }
                            }
                        }
                        if (!journal) items(shown, key = { it.id }) { n ->
                            NoteRow(
                                n,
                                author = vm.session?.let { if (n.authorId == it.userId) null else it.nameOf(n.authorId) },
                                subName = vm.session?.let { s -> s.relationship?.members?.firstOrNull { it.role == app.obey.api.Role.Submissive && it.userId != s.userId }?.displayName },
                                onOpen = { onOpen(n.id) },
                            )
                        }
                        if (journal && shown.isNotEmpty()) item(key = "top") { androidx.compose.material3.HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant) }
                        if (journal) items(shown, key = { it.id }) { n ->
                            JournalEntryRow(
                                n,
                                author = vm.session?.let { if (n.authorId == it.userId) null else it.nameOf(n.authorId) },
                                reply = replies[n.id]?.let { r -> r to (vm.session?.nameOf(r.authorId) ?: "") },
                                onOpen = { onOpen(n.id) },
                            )
                        }
                        item { androidx.compose.foundation.layout.Spacer(Modifier.padding(32.dp)) }
                    }
                }
            }
        }
    }
}

/** A note on a hairline: its title in the serif, then whether it's shared and when it last changed. */
@Composable
private fun NoteRow(note: Note, author: String?, subName: String?, onOpen: () -> Unit) {
    Column(Modifier.fillMaxWidth().clickable(onClick = onOpen)) {
        Row(Modifier.padding(vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(
                    note.title.ifBlank { "Untitled" },
                    style = MaterialTheme.typography.headlineSmall.copy(fontSize = 24.sp, lineHeight = 30.sp),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    listOfNotNull(
                        if (note.visibility == NoteVisibility.Private) "Private" else "Shared",
                        if (note.visibility == NoteVisibility.Shared && note.subCanEdit && author == null) subName?.let { "$it can edit" } else null,
                        author,
                        app.obey.ui.common.dayWord(note.updatedAt),
                    ).joinToString(" · "),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (note.pinned) Icon(Icons.Outlined.PushPin, "Pinned", Modifier.padding(start = 8.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        androidx.compose.material3.HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
    }
}

/** Letters: a journal entry on a hairline, "MONDAY, NOV 23 · FEELING GOOD" over the first lines in the serif. */
@Composable
private fun JournalEntryRow(note: Note, author: String?, reply: Pair<app.obey.api.NoteComment, String>?, onOpen: () -> Unit) {
    val c = MaterialTheme.colorScheme
    Column(Modifier.fillMaxWidth().clickable(onClick = onOpen)) {
        Column(Modifier.padding(vertical = 16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (note.visibility == NoteVisibility.Private) Icon(Icons.Outlined.Lock, "Private", Modifier.padding(end = 4.dp).size(14.dp), tint = c.onSurfaceVariant)
                Text(
                    listOfNotNull(
                        journalDay(note.createdAt),
                        note.mood?.let { m -> moods.firstOrNull { it.first == m }?.second?.let { "feeling ${it.lowercase()}" } },
                        author,
                    ).joinToString(" · ").uppercase(),
                    style = MaterialTheme.typography.labelMedium.copy(letterSpacing = 1.5.sp),
                    color = c.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            if (note.title.isNotBlank() && note.title != "Untitled") Text(note.title, style = MaterialTheme.typography.titleMedium)
            if (note.bodyMd.isNotBlank()) Text(
                journalExcerpt(note.bodyMd),
                style = MaterialTheme.typography.titleLarge.copy(fontSize = 23.sp, lineHeight = 31.sp),
                maxLines = 4,
                overflow = TextOverflow.Ellipsis,
            )
            if (note.tags.isNotEmpty()) Text(note.tags.joinToString(" ") { "#$it" }, style = MaterialTheme.typography.labelMedium, color = c.onSurfaceVariant)
            reply?.let { (r, name) -> ReplyQuote(r, name) }
        }
        androidx.compose.material3.HorizontalDivider(color = c.outlineVariant)
    }
}

/** The partner's reply quoted under the entry: an accent rule, the words in serif italic, then who and when. */
@Composable
private fun ReplyQuote(reply: app.obey.api.NoteComment, name: String) {
    val c = MaterialTheme.colorScheme
    Row(Modifier.padding(start = 24.dp, top = 8.dp).height(IntrinsicSize.Min)) {
        Box(Modifier.width(2.dp).fillMaxHeight().background(c.primary))
        Column(Modifier.padding(start = 18.dp)) {
            Text(
                "\u201C${journalExcerpt(reply.body).take(220)}\u201D",
                style = MaterialTheme.typography.titleLarge.copy(fontSize = 20.sp, lineHeight = 28.sp, fontStyle = FontStyle.Italic),
            )
            Text(
                listOf(name, java.time.OffsetDateTime.parse(reply.createdAt).atZoneSameInstant(java.time.ZoneId.systemDefault())
                    .format(java.time.format.DateTimeFormatter.ofPattern("h:mm a"))).filter { it.isNotBlank() }.joinToString(" · "),
                style = MaterialTheme.typography.bodySmall,
                color = c.onSurfaceVariant,
                modifier = Modifier.padding(top = 4.dp),
            )
        }
    }
}

/** "Monday, Nov 23" in the reader's time zone. */
private fun journalDay(iso: String): String =
    java.time.OffsetDateTime.parse(iso).atZoneSameInstant(java.time.ZoneId.systemDefault())
        .format(java.time.format.DateTimeFormatter.ofPattern("EEEE, MMM d"))

/** The entry as plain sentences: markdown marks and checklist boxes dropped, lines joined. */
private fun journalExcerpt(md: String): String = md.lineSequence()
    .map { it.trim().replace(Regex("^(#+|[-*+]|\\d+\\.|- \\[[ xX]\\])\\s+"), "").replace(Regex("[*_`~]"), "") }
    .filter { it.isNotBlank() }
    .joinToString(" ")
    .take(400)
