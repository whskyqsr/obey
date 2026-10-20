package app.obey.ui.tasks

import app.obey.ui.common.LocalFeatures
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
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
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.obey.ui.common.ErrorBox
import app.obey.ui.common.Load
import app.obey.ui.common.LoadingBox
import app.obey.ui.common.MessageEffect
import app.obey.ui.common.SectionHeader
import app.obey.ui.common.formatDate
import java.time.Instant
import java.time.LocalTime
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TaskEditorScreen(onDone: () -> Unit, vm: TaskEditorViewModel = hiltViewModel()) {
    val data by vm.data.collectAsStateWithLifecycle()
    val form by vm.form.collectAsStateWithLifecycle()
    val busy by vm.busy.collectAsStateWithLifecycle()
    val history by vm.history.collectAsStateWithLifecycle()
    val message by vm.message.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    MessageEffect(message, snackbar, vm::messageShown)
    LaunchedEffect(Unit) { vm.done.collect { onDone() } }

    var pickDate by remember { mutableStateOf(false) }
    var pickTime by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (vm.isNew) "New task" else "Edit task") },
                navigationIcon = { IconButton(onClick = onDone) { Icon(Icons.Outlined.Close, "Close") } },
                actions = {
                    if (!vm.isNew) IconButton(onClick = { confirmDelete = true }) { Icon(Icons.Outlined.Delete, "Delete") }
                    TextButton(onClick = vm::save, enabled = !busy && data is Load.Ready) { Text("Save") }
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        when (val d = data) {
            Load.Loading -> LoadingBox(Modifier.padding(padding))
            is Load.Failed -> ErrorBox(d.message, vm::load, Modifier.padding(padding))
            is Load.Ready -> Box(Modifier.padding(padding).fillMaxSize(), contentAlignment = Alignment.TopCenter) {
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
                    OutlinedTextField(
                        value = form.bodyMd,
                        onValueChange = { v -> vm.update { it.copy(bodyMd = v) } },
                        label = { Text("Details (optional)") },
                        minLines = 2,
                        modifier = Modifier.fillMaxWidth(),
                    )

                    Text("For", style = MaterialTheme.typography.labelLarge)
                    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        d.value.members.forEach { m ->
                            FilterChip(
                                selected = form.assigneeId == m.userId,
                                onClick = { vm.update { it.copy(assigneeId = m.userId) } },
                                label = { Text(m.displayName) },
                            )
                        }
                    }

                    SectionHeader("When", horizontalPadding = 0.dp)
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                        OutlinedButton(onClick = { pickDate = true }) {
                            Icon(Icons.Outlined.CalendarMonth, null)
                            Text("  ${formatDate(form.start)}")
                        }
                        if (!form.allDay) {
                            OutlinedButton(onClick = { pickTime = true }) {
                                Icon(Icons.Outlined.Schedule, null)
                                Text("  ${form.dueTime.format(DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT))}")
                            }
                        }
                    }
                    LabeledSwitch("All day", "Due by the end of the day", form.allDay) { v -> vm.update { it.copy(allDay = v) } }

                    SectionHeader("Repeat", horizontalPadding = 0.dp)
                    RecurrencePicker(form.recurrence, form.start, onChange = { r -> vm.update { it.copy(recurrence = r) } })

                    val features = LocalFeatures.current
                    SectionHeader(
                        when {
                            features.points && features.consequences -> "Points and consequences"
                            features.points -> "Points"
                            features.consequences -> "If it's missed"
                            else -> "Timing"
                        },
                        horizontalPadding = 0.dp,
                    )
                    if (features.points) {
                        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            NumberField("Points", form.points, Modifier.weight(1f)) { v -> vm.update { it.copy(points = v) } }
                            NumberField("Penalty if missed", form.missPenalty, Modifier.weight(1f)) { v -> vm.update { it.copy(missPenalty = v) } }
                        }
                    }
                    NumberField("Grace period (minutes)", form.graceMinutes, Modifier.fillMaxWidth()) { v -> vm.update { it.copy(graceMinutes = v) } }

                    var consequenceMenu by remember { mutableStateOf(false) }
                    if (features.consequences) Box {
                        val current = d.value.consequences.firstOrNull { it.id == form.consequenceId }
                        OutlinedButton(onClick = { consequenceMenu = true }, modifier = Modifier.fillMaxWidth()) {
                            Text("If missed: ${current?.title ?: "no consequence"}")
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

                    HorizontalDivider(Modifier.padding(vertical = 4.dp))
                    LabeledSwitch("Needs approval", if (features.points) "Points post after you approve it" else "You confirm it's done", form.approvalRequired) { v ->
                        vm.update { it.copy(approvalRequired = v) }
                    }
                    LabeledSwitch("Proof required", "A photo or text must be attached", form.proofRequired) { v ->
                        vm.update { it.copy(proofRequired = v) }
                    }

                    if (!vm.isNew) TaskHistorySection(history, vm::editHistory)
                }
            }
        }
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

    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            title = { Text("Delete this task?") },
            text = { Text(if (LocalFeatures.current.points) "Future occurrences are removed. Points already earned stay in the ledger." else "Future occurrences are removed. Its history stays.") },
            confirmButton = { Button(onClick = { confirmDelete = false; vm.delete() }) { Text("Delete") } },
            dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text("Cancel") } },
        )
    }
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
