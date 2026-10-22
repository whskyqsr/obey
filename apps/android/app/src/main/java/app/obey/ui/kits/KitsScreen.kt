package app.obey.ui.kits

import android.content.Intent
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
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
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.BookmarkAdd
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.ContentCopy
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.Download
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.FavoriteBorder
import androidx.compose.material.icons.outlined.Gavel
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.Link
import androidx.compose.material.icons.outlined.LinkOff
import androidx.compose.material.icons.outlined.MoreVert
import androidx.compose.material.icons.outlined.Redeem
import androidx.compose.material.icons.outlined.Report
import androidx.compose.material.icons.outlined.Share
import androidx.compose.material.icons.outlined.TaskAlt
import androidx.compose.material.icons.outlined.WbSunny
import androidx.compose.material.icons.outlined.Widgets
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import app.obey.BuildConfig
import app.obey.api.ApplyKitInput
import app.obey.api.ApplyKitResult
import app.obey.api.Consequence
import app.obey.api.Features
import app.obey.api.Frequency
import app.obey.api.Kit
import app.obey.api.KitInput
import app.obey.api.KitItem
import app.obey.api.KitPatch
import app.obey.api.ObeyApi
import app.obey.api.Protocol
import app.obey.api.Reward
import app.obey.api.Role
import app.obey.api.Rule
import app.obey.api.Schedule
import app.obey.api.SharedKit
import app.obey.api.StarterKit
import app.obey.api.Task
import app.obey.api.Weekday
import app.obey.data.Session
import app.obey.data.SessionRepository
import app.obey.recurrence.describe
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
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import javax.inject.Inject
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** Where a kit's items come from when adding them: a starter kit or one of your own (by id), or a shared code. */
sealed interface KitSource {
    data class Saved(val id: String) : KitSource
    data class Shared(val code: String) : KitSource
}

/** What this dynamic has, to pick a new kit from. */
data class KitLibrary(val tasks: List<Task>, val rules: List<Rule>, val protocols: List<Protocol>, val rewards: List<Reward>, val consequences: List<Consequence>)

/**
 * Kits: the starter catalog and your own, saved from a dynamic and shareable by a code. One view model for the
 * list, a kit, a new kit and a shared kit; each screen loads what it needs.
 */
@HiltViewModel
class KitsViewModel @Inject constructor(private val api: ObeyApi, private val sessions: SessionRepository) : BaseViewModel() {
    private val _state = MutableStateFlow<Load<List<StarterKit>>>(Load.Loading)
    val state: StateFlow<Load<List<StarterKit>>> = _state.asStateFlow()
    private val _mine = MutableStateFlow<Load<List<Kit>>>(Load.Loading)
    val mine: StateFlow<Load<List<Kit>>> = _mine.asStateFlow()
    private val _shared = MutableStateFlow<Load<SharedKit>>(Load.Loading)
    val shared: StateFlow<Load<SharedKit>> = _shared.asStateFlow()
    private val _library = MutableStateFlow<Load<KitLibrary>>(Load.Loading)
    val library: StateFlow<Load<KitLibrary>> = _library.asStateFlow()
    private val _added = MutableStateFlow<ApplyKitResult?>(null)
    /** Set once a kit is added, so the screen can move on to what was added. */
    val added: StateFlow<ApplyKitResult?> = _added.asStateFlow()
    private val _opened = MutableStateFlow<String?>(null)
    /** A kit just saved or copied: the screen opens it. */
    val opened: StateFlow<String?> = _opened.asStateFlow()
    private val _deleted = MutableStateFlow(false)
    val deleted: StateFlow<Boolean> = _deleted.asStateFlow()
    val session: Session? get() = sessions.session

    init { refresh() }

    fun refresh() {
        viewModelScope.launch {
            _state.value = Load.Loading
            _state.value = loadCatching { api.kits() }
        }
        refreshMine()
    }

    private fun refreshMine() {
        viewModelScope.launch { _mine.value = loadCatching { api.myKits() } }
    }

    fun loadShared(code: String) {
        viewModelScope.launch {
            _shared.value = Load.Loading
            _shared.value = loadCatching { api.sharedKit(code) }
        }
    }

