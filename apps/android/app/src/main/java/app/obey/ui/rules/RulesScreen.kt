package app.obey.ui.rules

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
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
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import app.obey.api.ObeyApi
import app.obey.api.Rule
import app.obey.api.ReorderInput
import app.obey.api.RuleInput
import app.obey.data.Session
import app.obey.data.SessionRepository
import app.obey.ui.common.BaseViewModel
import app.obey.ui.common.EmptyBox
import app.obey.ui.common.ErrorBox
import app.obey.ui.common.Load
import app.obey.ui.common.LoadingBox
import app.obey.ui.common.MessageEffect
import app.obey.ui.common.ReorderableList
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

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            if (_state.value !is Load.Ready) _state.value = Load.Loading
            _state.value = loadCatching { api.rules(sessions.requireRelationshipId()).inOrder() }
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RulesScreen(onOpenSettings: () -> Unit, vm: RulesViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    val message by vm.message.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    MessageEffect(message, snackbar, vm::messageShown)
    val canManage = vm.session?.canManage == true
    var editing by remember { mutableStateOf<Editing?>(null) }

    Scaffold(
        topBar = { TopAppBar(title = { Text("Rules") }, actions = { SettingsAction(onOpenSettings) }) },
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
                        ListItem(
                            modifier = if (canManage) Modifier.clickable { editing = Editing(r) } else Modifier,
                            leadingContent = {
                                Text("${index + 1}.", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.primary)
                            },
                            overlineContent = r.category?.takeIf { it.isNotBlank() }?.let { c -> { Text(c) } },
                            headlineContent = { Text(r.title) },
                            supportingContent = if (r.bodyMd.isNotBlank()) { { Text(r.bodyMd) } } else null,
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
