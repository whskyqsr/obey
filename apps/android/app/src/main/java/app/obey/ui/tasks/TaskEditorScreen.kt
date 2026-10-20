package app.obey.ui.tasks

import app.obey.ui.common.LocalFeatures
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.FormatListNumbered
import androidx.compose.material.icons.outlined.KeyboardArrowDown
import androidx.compose.material.icons.outlined.KeyboardArrowUp
import androidx.compose.material.icons.outlined.Balance
import androidx.compose.material.icons.outlined.EventRepeat
import androidx.compose.material.icons.outlined.ExpandLess
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.Timer
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.obey.ui.common.ErrorBox
import app.obey.ui.common.Load
import app.obey.ui.common.LoadingBox
import app.obey.ui.common.MessageEffect
import app.obey.ui.common.formatDate
import app.obey.ui.notes.MarkdownField
import app.obey.ui.notes.MarkdownToolbar
import app.obey.recurrence.describe
import java.time.ZoneId
import kotlin.math.abs
import java.time.Instant
import java.time.LocalTime
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun TaskEditorScreen(onDone: () -> Unit, vm: TaskEditorViewModel = hiltViewModel()) {
    val data by vm.data.collectAsStateWithLifecycle()
    val form by vm.form.collectAsStateWithLifecycle()
    val busy by vm.busy.collectAsStateWithLifecycle()
    val message by vm.message.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    MessageEffect(message, snackbar, vm::messageShown)
    LaunchedEffect(Unit) { vm.done.collect { onDone() } }

    var pickDate by remember { mutableStateOf(false) }
    var pickTime by remember { mutableStateOf(false) }
    var pickConsequenceTime by remember { mutableStateOf(false) }
    var pickZone by remember { mutableStateOf(false) }
    // The details field keeps its own selection; it's seeded once the task has loaded.
    var details by remember { mutableStateOf(TextFieldValue("")) }
    LaunchedEffect(data is Load.Ready) {
        if (data is Load.Ready) details = TextFieldValue(form.bodyMd, TextRange(form.bodyMd.length))
    }
    val timeFmt = DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT)

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (vm.isNew) "New task" else "Edit task") },
                navigationIcon = { IconButton(onClick = onDone) { Icon(Icons.Outlined.Close, "Close") } },
                actions = {
                    Button(onClick = vm::save, enabled = !busy && data is Load.Ready, modifier = Modifier.padding(end = 8.dp)) { Text("Save") }
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        when (val d = data) {
            Load.Loading -> LoadingBox(Modifier.padding(padding))
            is Load.Failed -> ErrorBox(d.message, vm::load, Modifier.padding(padding))
            is Load.Ready -> Box(Modifier.padding(padding).fillMaxSize(), contentAlignment = Alignment.TopCenter) {
                val features = LocalFeatures.current
                Column(
                    Modifier
                        .widthIn(max = 640.dp)
                        .fillMaxWidth()
                        .verticalScroll(rememberScrollState())
                        .imePadding()
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    OutlinedTextField(
                        value = form.title,
                        onValueChange = { v -> vm.update { it.copy(title = v.take(200)) } },
                        label = { Text("Title") },
                        isError = form.title.isEmpty() && message != null,
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    // Same formatting toolbar as notes, so details aren't raw Markdown to remember.
                    Surface(
                        shape = MaterialTheme.shapes.small,
                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Column {
                            MarkdownToolbar(details, { v -> details = v; vm.update { it.copy(bodyMd = v.text) } })
                            MarkdownField(
                                details,
                                { v -> details = v; vm.update { it.copy(bodyMd = v.text) } },
                                Modifier.fillMaxWidth().heightIn(min = 96.dp).padding(16.dp),
                                placeholder = "Details: what to do, and how",
                            )
                        }
                    }

                    Spacer(Modifier.height(4.dp))

                    // Each section collapses to a sentence, so the whole task reads at a glance.
                    val assignee = d.value.members.firstOrNull { it.userId == form.assigneeId }
                    Fold(
                        Icons.Outlined.Person,
                        "For ${assignee?.displayName ?: "nobody yet"}",
                        listOf(if (form.approvalRequired) "Needs your approval" else "No approval needed", if (form.proofRequired) "proof required" else "no proof").joinToString(" · "),
                    ) {
                        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            d.value.members.forEach { m ->
                                FilterChip(
                                    selected = form.assigneeId == m.userId,
                                    onClick = { vm.update { it.copy(assigneeId = m.userId) } },
                                    label = { Text(m.displayName) },
                                )
                            }
                        }
                        LabeledSwitch("Needs approval", if (features.points) "Points post after you approve it" else "You confirm it's done", form.approvalRequired) { v ->
                            vm.update { it.copy(approvalRequired = v) }
                        }
                        LabeledSwitch("Proof required", "A photo or text must be attached", form.proofRequired) { v ->
                            vm.update { it.copy(proofRequired = v) }
                        }
                    }

                    val schedule = form.recurrence.toSchedule(form.start)
                    val at = if (form.allDay) ", all day" else " at ${form.dueTime.format(timeFmt)}"
                    val zone = zoneName(form.timezone)
                    Fold(
                        Icons.Outlined.EventRepeat,
                        (if (schedule.rule == null) "Once, ${formatDate(form.start)}" else describe(schedule)) + at,
                        listOfNotNull(
                            if (schedule.rule != null) "From ${formatDate(form.start)}" else null,
                            if (!form.allDay && form.windowMinutes != null) "opens ${windowLabel(form.windowMinutes)}" else null,
                            "$zone time",
                        ).joinToString(" · "),
                        initiallyOpen = vm.isNew,
                    ) {
                        Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                            OutlinedButton(onClick = { pickDate = true }) {
                                Icon(Icons.Outlined.CalendarMonth, null)
                                Text("  ${formatDate(form.start)}")
                            }
                            if (!form.allDay) {
                                OutlinedButton(onClick = { pickTime = true }) {
                                    Icon(Icons.Outlined.Schedule, null)
                                    Text("  ${form.dueTime.format(timeFmt)}")
                                }
                            }
                        }
                        LabeledSwitch("All day", "Due by the end of the day", form.allDay) { v -> vm.update { it.copy(allDay = v) } }
                        if (!form.allDay) {
                            Text("Can be done", style = MaterialTheme.typography.labelLarge)
                            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                (WINDOWS + listOfNotNull(form.windowMinutes)).distinct().forEach { m ->
                                    FilterChip(selected = form.windowMinutes == m, onClick = { vm.update { it.copy(windowMinutes = m) } }, label = { Text(windowLabel(m)) })
                                }
                            }
                        }
                        RecurrencePicker(form.recurrence, form.start, onChange = { r -> vm.update { it.copy(recurrence = r) } }, weekStart = vm.weekStart)
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text("Time zone", style = MaterialTheme.typography.bodyLarge)
                                Text(
                                    zone + if (form.timezone == ZoneId.systemDefault().id) " (this phone)" else "",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            TextButton(onClick = { pickZone = true }) { Text("Change") }
                        }
                    }

                    StepsFold(form.steps) { steps -> vm.update { it.copy(steps = steps) } }

                    if (features.points || features.consequences) {
                        val consequence = d.value.consequences.firstOrNull { it.id == form.consequenceId }
                        val pts = form.points.toIntOrNull() ?: 0
                        val penalty = form.missPenalty.toIntOrNull() ?: 0
                        val title = if (features.points) {
                            listOfNotNull(
                                if (pts != 0) "${if (pts > 0) "+" else "−"}${abs(pts)} if done" else "No points",
                                if (penalty != 0) "−$penalty if missed" else null,
                            ).joinToString(" · ")
                        } else {
                            consequence?.let { "Missed: ${it.title}" } ?: "No consequence"
                        }
                        val sub = listOfNotNull(
                            if (features.points && features.consequences) "Missed: ${consequence?.title ?: "nothing"}" else null,
                            if (features.consequences && consequence != null) "due ${dueDaysLabel(form.consequenceDueDays).lowercase()}" else null,
                        ).joinToString(" · ")
                        Fold(Icons.Outlined.Balance, title, sub) {
                            if (features.points) {
                                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                    NumberField("Points if done", form.points, Modifier.weight(1f)) { v -> vm.update { it.copy(points = v) } }
                                    NumberField("Lost if missed", form.missPenalty, Modifier.weight(1f)) { v -> vm.update { it.copy(missPenalty = v) } }
                                }
                            }
                            var consequenceMenu by remember { mutableStateOf(false) }
                            if (features.consequences) Box {
                                OutlinedButton(onClick = { consequenceMenu = true }, modifier = Modifier.fillMaxWidth()) {
                                    Text("If missed: ${consequence?.title ?: "no consequence"}")
                                }
                                DropdownMenu(expanded = consequenceMenu, onDismissRequest = { consequenceMenu = false }) {
                                    DropdownMenuItem(text = { Text("No consequence") }, onClick = {
                                        consequenceMenu = false
                                        vm.update { it.copy(consequenceId = null) }
                                    })
                                    d.value.consequences.forEach { c ->
                                        DropdownMenuItem(text = { Text(c.title) }, onClick = {
                                            consequenceMenu = false
                                            vm.update { it.copy(consequenceId = c.id) }
                                        })
                                    }
                                }
                            }
                            if (features.consequences && form.consequenceId != null) {
                                Text(
                                    "Handed out automatically when it's missed, due:",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    (listOf(0, 1, 2, 3, 7) + form.consequenceDueDays).distinct().sorted().forEach { n ->
                                        FilterChip(
                                            selected = form.consequenceDueDays == n,
                                            onClick = { vm.update { it.copy(consequenceDueDays = n) } },
                                            label = { Text(dueDaysLabel(n)) },
                                        )
                                    }
                                }
                                LabeledSwitch("Any time that day", null, form.consequenceDueTime == null) { v ->
                                    vm.update { it.copy(consequenceDueTime = if (v) null else LocalTime.of(21, 0)) }
                                }
                                form.consequenceDueTime?.let { t ->
                                    OutlinedButton(onClick = { pickConsequenceTime = true }) {
                                        Icon(Icons.Outlined.Schedule, null)
                                        Text("  By ${t.format(timeFmt)}")
                                    }
                                }
                            }
                        }
                    }

                    val grace = form.effectiveGrace
                    val dueMinutes = if (form.allDay) 24 * 60 else form.dueTime.hour * 60 + form.dueTime.minute
                    Fold(
                        Icons.Outlined.Timer,
                        when (form.grace) {
                            Grace.None -> "No grace period"
                            Grace.Midnight -> "Grace until midnight"
                            else -> "$grace min grace"
                        },
                        "Counts as missed ${if (grace == 0) "right at" else "at"} ${clockAfter(dueMinutes + grace, timeFmt)}",
                    ) {
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Grace.entries.filter { !(form.allDay && it == Grace.Midnight) }.forEach { g ->
                                FilterChip(
                                    selected = form.grace == g,
                                    onClick = { vm.update { it.copy(grace = g, graceMinutes = if (g == Grace.Custom && it.grace != Grace.Custom) (it.effectiveGrace.takeIf { m -> m > 0 } ?: 30).toString() else it.graceMinutes) } },
                                    label = { Text(g.label) },
                                )
                            }
                        }
                        if (form.grace == Grace.Custom) {
                            NumberField("Minutes", form.graceMinutes, Modifier.widthIn(max = 160.dp)) { v -> vm.update { it.copy(graceMinutes = v) } }
                        }
                    }
                }
            }
        }
    }

    if (pickZone) {
        var query by remember { mutableStateOf("") }
        val zones = remember { ZoneId.getAvailableZoneIds().filter { "/" in it && !it.startsWith("Etc/") }.sorted() }
        AlertDialog(
            onDismissRequest = { pickZone = false },
            title = { Text("Time zone") },
            text = {
                Column {
                    OutlinedTextField(query, { query = it }, label = { Text("Search") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    LazyColumn(Modifier.heightIn(max = 360.dp)) {
                        items(zones.filter { it.replace('_', ' ').contains(query.trim(), ignoreCase = true) }) { z ->
                            ListItem(
                                headlineContent = { Text(zoneName(z)) },
                                supportingContent = { Text(z.substringBefore('/')) },
                                modifier = Modifier.clickable {
                                    vm.update { it.copy(timezone = z) }
                                    pickZone = false
                                },
                            )
                        }
                    }
                }
            },
            confirmButton = { TextButton(onClick = { pickZone = false }) { Text("Cancel") } },
        )
    }

    if (pickDate) {
        val state = rememberDatePickerState(
            initialSelectedDateMillis = form.start.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli(),
        )
        DatePickerDialog(
            onDismissRequest = { pickDate = false },
            confirmButton = {
                TextButton(onClick = {
                    state.selectedDateMillis?.let { ms ->
                        val date = Instant.ofEpochMilli(ms).atZone(ZoneOffset.UTC).toLocalDate()
                        vm.update { it.copy(start = date) }
                    }
                    pickDate = false
                }) { Text("OK") }
            },
            dismissButton = { TextButton(onClick = { pickDate = false }) { Text("Cancel") } },
        ) { DatePicker(state = state) }
    }

    if (pickTime) {
        val state = rememberTimePickerState(initialHour = form.dueTime.hour, initialMinute = form.dueTime.minute)
        AlertDialog(
            onDismissRequest = { pickTime = false },
            title = { Text("Due time") },
            text = { TimePicker(state = state) },
            confirmButton = {
                Button(onClick = {
                    vm.update { it.copy(dueTime = LocalTime.of(state.hour, state.minute)) }
                    pickTime = false
                }) { Text("OK") }
            },
            dismissButton = { TextButton(onClick = { pickTime = false }) { Text("Cancel") } },
        )
    }

    if (pickConsequenceTime) {
        val state = rememberTimePickerState(initialHour = form.consequenceDueTime?.hour ?: 21, initialMinute = form.consequenceDueTime?.minute ?: 0)
        AlertDialog(
            onDismissRequest = { pickConsequenceTime = false },
            title = { Text("Consequence due by") },
            text = { TimePicker(state = state) },
            confirmButton = {
                Button(onClick = {
                    vm.update { it.copy(consequenceDueTime = LocalTime.of(state.hour, state.minute)) }
                    pickConsequenceTime = false
                }) { Text("OK") }
            },
            dismissButton = { TextButton(onClick = { pickConsequenceTime = false }) { Text("Cancel") } },
        )
    }
}

private fun dueDaysLabel(n: Int) = when (n) {
    0 -> "Same day"
    1 -> "Next day"
    else -> "$n days later"
}

@Composable
fun LabeledSwitch(title: String, subtitle: String?, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyLarge)
            if (subtitle != null) {
                Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        Switch(checked = checked, onCheckedChange = onChange)
    }
}