    fun loadLibrary() {
        viewModelScope.launch {
            val rel = sessions.requireRelationshipId()
            val f = session?.relationship?.features ?: Features()
            _library.value = loadCatching {
                coroutineScope {
                    val tasks = async { api.tasks(rel) }
                    val rules = async { if (f.rules) api.rules(rel) else emptyList() }
                    val protocols = async { if (f.protocols) api.protocols(rel) else emptyList() }
                    val rewards = async { if (f.points) api.rewards(rel) else emptyList() }
                    val consequences = async { if (f.consequences) api.consequences(rel) else emptyList() }
                    KitLibrary(tasks.await().filter { it.active && it.assignedConsequenceId == null }, rules.await(), protocols.await(), rewards.await(), consequences.await())
                }
            }
        }
    }

    fun apply(source: KitSource, items: List<String>, assigneeId: String?) = action {
        val rel = sessions.requireRelationshipId()
        val body = ApplyKitInput(items = items, assigneeId = assigneeId, timezone = ZoneId.systemDefault().id, start = LocalDate.now().toString())
        _added.value = when (source) {
            is KitSource.Saved -> api.applyKit(rel, source.id, body)
            is KitSource.Shared -> api.applySharedKit(rel, source.code, body)
        }
    }

    fun save(input: KitInput) = action {
        _opened.value = api.saveKit(sessions.requireRelationshipId(), input).id
    }

    fun update(kit: Kit, title: String, description: String, keep: List<String>) = action {
        api.updateKit(kit.id, KitPatch(title, description, keep))
        refreshMine()
    }

    fun delete(kit: Kit) = action {
        api.deleteKit(kit.id)
        _deleted.value = true
    }

    fun share(kit: Kit, on: Boolean) = action {
        if (on) api.shareKit(kit.id) else api.unshareKit(kit.id)
        refreshMine()
    }

    fun copy(code: String) = action {
        _opened.value = api.copySharedKit(code).id
    }

    fun openedShown() {
        _opened.value = null
    }
}

fun kitIcon(name: String): ImageVector = when (name) {
    "wb_sunny" -> Icons.Outlined.WbSunny
    "favorite" -> Icons.Outlined.FavoriteBorder
    "home" -> Icons.Outlined.Home
    "gavel" -> Icons.Outlined.Gavel
    else -> Icons.Outlined.Widgets
}

private fun kindIcon(kind: String): ImageVector = when (kind) {
    "task" -> Icons.Outlined.TaskAlt
    "rule" -> Icons.Outlined.Gavel
    "protocol" -> Icons.Outlined.Description
    "reward" -> Icons.Outlined.Redeem
    else -> Icons.Outlined.Report
}

private fun plural(n: Int, word: String) = "$n $word${if (n == 1) "" else "s"}"
private val WEEKDAYS = listOf(Weekday.MO, Weekday.TU, Weekday.WE, Weekday.TH, Weekday.FR)
private val ORDER = listOf("task", "rule", "protocol", "reward", "consequence")
private fun sorted(items: List<KitItem>) = items.sortedBy { ORDER.indexOf(it.kind) }

/** "3 tasks, 2 rules, 1 consequence" */
private fun counts(items: List<KitItem>) =
    ORDER.mapNotNull { k -> items.count { it.kind == k }.takeIf { it > 0 }?.let { plural(it, k) } }.joinToString(", ")

private fun clock(time: String) = runCatching { LocalTime.parse(time).format(DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT)) }.getOrDefault(time)

/** "Every day by 9:00 PM · 5 points · photo proof · Write lines if missed"; rules, rewards and the rest say what they are. */
fun KitItem.summary(all: List<KitItem> = emptyList()): String {
    fun title(key: String?) = all.firstOrNull { it.key == key }?.title
    return when (kind) {
        "rule" -> all.count { it.ruleKey == key }.let { if (it > 0) "Rule · with ${plural(it, "protocol")}" else "Rule" }
        "protocol" -> title(ruleKey)?.let { "Protocol for “$it”" } ?: "Protocol"
        "reward" -> "Reward · ${plural(cost ?: 0, "point")}"
        "consequence" -> "Consequence"
        else -> {
            val r = repeat
            val whenText = when {
                r == null -> "Once"
                r.freq == Frequency.Daily && (r.interval ?: 1) == 1 -> "Every day"
                r.freq == Frequency.Weekly && (r.interval ?: 1) == 1 && r.byWeekday?.toSet() == WEEKDAYS.toSet() -> "Weekdays"
                else -> describe(Schedule(start = LocalDate.now().toString(), rule = r, anchor = anchor))
            }
            listOfNotNull(
                dueTime?.let { "$whenText by ${clock(it)}" } ?: whenText,
                points?.takeIf { it != 0 }?.let { plural(it, "point") },
                if (proofRequired == true) "photo proof" else null,
                steps?.takeIf { it.isNotEmpty() }?.let { plural(it.size, "step") },
                title(consequenceKey)?.let { "$it if missed" },
            ).joinToString(" · ")
        }
    }
}

