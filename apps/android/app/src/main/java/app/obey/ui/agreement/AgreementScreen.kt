package app.obey.ui.agreement

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material.icons.automirrored.outlined.Notes
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Block
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.EditCalendar
import androidx.compose.material.icons.outlined.EditNote
import androidx.compose.material.icons.outlined.EventRepeat
import androidx.compose.material.icons.outlined.FactCheck
import androidx.compose.material.icons.outlined.FavoriteBorder
import androidx.compose.material.icons.outlined.Gavel
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.outlined.HourglassTop
import androidx.compose.material.icons.outlined.Key
import androidx.compose.material.icons.outlined.MoreVert
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.PublishedWithChanges
import androidx.compose.material.icons.outlined.RemoveCircleOutline
import androidx.compose.material.icons.outlined.Handshake
import androidx.compose.material.icons.outlined.Tune
import androidx.compose.material.icons.outlined.UnfoldMore
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
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
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.navigation.toRoute
import app.obey.api.Agreement
import app.obey.api.AgreementFeedbackInput
import app.obey.api.AgreementInput
import app.obey.api.AgreementLine
import app.obey.api.AgreementSection
import app.obey.api.AgreementSectionInput
import app.obey.api.AgreementVersion
import app.obey.api.AgreementVersionSummary
import app.obey.api.ObeyApi
import app.obey.data.Session
import app.obey.data.SessionRepository
import app.obey.ui.AgreementRoute
import app.obey.ui.common.BaseViewModel
import app.obey.ui.common.ErrorBox
import app.obey.ui.common.Load
import app.obey.ui.common.LoadingBox
import app.obey.ui.common.LocalFeatures
import app.obey.ui.common.MenuButton
import app.obey.ui.common.MessageEffect
import app.obey.ui.common.SafeWordAction
import app.obey.ui.common.SettingsAction
import app.obey.ui.common.loadCatching
import app.obey.ui.common.local
import app.obey.ui.common.parseInstant
import app.obey.ui.today.Sheet
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.UUID
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

private val longDate = DateTimeFormatter.ofPattern("MMM d, yyyy")
private val shortDate = DateTimeFormatter.ofPattern("MMM d")

private fun dayOf(iso: String): LocalDate = parseInstant(iso).local().toLocalDate()

/** "today", "yesterday", "Oct 12", or "Oct 12, 2025" in another year. */
private fun relDay(iso: String): String {
    val d = dayOf(iso)
    val t = LocalDate.now()
    return when (d) {
        t -> "today"
        t.minusDays(1) -> "yesterday"
        else -> d.format(if (d.year == t.year) shortDate else longDate)
    }
}

/** A signature's date: "Today" or "Oct 12, 2026". */
private fun signedDay(iso: String): String = dayOf(iso).let { if (it == LocalDate.now()) "Today" else it.format(longDate) }

/** A plain YYYY-MM-DD date as "Jan 12, 2027". */
private fun plainDate(date: String): String = runCatching { LocalDate.parse(date).format(longDate) }.getOrDefault(date)

private fun plural(n: Int, one: String, many: String = one + "s") = "$n ${if (n == 1) one else many}"

private val OPEN = setOf("proposed", "changes_requested")

/** The agreed version a version is compared against: the latest one numbered before it. */
private fun previousAgreed(a: Agreement, number: Int): Int? =
    a.versions.filter { it.number < number && (it.status == "agreed" || it.status == "superseded") }.maxOfOrNull { it.number }

/** The number the next proposal gets: the open one's, or one past the newest. */
private fun nextNumber(a: Agreement): Int = a.proposal?.number ?: ((a.versions.maxOfOrNull { it.number } ?: 0) + 1)

/** Everyone in the dynamic but you, for "Send to Kitten". */
private fun othersOf(session: Session): String = session.partners.joinToString(" and ") { it.displayName }.ifEmpty { "your partner" }

/** Who in the dynamic hasn't agreed to [v] yet. */
private fun waitingFor(v: AgreementVersion, session: Session): String =
    session.relationship?.members.orEmpty().filter { m -> v.agreements.none { it.userId == m.userId } }.joinToString(" and ") { it.displayName }.ifEmpty { "everyone" }

private fun proposer(v: AgreementVersion, session: Session): String = v.proposedBy?.let { session.nameOf(it) } ?: "A former member"

@HiltViewModel
class AgreementViewModel @Inject constructor(private val api: ObeyApi, private val sessions: SessionRepository, savedState: SavedStateHandle) : BaseViewModel() {
    val session get() = sessions.session
    private val route = savedState.toRoute<AgreementRoute>()
    private var startHandled = false

    /** What Today asked to open, once: "edit", "review" or null. */
    fun takeStart(): String? {
        if (startHandled) return null
        startHandled = true
        return if (route.edit) "edit" else if (route.review) "review" else null
    }

    private val _state = MutableStateFlow<Load<Agreement>>(Load.Loading)
    val state: StateFlow<Load<Agreement>> = _state.asStateFlow()

    /** A version opened from the list; null when none is. */
    private val _version = MutableStateFlow<Load<AgreementVersion>?>(null)
    val version: StateFlow<Load<AgreementVersion>?> = _version.asStateFlow()
    private var versionId: String? = null

    /** How many rules and protocols there are now, for the editor's "The current list from Rules, 4 rules". */
    private val _counts = MutableStateFlow<Pair<Int?, Int?>>(null to null)
    val counts: StateFlow<Pair<Int?, Int?>> = _counts.asStateFlow()

