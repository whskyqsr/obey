package app.obey.ui.limits

import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Block
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.Explore
import androidx.compose.material.icons.outlined.PanTool
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import app.obey.api.Limit
import app.obey.api.LimitInput
import app.obey.api.LimitKind
import app.obey.api.ObeyApi
import app.obey.data.Session
import app.obey.data.SessionRepository
import app.obey.ui.common.BaseViewModel
import app.obey.ui.common.EmptyBox
import app.obey.ui.common.ErrorBox
import app.obey.ui.common.Load
import app.obey.ui.common.LoadingBox
import app.obey.ui.common.MessageEffect
import app.obey.ui.common.SettingsAction
import app.obey.ui.common.loadCatching
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** Everyone's limits. Partners see each other's; only the person whose limit it is can change it. */
@HiltViewModel
class LimitsViewModel @Inject constructor(private val api: ObeyApi, private val sessions: SessionRepository) : BaseViewModel() {
    private val _state = MutableStateFlow<Load<List<Limit>>>(Load.Loading)
    val state: StateFlow<Load<List<Limit>>> = _state.asStateFlow()
    val session: Session? get() = sessions.session

    fun refresh() {
        viewModelScope.launch {
            if (_state.value !is Load.Ready) _state.value = Load.Loading
            _state.value = loadCatching { api.limits(sessions.requireRelationshipId()) }
        }
    }

    fun save(existing: Limit?, input: LimitInput) = action {
        if (existing == null) api.createLimit(sessions.requireRelationshipId(), input) else api.updateLimit(existing.id, input)
        refresh()
    }

    fun delete(limit: Limit) = action { api.deleteLimit(limit.id); refresh() }
}

private data class KindInfo(val kind: LimitKind, val title: String, val short: String, val help: String, val icon: ImageVector)

private val KINDS = listOf(
    KindInfo(LimitKind.Hard, "Hard limits", "Hard", "Never, under any circumstances.", Icons.Outlined.Block),
    KindInfo(LimitKind.Soft, "Soft limits", "Soft", "Only with care, or ask first.", Icons.Outlined.PanTool),
    KindInfo(LimitKind.Curious, "Curious about", "Curious", "Open to trying, carefully.", Icons.Outlined.Explore),
)