/** Only what this dynamic has switched on; a task whose reward or consequence is off still comes, without it. */
private fun usableItems(items: List<KitItem>, f: Features) = items.filter {
    when (it.kind) {
        "task" -> true
        "rule" -> f.rules
        "protocol" -> f.protocols
        "reward" -> f.points
        else -> f.consequences
    }
}

/** The starter kits and items this dynamic can use. */
@Composable
internal fun usable(kits: List<StarterKit>): List<StarterKit> {
    val features = LocalFeatures.current
    return kits.map { k -> k.copy(items = usableItems(k.items, features)) }.filter { it.items.isNotEmpty() }
}

private fun kitLink(code: String) = "${BuildConfig.WEB_URL.trimEnd('/')}/kit/$code"
private fun dashed(code: String) = "${code.take(3)}-${code.drop(3)}"

/** A share link or its code: `…/kit/7KQM2P`, `7KQ-M2P` or `7kqm2p`. */
fun shareCodeFrom(text: String): String? =
    Regex("""(?:/kit/)?([A-Za-z0-9]{3}-?[A-Za-z0-9]{3})/?\s*$""").find(text.trim())?.groupValues?.get(1)?.replace("-", "")?.uppercase()

@Composable
private fun KitCard(icon: ImageVector, title: String, description: String, items: List<KitItem>, shared: Boolean, onClick: () -> Unit) {
    val colors = MaterialTheme.colorScheme
    val titles = items.map { if (it.kind == "reward") "Reward: ${it.title}" else it.title }
    ElevatedCard(onClick = onClick, modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp).fillMaxWidth()) {
        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.Top) {
            Surface(color = colors.secondaryContainer, shape = MaterialTheme.shapes.large, modifier = Modifier.size(48.dp)) {
                Box(contentAlignment = Alignment.Center) { Icon(icon, null, tint = colors.onSecondaryContainer) }
            }
            Spacer(Modifier.width(16.dp))
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(title, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f, fill = false))
                    if (shared) {
                        Spacer(Modifier.width(8.dp))
                        Surface(color = colors.tertiaryContainer, shape = MaterialTheme.shapes.extraSmall) {
                            Row(Modifier.padding(horizontal = 8.dp, vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Outlined.Link, null, Modifier.size(14.dp), tint = colors.onTertiaryContainer)
                                Spacer(Modifier.width(4.dp))
                                Text("Shared", style = MaterialTheme.typography.labelMedium, color = colors.onTertiaryContainer)
                            }
                        }
                    }
                }
                if (description.isNotBlank()) Text(description, style = MaterialTheme.typography.bodyMedium, color = colors.onSurfaceVariant)
                Spacer(Modifier.height(8.dp))
                Text(
                    titles.take(4).joinToString(" · ") + if (titles.size > 4) " · ${titles.size - 4} more" else "",
                    style = MaterialTheme.typography.labelMedium,
                    color = colors.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun SectionLabel(text: String) {
    Text(text, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(start = 20.dp, end = 16.dp, top = 16.dp, bottom = 4.dp))
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun KitsScreen(
    onBack: () -> Unit,
    onAdded: (ApplyKitResult) -> Unit,
    onOpenKit: (String) -> Unit,
    onNewKit: () -> Unit,
    onOpenShared: (String) -> Unit,
    vm: KitsViewModel = hiltViewModel(),
) {
    val state by vm.state.collectAsStateWithLifecycle()
    val mine by vm.mine.collectAsStateWithLifecycle()
    val added by vm.added.collectAsStateWithLifecycle()
    val message by vm.message.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    MessageEffect(message, snackbar, vm::messageShown)
    LaunchedEffect(added) { added?.let(onAdded) }
    var open by remember { mutableStateOf<StarterKit?>(null) }
    var adding by remember { mutableStateOf(false) }
    val colors = MaterialTheme.colorScheme

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Kits") },
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
                val own = (mine as? Load.Ready)?.value.orEmpty()
                LazyColumn(Modifier.padding(padding).fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp)) {
                    item(key = "intro") {
                        Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            Text("Sets of tasks, rules and rewards you can add to any dynamic.", style = MaterialTheme.typography.bodyMedium, color = colors.onSurfaceVariant)
                            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Button(onClick = onNewKit) { Icon(Icons.Outlined.Add, null); Text("  New kit") }
                                OutlinedButton(onClick = { adding = true }) { Icon(Icons.Outlined.Download, null); Text("  Add from a link") }
                            }
                        }
                    }
                    if (own.isNotEmpty()) {
                        item(key = "mine") { SectionLabel("Your kits") }
                        items(own, key = { it.id }) { k -> KitCard(Icons.Outlined.Widgets, k.title, k.description, k.items, k.shareCode != null) { onOpenKit(k.id) } }
                    }
                    item(key = "starter") { SectionLabel("Starter kits") }
                    items(kits, key = { it.id }) { k -> KitCard(kitIcon(k.icon), k.title, k.description, k.items, false) { open = k } }
                }
            }
        }
    }

    open?.let { k ->
        vm.session?.let { session ->
            KitSheet(k.title, k.description, k.items, session, onDismiss = { open = null }, onAdd = { items, who -> vm.apply(KitSource.Saved(k.id), items, who); open = null })
        }
    }
    if (adding) AddByCodeDialog(onDismiss = { adding = false }, onOpen = { adding = false; onOpenShared(it) })
}

