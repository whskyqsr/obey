package app.obey.ui.rulelog

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.sp
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
import androidx.compose.material.icons.outlined.Gavel
import androidx.compose.material3.AlertDialog
import app.obey.ui.common.Button
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import app.obey.ui.common.LettersField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import app.obey.ui.common.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.LargeTopAppBar
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
import app.obey.ui.common.BackLink
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
    /** Recent occurrences by their task, to say what came of each entry's consequence. */
    private val _outcomes = MutableStateFlow<Map<String, app.obey.api.Occurrence>>(emptyMap())
    val outcomes: StateFlow<Map<String, app.obey.api.Occurrence>> = _outcomes.asStateFlow()
    val session: Session? get() = sessions.session

    fun refresh() {
        viewModelScope.launch {
            if (_state.value !is Load.Ready) _state.value = Load.Loading
            _state.value = loadCatching { api.ruleLog(sessions.requireRelationshipId()) }
            val today = LocalDate.now()
            _outcomes.value = runCatching {
                api.occurrences(sessions.requireRelationshipId(), today.minusDays(30).toString(), today.plusDays(7).toString())
            }.getOrDefault(emptyList()).associateBy { it.seriesId }
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
    var kind by remember { mutableStateOf("all") }
    var open by remember { mutableStateOf<RuleLogEntry?>(null) }
    val outcomes by vm.outcomes.collectAsStateWithLifecycle()
    val features = LocalFeatures.current
    val colors = MaterialTheme.colorScheme
    fun name(id: String) = if (id == me) "You" else session?.nameOf(id) ?: "Someone"
    fun outcome(e: RuleLogEntry): String {
        val taskId = e.consequenceTaskId ?: return "none"
        val o = outcomes[taskId] ?: return "consequence given"
        val state = when (o.status) {
            app.obey.api.OccurrenceStatus.Completed -> "done"
            app.obey.api.OccurrenceStatus.Submitted -> return if (isDom) "needs your approval" else "sent for approval"
            app.obey.api.OccurrenceStatus.Missed -> "not done"
            app.obey.api.OccurrenceStatus.Excused -> "excused"
            app.obey.api.OccurrenceStatus.Cancelled -> "skipped"
            app.obey.api.OccurrenceStatus.Pending -> "owed"
        }
        return "${o.title.lowercase()} · $state"
    }

    Scaffold(
        topBar = {
            LargeTopAppBar(
                title = { Text("Broken rules") },
                navigationIcon = { BackLink("Rules", onBack) },
                actions = {
                    if (!readOnly) IconButton(onClick = { adding = true }) { Icon(Icons.Outlined.Add, if (isDom) "Log a broken rule" else "Own up to one") }
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        when (val s = state) {
            Load.Loading -> LoadingBox(Modifier.padding(padding))
            is Load.Failed -> ErrorBox(s.message, vm::refresh, Modifier.padding(padding))
            is Load.Ready -> if (s.value.isEmpty()) {
                EmptyBox(
                    "Nothing logged",
                    null,
                    Modifier.padding(padding),
                    icon = Icons.Outlined.Gavel,
                )
            } else {
                val people = s.value.map { it.subjectId }.distinct()
                val filters = features.rules && features.protocols
                val shown = s.value.filter { (who == null || it.subjectId == who) && (kind == "all" || (kind == "protocols") == (it.protocolId != null)) }
                LazyColumn(Modifier.padding(padding).fillMaxSize(), contentPadding = PaddingValues(bottom = 96.dp)) {
                    if (filters || people.size > 1) item(key = "filters") {
                        Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Pill("Everyone", kind == "all" && who == null) { kind = "all"; who = null }
                            if (filters) {
                                Pill("Rules", kind == "rules") { kind = if (kind == "rules") "all" else "rules" }
                                Pill("Protocols", kind == "protocols") { kind = if (kind == "protocols") "all" else "protocols" }
                            }
                            if (people.size > 1) people.forEach { id -> Pill(name(id), who == id) { who = if (who == id) null else id } }
                        }
                    }
                    if (shown.isEmpty()) item(key = "none") {
                        Text("Nothing logged here.", style = MaterialTheme.typography.bodyMedium, color = colors.onSurfaceVariant, modifier = Modifier.padding(16.dp))
                    }
                    items(shown, key = { it.id }) { e ->
                        Column(Modifier.fillMaxWidth().clickable { open = e }.padding(horizontal = 16.dp)) {
                            Row(Modifier.padding(vertical = 14.dp), verticalAlignment = Alignment.Top) {
                                Column(Modifier.weight(1f)) {
                                    Text(e.title, style = MaterialTheme.typography.titleLarge)
                                    val by = when {
                                        e.loggedBy != e.subjectId -> "logged by ${name(e.loggedBy).replaceFirstChar { if (e.loggedBy == me) it.lowercaseChar() else it }}"
                                        e.subjectId == me -> "you owned up"
                                        else -> "${name(e.subjectId)} owned up"
                                    }
                                    val day = runCatching { LocalDate.parse(e.occurredOn).format(dateLabel) }.getOrDefault(e.occurredOn)
                                    val whose = if (people.size > 1 && e.loggedBy != e.subjectId) "${name(e.subjectId)} · " else ""
                                    Text("$whose$day · $by", style = MaterialTheme.typography.bodyMedium, color = colors.onSurfaceVariant, modifier = Modifier.padding(top = 2.dp))
                                    if (e.note.isNotBlank()) {
                                        Text(
                                            "\u201C${e.note}\u201D",
                                            style = MaterialTheme.typography.titleLarge.copy(fontStyle = androidx.compose.ui.text.font.FontStyle.Italic, fontSize = 21.sp, lineHeight = 26.sp),
                                            color = colors.onSurfaceVariant,
                                            modifier = Modifier.padding(top = 8.dp),
                                        )
                                    }
                                }
                                Text(outcome(e), style = MaterialTheme.typography.labelMedium, color = colors.onSurfaceVariant, modifier = Modifier.padding(start = 12.dp, top = 6.dp))
                            }
                            HorizontalDivider(color = colors.outlineVariant)
                        }
                    }
                }
            }
        }
    }

    open?.let { e ->
        val canRemove = !readOnly && (e.loggedBy == me || isDom)
        val result = outcome(e)
        AlertDialog(
            onDismissRequest = { open = null },
            title = { Text(e.title) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    val day = runCatching { LocalDate.parse(e.occurredOn).format(dateLabel) }.getOrDefault(e.occurredOn)
                    Text("${name(e.subjectId)} · $day · ${if (e.loggedBy == e.subjectId) "owned up" else "logged by ${name(e.loggedBy)}"}")
                    Text(
                        when (result) {
                            "none" -> "No consequence"
                            "needs your approval", "sent for approval" -> "Consequence $result"
                            else -> "Consequence: $result"
                        },
                    )
                    if (e.note.isNotBlank()) {
                        Text(
                            "\u201C${e.note}\u201D",
                            style = MaterialTheme.typography.titleLarge.copy(fontStyle = androidx.compose.ui.text.font.FontStyle.Italic, fontSize = 21.sp, lineHeight = 26.sp),
                            modifier = Modifier.padding(top = 8.dp),
                        )
                    }
                }
            },
            confirmButton = {
                val taskId = e.consequenceTaskId
                if (taskId != null) OutlinedButton(onClick = { open = null; onOpenTask(taskId) }) { Text("See the consequence") }
                else TextButton(onClick = { open = null }) { Text("Close") }
            },
            dismissButton = {
                if (canRemove) TextButton(onClick = { open = null; removing = e }) { Text("Remove", color = colors.error) }
            },
        )
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
    data class R(val rule: Rule, val number: Int) : Broken { override val label get() = "${app.obey.ui.rules.roman(number)}. ${rule.title}" }
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
        title = { Text(if (isDom) "Log a broken rule" else "Own up to one", style = MaterialTheme.typography.headlineMedium) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                if (isDom) {
                    Picker("Who", members.firstOrNull { it.userId == subject }?.let { if (it.userId == me) "Me" else it.displayName }.orEmpty(), members.map { (if (it.userId == me) "Me" else it.displayName) to it.userId }) { subject = it }
                }
                Picker("What was broken", broken?.label ?: "Pick a rule or protocol", options.map { it.label to it }) { broken = it }
                OutlinedButton(onClick = { picking = "on" }) { Text("When: ${on.format(dateLabel)}") }
                LettersField(note, { note = it.take(2000) }, label = { Text("Note (optional)") }, minLines = 2, modifier = Modifier.fillMaxWidth())
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

/** A filter pill: an ink border marks the chosen one. */
@Composable
private fun Pill(label: String, selected: Boolean, onClick: () -> Unit) {
    val c = MaterialTheme.colorScheme
    Text(
        label,
        style = MaterialTheme.typography.labelLarge.copy(fontSize = 15.sp),
        color = if (selected) c.onSurface else c.onSurfaceVariant,
        modifier = Modifier
            .clip(CircleShape)
            .border(1.dp, if (selected) c.onSurface else c.outlineVariant, CircleShape)
            .background(if (selected) c.surfaceContainerLowest else c.surfaceContainerLow)
            .selectable(selected = selected, role = androidx.compose.ui.semantics.Role.Tab, onClick = onClick)
            .padding(horizontal = 20.dp, vertical = 10.dp),
    )
}

/** A field-style row (label, value, hairline) that opens a menu of [options]. */
@Composable
private fun <T> Picker(label: String, value: String, options: List<Pair<String, T>>, onPick: (T) -> Unit) {
    var open by remember { mutableStateOf(false) }
    val c = MaterialTheme.colorScheme
    Column {
        Text(label, style = MaterialTheme.typography.bodySmall, color = c.onSurfaceVariant)
        Box {
            Row(Modifier.fillMaxWidth().clickable { open = true }.padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(value, Modifier.weight(1f), style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
                Icon(Icons.Outlined.ArrowDropDown, null, tint = c.onSurfaceVariant)
            }
            DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
                options.forEach { (text, v) -> DropdownMenuItem(text = { Text(text) }, onClick = { onPick(v); open = false }) }
            }
        }
        HorizontalDivider(color = c.outlineVariant)
    }
}