    fun load() {
        val rel = sessions.requireRelationshipId()
        viewModelScope.launch { _state.value = loadCatching { api.agreement(rel) } }
    }

    fun openVersion(id: String) {
        versionId = id
        _version.value = Load.Loading
        viewModelScope.launch {
            val result = loadCatching { api.agreementVersion(id) }
            if (versionId == id) _version.value = result
        }
    }

    fun retryVersion() {
        versionId?.let { openVersion(it) }
    }

    fun closeVersion() {
        versionId = null
        _version.value = null
    }

    fun loadCounts() {
        val rel = sessions.requireRelationshipId()
        val f = sessions.session?.relationship?.features
        viewModelScope.launch {
            val rules = if (f?.rules == true) runCatching { api.rules(rel).size }.getOrNull() else null
            val protocols = if (f?.protocols == true) runCatching { api.protocols(rel).size }.getOrNull() else null
            _counts.value = rules to protocols
        }
    }

    fun template(onReady: (List<AgreementSectionInput>) -> Unit) = action {
        onReady(api.agreementTemplate(sessions.requireRelationshipId()).sections)
    }

    fun propose(input: AgreementInput, done: () -> Unit) = action {
        val v = api.proposeAgreement(sessions.requireRelationshipId(), input)
        say(if (v.status == "agreed") "Version ${v.number} is in force" else "Sent to ${sessions.session?.let { othersOf(it) } ?: "your partner"}")
        done()
        load()
    }

    fun agree(v: AgreementVersion, done: () -> Unit) = action {
        val r = api.agreeToAgreement(v.id)
        say(if (r.status == "agreed") "Version ${r.number} is in force" else "You agreed to version ${r.number}")
        done()
        load()
    }

    fun requestChanges(v: AgreementVersion, note: String, done: () -> Unit) = action {
        api.requestAgreementChanges(v.id, AgreementFeedbackInput(note.trim()))
        say("${sessions.session?.let { proposer(v, it) } ?: "They"} is told")
        done()
        load()
    }

    fun withdraw(v: AgreementVersion) = action {
        api.withdrawAgreement(v.id)
        say("Version ${v.number} withdrawn")
        load()
    }
}

/** A section while it's being written. */
private data class DraftSection(val id: String, val kind: String, val title: String, val body: String, val noteId: String?, val noteTitle: String? = null)

/** What the editor opens with. */
private data class Draft(val number: Int, val sections: List<DraftSection>, val reviewBy: String?, val note: String)

private fun AgreementSection.draft() = DraftSection(id, kind, title, body, noteId, noteTitle)
private fun AgreementSectionInput.draft() = DraftSection(id, kind, title, body, noteId)

/** The agreement: one versioned page everyone in the dynamic signs, proposals to change it, and every version before. */
/** Opens the limits list from the agreement's limits section. */
private val LocalOpenLimits = staticCompositionLocalOf<() -> Unit> { {} }

