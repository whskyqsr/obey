package app.obey.ui.rulelog

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.ArrowDropDown
import androidx.compose.material.icons.outlined.Bolt
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material.icons.outlined.FactCheck
import androidx.compose.material.icons.outlined.Gavel
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.AssistChipDefaults
import androidx.compose.material3.Button
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import app.obey.api.Consequence
import app.obey.api.ObeyApi
import app.obey.api.Protocol
import app.obey.api.Rule
import app.obey.api.RuleLogConsequence
import app.obey.api.RuleLogEntry
import app.obey.api.RuleLogInput
import app.obey.data.Session
import app.obey.data.SessionRepository
import app.obey.ui.common.BaseViewModel
import app.obey.ui.common.EmptyBox
import app.obey.ui.common.ErrorBox
import app.obey.ui.common.Load
import app.obey.ui.common.LoadingBox
import app.obey.ui.common.LocalFeatures
import app.obey.ui.common.MessageEffect
import app.obey.ui.common.loadCatching
import app.obey.ui.rules.inOrder
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** What can be picked in the log dialog: the dynamic's rules, protocols and consequences. */
data class LogChoices(val rules: List<Rule> = emptyList(), val protocols: List<Protocol> = emptyList(), val consequences: List<Consequence> = emptyList())

/** The broken-rule log: a Dominant logs for anyone, with a consequence if they like; anyone owns up to their own. */
@HiltViewModel
class RuleLogViewModel @Inject constructor(private val api: ObeyApi, private val sessions: SessionRepository) : BaseViewModel() {
    private val _state = MutableStateFlow<Load<List<RuleLogEntry>>>(Load.Loading)
    val state: StateFlow<Load<List<RuleLogEntry>>> = _state.asStateFlow()
    private val _choices = MutableStateFlow(LogChoices())
    val choices: StateFlow<LogChoices> = _choices.asStateFlow()
    val session: Session? get() = sessions.session

    fun refresh() {
        viewModelScope.launch {
            if (_state.value !is Load.Ready) _state.value = Load.Loading
            _state.value = loadCatching { api.ruleLog(sessions.requireRelationshipId()) }
        }
    }

    fun loadChoices(rules: Boolean, protocols: Boolean, consequences: Boolean) {
        viewModelScope.launch {
            val rel = sessions.requireRelationshipId()
            _choices.value = LogChoices(
                rules = if (rules) runCatching { api.rules(rel).inOrder() }.getOrDefault(emptyList()) else emptyList(),
                protocols = if (protocols) runCatching { api.protocols(rel).sortedWith(compareBy({ it.position }, { it.createdAt })) }.getOrDefault(emptyList()) else emptyList(),
                consequences = if (consequences) runCatching { api.consequences(rel) }.getOrDefault(emptyList()) else emptyList(),
            )
        }
    }

    fun add(input: RuleLogInput) = action {
        api.addRuleLog(sessions.requireRelationshipId(), input)
        say(if (input.consequence != null) "Logged, and the consequence is on their list" else "Logged")
        refresh()
    }

    fun delete(e: RuleLogEntry) = action { api.deleteRuleLog(e.id); refresh() }
}

