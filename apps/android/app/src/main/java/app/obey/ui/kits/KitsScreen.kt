package app.obey.ui.kits

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.FavoriteBorder
import androidx.compose.material.icons.outlined.Gavel
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.WbSunny
import androidx.compose.material.icons.outlined.Widgets
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import app.obey.api.ApplyKitInput
import app.obey.api.ApplyKitResult
import app.obey.api.KitItem
import app.obey.api.ObeyApi
import app.obey.api.Role
import app.obey.api.StarterKit
import app.obey.data.Session
import app.obey.data.SessionRepository
import app.obey.ui.common.BaseViewModel
import app.obey.ui.common.ErrorBox
import app.obey.ui.common.Load
import app.obey.ui.common.LoadingBox
import app.obey.ui.common.LocalFeatures
import app.obey.ui.common.MessageEffect
import app.obey.ui.common.loadCatching
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** Starter kits: ready-made tasks, rules and protocols a Dominant picks from; everything stays editable afterwards. */
@HiltViewModel
class KitsViewModel @Inject constructor(private val api: ObeyApi, private val sessions: SessionRepository) : BaseViewModel() {
    private val _state = MutableStateFlow<Load<List<StarterKit>>>(Load.Loading)
    val state: StateFlow<Load<List<StarterKit>>> = _state.asStateFlow()
    private val _added = MutableStateFlow<ApplyKitResult?>(null)
    /** Set once a kit is added, so the screen can move on to what was added. */
    val added: StateFlow<ApplyKitResult?> = _added.asStateFlow()
    val session: Session? get() = sessions.session

    init { refresh() }

    fun refresh() {
        viewModelScope.launch {
            _state.value = Load.Loading
            _state.value = loadCatching { api.kits() }
        }
    }

    fun apply(kit: StarterKit, items: List<String>, assigneeId: String?) = action {
        _added.value = api.applyKit(
            sessions.requireRelationshipId(),
            kit.id,
            ApplyKitInput(items = items, assigneeId = assigneeId, timezone = ZoneId.systemDefault().id, start = LocalDate.now().toString()),
        )
    }
}

fun kitIcon(name: String): ImageVector = when (name) {
    "wb_sunny" -> Icons.Outlined.WbSunny
    "favorite" -> Icons.Outlined.FavoriteBorder
    "home" -> Icons.Outlined.Home
    "gavel" -> Icons.Outlined.Gavel
    else -> Icons.Outlined.Widgets
}

private val DAYS = mapOf("MO" to "Mondays", "TU" to "Tuesdays", "WE" to "Wednesdays", "TH" to "Thursdays", "FR" to "Fridays", "SA" to "Saturdays", "SU" to "Sundays")

/** "Daily at 9:00 AM", "Every 2 days at 7:00 PM", "Sundays at 6:00 PM"; rules and protocols say what they are. */
fun KitItem.summary(): String {
    if (kind == "rule") return "Rule"
    if (kind == "protocol") return "Protocol"
    val r = repeat ?: return "Task"
    val n = r.interval ?: 1
    val unit = if (r.freq == "daily") "days" else "weeks"
    val whenText = r.byWeekday?.joinToString(", ") { DAYS[it] ?: it }
        ?: if (n > 1) "Every $n $unit" else if (r.freq == "daily") "Daily" else "Weekly"
    val at = dueTime?.let { runCatching { LocalTime.parse(it).format(DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT)) }.getOrNull() }
    return if (at != null) "$whenText at $at" else whenText
}