@Composable
fun AgreementScreen(onOpenSettings: () -> Unit, onOpenNote: (String) -> Unit, onOpenLimits: () -> Unit) {
    CompositionLocalProvider(LocalOpenLimits provides onOpenLimits) { AgreementContent(onOpenSettings, onOpenNote) }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AgreementContent(onOpenSettings: () -> Unit, onOpenNote: (String) -> Unit, vm: AgreementViewModel = hiltViewModel()) {
    LaunchedEffect(Unit) { vm.load() }
    val state by vm.state.collectAsStateWithLifecycle()
    val version by vm.version.collectAsStateWithLifecycle()
    val counts by vm.counts.collectAsStateWithLifecycle()
    val busy by vm.busy.collectAsStateWithLifecycle()
    val message by vm.message.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    MessageEffect(message, snackbar, vm::messageShown)
    val session = vm.session ?: return
    val me = session.userId
    val other = othersOf(session)
    val a = (state as? Load.Ready)?.value
    var page by rememberSaveable { mutableStateOf("main") }
    var editing by remember { mutableStateOf<Draft?>(null) }
    var agreeing by remember { mutableStateOf<AgreementVersion?>(null) }
    var asking by remember { mutableStateOf<AgreementVersion?>(null) }
    var withdrawing by remember { mutableStateOf<AgreementVersion?>(null) }
    val shown = if (page == "review" && a != null && a.proposal == null) "main" else page

    fun edit(d: Draft) {
        vm.loadCounts()
        editing = d
    }
    fun editFrom(a: Agreement) {
        val base = a.proposal ?: a.current ?: return
        val note = if (base == a.proposal && base.proposedBy == me) base.note else ""
        edit(Draft(nextNumber(a), base.sections.map { it.draft() }, base.reviewBy, note))
    }

    LaunchedEffect(a) {
        if (a == null) return@LaunchedEffect
        val start = vm.takeStart()
        if (start == "edit" && a.proposal?.proposedBy == me) editFrom(a)
        if (start == "review" && a.proposal != null) page = "review"
    }
    BackHandler(enabled = version != null || shown != "main") {
        if (version != null) { vm.closeVersion() } else { page = "main" }
    }

    val viewing = (version as? Load.Ready)?.value
    val title = when {
        version != null -> viewing?.let { "Version ${it.number}" } ?: "Version"
        shown == "versions" -> "Versions"
        else -> "Agreement"
    }
    val subtitle = when {
        version != null -> viewing?.let { v ->
            when (v.status) {
                "agreed" -> "In force · agreed ${v.agreedAt?.let { relDay(it) } ?: ""}"
                "superseded" -> "Agreed ${v.agreedAt?.let { relDay(it) } ?: ""}, since replaced"
                else -> "Proposed by ${proposer(v, session)} ${relDay(v.proposedAt)}"
            }
        }
        a == null -> null
        shown == "versions" -> "Agreement"
        shown == "review" -> a.proposal?.let { "Version ${it.number}, proposed by ${if (it.proposedBy == me) "you" else proposer(it, session)} ${relDay(it.proposedAt)}" }
        a.current != null -> a.current.let { c -> "Version ${c.number}" + (c.agreedAt?.let { " · agreed ${relDay(it)}" } ?: "") }
        a.proposal != null -> "Not agreed yet"
        else -> "Not written yet"
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(title)
                        subtitle?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    }
                },
                navigationIcon = {
                    if (version != null || shown != "main") {
                        IconButton(onClick = { if (version != null) { vm.closeVersion() } else { page = "main" } }) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Back") }
                    } else {
                        MenuButton()
                    }
                },
                actions = { SafeWordAction(); SettingsAction(onOpenSettings) },
            )
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        val body = Modifier.padding(padding).fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp).padding(bottom = 24.dp)
        when (val s = state) {
            Load.Loading -> LoadingBox(Modifier.padding(padding))
            is Load.Failed -> ErrorBox(s.message, vm::load, Modifier.padding(padding))
            is Load.Ready -> {
                val ag = s.value
                val v = version
                if (v != null) {
                    when (v) {
                        Load.Loading -> LoadingBox(Modifier.padding(padding))
                        is Load.Failed -> ErrorBox(v.message, vm::retryVersion, Modifier.padding(padding))
                        is Load.Ready -> Column(body, verticalArrangement = Arrangement.spacedBy(16.dp)) {
                            val prev = previousAgreed(ag, v.value.number)
                            if (v.value.note.isNotBlank()) NoteBanner(null, "${proposer(v.value, session)}: “${v.value.note}”")
                            PageCard(v.value, marked = prev != null, onlyChanged = false, prevNumber = prev, onOpenNote = onOpenNote)
                            Signatures(v.value, session)
                        }
                    }
                } else {
                    Column(body, verticalArrangement = Arrangement.spacedBy(16.dp)) {
                        when (shown) {
                            "versions" -> VersionList(ag, session) { vm.openVersion(it) }
                            "review" -> ag.proposal?.let { p ->
                                Review(
                                    p,
                                    ag,
                                    session,
                                    onOpenNote = onOpenNote,
                                    onAgree = { agreeing = p },
                                    onAsk = { asking = p },
                                    onEdit = { editFrom(ag) },
                                    onWithdraw = { withdrawing = p },
                                )
                            }
                            else -> Main(
                                ag,
                                session,
                                onOpenNote = onOpenNote,
                                onRead = { page = "review" },
                                onEdit = { editFrom(ag) },
                                onWithdraw = { ag.proposal?.let { withdrawing = it } },
                                onVersions = { page = "versions" },
                                onTemplate = { vm.template { sections -> edit(Draft(nextNumber(ag), sections.map { it.draft() }, null, "")) } },
                                onBlank = { edit(Draft(nextNumber(ag), listOf(DraftSection("why", "text", "Why we're doing this", "", null)), null, "")) },
                            )
                        }
                    }
                }
            }
        }
    }

    editing?.let { d ->
        AgreementEditor(d, other, a?.current?.number, counts, busy, snackbar, onDismiss = { editing = null }) { input ->
            vm.propose(input) {
                editing = null
                page = "main"
            }
        }
    }
    agreeing?.let { v ->
        val last = session.relationship?.members.orEmpty().all { m -> m.userId == session.userId || v.agreements.any { it.userId == m.userId } }
        AgreeSheet(v, a?.current?.number, last, busy, onDismiss = { agreeing = null }) { vm.agree(v) { agreeing = null; page = "main" } }
    }
    asking?.let { v -> AskChangesSheet(proposer(v, session), a?.current?.number, busy, onDismiss = { asking = null }) { note -> vm.requestChanges(v, note) { asking = null; page = "main" } } }
    withdrawing?.let { v ->
        AlertDialog(
            onDismissRequest = { withdrawing = null },
            title = { Text("Withdraw version ${v.number}?") },
            text = { Text("$other won't be asked to agree to it any more." + (a?.current?.let { " Version ${it.number} stays in force." } ?: "")) },
            confirmButton = { TextButton(onClick = { vm.withdraw(v); withdrawing = null; page = "main" }, enabled = !busy) { Text("Withdraw") } },
            dismissButton = { TextButton(onClick = { withdrawing = null }) { Text("Cancel") } },
        )
    }
}