private val dateLabel = DateTimeFormatter.ofPattern("EEE, MMM d")

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RuleLogScreen(onBack: () -> Unit, onOpenTask: (String) -> Unit, vm: RuleLogViewModel = hiltViewModel()) {
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
    val isDom = session?.canManage == true
    var adding by remember { mutableStateOf(false) }
    var removing by remember { mutableStateOf<RuleLogEntry?>(null) }
    var who by remember { mutableStateOf<String?>(null) }
    val colors = MaterialTheme.colorScheme
    fun name(id: String) = if (id == me) "You" else session?.nameOf(id) ?: "Someone"

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Broken rules") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Back") } },
            )
        },
        floatingActionButton = {
            if (!readOnly) ExtendedFloatingActionButton(onClick = { adding = true }, icon = { Icon(Icons.Outlined.Add, null) }, text = { Text(if (isDom) "Log a broken rule" else "Own up to one") })
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        when (val s = state) {
            Load.Loading -> LoadingBox(Modifier.padding(padding))
            is Load.Failed -> ErrorBox(s.message, vm::refresh, Modifier.padding(padding))
            is Load.Ready -> if (s.value.isEmpty()) {
                EmptyBox(
                    "Nothing logged",
                    if (isDom) "When a rule or protocol is broken, log it here, with a consequence if you like." else "If you break a rule or protocol, you can own up to it here.",
                    Modifier.padding(padding),
                )
            } else {
                val people = s.value.map { it.subjectId }.distinct()
                val shown = s.value.filter { who == null || it.subjectId == who }
                LazyColumn(Modifier.padding(padding).fillMaxSize(), contentPadding = PaddingValues(bottom = 96.dp)) {
                    if (people.size > 1) item(key = "who") {
                        Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            FilterChip(selected = who == null, onClick = { who = null }, label = { Text("Everyone") })
                            people.forEach { id -> FilterChip(selected = who == id, onClick = { who = if (who == id) null else id }, label = { Text(name(id)) }) }
                        }
                    }
                    item(key = "count") {
                        Text("${s.value.size} logged", style = MaterialTheme.typography.bodyMedium, color = colors.onSurfaceVariant, modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp))
                    }
                    items(shown, key = { it.id }) { e ->
                        Surface(color = colors.surfaceContainerLow, shape = MaterialTheme.shapes.medium, modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp).fillMaxWidth()) {
                            Row(Modifier.padding(12.dp), verticalAlignment = Alignment.Top) {
                                Icon(if (e.protocolId != null) Icons.Outlined.FactCheck else Icons.Outlined.Gavel, null, tint = colors.onSurfaceVariant, modifier = Modifier.padding(top = 2.dp))
                                Spacer(Modifier.width(12.dp))
                                Column(Modifier.weight(1f)) {
                                    Text(e.title, style = MaterialTheme.typography.titleMedium)
                                    val by = if (e.loggedBy == e.subjectId) "owned up" else "logged by ${name(e.loggedBy)}"
                                    val day = runCatching { LocalDate.parse(e.occurredOn).format(dateLabel) }.getOrDefault(e.occurredOn)
                                    Text("${name(e.subjectId)} · $day · $by", style = MaterialTheme.typography.labelMedium, color = colors.onSurfaceVariant)
                                    if (e.note.isNotBlank()) {
                                        Spacer(Modifier.height(4.dp))
                                        Text(e.note, style = MaterialTheme.typography.bodyMedium, color = colors.onSurfaceVariant)
                                    }
                                    e.consequenceTaskId?.let { taskId ->
                                        AssistChip(
                                            onClick = { onOpenTask(taskId) },
                                            label = { Text("Consequence given") },
                                            leadingIcon = { Icon(Icons.Outlined.Bolt, null, Modifier.size(AssistChipDefaults.IconSize)) },
                                        )
                                    }
                                }
                                if (!readOnly && (e.loggedBy == me || isDom)) {
                                    IconButton(onClick = { removing = e }) { Icon(Icons.Outlined.DeleteOutline, "Remove from log") }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    removing?.let { e ->
        AlertDialog(
            onDismissRequest = { removing = null },
            title = { Text("Remove from the log?") },
            text = { Text("\"${e.title}\" comes off the log. A consequence already given stays on the task list.") },
            confirmButton = { TextButton(onClick = { vm.delete(e); removing = null }) { Text("Remove", color = colors.error) } },
            dismissButton = { TextButton(onClick = { removing = null }) { Text("Cancel") } },
        )
    }
    if (adding && session != null) LogDialog(vm, session, onDismiss = { adding = false })
}

private sealed interface Broken {
    val label: String
    data class R(val rule: Rule, val number: Int) : Broken { override val label get() = "$number. ${rule.title}" }
    data class P(val protocol: Protocol) : Broken { override val label get() = protocol.title }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun LogDialog(vm: RuleLogViewModel, session: Session, onDismiss: () -> Unit) {
    val features = LocalFeatures.current
    val isDom = session.canManage
    val me = session.userId
    LifecycleResumeEffect(Unit) {
        vm.loadChoices(features.rules, features.protocols, isDom && features.consequences)
        onPauseOrDispose { }
    }
    val choices by vm.choices.collectAsStateWithLifecycle()
    val members = session.relationship?.members.orEmpty()
    var subject by remember { mutableStateOf(if (isDom) (session.partners.firstOrNull { it.role == app.obey.api.Role.Submissive } ?: session.partners.firstOrNull())?.userId ?: me else me) }
    var broken by remember { mutableStateOf<Broken?>(null) }
    var on by remember { mutableStateOf(LocalDate.now()) }
    var note by remember { mutableStateOf("") }
    var consequence by remember { mutableStateOf<Consequence?>(null) }
    var due by remember { mutableStateOf(LocalDate.now().plusDays(1)) }
    var dueTime by remember { mutableStateOf(LocalTime.of(20, 0)) }
    var approval by remember { mutableStateOf(false) }
    var picking by remember { mutableStateOf<String?>(null) }
    val options = choices.rules.mapIndexed { i, r -> Broken.R(r, i + 1) } + choices.protocols.map { Broken.P(it) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (isDom) "Log a broken rule" else "Own up to a broken rule") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                if (isDom) {
                    Picker("Who", members.firstOrNull { it.userId == subject }?.let { if (it.userId == me) "Me" else it.displayName }.orEmpty(), members.map { (if (it.userId == me) "Me" else it.displayName) to it.userId }) { subject = it }
                }
                Picker("What was broken", broken?.label ?: "Pick a rule or protocol", options.map { it.label to it }) { broken = it }
                OutlinedButton(onClick = { picking = "on" }) { Text("When: ${on.format(dateLabel)}") }
                OutlinedTextField(note, { note = it.take(2000) }, label = { Text("Note (optional)") }, minLines = 2, modifier = Modifier.fillMaxWidth())
                if (isDom && features.consequences && subject != me) {
                    Picker("Consequence (optional)", consequence?.title ?: "None", listOf<Pair<String, Consequence?>>("None" to null) + choices.consequences.map { it.title to it }) { consequence = it }
                    if (consequence != null) {
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedButton(onClick = { picking = "due" }) { Text("Due ${due.format(DateTimeFormatter.ofPattern("MMM d"))}") }
                            OutlinedButton(onClick = { picking = "time" }) { Text("By ${dueTime.format(DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT))}") }
                        }
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("Needs your approval", Modifier.weight(1f))
                            Switch(checked = approval, onCheckedChange = { approval = it })
                        }
                    }
                }
            }
        },
        confirmButton = {
            Button(
                enabled = broken != null,
                onClick = {
                    val b = broken ?: return@Button
                    vm.add(
                        RuleLogInput(
                            subjectId = subject,
                            ruleId = (b as? Broken.R)?.rule?.id,
                            protocolId = (b as? Broken.P)?.protocol?.id,
                            note = note.trim(),
                            occurredOn = on.toString(),
                            consequence = consequence?.let {
                                RuleLogConsequence(it.id, due.toString(), dueTime.format(DateTimeFormatter.ofPattern("HH:mm")), ZoneId.systemDefault().id, approval)
                            },
                        ),
                    )
                    onDismiss()
                },
            ) { Text("Log it") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )

    when (picking) {
        "on", "due" -> {
            val initial = if (picking == "on") on else due
            val state = rememberDatePickerState(initialSelectedDateMillis = initial.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli())
            DatePickerDialog(
                onDismissRequest = { picking = null },
                confirmButton = {
                    TextButton(onClick = {
                        state.selectedDateMillis?.let { Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate() }?.let { d ->
                            if (picking == "on") on = minOf(d, LocalDate.now()) else due = maxOf(d, LocalDate.now())
                        }
                        picking = null
                    }) { Text("OK") }
                },
                dismissButton = { TextButton(onClick = { picking = null }) { Text("Cancel") } },
            ) { DatePicker(state) }
        }
        "time" -> {
            val state = rememberTimePickerState(initialHour = dueTime.hour, initialMinute = dueTime.minute)
            AlertDialog(
                onDismissRequest = { picking = null },
                text = { TimePicker(state = state) },
                confirmButton = { TextButton(onClick = { dueTime = LocalTime.of(state.hour, state.minute); picking = null }) { Text("Set") } },
                dismissButton = { TextButton(onClick = { picking = null }) { Text("Cancel") } },
            )
        }
    }
}

/** A labelled button that opens a menu of [options]. */
@Composable
private fun <T> Picker(label: String, value: String, options: List<Pair<String, T>>, onPick: (T) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Column {
        Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Box {
            OutlinedButton(onClick = { open = true }, modifier = Modifier.fillMaxWidth()) {
                Text(value, Modifier.weight(1f), maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
                Icon(Icons.Outlined.ArrowDropDown, null)
            }
            DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
                options.forEach { (text, v) -> DropdownMenuItem(text = { Text(text) }, onClick = { onPick(v); open = false }) }
            }
        }
    }
}
