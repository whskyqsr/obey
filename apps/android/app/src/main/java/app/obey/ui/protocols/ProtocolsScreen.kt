package app.obey.ui.protocols

import androidx.compose.material.icons.outlined.History
import app.obey.ui.notes.MarkdownPreview
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.Row
import androidx.compose.material.icons.outlined.ExpandLess
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material3.IconButton
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import app.obey.api.ObeyApi
import app.obey.api.Protocol
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
import app.obey.ui.common.MenuButton
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

    fun reorder(protocols: List<Protocol>) {
        val current = (_state.value as? Load.Ready)?.value ?: return
        _state.value = Load.Ready(current.copy(protocols = protocols))
        action {
            val saved = api.reorderProtocols(sessions.requireRelationshipId(), ReorderInput(protocols.map { it.id }))
            _state.value = Load.Ready(current.copy(protocols = saved.sortedWith(compareBy({ it.position }, { it.createdAt }))))
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProtocolsScreen(onOpen: (String) -> Unit, onNew: () -> Unit, onOpenSettings: () -> Unit, onOpenLog: () -> Unit, vm: ProtocolsViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    val message by vm.message.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    MessageEffect(message, snackbar, vm::messageShown)
    LifecycleResumeEffect(Unit) {
        vm.refresh()
        onPauseOrDispose { }
    }
    val canManage = vm.session?.canManage == true
    val showRules = LocalFeatures.current.rules
    var expanded by remember { mutableStateOf(setOf<String>()) }

    Scaffold(
        topBar = {
            TopAppBar(
                navigationIcon = { MenuButton() },
                title = { Text("Protocols") },
                actions = {
                    IconButton(onClick = onOpenLog) { Icon(Icons.Outlined.History, "Broken-rule log") }
                    SettingsAction(onOpenSettings)
                },
            )
        },
        floatingActionButton = {
            if (canManage) ExtendedFloatingActionButton(onClick = onNew, icon = { Icon(Icons.Outlined.Add, null) }, text = { Text("Protocol") })
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
                        val ruleIndex = rules.indexOfFirst { it.id == p.ruleId }
                        ListItem(
                            modifier = Modifier.clickable { onOpen(p.id) },
                            overlineContent = if (ruleIndex >= 0) {
                                { Text("Rule ${ruleIndex + 1}: ${rules[ruleIndex].title}", maxLines = 1, overflow = TextOverflow.Ellipsis) }
                            } else null,
                            headlineContent = { Text(p.title) },
                            supportingContent = if (p.bodyMd.isNotBlank()) {
                                {
                                    val open = p.id in expanded
                                    MarkdownPreview(
                                        markdown = p.bodyMd,
                                        onToggleCheck = null,
                                        modifier = if (open || !p.isLong) Modifier else Modifier.heightIn(max = 120.dp).clipToBounds().fadeOut(),
                                    )
                                }
                            } else null,
                            trailingContent = {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    if (p.isLong) {
                                        val open = p.id in expanded
                                        IconButton(onClick = { expanded = if (open) expanded - p.id else expanded + p.id }) {
                                            Icon(if (open) Icons.Outlined.ExpandLess else Icons.Outlined.ExpandMore, if (open) "Show less" else "Show more")
                                        }
                                    }
                                    handle?.invoke()
                                }
                            },
                        )
                    }
                }
            }
        }
    }
}

/** Long enough that the collapsed preview cuts it off, so it gets a chevron. */
private val Protocol.isLong: Boolean
    get() = bodyMd.lineSequence().count { it.isNotBlank() } > 3 || bodyMd.length > 180

/** Fades the bottom of a clipped preview so it reads as "more below". */
private fun Modifier.fadeOut(): Modifier = graphicsLayer { compositingStrategy = CompositingStrategy.Offscreen }
    .drawWithContent {
        drawContent()
        drawRect(
            brush = Brush.verticalGradient(0.6f to Color.Black, 1f to Color.Transparent),
            blendMode = BlendMode.DstIn,
        )
    }