@Composable
private fun Main(
    a: Agreement,
    session: Session,
    onOpenNote: (String) -> Unit,
    onRead: () -> Unit,
    onEdit: () -> Unit,
    onWithdraw: () -> Unit,
    onVersions: () -> Unit,
    onTemplate: () -> Unit,
    onBlank: () -> Unit,
) {
    a.proposal?.let { ProposalBanner(it, session, onRead, onEdit, onWithdraw) }
    if (a.current != null && a.proposal == null && a.drift.isNotEmpty()) DriftBanner(a, session, onEdit)
    val cur = a.current
    when {
        cur != null -> {
            PageCard(cur, marked = false, onlyChanged = false, prevNumber = null, onOpenNote = onOpenNote)
            Signatures(cur, session)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                TextButton(onClick = onVersions) {
                    Icon(Icons.Outlined.History, null, Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text("Versions")
                }
                if (!session.readOnly) {
                    FilledTonalButton(onClick = onEdit) {
                        Icon(Icons.Outlined.Edit, null, Modifier.size(18.dp))
                        Spacer(Modifier.width(8.dp))
                        Text("Propose changes")
                    }
                }
            }
        }
        a.proposal == null -> EmptyCard(session.readOnly, onTemplate, onBlank)
        else -> TextButton(onClick = onVersions) {
            Icon(Icons.Outlined.History, null, Modifier.size(18.dp))
            Spacer(Modifier.width(8.dp))
            Text("Versions")
        }
    }
}

@Composable
private fun EmptyCard(readOnly: Boolean, onTemplate: () -> Unit, onBlank: () -> Unit) {
    val c = MaterialTheme.colorScheme
    Surface(color = c.surfaceContainerLow, shape = MaterialTheme.shapes.large, modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Icon(Icons.Outlined.Handshake, null, Modifier.size(32.dp), tint = c.primary)
            Text("Write down what you've agreed", style = MaterialTheme.typography.headlineSmall)
            Text(
                "One page you both sign: why you're doing this, what each of you will do, limits, safewords, and your rules and protocols. " +
                    "Either of you can propose changes later, and a new version only counts once you both agree.",
                style = MaterialTheme.typography.bodyMedium,
                color = c.onSurfaceVariant,
            )
            if (!readOnly) {
                Button(onClick = onTemplate) { Text("Start from our template") }
                TextButton(onClick = onBlank) { Text("Start blank") }
            }
        }
    }
}

/** Rules or protocols changed after the version in force was written, so what's signed no longer matches them. */
@Composable
private fun DriftBanner(a: Agreement, session: Session, onPropose: () -> Unit) {
    val what = a.drift.map { if (it.kind == "rules") "Rules" else "Protocols" }.distinct().joinToString(" and ")
    val everyone = if (session.partners.size > 1) "all" else "both"
    fun titles(verb: String) = a.drift.filter { it.verb == verb }.joinToString(", ") { it.title }
    val c = MaterialTheme.colorScheme
    Surface(color = c.secondaryContainer, contentColor = c.onSecondaryContainer, shape = RoundedCornerShape(24.dp), modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Outlined.PublishedWithChanges, null)
                Text("$what changed since you $everyone signed", style = MaterialTheme.typography.titleMedium)
            }
            titles("added").ifEmpty { null }?.let { Text("Added: $it", style = MaterialTheme.typography.bodyMedium) }
            titles("removed").ifEmpty { null }?.let { Text("Removed: $it", style = MaterialTheme.typography.bodyMedium) }
            if (!session.readOnly) {
                Button(onClick = onPropose, modifier = Modifier.padding(top = 8.dp)) {
                    Icon(Icons.Outlined.Edit, null, Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text("Propose an update")
                }
            }
        }
    }
}

/** The open proposal, at the top of the agreement: what it needs from you, or who it's waiting for. */
@Composable
private fun ProposalBanner(p: AgreementVersion, session: Session, onRead: () -> Unit, onEdit: () -> Unit, onWithdraw: () -> Unit) {
    val me = session.userId
    val mine = p.proposedBy == me
    val agreed = p.agreements.any { it.userId == me }
    val asked = p.status == "changes_requested"
    val askedBy = p.feedback?.userId?.let { if (it == me) "You" else session.nameOf(it) } ?: "Someone"
    val title = when {
        mine && asked -> "$askedBy asked for changes"
        mine -> "Waiting for ${waitingFor(p, session)}"
        asked && p.feedback?.userId == me -> "You asked for changes"
        agreed -> "You agreed to version ${p.number}"
        else -> "${proposer(p, session)} proposed version ${p.number}"
    }
    val note = when {
        asked -> p.feedback?.note
        mine -> null
        agreed -> null
        else -> p.note
    }?.takeIf { it.isNotBlank() }
    val sub = when {
        mine && !asked -> "You proposed version ${p.number} ${relDay(p.proposedAt)}."
        agreed -> "Waiting for ${waitingFor(p, session)}."
        else -> null
    }
    val c = MaterialTheme.colorScheme
    Surface(color = c.secondaryContainer, contentColor = c.onSecondaryContainer, shape = RoundedCornerShape(24.dp), modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium)
            sub?.let { Text(it, style = MaterialTheme.typography.bodyMedium) }
            note?.let { Text("“$it”", style = MaterialTheme.typography.bodyMedium, fontStyle = FontStyle.Italic) }
            if (!session.readOnly) {
                Row(Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    if (mine) {
                        Button(onClick = onEdit) { Text("Edit") }
                        TextButton(onClick = onRead) { Text("Read it") }
                        TextButton(onClick = onWithdraw) { Text("Withdraw") }
                    } else {
                        Button(onClick = onRead) { Text("Read it") }
                    }
                }
            }
        }
    }
}