@Composable
private fun AddByCodeDialog(onDismiss: () -> Unit, onOpen: (String) -> Unit) {
    var text by rememberSaveable { mutableStateOf("") }
    val code = shareCodeFrom(text)
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add a shared kit") },
        text = {
            OutlinedTextField(
                value = text,
                onValueChange = { text = it.take(200) },
                label = { Text("Link or code") },
                supportingText = { Text("Ask whoever shared it for the link or the 6-letter code.") },
                singleLine = true,
            )
        },
        confirmButton = { TextButton(enabled = code != null, onClick = { code?.let(onOpen) }) { Text("Open") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun KitSheet(title: String, description: String, kitItems: List<KitItem>, session: Session, onDismiss: () -> Unit, onAdd: (List<String>, String?) -> Unit) {
    val me = session.userId
    val items = usableItems(kitItems, LocalFeatures.current)
    val people = session.partners.sortedBy { if (it.role == Role.Submissive) 0 else 1 } + session.relationship?.members.orEmpty().filter { it.userId == me }
    var picked by remember { mutableStateOf(items.map { it.key }.toSet()) }
    var assignee by remember { mutableStateOf(people.firstOrNull()?.userId ?: me) }
    var choosing by remember { mutableStateOf(false) }
    val chosen = items.filter { it.key in picked }
    val hasTasks = chosen.any { it.kind == "task" }
    val colors = MaterialTheme.colorScheme

    fun toggle(i: KitItem, on: Boolean) {
        val n = picked.toMutableSet()
        if (on) n += i.key else n -= i.key
        // A protocol goes with the rule it spells out; a task with its reward and consequence.
        if (!on) items.filter { i.key in listOf(it.ruleKey, it.consequenceKey, it.rewardKey) }.forEach { n -= it.key }
        if (on) listOfNotNull(i.ruleKey, i.consequenceKey, i.rewardKey).filter { k -> items.any { it.key == k } }.forEach { n += it }
        picked = n
    }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(Modifier.padding(horizontal = 24.dp).navigationBarsPadding().verticalScroll(rememberScrollState())) {
            Text(title, style = MaterialTheme.typography.headlineSmall)
            Spacer(Modifier.height(8.dp))
            Text("${if (description.isNotBlank()) "$description " else ""}Untick anything you don't want.", style = MaterialTheme.typography.bodyMedium, color = colors.onSurfaceVariant)
            Spacer(Modifier.height(8.dp))
            items.forEach { i ->
                Row(Modifier.fillMaxWidth().clickable { toggle(i, i.key !in picked) }.padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(checked = i.key in picked, onCheckedChange = { toggle(i, it) })
                    Spacer(Modifier.width(8.dp))
                    Column {
                        Text(i.title, style = MaterialTheme.typography.bodyLarge)
                        Text(i.summary(items), style = MaterialTheme.typography.bodySmall, color = colors.onSurfaceVariant)
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

/** A kit's items, one row each. */
@Composable
private fun ItemList(items: List<KitItem>) {
    val colors = MaterialTheme.colorScheme
    Surface(color = colors.surfaceContainerLow, shape = MaterialTheme.shapes.large, modifier = Modifier.padding(horizontal = 16.dp).fillMaxWidth()) {
        Column {
            items.forEachIndexed { n, i ->
                if (n > 0) HorizontalDivider(color = colors.surfaceContainerHighest)
                Row(Modifier.padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(kindIcon(i.kind), null, tint = colors.onSurfaceVariant)
                    Spacer(Modifier.width(16.dp))
                    Column(Modifier.weight(1f)) {
                        Text(i.title, style = MaterialTheme.typography.bodyLarge)
                        Text(i.summary(items), style = MaterialTheme.typography.bodyMedium, color = colors.onSurfaceVariant)
                    }
                }
            }
        }
    }
}

/** One of your own kits: add it, share it, edit or delete it. */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun KitScreen(kitId: String, onBack: () -> Unit, onAdded: (ApplyKitResult) -> Unit, vm: KitsViewModel = hiltViewModel()) {
    val mine by vm.mine.collectAsStateWithLifecycle()
    val added by vm.added.collectAsStateWithLifecycle()
    val deleted by vm.deleted.collectAsStateWithLifecycle()
    val busy by vm.busy.collectAsStateWithLifecycle()
    val message by vm.message.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    MessageEffect(message, snackbar, vm::messageShown)
    LaunchedEffect(added) { added?.let(onAdded) }
    LaunchedEffect(deleted) { if (deleted) onBack() }
    var dialog by remember { mutableStateOf<String?>(null) }
    var menu by remember { mutableStateOf(false) }
    val colors = MaterialTheme.colorScheme
    val kit = (mine as? Load.Ready)?.value?.firstOrNull { it.id == kitId }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(kit?.title ?: "Kit") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Back") } },
                actions = {
                    if (kit != null) {
                        Box {
                            IconButton(onClick = { menu = true }) { Icon(Icons.Outlined.MoreVert, "More options") }
                            DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                                DropdownMenuItem(text = { Text("Edit") }, leadingIcon = { Icon(Icons.Outlined.Edit, null) }, onClick = { menu = false; dialog = "edit" })
                                DropdownMenuItem(
                                    text = { Text("Delete", color = colors.error) },
                                    leadingIcon = { Icon(Icons.Outlined.Delete, null, tint = colors.error) },
                                    onClick = { menu = false; dialog = "delete" },
                                )
                            }
                        }
                    }
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        when (val s = mine) {
            Load.Loading -> LoadingBox(Modifier.padding(padding))
            is Load.Failed -> ErrorBox(s.message, vm::refresh, Modifier.padding(padding))
            is Load.Ready -> if (kit == null) {
                Text("This kit was deleted.", Modifier.padding(padding).padding(16.dp), color = colors.onSurfaceVariant)
            } else {
                val items = sorted(kit.items)
                Column(Modifier.padding(padding).fillMaxSize().verticalScroll(rememberScrollState()).padding(bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(kit.description.ifBlank { counts(items) }, style = MaterialTheme.typography.bodyMedium, color = colors.onSurfaceVariant, modifier = Modifier.padding(horizontal = 16.dp))
                    FlowRow(Modifier.padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(onClick = { dialog = "add" }) { Icon(Icons.Outlined.Add, null); Text("  Add to this dynamic") }
                        FilledTonalButton(onClick = { dialog = "share" }) { Icon(Icons.Outlined.Share, null); Text("  Share") }
                    }
                    ItemList(items)
                    val saved = runCatching { OffsetDateTime.parse(kit.createdAt).toLocalDate().format(DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM)) }.getOrNull()
                    Text(
                        listOfNotNull(saved?.let { "Saved $it." }, "Only you see your kits. It's a copy: changing a task later doesn't change the kit.").joinToString(" "),
                        style = MaterialTheme.typography.bodySmall,
                        color = colors.onSurfaceVariant,
                        modifier = Modifier.padding(horizontal = 16.dp),
                    )
                }
            }
        }
    }

    if (kit != null) when (dialog) {
        "add" -> vm.session?.let { session ->
            KitSheet(kit.title, kit.description, kit.items, session, onDismiss = { dialog = null }, onAdd = { items, who -> vm.apply(KitSource.Saved(kit.id), items, who); dialog = null })
        }
        "share" -> ShareSheet(kit, busy, onShare = { vm.share(kit, it) }, onDismiss = { dialog = null })
        "edit" -> EditKitDialog(kit, onDismiss = { dialog = null }, onSave = { t, d, keep -> vm.update(kit, t, d, keep); dialog = null })
        "delete" -> AlertDialog(
            onDismissRequest = { dialog = null },
            title = { Text("Delete “${kit.title}”?") },
            confirmButton = { TextButton(onClick = { dialog = null; vm.delete(kit) }) { Text("Delete") } },
            dismissButton = { TextButton(onClick = { dialog = null }) { Text("Cancel") } },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ShareSheet(kit: Kit, busy: Boolean, onShare: (Boolean) -> Unit, onDismiss: () -> Unit) {
    val colors = MaterialTheme.colorScheme
    val clipboard = LocalClipboardManager.current
    val context = LocalContext.current
    val code = kit.shareCode
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(Modifier.padding(horizontal = 24.dp).navigationBarsPadding().padding(bottom = 16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Text("Share “${kit.title}”", style = MaterialTheme.typography.headlineSmall)
            Text(
                "Anyone with the link can see this kit and save a copy. They don't see your name, your dynamic, or who the tasks were for.",
                style = MaterialTheme.typography.bodyMedium,
                color = colors.onSurfaceVariant,
            )
            if (code == null) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End)) {
                    TextButton(onClick = onDismiss) { Text("Cancel") }
                    Button(enabled = !busy, onClick = { onShare(true) }) { Text("Create link") }
                }
            } else {
                val link = kitLink(code)
                OutlinedCard(onClick = { clipboard.setText(AnnotatedString(link)) }, modifier = Modifier.fillMaxWidth()) {
                    Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(link.removePrefix("https://"), style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
                        Icon(Icons.Outlined.ContentCopy, "Copy link", tint = colors.primary)
                    }
                }
                Text(
                    "Or give them the code ${dashed(code)} to enter under “Add from a link”.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = colors.onSurfaceVariant,
                )
                Text(
                    "Changes you make to the kit show up for anyone who opens the link later. Copies already saved stay as they were.",
                    style = MaterialTheme.typography.bodySmall,
                    color = colors.onSurfaceVariant,
                )
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    TextButton(enabled = !busy, onClick = { onShare(false); onDismiss() }) {
                        Icon(Icons.Outlined.LinkOff, null, tint = colors.error)
                        Text("  Stop sharing", color = colors.error)
                    }
                    Spacer(Modifier.weight(1f))
                    Button(onClick = {
                        val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, link)
                        context.startActivity(Intent.createChooser(send, "Share kit link"))
                    }) { Icon(Icons.Outlined.Share, null); Text("  Send link") }
                }
            }
        }
    }
}

@Composable
private fun EditKitDialog(kit: Kit, onDismiss: () -> Unit, onSave: (String, String, List<String>) -> Unit) {
    var title by rememberSaveable { mutableStateOf(kit.title) }
    var description by rememberSaveable { mutableStateOf(kit.description) }
    var keep by remember { mutableStateOf(kit.items.map { it.key }.toSet()) }
    val items = sorted(kit.items)
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Edit kit") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(title, { title = it.take(60) }, label = { Text("Name") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(description, { description = it.take(200) }, label = { Text("Description (optional)") }, modifier = Modifier.fillMaxWidth())
                Text("Untick anything to take out of the kit.", style = MaterialTheme.typography.bodyMedium)
                items.forEach { i ->
                    Row(Modifier.fillMaxWidth().clickable { keep = if (i.key in keep) keep - i.key else keep + i.key }, verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(checked = i.key in keep, onCheckedChange = { keep = if (it) keep + i.key else keep - i.key })
                        Text(i.title, style = MaterialTheme.typography.bodyLarge)
                    }
                }
            }
        },
        confirmButton = { TextButton(enabled = title.isNotBlank() && keep.isNotEmpty(), onClick = { onSave(title.trim(), description.trim(), keep.toList()) }) { Text("Save") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

/** Pick from what this dynamic already has; the kit is a copy. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NewKitScreen(onBack: () -> Unit, onSaved: (String) -> Unit, vm: KitsViewModel = hiltViewModel()) {
    val library by vm.library.collectAsStateWithLifecycle()
    val opened by vm.opened.collectAsStateWithLifecycle()
    val busy by vm.busy.collectAsStateWithLifecycle()
    val message by vm.message.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    MessageEffect(message, snackbar, vm::messageShown)
    LaunchedEffect(Unit) { vm.loadLibrary() }
    LaunchedEffect(opened) { opened?.let { vm.openedShown(); onSaved(it) } }
    var title by rememberSaveable { mutableStateOf("") }
    var description by rememberSaveable { mutableStateOf("") }
    var picked by remember { mutableStateOf(setOf<String>()) }
    val colors = MaterialTheme.colorScheme
    val lib = (library as? Load.Ready)?.value

    // What comes along without being ticked: a task's reward and consequence, a rule's protocols.
    val along = buildMap {
        lib?.tasks?.filter { it.id in picked }?.forEach { t ->
            t.consequenceId?.let { put(it, "Comes with ${t.title}") }
            t.rewardId?.let { put(it, "Comes with ${t.title}") }
        }
        lib?.protocols?.filter { it.ruleId != null && it.ruleId in picked }?.forEach { put(it.id, "Comes with its rule") }
    }
    val total = (picked + along.keys).size

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("New kit") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.Outlined.Close, "Close") } },
                actions = {
                    Button(
                        enabled = !busy && title.isNotBlank() && total > 0 && lib != null,
                        onClick = save@{
                            val l = lib ?: return@save
                            fun ids(list: List<String>) = list.filter { it in picked }
                            vm.save(
                                KitInput(
                                    title = title.trim(),
                                    description = description.trim(),
                                    tasks = ids(l.tasks.map { it.id }),
                                    rules = ids(l.rules.map { it.id }),
                                    protocols = ids(l.protocols.map { it.id }),
                                    rewards = ids(l.rewards.map { it.id }),
                                    consequences = ids(l.consequences.map { it.id }),
                                ),
                            )
                        },
                        modifier = Modifier.padding(end = 8.dp),
                    ) { Text("Save") }
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        when (val s = library) {
            Load.Loading -> LoadingBox(Modifier.padding(padding))
            is Load.Failed -> ErrorBox(s.message, vm::loadLibrary, Modifier.padding(padding))
            is Load.Ready -> {
                val l = s.value
                @Composable
                fun row(id: String, headline: String, supporting: String, tie: String? = null) {
                    val forced = along[id]
                    val on = id in picked || forced != null
                    Row(
                        Modifier.fillMaxWidth().clickable(enabled = forced == null) { picked = if (id in picked) picked - id else picked + id }.padding(vertical = 4.dp),
                        verticalAlignment = Alignment.Top,
                    ) {
                        Checkbox(checked = on, enabled = forced == null, onCheckedChange = { picked = if (it) picked + id else picked - id })
                        Spacer(Modifier.width(8.dp))
                        Column(Modifier.padding(top = 10.dp)) {
                            Text(headline, style = MaterialTheme.typography.bodyLarge)
                            Text(forced ?: supporting, style = MaterialTheme.typography.bodySmall, color = colors.onSurfaceVariant)
                            if (tie != null && id in picked) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(Icons.Outlined.Link, null, Modifier.size(16.dp), tint = colors.onSurfaceVariant)
                                    Text(" $tie", style = MaterialTheme.typography.bodySmall, color = colors.onSurfaceVariant)
                                }
                            }
                        }
                    }
                }
                @Composable
                fun group(label: String, show: Boolean, content: @Composable () -> Unit) {
                    if (!show) return
                    Text(label.uppercase(), style = MaterialTheme.typography.labelMedium, color = colors.onSurfaceVariant, modifier = Modifier.padding(top = 16.dp))
                    content()
                }
                Column(Modifier.padding(padding).fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp).padding(bottom = 24.dp)) {
                    OutlinedTextField(title, { title = it.take(60) }, label = { Text("Name") }, placeholder = { Text("Weeknight routine") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    Spacer(Modifier.height(8.dp))
                    OutlinedTextField(description, { description = it.take(200) }, label = { Text("Description (optional)") }, modifier = Modifier.fillMaxWidth())
                    Spacer(Modifier.height(12.dp))
                    Text("Pick what goes in. The kit is a copy: changing a task later doesn't change the kit.", style = MaterialTheme.typography.bodyMedium, color = colors.onSurfaceVariant)
                    group("Tasks", l.tasks.isNotEmpty()) {
                        l.tasks.forEach { t ->
                            row(
                                t.id,
                                t.title,
                                listOfNotNull(t.summary, t.dueTime?.let { "by ${clock(it)}" }, if (t.placeId != null) "its place isn't copied" else null).joinToString(" · "),
                                t.consequenceId?.let { c -> "Brings its consequence: ${l.consequences.firstOrNull { it.id == c }?.title ?: "the consequence"}" },
                            )
                        }
                    }
                    group("Rules", l.rules.isNotEmpty()) {
                        l.rules.forEach { r ->
                            val n = l.protocols.count { it.ruleId == r.id }
                            row(r.id, r.title, if (n > 0) "Rule · with ${plural(n, "protocol")}" else "Rule")
                        }
                    }
                    group("Protocols", l.protocols.isNotEmpty()) { l.protocols.forEach { row(it.id, it.title, "Protocol") } }
                    group("Rewards", l.rewards.isNotEmpty()) { l.rewards.forEach { row(it.id, it.title, plural(it.cost, "point")) } }
                    group("Consequences", l.consequences.isNotEmpty()) { l.consequences.forEach { row(it.id, it.title, "Consequence") } }
                    Spacer(Modifier.height(16.dp))
                    Row {
                        Icon(Icons.Outlined.Info, null, Modifier.size(18.dp), tint = colors.onSurfaceVariant)
                        Spacer(Modifier.width(8.dp))
                        Text(
                            "Kits keep titles, descriptions, schedules, points, steps and proof settings. They never include who a task is for, places, photos, comments or history.",
                            style = MaterialTheme.typography.bodySmall,
                            color = colors.onSurfaceVariant,
                        )
                    }
                }
            }
        }
    }
}

/** A kit someone shared: save a copy, or add it straight to this dynamic. */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun SharedKitScreen(code: String, onBack: () -> Unit, onAdded: (ApplyKitResult) -> Unit, onSaved: (String) -> Unit, vm: KitsViewModel = hiltViewModel()) {
    val shared by vm.shared.collectAsStateWithLifecycle()
    val added by vm.added.collectAsStateWithLifecycle()
    val opened by vm.opened.collectAsStateWithLifecycle()
    val busy by vm.busy.collectAsStateWithLifecycle()
    val message by vm.message.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    MessageEffect(message, snackbar, vm::messageShown)
    LaunchedEffect(code) { vm.loadShared(code) }
    LaunchedEffect(added) { added?.let(onAdded) }
    LaunchedEffect(opened) { opened?.let { vm.openedShown(); onSaved(it) } }
    var adding by remember { mutableStateOf(false) }
    val colors = MaterialTheme.colorScheme

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text((shared as? Load.Ready)?.value?.title ?: "Shared kit") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Back") } },
            )
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        when (val s = shared) {
            Load.Loading -> LoadingBox(Modifier.padding(padding))
            is Load.Failed -> Column(Modifier.padding(padding).padding(24.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Icon(Icons.Outlined.LinkOff, null, tint = colors.onSurfaceVariant)
                Text("This kit isn't shared any more", style = MaterialTheme.typography.titleMedium)
                Text("Ask whoever sent it for a new link.", style = MaterialTheme.typography.bodyMedium, color = colors.onSurfaceVariant)
            }
            is Load.Ready -> {
                val kit = s.value
                val items = sorted(kit.items)
                Column(Modifier.padding(padding).fillMaxSize().verticalScroll(rememberScrollState()).padding(bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("A shared kit · ${counts(items)}", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium, color = colors.onSurfaceVariant, modifier = Modifier.padding(horizontal = 16.dp))
                    if (kit.description.isNotBlank()) Text(kit.description, style = MaterialTheme.typography.bodyMedium, color = colors.onSurfaceVariant, modifier = Modifier.padding(horizontal = 16.dp))
                    ItemList(items)
                    FlowRow(Modifier.padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(enabled = !busy, onClick = { vm.copy(code) }) { Icon(Icons.Outlined.BookmarkAdd, null); Text("  Save to your kits") }
                        FilledTonalButton(onClick = { adding = true }) { Text("Add to this dynamic") }
                    }
                }
                if (adding) vm.session?.let { session ->
                    KitSheet(kit.title, kit.description, kit.items, session, onDismiss = { adding = false }, onAdd = { picked, who -> vm.apply(KitSource.Shared(code), picked, who); adding = false })
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
    return "Added " + listOfNotNull(n(tasks, "task"), n(rules, "rule"), n(protocols, "protocol"), n(rewards, "reward"), n(consequences, "consequence")).joinToString(", ")
}
