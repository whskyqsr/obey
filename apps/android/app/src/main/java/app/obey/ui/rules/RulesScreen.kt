package app.obey.ui.rules

import androidx.compose.material3.IconButton
import androidx.compose.material.icons.outlined.History
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.FactCheck
import androidx.compose.material3.AssistChip
import androidx.compose.material3.AssistChipDefaults
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import app.obey.api.ObeyApi
import app.obey.api.Protocol
import app.obey.api.Rule
import app.obey.api.ReorderInput
import app.obey.api.RuleInput
import app.obey.data.Session
import app.obey.data.SessionRepository
import app.obey.ui.common.BaseViewModel
import app.obey.ui.common.EmptyBox
import app.obey.ui.common.LocalFeatures
import app.obey.ui.common.ErrorBox
import app.obey.ui.common.Load
import app.obey.ui.common.LoadingBox
import app.obey.ui.common.MessageEffect
import app.obey.ui.common.ReorderableList
import app.obey.ui.common.MenuButton
import app.obey.ui.common.SettingsAction
import app.obey.ui.common.loadCatching
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

@HiltViewModel
class RulesViewModel @Inject constructor(
    private val api: ObeyApi,
    private val sessions: SessionRepository,
) : BaseViewModel() {
    private val _state = MutableStateFlow<Load<List<Rule>>>(Load.Loading)
    val state: StateFlow<Load<List<Rule>>> = _state.asStateFlow()
    val session: Session? get() = sessions.session

    /** Protocols linked to each rule, keyed by rule id, in the protocols' own order. */
    private val _protocols = MutableStateFlow<Map<String, List<Protocol>>>(emptyMap())
    val protocols: StateFlow<Map<String, List<Protocol>>> = _protocols.asStateFlow()

    fun refresh(withProtocols: Boolean = true) {
        viewModelScope.launch {
            if (_state.value !is Load.Ready) _state.value = Load.Loading
            _state.value = loadCatching { api.rules(sessions.requireRelationshipId()).inOrder() }
        }
        if (withProtocols) {
            viewModelScope.launch {
                // The rules still show if this fails; they just lose their protocol links.
                runCatching { api.protocols(sessions.requireRelationshipId()) }.onSuccess { list ->
                    _protocols.value = list.sortedWith(compareBy({ it.position }, { it.createdAt }))
                        .filter { it.ruleId != null }
                        .groupBy { it.ruleId!! }
                }
            }
        }
    }

    // New rules go to the end; the server numbers them.
    fun save(existing: Rule?, input: RuleInput) = action {
        if (existing == null) api.createRule(sessions.requireRelationshipId(), input) else api.updateRule(existing.id, input)
        refresh()
    }

    fun delete(rule: Rule) = action { api.deleteRule(rule.id); refresh() }

    /** Saves a drag-to-reorder; the list already shows the new order. */
    fun reorder(rules: List<Rule>) {
        _state.value = Load.Ready(rules)
        action { _state.value = Load.Ready(api.reorderRules(sessions.requireRelationshipId(), ReorderInput(rules.map { it.id })).inOrder()) }
    }
}

internal fun List<Rule>.inOrder() = sortedWith(compareBy({ it.position }, { it.createdAt }))

private data class Editing(val rule: Rule?)

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun RulesScreen(onOpenSettings: () -> Unit, onOpenProtocol: (String) -> Unit, onOpenLog: () -> Unit, vm: RulesViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    val message by vm.message.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    MessageEffect(message, snackbar, vm::messageShown)
    val showProtocols = LocalFeatures.current.protocols
    val protocols by vm.protocols.collectAsStateWithLifecycle()
    // Refreshes on return from a protocol, which may have been relinked.
    LifecycleResumeEffect(showProtocols) {
        vm.refresh(withProtocols = showProtocols)
        onPauseOrDispose { }
    }
    val canManage = vm.session?.canManage == true
    var editing by remember { mutableStateOf<Editing?>(null) }

    Scaffold(
        topBar = {
            TopAppBar(
                navigationIcon = { MenuButton() },
                title = { Text("Rules") },
                actions = {
                    IconButton(onClick = onOpenLog) { Icon(Icons.Outlined.History, "Broken-rule log") }
                    SettingsAction(onOpenSettings)
                },
            )
        },
        floatingActionButton = {
            if (canManage) FloatingActionButton(onClick = { editing = Editing(null) }) { Icon(Icons.Outlined.Add, "New rule") }
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        when (val s = state) {
            Load.Loading -> LoadingBox(Modifier.padding(padding))
            is Load.Failed -> ErrorBox(s.message, vm::refresh, Modifier.padding(padding))
            is Load.Ready -> {
                if (s.value.isEmpty()) {
                    EmptyBox("No rules yet", if (canManage) "Rules are numbered in the order you add them." else null, Modifier.padding(padding))
                } else {
                    // Numbers always follow the list order; a Dominant drags the handle to change it.
                    ReorderableList(
                        items = s.value,
                        key = { it.id },
                        enabled = canManage,
                        onReorder = vm::reorder,
                        modifier = Modifier.padding(padding).fillMaxSize(),
                    ) { r, index, handle ->
                        val linked = if (showProtocols) protocols[r.id].orEmpty() else emptyList()
                        ListItem(
                            modifier = if (canManage) Modifier.clickable { editing = Editing(r) } else Modifier,
                            leadingContent = {
                                Text("${index + 1}.", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.primary)
                            },
                            overlineContent = r.category?.takeIf { it.isNotBlank() }?.let { c -> { Text(c) } },
                            headlineContent = { Text(r.title) },
                            supportingContent = if (r.bodyMd.isNotBlank() || linked.isNotEmpty()) {
                                {
                                    Column {
                                        if (r.bodyMd.isNotBlank()) Text(r.bodyMd)
                                        if (linked.isNotEmpty()) {
                                            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                                linked.forEach { p ->
                                                    AssistChip(
                                                        onClick = { onOpenProtocol(p.id) },
                                                        label = { Text(p.title) },
                                                        leadingIcon = { Icon(Icons.Outlined.FactCheck, null, Modifier.size(AssistChipDefaults.IconSize)) },
                                                    )
                                                }
                                            }
                                        }
                                    }
                                }
                            } else null,
                            trailingContent = handle,
                        )
                    }
                }
            }
        }
    }

    editing?.let { e ->
        val existing = e.rule
        var title by remember(existing) { mutableStateOf(existing?.title.orEmpty()) }
        var body by remember(existing) { mutableStateOf(existing?.bodyMd.orEmpty()) }
        var category by remember(existing) { mutableStateOf(existing?.category.orEmpty()) }
        AlertDialog(
            onDismissRequest = { editing = null },
            title = { Text(if (existing == null) "New rule" else "Edit rule") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    OutlinedTextField(title, { title = it.take(200) }, label = { Text("Rule") })
                    OutlinedTextField(body, { body = it.take(5000) }, label = { Text("Details (optional)") }, minLines = 2)
                    OutlinedTextField(category, { category = it.take(60) }, label = { Text("Category (optional)") }, singleLine = true)
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        vm.save(existing, RuleInput(title.trim(), body, category.trim().ifEmpty { null }))
                        editing = null
                    },
                    enabled = title.isNotBlank(),
                ) { Text("Save") }
            },
            dismissButton = {
                Row {
                    if (existing != null) {
                        TextButton(onClick = { vm.delete(existing); editing = null }) {
                            Text("Delete", color = MaterialTheme.colorScheme.error)
                        }
                    }
                    TextButton(onClick = { editing = null }) { Text("Cancel") }
                }
            },
        )
    }
}