/** A proposal to read: what changed since the version in force, who has agreed, and agreeing or asking for changes. */
@Composable
private fun Review(
    p: AgreementVersion,
    a: Agreement,
    session: Session,
    onOpenNote: (String) -> Unit,
    onAgree: () -> Unit,
    onAsk: () -> Unit,
    onEdit: () -> Unit,
    onWithdraw: () -> Unit,
) {
    val me = session.userId
    val prev = previousAgreed(a, p.number)
    val heading = if (prev == null) "The first version of your agreement" else "${plural(p.changes, "change")} from version $prev"
    NoteBanner(heading, p.note.takeIf { it.isNotBlank() }?.let { "${if (p.proposedBy == me) "You" else proposer(p, session)}: “$it”" })
    if (p.status == "changes_requested") {
        p.feedback?.takeIf { it.note.isNotBlank() }?.let { f ->
            val who = f.userId?.let { if (it == me) "You" else session.nameOf(it) } ?: "Someone"
            NoteBanner("$who asked for changes", "“${f.note}”")
        }
    }
    PageCard(p, marked = prev != null, onlyChanged = prev != null, prevNumber = prev, onOpenNote = onOpenNote)
    Signatures(p, session)
    if (session.readOnly) return
    val mine = p.proposedBy == me
    val agreed = p.agreements.any { it.userId == me }
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End), verticalAlignment = Alignment.CenterVertically) {
        if (mine) {
            TextButton(onClick = onWithdraw) { Text("Withdraw") }
            FilledTonalButton(onClick = onEdit) {
                Icon(Icons.Outlined.Edit, null, Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
                Text("Edit")
            }
        } else if (!agreed) {
            OutlinedButton(onClick = onAsk) { Text("Ask for changes") }
            Button(onClick = onAgree) {
                Icon(Icons.Outlined.Handshake, null, Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
                Text("Agree")
            }
        }
    }
}

/** The tertiary banner over a proposal: how much changed, and the proposer's note. */
@Composable
private fun NoteBanner(heading: String?, note: String?) {
    if (heading == null && note == null) return
    val c = MaterialTheme.colorScheme
    Surface(color = c.tertiaryContainer, contentColor = c.onTertiaryContainer, shape = MaterialTheme.shapes.large, modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            heading?.let { Text(it, style = MaterialTheme.typography.titleMedium) }
            note?.let { Text(it, style = MaterialTheme.typography.bodyMedium, fontStyle = FontStyle.Italic) }
        }
    }
}

private fun sectionIcon(s: AgreementSection): ImageVector {
    val t = s.title.trim().lowercase()
    return when {
        s.kind == "rules" -> Icons.Outlined.Gavel
        s.kind == "protocols" -> Icons.Outlined.FactCheck
        t.startsWith("why") -> Icons.Outlined.FavoriteBorder
        t.startsWith("what ") && t.endsWith(" will do") -> Icons.Outlined.Person
        "limit" in t -> Icons.Outlined.Block
        "safeword" in t || "safe word" in t -> Icons.Outlined.Key
        "review" in t -> Icons.Outlined.EventRepeat
        else -> Icons.AutoMirrored.Outlined.Notes
    }
}

/** A section's lines as they stand, with nothing marked. */
private fun plainLines(s: AgreementSection): List<AgreementLine> =
    (if (s.kind == "text") s.body.split("\n").map { it.trimEnd() }.filter { it.isNotBlank() } else s.items).map { AgreementLine("same", it) }

/** Lines added since the version before, in a green tint. */
private val AddedTint = Color(0x332E7D32)

/** The whole page in one card; [marked] shows what was added and removed, [onlyChanged] folds away the sections that didn't change. */
@Composable
private fun PageCard(v: AgreementVersion, marked: Boolean, onlyChanged: Boolean, prevNumber: Int?, onOpenNote: (String) -> Unit) {
    val c = MaterialTheme.colorScheme
    var showAll by rememberSaveable(v.id) { mutableStateOf(false) }
    val unchanged = v.sections.count { it.change == "same" }
    val sections = if (onlyChanged && !showAll) v.sections.filter { it.change != "same" } else v.sections
    Surface(color = c.surfaceContainerLow, shape = MaterialTheme.shapes.large, modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
            sections.forEach { s -> key(s.id) { SectionView(s, marked, prevNumber, onOpenNote) } }
            if (marked) {
                v.removed.forEach { t ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Outlined.RemoveCircleOutline, null, Modifier.size(20.dp), tint = c.error)
                        Spacer(Modifier.width(12.dp))
                        Text(t, style = MaterialTheme.typography.titleMedium, color = c.error, textDecoration = TextDecoration.LineThrough)
                    }
                }
            }
            v.reviewBy?.let { date ->
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    SectionTitle(Icons.Outlined.EventRepeat, "Review")
                    Text("We'll read this again together by ${plainDate(date)}.", style = MaterialTheme.typography.bodyMedium)
                }
            }
            if (onlyChanged && unchanged > 0) {
                Row(
                    Modifier.fillMaxWidth().clickable { showAll = !showAll }.padding(vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Outlined.UnfoldMore, null, Modifier.size(20.dp), tint = c.onSurfaceVariant)
                    Spacer(Modifier.width(12.dp))
                    Text(
                        if (showAll) "Show only what changed" else "${plural(unchanged, "section")} unchanged · Show all",
                        style = MaterialTheme.typography.bodyMedium,
                        color = c.onSurfaceVariant,
                    )
                }
            }
            if (sections.isEmpty() && !(marked && v.removed.isNotEmpty()) && v.reviewBy == null) {
                Text("Nothing on the page itself changed.", style = MaterialTheme.typography.bodyMedium, color = c.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun SectionTitle(icon: ImageVector, title: String, tag: String? = null) {
    val c = MaterialTheme.colorScheme
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, null, Modifier.size(20.dp), tint = c.primary)
        Spacer(Modifier.width(12.dp))
        Text(title, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f, fill = false))
        tag?.let {
            Spacer(Modifier.width(8.dp))
            Text(it, style = MaterialTheme.typography.labelSmall, color = c.tertiary)
        }
    }
}

