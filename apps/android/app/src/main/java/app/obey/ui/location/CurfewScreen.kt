package app.obey.ui.location

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.AddLocationAlt
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import app.obey.api.Consequence
import app.obey.api.Curfew
import app.obey.api.CurfewInput
import app.obey.api.ObeyApi
import app.obey.api.Role
import app.obey.data.Session
import app.obey.data.SessionRepository
import app.obey.ui.common.BaseViewModel
import app.obey.ui.common.EmptyBox
import app.obey.ui.common.MessageEffect
import app.obey.ui.tasks.NumberField
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.LocalTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** "22:00" as "10:00 PM". */
fun clockLabel(hhmm: String): String = runCatching { LocalTime.parse(hhmm).format(DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT)) }.getOrDefault(hhmm)

/** "Home by 10:00 PM, in until 6:00 AM", or with weekends "Sun–Thu by 10:00 PM, Fri–Sat by 12:00 AM, in until 6:00 AM". */
fun describeCurfew(c: CurfewInput): String {
    val by = c.weekendTime?.let { "Sun–Thu by ${clockLabel(c.time)}, Fri–Sat by ${clockLabel(it)}" } ?: "Home by ${clockLabel(c.time)}"
    return "$by, in until ${clockLabel(c.until)}"
}

/** A sub's curfew settings: a Dominant sets it; the sub sees what it is. */
@HiltViewModel
class CurfewViewModel @Inject constructor(private val api: ObeyApi, private val sessions: SessionRepository) : BaseViewModel() {
    val session: Session? get() = sessions.session
    private val relId: String? get() = sessions.session?.relationship?.id

    private val _curfew = MutableStateFlow<Curfew?>(null)
    val curfew: StateFlow<Curfew?> = _curfew.asStateFlow()

    private val _consequences = MutableStateFlow<List<Consequence>>(emptyList())
    val consequences: StateFlow<List<Consequence>> = _consequences.asStateFlow()

    init {
        load()
    }

    fun load() {
        val id = relId ?: return
        viewModelScope.launch {
            runCatching { api.curfew(id) }.onSuccess { _curfew.value = it }.onFailure { say(it.message ?: "Couldn't load curfew") }
            if (sessions.session?.canManage == true && sessions.session?.relationship?.features?.consequences == true) {
                _consequences.value = runCatching { api.consequences(id) }.getOrDefault(emptyList())
            }
        }
    }

