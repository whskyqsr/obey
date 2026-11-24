package app.obey.ui.protocols

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.clickable
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
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.MoreHoriz
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.navigation.toRoute
import app.obey.api.ObeyApi
import app.obey.api.Protocol
import app.obey.api.ProtocolInput
import app.obey.api.Rule
import app.obey.api.RuleLogEntry
import app.obey.ui.common.BackLink
import app.obey.ui.rules.roman
import app.obey.data.SessionRepository
import app.obey.ui.ProtocolEditorRoute
import app.obey.ui.common.BaseViewModel
import app.obey.ui.common.ErrorBox
import app.obey.ui.common.Load
import app.obey.ui.common.LoadingBox
import app.obey.ui.common.LocalFeatures
import app.obey.ui.common.MessageEffect
import app.obey.ui.common.loadCatching
import app.obey.ui.notes.MarkdownField
import app.obey.ui.notes.MarkdownPreview
import app.obey.ui.notes.MarkdownToolbar
import app.obey.ui.rules.inOrder
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.async
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch

@HiltViewModel
class ProtocolEditorViewModel @Inject constructor(
    savedState: SavedStateHandle,
    private val api: ObeyApi,
    private val sessions: SessionRepository,
) : BaseViewModel() {
    private val protocolId: String? = savedState.toRoute<ProtocolEditorRoute>().protocolId
    val opensForReading: Boolean = protocolId != null
    val canManage: Boolean get() = sessions.session?.canManage == true

    var protocol: Protocol? = null
        private set
    var rules: List<Rule> = emptyList()
        private set
    /** This month's rule log entries for this protocol, each with the title of the consequence it got (if any). */
    var broken: List<Pair<RuleLogEntry, String?>> = emptyList()
        private set

    private val _load = MutableStateFlow<Load<Unit>>(Load.Loading)
    val load: StateFlow<Load<Unit>> = _load.asStateFlow()

    private val _closed = Channel<Unit>(Channel.CONFLATED)
    val closed = _closed.receiveAsFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _load.value = Load.Loading
            _load.value = loadCatching {
                val rel = sessions.requireRelationshipId()
                coroutineScope {
                    val protocols = async { if (protocolId == null) emptyList() else api.protocols(rel) }
                    val rules = async { api.rules(rel) }
                    this@ProtocolEditorViewModel.rules = rules.await().inOrder()
                    protocol = protocolId?.let { id -> protocols.await().firstOrNull { it.id == id } ?: error("That protocol no longer exists") }
                    if (protocolId != null) {
                        // Best effort: the page still opens if the log can't be read.
                        broken = runCatching {
                            val month = java.time.LocalDate.now().toString().take(7)
                            val entries = api.ruleLog(rel).filter { it.protocolId == protocolId && it.occurredOn.startsWith(month) }
                            val tasks = if (entries.any { it.consequenceTaskId != null }) api.tasks(rel) else emptyList()
                            entries.map { e -> e to e.consequenceTaskId?.let { id -> tasks.firstOrNull { it.id == id }?.title } }
                        }.getOrDefault(emptyList())
                    }
                }
            }
        }
    }

    /** Saves and, for a new protocol, remembers it so later saves update it. */
    fun save(input: ProtocolInput, onSaved: () -> Unit) = action {
        protocol = protocol?.let { api.updateProtocol(it.id, input) } ?: api.createProtocol(sessions.requireRelationshipId(), input)
        say("Saved")
        onSaved()
    }

    fun delete() {
        val p = protocol ?: run { _closed.trySend(Unit); return }
        action {
            api.deleteProtocol(p.id)
            _closed.trySend(Unit)
        }
    }
}