@Composable
private fun SectionView(s: AgreementSection, marked: Boolean, prevNumber: Int?, onOpenNote: (String) -> Unit) {
    val c = MaterialTheme.colorScheme
    val lines = if (marked) s.lines else plainLines(s)
    val list = s.kind != "text"
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        SectionTitle(sectionIcon(s), s.title, if (marked && s.change == "new") "NEW" else null)
        val noteId = s.noteId
        val noteTitle = s.noteTitle
        if (noteId != null && noteTitle != null) {
            Text(
                buildAnnotatedString {
                    append("In the note ")
                    withStyle(SpanStyle(color = c.primary, textDecoration = TextDecoration.Underline)) { append(noteTitle) }
                },
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.clickable { onOpenNote(noteId) },
            )
        }
        lines.forEach { LineView(it, list) }
        if (s.kind == "text" && s.id == "limits" && LocalFeatures.current.limits) {
            val open = LocalOpenLimits.current
            TextButton(onClick = open, contentPadding = PaddingValues(horizontal = 0.dp)) {
                Icon(Icons.Outlined.Tune, null, Modifier.size(18.dp))
                Spacer(Modifier.width(4.dp))
                Text("Your limits list")
            }
        }
        if (list) {
            val from = if (s.kind == "rules") "Rules" else "Protocols"
            val added = lines.count { it.op == "add" }
            val removed = lines.count { it.op == "del" }
            val caption = when {
                lines.isEmpty() -> "Nothing in $from when this version was written"
                marked && prevNumber != null && added + removed > 0 ->
                    "From $from · " + listOfNotNull(added.takeIf { it > 0 }?.let { "$it added" }, removed.takeIf { it > 0 }?.let { "$it removed" }).joinToString(", ") + " since version $prevNumber"
                else -> "From $from, as of this version"
            }
            Text(caption, style = MaterialTheme.typography.bodySmall, color = c.onSurfaceVariant)
        }
    }
}

@Composable
private fun LineView(l: AgreementLine, list: Boolean) {
    val c = MaterialTheme.colorScheme
    val bullet = list || l.text.startsWith("- ")
    val text = if (!list && l.text.startsWith("- ")) l.text.removePrefix("- ") else l.text
    val added = l.op == "add"
    val removed = l.op == "del"
    Text(
        text,
        style = MaterialTheme.typography.bodyMedium,
        color = if (removed) c.error else c.onSurface,
        textDecoration = if (removed) TextDecoration.LineThrough else null,
        modifier = Modifier
            .padding(start = if (bullet) 32.dp else 0.dp)
            .then(if (added) Modifier.background(AddedTint, RoundedCornerShape(4.dp)).padding(horizontal = 4.dp) else Modifier),
    )
}

/** "Agreed by" tiles, one per person in the dynamic. */
@Composable
private fun Signatures(v: AgreementVersion, session: Session) {
    val c = MaterialTheme.colorScheme
    val members = session.relationship?.members.orEmpty()
    if (members.isEmpty()) return
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        members.forEach { m ->
            val sig = v.agreements.firstOrNull { it.userId == m.userId }
            Surface(color = c.surfaceContainerHigh, shape = MaterialTheme.shapes.large, modifier = Modifier.weight(1f)) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("Agreed by", style = MaterialTheme.typography.labelMedium, color = c.onSurfaceVariant)
                    if (sig != null) {
                        Text(m.displayName, style = MaterialTheme.typography.titleLarge, fontFamily = FontFamily.Serif, fontStyle = FontStyle.Italic, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(signedDay(sig.agreedAt), style = MaterialTheme.typography.bodySmall, color = c.onSurfaceVariant)
                    } else {
                        Text("Waiting for ${m.displayName}", style = MaterialTheme.typography.bodyLarge, fontFamily = FontFamily.Serif, color = c.onSurfaceVariant)
                    }
                }
            }
        }
    }
}

@Composable
private fun VersionList(a: Agreement, session: Session, onOpen: (String) -> Unit) {
    val c = MaterialTheme.colorScheme
    if (a.versions.isEmpty()) {
        Text("No versions yet.", style = MaterialTheme.typography.bodyMedium, color = c.onSurfaceVariant)
        return
    }
    val everyone = if ((session.relationship?.members?.size ?: 0) > 2) "everyone" else "both"
    Surface(color = c.surfaceContainerLow, shape = MaterialTheme.shapes.large, modifier = Modifier.fillMaxWidth()) {
        Column {
            a.versions.forEach { s -> key(s.id) { VersionRow(s, a, session, everyone) { onOpen(s.id) } } }
        }
    }
    Text("Old versions stay readable, with what changed in each.", style = MaterialTheme.typography.bodySmall, color = c.onSurfaceVariant)
}