@Composable
fun NumberField(label: String, value: String, modifier: Modifier = Modifier, onChange: (String) -> Unit) {
    OutlinedTextField(
        value = value,
        onValueChange = { v -> if (v.isEmpty() || v == "-" || v.matches(Regex("-?\\d{0,6}"))) onChange(v) },
        label = { Text(label) },
        isError = value.toIntOrNull() == null,
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
        modifier = modifier,
    )
}

/** "America/New_York" → "New York". */
private val WINDOWS = listOf<Int?>(null, 15, 30, 60, 120, 240)

private fun windowLabel(m: Int?) = when {
    m == null -> "Any time"
    m < 60 -> "$m min before"
    m == 60 -> "1 hour before"
    else -> "${m / 60} hours before"
}

/** A ritual's steps: done in order, one at a time, from the run sheet. A task with none is an ordinary task. */
@Composable
private fun StepsFold(steps: List<app.obey.api.TaskStep>, onChange: (List<app.obey.api.TaskStep>) -> Unit) {
    var draft by rememberSaveable { mutableStateOf("") }
    fun add() {
        val title = draft.trim()
        if (title.isEmpty() || steps.size >= 30) return
        onChange(steps + app.obey.api.TaskStep(java.util.UUID.randomUUID().toString().take(8), title))
        draft = ""
    }
    val named = steps.filter { it.title.isNotBlank() }
    Fold(
        Icons.Outlined.FormatListNumbered,
        if (named.isEmpty()) "No steps" else "Ritual: ${named.size} step${if (named.size == 1) "" else "s"}",
        if (named.isEmpty()) "Add steps to make it a routine done in order" else named.joinToString(" → ") { it.title.trim() },
    ) {
        steps.forEachIndexed { i, s ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("${i + 1}", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.widthIn(min = 20.dp))
                OutlinedTextField(
                    value = s.title,
                    onValueChange = { v -> onChange(steps.map { if (it.id == s.id) it.copy(title = v.take(200)) else it }) },
                    singleLine = true,
                    modifier = Modifier.weight(1f),
                )
                IconButton(onClick = { onChange(steps.toMutableList().apply { add(i - 1, removeAt(i)) }) }, enabled = i > 0) {
                    Icon(Icons.Outlined.KeyboardArrowUp, "Move step ${i + 1} up")
                }
                IconButton(onClick = { onChange(steps.toMutableList().apply { add(i + 1, removeAt(i)) }) }, enabled = i < steps.lastIndex) {
                    Icon(Icons.Outlined.KeyboardArrowDown, "Move step ${i + 1} down")
                }
                IconButton(onClick = { onChange(steps.filter { it.id != s.id }) }) { Icon(Icons.Outlined.Close, "Remove step ${i + 1}") }
            }
        }
        if (steps.size < 30) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = draft,
                    onValueChange = { draft = it.take(200) },
                    label = { Text("Add a step") },
                    singleLine = true,
                    keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(imeAction = androidx.compose.ui.text.input.ImeAction.Done),
                    keyboardActions = androidx.compose.foundation.text.KeyboardActions(onDone = { add() }),
                    modifier = Modifier.weight(1f),
                )
                FilledTonalButton(onClick = { add() }, enabled = draft.isNotBlank()) { Text("Add") }
            }
        }
        if (steps.isNotEmpty()) {
            Text(
                "They're done one at a time from Start, and the task is finished when the last one is.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

private fun zoneName(id: String) = id.substringAfterLast('/').replace('_', ' ')

/** "9:15 PM", "midnight", or a time "the next day" once it passes midnight. */
private fun clockAfter(minutes: Int, fmt: DateTimeFormatter): String {
    if (minutes == 24 * 60) return "midnight"
    val t = LocalTime.of((minutes / 60) % 24, minutes % 60).format(fmt)
    return if (minutes > 24 * 60) "$t the next day" else t
}

/** A section that collapses to a one-line summary of what's in it. */
@Composable
private fun Fold(
    icon: ImageVector,
    title: String,
    summary: String,
    initiallyOpen: Boolean = false,
    content: @Composable ColumnScope.() -> Unit,
) {
    var open by rememberSaveable { mutableStateOf(initiallyOpen) }
    Surface(color = MaterialTheme.colorScheme.surfaceContainerLow, shape = MaterialTheme.shapes.large, modifier = Modifier.fillMaxWidth()) {
        Column {
            Row(
                Modifier
                    .fillMaxWidth()
                    .clickable(onClickLabel = if (open) "Collapse" else "Expand") { open = !open }
                    .padding(horizontal = 16.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                Icon(icon, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                Column(Modifier.weight(1f)) {
                    Text(title, style = MaterialTheme.typography.bodyLarge)
                    if (summary.isNotEmpty()) {
                        Text(summary, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                Icon(if (open) Icons.Outlined.ExpandLess else Icons.Outlined.ExpandMore, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            AnimatedVisibility(open) {
                Column(Modifier.padding(start = 16.dp, end = 16.dp, bottom = 16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) { content() }
            }
        }
    }
}