private data class Editing(val limit: Limit?, val kind: LimitKind)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LimitsScreen(onOpenSettings: () -> Unit, vm: LimitsViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    val message by vm.message.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    MessageEffect(message, snackbar, vm::messageShown)
    LifecycleResumeEffect(Unit) {
        vm.refresh()
        onPauseOrDispose { }
    }
    val session = vm.session
    val me = session?.userId
    val readOnly = session?.readOnly == true
    var editing by remember { mutableStateOf<Editing?>(null) }
    var who by remember { mutableStateOf<String?>(null) }
    val colors = MaterialTheme.colorScheme
    fun name(id: String) = if (id == me) "You" else session?.nameOf(id) ?: "Someone"

    Scaffold(
        topBar = { TopAppBar(title = { Text("Limits") }, actions = { SettingsAction(onOpenSettings) }) },
        floatingActionButton = {
            if (!readOnly) ExtendedFloatingActionButton(onClick = { editing = Editing(null, LimitKind.Hard) }, icon = { Icon(Icons.Outlined.Add, null) }, text = { Text("Add a limit") })
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        when (val s = state) {
            Load.Loading -> LoadingBox(Modifier.padding(padding))
            is Load.Failed -> ErrorBox(s.message, vm::refresh, Modifier.padding(padding))
            is Load.Ready -> if (s.value.isEmpty()) {
                EmptyBox("No limits written down yet", "Add your hard limits, soft limits and anything you're curious about, so your partner always knows.", Modifier.padding(padding))
            } else {
                val people = listOfNotNull(me) + session?.partners.orEmpty().map { it.userId }
                val shown = s.value.filter { who == null || it.ownerId == who }
                LazyColumn(Modifier.padding(padding).fillMaxSize(), contentPadding = androidx.compose.foundation.layout.PaddingValues(bottom = 96.dp)) {
                    item(key = "intro") {
                        Text(
                            "Everyone's, in one place. Only you can change yours.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = colors.onSurfaceVariant,
                            modifier = Modifier.padding(horizontal = 16.dp),
                        )
                    }
                    if (people.size > 1) item(key = "who") {
                        Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            FilterChip(selected = who == null, onClick = { who = null }, label = { Text("Everyone") })
                            people.forEach { id -> FilterChip(selected = who == id, onClick = { who = if (who == id) null else id }, label = { Text(name(id)) }) }
                        }
                    }
                    KINDS.forEach { k ->
                        val list = shown.filter { it.kind == k.kind }
                        item(key = "h-${k.kind}") {
                            Row(Modifier.padding(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                                val tint = when (k.kind) {
                                    LimitKind.Hard -> colors.error
                                    LimitKind.Soft -> colors.tertiary
                                    LimitKind.Curious -> colors.primary
                                }
                                Icon(k.icon, null, tint = tint)
                                Spacer(Modifier.width(8.dp))
                                Column {
                                    Text(k.title, style = MaterialTheme.typography.titleMedium)
                                    Text(k.help, style = MaterialTheme.typography.bodySmall, color = colors.onSurfaceVariant)
                                }
                            }
                        }
                        if (list.isEmpty()) item(key = "e-${k.kind}") {
                            Text("None yet.", color = colors.onSurfaceVariant, modifier = Modifier.padding(horizontal = 16.dp))
                        }
                        items(list, key = { it.id }) { l ->
                            val mine = l.ownerId == me && !readOnly
                            Surface(
                                color = colors.surfaceContainerLow,
                                shape = MaterialTheme.shapes.medium,
                                modifier = Modifier
                                    .padding(horizontal = 16.dp, vertical = 4.dp)
                                    .fillMaxWidth()
                                    .then(if (l.kind == LimitKind.Hard) Modifier.border(1.dp, colors.error.copy(alpha = 0.5f), MaterialTheme.shapes.medium) else Modifier)
                                    .then(if (mine) Modifier.clickable { editing = Editing(l, l.kind) } else Modifier),
                            ) {
                                Row(Modifier.padding(12.dp), verticalAlignment = Alignment.Top) {
                                    Column(Modifier.weight(1f)) {
                                        Text(l.title, style = MaterialTheme.typography.titleMedium)
                                        Text(name(l.ownerId), style = MaterialTheme.typography.labelMedium, color = colors.onSurfaceVariant)
                                        if (l.note.isNotBlank()) {
                                            Spacer(Modifier.height(4.dp))
                                            Text(l.note, style = MaterialTheme.typography.bodyMedium, color = colors.onSurfaceVariant)
                                        }
                                    }
                                    if (mine) Icon(Icons.Outlined.Edit, "Edit", tint = colors.onSurfaceVariant)
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    editing?.let { e ->
        val existing = e.limit
        var title by remember(e) { mutableStateOf(existing?.title.orEmpty()) }
        var kind by remember(e) { mutableStateOf(e.kind) }
        var note by remember(e) { mutableStateOf(existing?.note.orEmpty()) }
        var confirmDelete by remember(e) { mutableStateOf(false) }
        if (confirmDelete && existing != null) {
            AlertDialog(
                onDismissRequest = { confirmDelete = false },
                title = { Text("Remove this limit?") },
                text = { Text("\"${existing.title}\" comes off your limits, and your partner is told they changed.") },
                confirmButton = { TextButton(onClick = { vm.delete(existing); editing = null }) { Text("Remove", color = colors.error) } },
                dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text("Cancel") } },
            )
        } else AlertDialog(
            onDismissRequest = { editing = null },
            title = { Text(if (existing == null) "Add a limit" else "Edit your limit") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    OutlinedTextField(title, { title = it.take(200) }, label = { Text("Limit") }, singleLine = true)
                    SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                        KINDS.forEachIndexed { i, k ->
                            SegmentedButton(selected = kind == k.kind, onClick = { kind = k.kind }, shape = SegmentedButtonDefaults.itemShape(i, KINDS.size)) { Text(k.short) }
                        }
                    }
                    OutlinedTextField(note, { note = it.take(2000) }, label = { Text("Note (optional)") }, minLines = 2)
                }
            },
            confirmButton = {
                Button(onClick = { vm.save(existing, LimitInput(title.trim(), kind, note.trim())); editing = null }, enabled = title.isNotBlank()) { Text("Save") }
            },
            dismissButton = {
                Row {
                    if (existing != null) TextButton(onClick = { confirmDelete = true }) { Text("Remove", color = colors.error) }
                    TextButton(onClick = { editing = null }) { Text("Cancel") }
                }
            },
        )
    }
}