/** The kits and items this dynamic can use: rules and protocols only when those features are on. */
@Composable
private fun usable(kits: List<StarterKit>): List<StarterKit> {
    val features = LocalFeatures.current
    return kits.map { k -> k.copy(items = k.items.filter { it.kind == "task" || (if (it.kind == "rule") features.rules else features.protocols) }) }
        .filter { it.items.isNotEmpty() }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun KitsScreen(onBack: () -> Unit, onAdded: (ApplyKitResult) -> Unit, vm: KitsViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    val added by vm.added.collectAsStateWithLifecycle()
    val message by vm.message.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    MessageEffect(message, snackbar, vm::messageShown)
    LaunchedEffect(added) { added?.let(onAdded) }
    var open by remember { mutableStateOf<StarterKit?>(null) }
    val colors = MaterialTheme.colorScheme

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Starter kits") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Back") } },
            )
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        when (val s = state) {
            Load.Loading -> LoadingBox(Modifier.padding(padding))
            is Load.Failed -> ErrorBox(s.message, vm::refresh, Modifier.padding(padding))
            is Load.Ready -> {
                val kits = usable(s.value)
                LazyColumn(Modifier.padding(padding).fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp)) {
                    item(key = "intro") {
                        Text(
                            "Pick a set to start from. You choose what to add, and can edit anything afterwards.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = colors.onSurfaceVariant,
                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                        )
                    }
                    items(kits, key = { it.id }) { k ->
                        ElevatedCard(onClick = { open = k }, modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp).fillMaxWidth()) {
                            Row(Modifier.padding(16.dp), verticalAlignment = Alignment.Top) {
                                Surface(color = colors.secondaryContainer, shape = MaterialTheme.shapes.large, modifier = Modifier.size(48.dp)) {
                                    Box(contentAlignment = Alignment.Center) { Icon(kitIcon(k.icon), null, tint = colors.onSecondaryContainer) }
                                }
                                Spacer(Modifier.width(16.dp))
                                Column(Modifier.weight(1f)) {
                                    Text(k.title, style = MaterialTheme.typography.titleMedium)
                                    Text(k.description, style = MaterialTheme.typography.bodyMedium, color = colors.onSurfaceVariant)
                                    Spacer(Modifier.height(8.dp))
                                    Text(k.items.joinToString(" · ") { it.title }, style = MaterialTheme.typography.labelMedium, color = colors.onSurfaceVariant)
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    open?.let { k -> vm.session?.let { session -> KitSheet(k, session, onDismiss = { open = null }, onAdd = { items, who -> vm.apply(k, items, who); open = null }) } }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun KitSheet(kit: StarterKit, session: Session, onDismiss: () -> Unit, onAdd: (List<String>, String?) -> Unit) {
    val me = session.userId
    val people = session.partners.sortedBy { if (it.role == Role.Submissive) 0 else 1 } + session.relationship?.members.orEmpty().filter { it.userId == me }
    var picked by remember { mutableStateOf(kit.items.map { it.key }.toSet()) }
    var assignee by remember { mutableStateOf(people.firstOrNull()?.userId ?: me) }
    var choosing by remember { mutableStateOf(false) }
    val chosen = kit.items.filter { it.key in picked }
    val hasTasks = chosen.any { it.kind == "task" }
    val colors = MaterialTheme.colorScheme

    fun toggle(i: KitItem, on: Boolean) {
        val n = picked.toMutableSet()
        if (on) n += i.key else n -= i.key
        // A protocol goes with the rule it spells out.
        if (!on) kit.items.filter { it.ruleKey == i.key }.forEach { n -= it.key }
        if (on) i.ruleKey?.let { n += it }
        picked = n
    }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(Modifier.padding(horizontal = 24.dp).navigationBarsPadding().verticalScroll(rememberScrollState())) {
            Text(kit.title, style = MaterialTheme.typography.headlineSmall)
            Spacer(Modifier.height(8.dp))
            Text("${kit.description} Untick anything you don't want.", style = MaterialTheme.typography.bodyMedium, color = colors.onSurfaceVariant)
            Spacer(Modifier.height(8.dp))
            kit.items.forEach { i ->
                Row(Modifier.fillMaxWidth().clickable { toggle(i, i.key !in picked) }.padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(checked = i.key in picked, onCheckedChange = { toggle(i, it) })
                    Spacer(Modifier.width(8.dp))
                    Column {
                        Text(i.title, style = MaterialTheme.typography.bodyLarge)
                        Text(i.summary(), style = MaterialTheme.typography.bodySmall, color = colors.onSurfaceVariant)
                    }
                }
            }
            if (hasTasks) {
                Spacer(Modifier.height(12.dp))
                Box {
                    val label = people.firstOrNull { it.userId == assignee }?.let { if (it.userId == me) "Me" else it.displayName } ?: "Me"
                    OutlinedButton(onClick = { choosing = true }, modifier = Modifier.fillMaxWidth()) { Text("Tasks are for: $label") }
                    DropdownMenu(expanded = choosing, onDismissRequest = { choosing = false }) {
                        people.forEach { p ->
                            DropdownMenuItem(text = { Text(if (p.userId == me) "Me" else p.displayName) }, onClick = { assignee = p.userId; choosing = false })
                        }
                    }
                }
                if (session.partners.isEmpty()) {
                    Spacer(Modifier.height(8.dp))
                    Text("Your partner hasn't joined yet, so tasks would be yours. You can reassign them later.", style = MaterialTheme.typography.bodySmall, color = colors.onSurfaceVariant)
                }
            }
            Row(Modifier.fillMaxWidth().padding(vertical = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End)) {
                TextButton(onClick = onDismiss) { Text("Cancel") }
                Button(enabled = chosen.isNotEmpty(), onClick = { onAdd(chosen.map { it.key }, if (hasTasks) assignee else null) }) {
                    Text(if (chosen.isEmpty()) "Add" else "Add ${chosen.size}")
                }
            }
        }
    }
}

/** Shown to a Dominant with no tasks yet: a quick way into the kits. */
@Composable
fun KitPrompt(onBrowse: () -> Unit, modifier: Modifier = Modifier) {
    val colors = MaterialTheme.colorScheme
    OutlinedCard(modifier.padding(horizontal = 16.dp, vertical = 8.dp).fillMaxWidth()) {
        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Outlined.Widgets, null, tint = colors.primary)
            Spacer(Modifier.width(16.dp))
            Column(Modifier.weight(1f)) {
                Text("Start from a kit", style = MaterialTheme.typography.titleMedium)
                Text("Ready-made daily tasks and rules you can pick from and edit.", style = MaterialTheme.typography.bodyMedium, color = colors.onSurfaceVariant)
            }
            Spacer(Modifier.width(8.dp))
            FilledTonalButton(onClick = onBrowse) { Text("Browse") }
        }
    }
}

/** "Added 3 tasks, 1 rule" for the snackbar after a kit is added. */
fun ApplyKitResult.describe(): String {
    fun n(count: Int, word: String) = if (count == 0) null else "$count $word${if (count == 1) "" else "s"}"
    return "Added " + listOfNotNull(n(tasks, "task"), n(rules, "rule"), n(protocols, "protocol")).joinToString(", ")
}