@Composable
private fun VersionRow(s: AgreementVersionSummary, a: Agreement, session: Session, everyone: String, onClick: () -> Unit) {
    val c = MaterialTheme.colorScheme
    val who = s.proposedBy?.let { if (it == session.userId) "you" else session.nameOf(it) } ?: "a former member"
    val tag = when (s.status) {
        "agreed" -> "IN FORCE"
        "changes_requested" -> "CHANGES ASKED FOR"
        "proposed" -> a.proposal?.takeIf { it.id == s.id }?.let { "WAITING FOR ${waitingFor(it, session).uppercase()}" } ?: "WAITING"
        else -> null
    }
    val line = if (s.status in OPEN || s.agreedAt == null) {
        "Proposed by $who ${relDay(s.proposedAt)} · ${plural(s.changes, "change")}"
    } else {
        "Agreed by $everyone ${s.agreedAt?.let { relDay(it) } ?: ""} · proposed by $who"
    }
    ListItem(
        colors = ListItemDefaults.colors(containerColor = c.surfaceContainerLow),
        modifier = Modifier.clickable(onClick = onClick),
        leadingContent = {
            Icon(
                when (s.status) {
                    "agreed" -> Icons.Outlined.CheckCircle
                    "proposed", "changes_requested" -> Icons.Outlined.HourglassTop
                    else -> Icons.Outlined.History
                },
                null,
                tint = if (s.status == "agreed") c.primary else c.onSurfaceVariant,
            )
        },
        headlineContent = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Version ${s.number}")
                tag?.let {
                    Spacer(Modifier.width(8.dp))
                    Surface(color = c.tertiaryContainer, contentColor = c.onTertiaryContainer, shape = RoundedCornerShape(4.dp)) {
                        Text(it, style = MaterialTheme.typography.labelSmall, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp))
                    }
                }
            }
        },
        supportingContent = { Text(line) },
        trailingContent = { Icon(Icons.AutoMirrored.Outlined.KeyboardArrowRight, null) },
    )
}