    fun save(input: CurfewInput) = action {
        val was = _curfew.value?.settings?.enabled == true
        _curfew.value = api.saveCurfew(relId!!, input)
        say(if (!input.enabled) "Curfew is off" else if (was) "Curfew saved" else "Curfew is on")
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CurfewScreen(onBack: () -> Unit, onPlaces: () -> Unit, vm: CurfewViewModel = hiltViewModel(), places: LocationViewModel = hiltViewModel()) {
    val curfew by vm.curfew.collectAsStateWithLifecycle()
    val placeList by places.places.collectAsStateWithLifecycle()
    val consequences by vm.consequences.collectAsStateWithLifecycle()
    val busy by vm.busy.collectAsStateWithLifecycle()
    val message by vm.message.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    MessageEffect(message, snackbar, vm::messageShown)
    val session = vm.session
    val canEdit = session?.canManage == true
    val subs = session?.partners.orEmpty().filter { it.role != Role.Dominant }
    var form by remember { mutableStateOf<CurfewInput?>(null) }
    var picking by remember { mutableStateOf<String?>(null) } // "time" | "weekend" | "until"

    LaunchedEffect(curfew, placeList) {
        val c = curfew ?: return@LaunchedEffect
        val list = placeList ?: return@LaunchedEffect
        if (form != null) return@LaunchedEffect
        val home = list.firstOrNull { it.name.contains("home", ignoreCase = true) } ?: list.firstOrNull()
        form = c.settings ?: CurfewInput(
            enabled = false,
            assigneeId = subs.firstOrNull()?.userId ?: "",
            placeId = home?.id ?: "",
            time = "22:00",
            until = "06:00",
            timezone = ZoneId.systemDefault().id,
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Curfew") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Back") } },
            )
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        Box(Modifier.padding(padding).fillMaxSize(), contentAlignment = Alignment.TopCenter) {
            Column(
                Modifier.widthIn(max = 640.dp).fillMaxWidth().verticalScroll(rememberScrollState()).padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                val f = form ?: return@Column
                val saved = curfew?.settings
                val who = session?.nameOf(f.assigneeId) ?: "They"
                val mine = f.assigneeId == session?.userId
                if (!canEdit) {
                    if (saved?.enabled == true) {
                        CurfewCard {
                            Text(describeCurfew(saved), style = MaterialTheme.typography.bodyLarge)
                            Text(
                                "At ${placeList?.firstOrNull { it.id == saved.placeId }?.name ?: "Home"}. Leaving before then breaks curfew. Late or left early, it counts like a missed task.",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    } else {
                        EmptyBox("No curfew", "A Dominant can set one here.")
                    }
                    return@Column
                }
                if (placeList.isNullOrEmpty()) {
                    EmptyBox("Add Home first", "Curfew checks that they're at a place. Save their home in Places, then come back.")
                    FilledTonalButton(onClick = onPlaces, modifier = Modifier.align(Alignment.CenterHorizontally)) {
                        Icon(Icons.Outlined.AddLocationAlt, null, Modifier.size(18.dp))
                        Text("Go to Places", Modifier.padding(start = 8.dp))
                    }
                    return@Column
                }

                Surface(color = MaterialTheme.colorScheme.surfaceContainerLow, shape = MaterialTheme.shapes.large) {
                    ListItem(
                        modifier = Modifier.clickable {
                            val next = f.copy(enabled = !f.enabled)
                            form = next
                            if (!next.enabled && saved?.enabled == true) vm.save(next)
                        },
                        colors = ListItemDefaults.colors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
                        headlineContent = { Text("Curfew") },
                        supportingContent = { Text("${if (mine) "You're" else "$who is"} home by a set time and stays in until morning") },
                        trailingContent = {
                            Switch(checked = f.enabled, onCheckedChange = { on ->
                                val next = f.copy(enabled = on)
                                form = next
                                if (!on && saved?.enabled == true) vm.save(next)
                            })
                        },
                    )
                }

                if (f.enabled) {
                    CurfewCard {
                        if (subs.size > 1) {
                            Picker("Who", session?.nameOf(f.assigneeId) ?: "", subs.map { it.userId to it.displayName }) { form = f.copy(assigneeId = it) }
                        }
                        SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                            SegmentedButton(
                                selected = f.weekendTime == null,
                                onClick = { form = f.copy(weekendTime = null) },
                                shape = SegmentedButtonDefaults.itemShape(0, 2),
                            ) { Text("Every night", maxLines = 1) }
                            SegmentedButton(
                                selected = f.weekendTime != null,
                                onClick = { form = f.copy(weekendTime = f.weekendTime ?: saved?.weekendTime ?: "00:00") },
                                shape = SegmentedButtonDefaults.itemShape(1, 2),
                            ) { Text("Weekends differ", maxLines = 1, overflow = TextOverflow.Ellipsis) }
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            TimeButton(if (f.weekendTime != null) "Sun–Thu, home by" else "Home by", f.time, Modifier.weight(1f)) { picking = "time" }
                            f.weekendTime?.let { TimeButton("Fri–Sat, home by", it, Modifier.weight(1f)) { picking = "weekend" } }
                        }
                        TimeButton("Stay in until", f.until, Modifier.fillMaxWidth()) { picking = "until" }
                        Hint("Leaving home before then breaks curfew.")
                        val list = placeList.orEmpty()
                        Picker("Home", list.firstOrNull { it.id == f.placeId }?.name ?: "Choose a place", list.map { it.id to listOfNotNull(it.name, it.address).joinToString(" · ") }) {
                            form = f.copy(placeId = it)
                        }
                        Hint(if (mine) "Your phone checks this. Without location, you tap \"I'm home\"." else "$who's phone checks this. Without location, $who taps \"I'm home\".")
                        if (!mine) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Column(Modifier.weight(1f)) {
                                    Text("$who tells you they're home", style = MaterialTheme.typography.bodyLarge)
                                    Text(
                                        "Getting home puts \"Tell ${session?.me?.user?.displayName ?: "you"} I'm home\" in front of $who, with room for a line. Their phone still checks curfew; this is them reporting in.",
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                                Switch(checked = f.reportHome, onCheckedChange = { form = f.copy(reportHome = it) })
                            }
                        }
                    }

                    val features = session?.relationship?.features
                    if (features != null && (features.points || features.consequences)) {
                        CurfewCard {
                            Text("If it's broken", style = MaterialTheme.typography.titleMedium)
                            if (features.points) {
                                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                    NumberField("Points for keeping it", f.points.toString(), Modifier.weight(1f)) { v -> form = f.copy(points = v.toIntOrNull()?.coerceAtLeast(0) ?: 0) }
                                    NumberField("Points lost for breaking it", f.missPenalty.toString(), Modifier.weight(1f)) { v -> form = f.copy(missPenalty = v.toIntOrNull()?.coerceAtLeast(0) ?: 0) }
                                }
                            }
                            if (features.consequences) {
                                Picker(
                                    "Consequence",
                                    consequences.firstOrNull { it.id == f.consequenceId }?.title ?: "None",
                                    listOf<Pair<String?, String>>(null to "None") + consequences.map { it.id to it.title },
                                ) { form = f.copy(consequenceId = it) }
                            }
                            Hint("Late or left early, it counts like a missed task. You can excuse a night.")
                        }
                    }
                }

                val dirty = saved != f && (f.enabled || saved?.enabled == true)
                if (dirty && f.enabled) {
                    Button(onClick = { vm.save(f) }, enabled = !busy && f.placeId.isNotEmpty() && f.assigneeId.isNotEmpty()) {
                        Icon(Icons.Outlined.Check, null, Modifier.size(18.dp))
                        Text(if (saved?.enabled == true) "Save" else "Turn on curfew", Modifier.padding(start = 8.dp))
                    }
                }
                if (subs.isEmpty()) Hint("Curfew is for a submissive in this dynamic; invite them first.")
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Icon(Icons.Outlined.Info, null, Modifier.size(18.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(
                        "Nights don't show as tasks. Today shows curfew from an hour before, and plans that run past it.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }

    picking?.let { which ->
        val f = form ?: return@let
        val current = LocalTime.parse(when (which) { "weekend" -> f.weekendTime ?: "00:00"; "until" -> f.until; else -> f.time })
        val state = rememberTimePickerState(initialHour = current.hour, initialMinute = current.minute)
        AlertDialog(
            onDismissRequest = { picking = null },
            title = { Text(if (which == "until") "Stay in until" else "Home by") },
            text = { TimePicker(state = state) },
            confirmButton = {
                Button(onClick = {
                    val t = LocalTime.of(state.hour, state.minute).toString()
                    form = when (which) {
                        "weekend" -> f.copy(weekendTime = t)
                        "until" -> f.copy(until = t)
                        else -> f.copy(time = t)
                    }
                    picking = null
                }) { Text("OK") }
            },
            dismissButton = { TextButton(onClick = { picking = null }) { Text("Cancel") } },
        )
    }
}

@Composable
private fun CurfewCard(content: @Composable () -> Unit) {
    Surface(color = MaterialTheme.colorScheme.surfaceContainerLow, shape = MaterialTheme.shapes.large) {
        Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) { content() }
    }
}

@Composable
private fun Hint(text: String) {
    Text(text, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
}

@Composable
private fun TimeButton(label: String, hhmm: String, modifier: Modifier, onClick: () -> Unit) {
    OutlinedButton(onClick = onClick, modifier = modifier) {
        Column(Modifier.fillMaxWidth()) {
            Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(clockLabel(hhmm), style = MaterialTheme.typography.titleMedium)
        }
    }
}

@Composable
private fun <T> Picker(label: String, current: String, options: List<Pair<T, String>>, onPick: (T) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box {
        OutlinedButton(onClick = { open = true }, modifier = Modifier.fillMaxWidth()) {
            Column(Modifier.fillMaxWidth()) {
                Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(current, style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            options.forEach { (value, text) ->
                DropdownMenuItem(text = { Text(text) }, onClick = {
                    open = false
                    onPick(value)
                })
            }
        }
    }
}
