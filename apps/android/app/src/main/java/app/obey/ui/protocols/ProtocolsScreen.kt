package app.obey.ui.protocols

import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.Gavel
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import app.obey.api.ObeyApi
import app.obey.api.Protocol
import app.obey.api.ProtocolInput
import app.obey.api.ReorderInput
import app.obey.api.Rule
import app.obey.data.Session
import app.obey.data.SessionRepository
import app.obey.ui.common.BaseViewModel
import app.obey.ui.common.EmptyBox
import app.obey.ui.common.ErrorBox
import app.obey.ui.common.Load
import app.obey.ui.common.LoadingBox
import app.obey.ui.common.LocalFeatures
import app.obey.ui.common.MessageEffect
import app.obey.ui.common.ReorderableList
import app.obey.ui.common.SettingsAction
import app.obey.ui.common.loadCatching
import app.obey.ui.rules.inOrder
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class ProtocolsData(val protocols: List<Protocol>, val rules: List<Rule>)

@HiltViewModel
class ProtocolsViewModel @Inject constructor(
    private val api: ObeyApi,
    private val sessions: SessionRepository,
) : BaseViewModel() {
    private val _state = MutableStateFlow<Load<ProtocolsData>>(Load.Loading)
    val state: StateFlow<Load<ProtocolsData>> = _state.asStateFlow()
    val session: Session? get() = sessions.session

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            if (_state.value !is Load.Ready) _state.value = Load.Loading
            _state.value = loadCatching {
                val rel = sessions.requireRelationshipId()
                coroutineScope {
                    val protocols = async { api.protocols(rel) }
                    val rules = async { api.rules(rel) }
                    ProtocolsData(protocols.await().sortedWith(compareBy({ it.position }, { it.createdAt })), rules.await().inOrder())
                }
            }
        }
    }

    fun save(existing: Protocol?, input: ProtocolInput) = action {
        if (existing == null) api.createProtocol(sessions.requireRelationshipId(), input) else api.updateProtocol(existing.id, input)
        refresh()
    }

    fun delete(p: Protocol) = action { api.deleteProtocol(p.id); refresh() }

    fun reorder(protocols: List<Protocol>) {
        val current = (_state.value as? Load.Ready)?.value ?: return
        _state.value = Load.Ready(current.copy(protocols = protocols))
        action {
            val saved = api.reorderProtocols(sessions.requireRelationshipId(), ReorderInput(protocols.map { it.id }))
            _state.value = Load.Ready(current.copy(protocols = saved.sortedWith(compareBy({ it.position }, { it.createdAt }))))
        }
    }
}

private data class Editing(val protocol: Protocol?)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProtocolsScreen(onOpenSettings: () -> Unit, vm: ProtocolsViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    val message by vm.message.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    MessageEffect(message, snackbar, vm::messageShown)
    val canManage = vm.session?.canManage == true
    val showRules = LocalFeatures.current.rules
    var editing by remember { mutableStateOf<Editing?>(null) }
    var expanded by rememberSaveable { mutableStateOf(setOf<String>()) }

    Scaffold(
        topBar = { TopAppBar(title = { Text("Protocols") }, actions = { SettingsAction(onOpenSettings) }) },
        floatingActionButton = {
            if (canManage) {
                ExtendedFloatingActionButton(onClick = { editing = Editing(null) }, icon = { Icon(Icons.Outlined.Add, null) }, text = { Text("Protocol") })
            }
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        when (val s = state) {
            Load.Loading -> LoadingBox(Modifier.padding(padding))
            is Load.Failed -> ErrorBox(s.message, vm::refresh, Modifier.padding(padding))
            is Load.Ready -> {
                val rules = if (showRules) s.value.rules else emptyList()
                if (s.value.protocols.isEmpty()) {
                    EmptyBox("No protocols yet", if (canManage) "Spell out exactly what's expected, and when and how it's done." else null, Modifier.padding(padding))
                } else {
                    ReorderableList(
                        items = s.value.protocols,
                        key = { it.id },
                        enabled = canManage,
                        onReorder = vm::reorder,
                        modifier = Modifier.padding(padding).fillMaxSize(),
                    ) { p, _, handle ->
                        val open = p.id in expanded
                        val ruleIndex = rules.indexOfFirst { it.id == p.ruleId }
                        ListItem(
                            modifier = Modifier.animateContentSize().clickable { expanded = if (open) expanded - p.id else expanded + p.id },
                            headlineContent = { Text(p.title) },
                            overlineContent = if (ruleIndex >= 0) {
                                { Text("Rule ${ruleIndex + 1}: ${rules[ruleIndex].title}", maxLines = 1, overflow = TextOverflow.Ellipsis) }
                            } else null,
                            supportingContent = if (p.bodyMd.isNotBlank()) {
                                { Text(p.bodyMd, maxLines = if (open) Int.MAX_VALUE else 2, overflow = TextOverflow.Ellipsis) }
                            } else null,
                            trailingContent = if (canManage) {
                                {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        IconButton(onClick = { editing = Editing(p) }) { Icon(Icons.Outlined.Edit, "Edit ${p.title}") }
                                        handle?.invoke()
                                    }
                                }
                            } else null,
                        )
                    }
                }
            }
        }
    }

    editing?.let { e ->
        val existing = e.protocol
        val rules = (state as? Load.Ready)?.value?.rules.orEmpty().takeIf { showRules }.orEmpty()
        var title by remember(existing) { mutableStateOf(existing?.title.orEmpty()) }
        var body by remember(existing) { mutableStateOf(existing?.bodyMd.orEmpty()) }
        var ruleId by remember(existing) { mutableStateOf(existing?.ruleId) }
        var ruleMenu by remember { mutableStateOf(false) }
        AlertDialog(
            onDismissRequest = { editing = null },
            title = { Text(if (existing == null) "New protocol" else "Edit protocol") },
            text = {
                Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    OutlinedTextField(title, { title = it.take(200) }, label = { Text("Protocol") }, placeholder = { Text("e.g. Hydration") }, singleLine = true)
                    OutlinedTextField(body, { body = it.take(20_000) }, label = { Text("What's expected, and when and how") }, minLines = 4)
                    if (rules.isNotEmpty()) {
                        Box {
                            val i = rules.indexOfFirst { it.id == ruleId }
                            OutlinedButton(onClick = { ruleMenu = true }, modifier = Modifier.fillMaxWidth()) {
                                Icon(Icons.Outlined.Gavel, null)
                                Text(
                                    if (i >= 0) "  Rule ${i + 1}: ${rules[i].title}" else "  Spells out a rule (optional)",
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }
                            DropdownMenu(expanded = ruleMenu, onDismissRequest = { ruleMenu = false }) {
                                DropdownMenuItem(text = { Text("No rule") }, onClick = { ruleId = null; ruleMenu = false })
                                rules.forEachIndexed { n, r ->
                                    DropdownMenuItem(text = { Text("${n + 1}. ${r.title}") }, onClick = { ruleId = r.id; ruleMenu = false })
                                }
                            }
                        }
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        // With Rules switched off the picker is hidden, so keep whatever link was there.
                        vm.save(existing, ProtocolInput(title.trim(), body, if (rules.isEmpty()) existing?.ruleId else ruleId))
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