/** Writing a version: every section, a review date, and a line for the others about what changed. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AgreementEditor(
    start: Draft,
    other: String,
    inForce: Int?,
    counts: Pair<Int?, Int?>,
    busy: Boolean,
    snackbar: SnackbarHostState,
    onDismiss: () -> Unit,
    onSend: (AgreementInput) -> Unit,
) {
    var sections by remember { mutableStateOf(start.sections) }
    var reviewBy by remember { mutableStateOf(start.reviewBy) }
    var note by remember { mutableStateOf(start.note) }
    var picking by remember { mutableStateOf(false) }
    val ok = sections.isNotEmpty() && sections.all { it.title.isNotBlank() }
    fun update(i: Int, change: (DraftSection) -> DraftSection) {
        sections = sections.toMutableList().also { it[i] = change(it[i]) }
    }
    fun move(i: Int, by: Int) {
        val j = i + by
        if (i !in sections.indices || j !in sections.indices) return
        sections = sections.toMutableList().also { l ->
            val t = l[i]
            l[i] = l[j]
            l[j] = t
        }
    }
    fun send() = onSend(
        AgreementInput(
            sections = sections.map { AgreementSectionInput(it.id, it.kind, it.title.trim(), if (it.kind == "text") it.body.trimEnd() else "", it.noteId) },
            reviewBy = reviewBy,
            note = note.trim(),
        ),
    )

    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false)) {
        Scaffold(
            topBar = {
                TopAppBar(
                    title = { Text("Version ${start.number}") },
                    navigationIcon = { IconButton(onClick = onDismiss) { Icon(Icons.Outlined.Close, "Close") } },
                    actions = {
                        Button(onClick = ::send, enabled = ok && !busy, modifier = Modifier.padding(end = 8.dp)) { Text("Send to $other", maxLines = 1, overflow = TextOverflow.Ellipsis) }
                    },
                )
            },
            snackbarHost = { SnackbarHost(snackbar) },
        ) { padding ->
            Column(
                Modifier.padding(padding).fillMaxSize().imePadding().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp).padding(bottom = 24.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text(
                    "Changes take effect once you both agree." + (inForce?.let { " Until then version $it stays in force." } ?: ""),
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                sections.forEachIndexed { i, s ->
                    key(s.id) {
                        SectionEditor(
                            s,
                            counts,
                            canMoveUp = i > 0,
                            canMoveDown = i < sections.lastIndex,
                            canRemove = sections.size > 1,
                            onChange = { changed -> update(i) { changed } },
                            onMove = { by -> move(i, by) },
                            onRemove = { sections = sections.filterIndexed { j, _ -> j != i } },
                        )
                    }
                }
                OutlinedButton(onClick = { sections = sections + DraftSection("s-" + UUID.randomUUID().toString().take(8), "text", "", "", null) }, enabled = sections.size < 30) {
                    Icon(Icons.Outlined.Add, null, Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text("Add a section")
                }
                Box {
                    OutlinedTextField(
                        value = reviewBy?.let { plainDate(it) } ?: "",
                        onValueChange = {},
                        readOnly = true,
                        label = { Text("Review by (optional)") },
                        trailingIcon = { Icon(Icons.Outlined.EditCalendar, null) },
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Box(Modifier.matchParentSize().clickable { picking = true })
                }
                if (reviewBy != null) TextButton(onClick = { reviewBy = null }) { Text("No review date") }
                OutlinedTextField(
                    note,
                    { note = it.take(500) },
                    label = { Text("What changed, for $other") },
                    minLines = 2,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
        if (picking) {
            val initial = reviewBy?.let { runCatching { LocalDate.parse(it) }.getOrNull() } ?: LocalDate.now().plusMonths(3)
            val state = rememberDatePickerState(initialSelectedDateMillis = initial.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli())
            DatePickerDialog(
                onDismissRequest = { picking = false },
                confirmButton = {
                    TextButton(onClick = {
                        // DatePicker reports midnight UTC of the chosen day.
                        state.selectedDateMillis?.let { reviewBy = Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate().toString() }
                        picking = false
                    }) { Text("OK") }
                },
                dismissButton = { TextButton(onClick = { picking = false }) { Text("Cancel") } },
            ) { DatePicker(state = state) }
        }
    }
}

@Composable
private fun SectionEditor(
    s: DraftSection,
    counts: Pair<Int?, Int?>,
    canMoveUp: Boolean,
    canMoveDown: Boolean,
    canRemove: Boolean,
    onChange: (DraftSection) -> Unit,
    onMove: (Int) -> Unit,
    onRemove: () -> Unit,
) {
    val c = MaterialTheme.colorScheme
    var menu by remember { mutableStateOf(false) }
    Surface(shape = MaterialTheme.shapes.large, color = c.surface, border = BorderStroke(1.dp, c.outlineVariant), modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(start = 16.dp, end = 4.dp, top = 4.dp, bottom = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                val titleStyle = MaterialTheme.typography.titleMedium
                BasicTextField(
                    value = s.title,
                    onValueChange = { onChange(s.copy(title = it.take(80))) },
                    textStyle = titleStyle.copy(color = c.onSurface),
                    cursorBrush = SolidColor(c.primary),
                    singleLine = true,
                    modifier = Modifier.weight(1f),
                    decorationBox = { inner ->
                        Box {
                            if (s.title.isEmpty()) Text("Section title", style = titleStyle, color = c.onSurfaceVariant)
                            inner()
                        }
                    },
                )
                Box {
                    IconButton(onClick = { menu = true }) { Icon(Icons.Outlined.MoreVert, "Section options") }
                    DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                        DropdownMenuItem(text = { Text("Move up") }, onClick = { menu = false; onMove(-1) }, enabled = canMoveUp)
                        DropdownMenuItem(text = { Text("Move down") }, onClick = { menu = false; onMove(1) }, enabled = canMoveDown)
                        DropdownMenuItem(text = { Text("Remove") }, onClick = { menu = false; onRemove() }, enabled = canRemove)
                    }
                }
            }
            val listText = when (s.kind) {
                "rules" -> "The current list from Rules" + (counts.first?.let { ", ${plural(it, "rule")}" } ?: "") + ". Edit them in Rules."
                "protocols" -> "The current list from Protocols" + (counts.second?.let { ", ${plural(it, "protocol")}" } ?: "") + ". Edit them in Protocols."
                else -> null
            }
            if (listText != null) {
                Text(listText, style = MaterialTheme.typography.bodyLarge, color = c.onSurfaceVariant, modifier = Modifier.padding(end = 12.dp))
            } else {
                OutlinedTextField(
                    s.body,
                    { onChange(s.copy(body = it.take(5000))) },
                    placeholder = { Text("Start a line with “- ” for a bullet") },
                    minLines = 2,
                    modifier = Modifier.fillMaxWidth().padding(end = 12.dp),
                )
            }
            if (s.noteId != null) {
                Text(
                    "Links to the note ${s.noteTitle ?: "it points to"}",
                    style = MaterialTheme.typography.bodySmall,
                    color = c.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun AgreeSheet(v: AgreementVersion, inForce: Int?, last: Boolean, busy: Boolean, onDismiss: () -> Unit, onAgree: () -> Unit) {
    var read by remember { mutableStateOf(false) }
    Sheet(
        Icons.Outlined.Handshake,
        "Agree to version ${v.number}?",
        onDismiss,
        actions = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
            Button(onClick = onAgree, enabled = read && !busy) { Text("Agree") }
        },
    ) {
        Text(
            (if (last) "It takes effect now for both of you" else "It takes effect once everyone has agreed") + (inForce?.let { ", and replaces version $it" } ?: "") + ". Either of you can propose changes at any time.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Row(Modifier.fillMaxWidth().clickable { read = !read }, verticalAlignment = Alignment.CenterVertically) {
            Checkbox(checked = read, onCheckedChange = { read = it })
            Spacer(Modifier.width(8.dp))
            Text("I've read all of version ${v.number}, including the parts that didn't change.", style = MaterialTheme.typography.bodyMedium)
        }
    }
}

@Composable
private fun AskChangesSheet(name: String, inForce: Int?, busy: Boolean, onDismiss: () -> Unit, onSend: (String) -> Unit) {
    var note by remember { mutableStateOf("") }
    Sheet(
        Icons.Outlined.EditNote,
        "Ask for changes",
        onDismiss,
        actions = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
            Button(onClick = { onSend(note.trim()) }, enabled = note.isNotBlank() && !busy) { Text("Send") }
        },
    ) {
        Text(
            "$name is told and can edit the proposal." + (inForce?.let { " Version $it stays in force meanwhile." } ?: ""),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        OutlinedTextField(note, { note = it.take(1000) }, label = { Text("Note to $name") }, minLines = 2, modifier = Modifier.fillMaxWidth())
    }
}

/** Whether [v] is waiting on [session]'s person: a partner's proposal they haven't agreed to, or changes asked of their own. */
fun agreementNeedsMe(v: AgreementVersion?, session: Session): Boolean {
    if (v == null || v.status !in OPEN) return false
    val me = session.userId
    return if (v.proposedBy == me) v.status == "changes_requested" else v.status == "proposed" && v.agreements.none { it.userId == me }
}