/** One protocol, full page: formatted for reading, with the Markdown editor for a Dominant. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProtocolEditorScreen(onDone: () -> Unit, vm: ProtocolEditorViewModel = hiltViewModel()) {
    val load by vm.load.collectAsStateWithLifecycle()
    val busy by vm.busy.collectAsStateWithLifecycle()
    val message by vm.message.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    MessageEffect(message, snackbar, vm::messageShown)
    LaunchedEffect(Unit) { vm.closed.collect { onDone() } }

    val showRules = LocalFeatures.current.rules
    var reading by rememberSaveable { mutableStateOf(vm.opensForReading) }
    var title by remember { mutableStateOf(TextFieldValue("")) }
    var body by remember { mutableStateOf(TextFieldValue("")) }
    var ruleId by remember { mutableStateOf<String?>(null) }
    var dirty by remember { mutableStateOf(false) }
    var ruleMenu by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }
    var menu by remember { mutableStateOf(false) }
    var confirmDiscard by remember { mutableStateOf(false) }

    fun reset() {
        val p = vm.protocol
        title = TextFieldValue(p?.title.orEmpty())
        body = TextFieldValue(p?.bodyMd.orEmpty(), TextRange(p?.bodyMd?.length ?: 0))
        ruleId = p?.ruleId
        dirty = false
    }
    LaunchedEffect(load) { if (load is Load.Ready) reset() }

    fun leaveEditing() {
        if (vm.protocol == null) onDone() else { reset(); reading = true }
    }
    fun back() {
        when {
            reading -> onDone()
            dirty -> confirmDiscard = true
            else -> leaveEditing()
        }
    }
    BackHandler(onBack = ::back)

    val rules = if (showRules) vm.rules else emptyList()
    val ruleIndex = rules.indexOfFirst { it.id == ruleId }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {},
                navigationIcon = {
                    if (reading) BackLink("Protocols", ::back)
                    else TextButton(onClick = ::back) { Text("Cancel", style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                },
                actions = {
                    if (vm.canManage && load is Load.Ready) {
                        if (reading) {
                            IconButton(onClick = { reading = false }) { Icon(Icons.Outlined.Edit, "Edit") }
                            Box {
                                IconButton(onClick = { menu = true }) { Icon(Icons.Outlined.MoreHoriz, "More") }
                                DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                                    DropdownMenuItem(text = { Text("Delete") }, onClick = { menu = false; confirmDelete = true })
                                }
                            }
                        } else {
                            TextButton(
                                onClick = {
                                    // With Rules switched off the picker is hidden, so keep whatever link was there.
                                    val link = if (rules.isEmpty()) vm.protocol?.ruleId else ruleId
                                    vm.save(ProtocolInput(title.text.trim(), body.text, link)) { dirty = false; reading = true }
                                },
                                enabled = !busy && title.text.isNotBlank() && (dirty || vm.protocol == null),
                            ) { Text("Save") }
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
                    Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp, vertical = 8.dp).widthIn(max = 720.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    val titleStyle = MaterialTheme.typography.headlineLarge.copy(color = MaterialTheme.colorScheme.onSurface)
                    if (reading) {
                        Text(title.text, style = MaterialTheme.typography.displayMedium)
                        if (ruleIndex >= 0) {
                            Text(
                                "Spells out rule ${roman(ruleIndex + 1)}: ${rules[ruleIndex].title}.",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        if (body.text.isBlank()) {
                            Text("Nothing written yet.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                        } else {
                            MarkdownPreview(markdown = body.text, onToggleCheck = null, modifier = Modifier.fillMaxWidth(), letters = true)
                        }
                        if (showRules && vm.broken.isNotEmpty()) {
                            Text(
                                "BROKEN THIS MONTH",
                                style = MaterialTheme.typography.labelMedium.copy(letterSpacing = 1.2.sp),
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(top = 20.dp),
                            )
                            vm.broken.forEachIndexed { i, (e, consequence) ->
                                Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                                    Column(Modifier.weight(1f)) {
                                        Text(java.time.LocalDate.parse(e.occurredOn).format(java.time.format.DateTimeFormatter.ofPattern("EEE, MMM d")), style = MaterialTheme.typography.bodyLarge)
                                        if (e.note.isNotBlank()) Text(e.note, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    }
                                    if (e.consequenceTaskId != null) {
                                        Text((consequence ?: "consequence").lowercase(), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    }
                                }
                                if (i < vm.broken.lastIndex) HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                            }
                        }
                    } else {
                        BasicTextField(
                            value = title,
                            onValueChange = { v -> title = v.copy(text = v.text.replace("\n", "").take(200)); dirty = true },
                            textStyle = titleStyle,
                            singleLine = true,
                            cursorBrush = SolidColor(MaterialTheme.colorScheme.primary),
                            modifier = Modifier.fillMaxWidth(),
                            decorationBox = { inner ->
                                Box {
                                    if (title.text.isEmpty()) Text("Name it", style = titleStyle, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    inner()
                                }
                            },
                        )
                        if (rules.isNotEmpty()) {
                            Box {
                                Column(Modifier.fillMaxWidth().clickable { ruleMenu = true }) {
                                    Text("Spells out a rule (optional)", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    Text(
                                        if (ruleIndex >= 0) "${ruleIndex + 1}. ${rules[ruleIndex].title}" else "No rule",
                                        style = MaterialTheme.typography.bodyLarge,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                        modifier = Modifier.padding(vertical = 8.dp),
                                    )
                                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                                }
                                DropdownMenu(expanded = ruleMenu, onDismissRequest = { ruleMenu = false }) {
                                    DropdownMenuItem(text = { Text("No rule") }, onClick = { ruleId = null; dirty = true; ruleMenu = false })
                                    rules.forEachIndexed { n, r ->
                                        DropdownMenuItem(text = { Text("${n + 1}. ${r.title}") }, onClick = { ruleId = r.id; dirty = true; ruleMenu = false })
                                    }
                                }
                            }
                        }
                        MarkdownField(
                            value = body,
                            onChange = { v -> body = v; dirty = true },
                            modifier = Modifier.fillMaxWidth(),
                            placeholder = "What's expected, and when and how it's done.",
                        )
                    }
                }
                if (!reading) {
                    MarkdownToolbar(value = body, onChange = { v -> body = v; dirty = true }, modifier = Modifier.fillMaxWidth().navigationBarsPadding())
                }
            }
        }
    }

    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            title = { Text("Delete this protocol?") },
            text = { Text("This can't be undone.") },
            confirmButton = { Button(onClick = { confirmDelete = false; vm.delete() }) { Text("Delete") } },
            dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text("Cancel") } },
        )
    }
    if (confirmDiscard) {
        AlertDialog(
            onDismissRequest = { confirmDiscard = false },
            title = { Text("Discard unsaved changes?") },
            confirmButton = { Button(onClick = { confirmDiscard = false; leaveEditing() }) { Text("Discard") } },
            dismissButton = { TextButton(onClick = { confirmDiscard = false }) { Text("Keep editing") } },
        )
    }
}
