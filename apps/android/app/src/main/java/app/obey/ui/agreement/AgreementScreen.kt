package app.obey.ui.agreement

import androidx.compose.material3.HorizontalDivider
import androidx.compose.foundation.border
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.layout.height
import androidx.compose.material.icons.outlined.Link
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import app.obey.ui.common.inkButtonColors
import app.obey.ui.common.Eyebrow
import app.obey.ui.common.BackLink
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
import androidx.compose.material.icons.outlined.MoreHoriz
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.PublishedWithChanges
import androidx.compose.material.icons.outlined.RemoveCircleOutline
import androidx.compose.material.icons.outlined.Handshake
import androidx.compose.material.icons.outlined.Tune
import androidx.compose.material.icons.outlined.UnfoldMore
import androidx.compose.material3.AlertDialog
import app.obey.ui.common.Button
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import app.obey.ui.common.TonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import app.obey.ui.common.LettersField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.LargeTopAppBar
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
        shown == "versions" -> "Old versions stay readable, with what changed in each."
        shown == "review" -> a.proposal?.let { "Version ${it.number}, proposed by ${if (it.proposedBy == me) "you" else proposer(it, session)} ${relDay(it.proposedAt)}" }
        a.current != null -> a.current.let { c -> "Version ${c.number} is in force" + (c.agreedAt?.let { ", agreed ${relDay(it)}" } ?: "") + "." }
        a.proposal != null -> "Nothing agreed yet."
        else -> "Not written yet."
    }

    Scaffold(
        topBar = {
            app.obey.ui.common.PageHeader(
                title,
                sub = subtitle,
                navigation = {
                    if (version != null || shown != "main") {
                        BackLink(if (version != null) "Versions" else "Agreement") { if (version != null) { vm.closeVersion() } else { page = "main" } }
                    } else {
                        MenuButton()
                    }
                },
            ) {
                if (version == null && shown == "main" && (a?.current != null || a?.proposal != null)) {
                    IconButton(onClick = { page = "versions" }) { Icon(Icons.Outlined.History, "Versions") }
                }
            }
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
                            if (v.value.note.isNotBlank()) NoteBanner(null, "“${v.value.note}”")
                            PageCard(v.value, marked = prev != null, onlyChanged = false, prevNumber = prev, onOpenNote = onOpenNote)
                            Signatures(v.value, session)
                        }
                    }
                } else {
                    Column(body, verticalArrangement = Arrangement.spacedBy(16.dp)) {
                        when (shown) {
                            "versions" -> VersionList(ag, session) { id -> if (id == ag.proposal?.id) page = "review" else vm.openVersion(id) }
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
                                onAgree = { ag.proposal?.let { agreeing = it } },
                                onAsk = { ag.proposal?.let { asking = it } },
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
    onAgree: () -> Unit,
    onAsk: () -> Unit,
    onRead: () -> Unit,
    onEdit: () -> Unit,
    onWithdraw: () -> Unit,
    onVersions: () -> Unit,
    onTemplate: () -> Unit,
    onBlank: () -> Unit,
) {
    a.proposal?.let { p ->
        ProposalBanner(p, a.current?.number, session, onAgree, onAsk, onRead, onEdit, onWithdraw)
        if (a.current != null) WhatChanged(p, onOpenNote, onRead)
    }
    if (a.current != null && a.proposal == null && a.drift.isNotEmpty()) DriftNote(a, session, onEdit)
    val cur = a.current
    when {
        cur != null && a.proposal == null -> {
            PageCard(cur, marked = false, onlyChanged = false, prevNumber = null, onOpenNote = onOpenNote)
            Signatures(cur, session)
            if (!session.readOnly) OutlinedButton(onClick = onEdit) { Text("Propose changes") }
        }
        cur == null && a.proposal == null && !session.readOnly -> Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Button(onClick = onTemplate, colors = inkButtonColors()) { Text("Start from our template") }
            TextButton(onClick = onBlank) { Text("Start blank") }
        }
        else -> Unit
    }
}



/** The sections a proposal changes, marked, then the unchanged ones named in a line (mockup 23). */
@Composable
private fun WhatChanged(p: AgreementVersion, onOpenNote: (String) -> Unit, onReadAll: () -> Unit) {
    val c = MaterialTheme.colorScheme
    val changed = p.sections.filter { it.change != "same" }
    val same = p.sections.filter { it.change == "same" }.map { if (it.kind == "text") it.title else plural(it.items.size, it.kind.removeSuffix("s")) }
    if (changed.isNotEmpty() || p.removed.isNotEmpty()) {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Eyebrow("What changed")
            changed.forEach { s -> key(s.id) { SectionView(s, marked = true, prevNumber = null, onOpenNote = onOpenNote) } }
            p.removed.forEach { t -> Text(t, style = serifBody, color = c.onSurfaceVariant, textDecoration = TextDecoration.LineThrough) }
        }
    }
    if (same.isNotEmpty()) {
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Eyebrow("Unchanged")
            Text(same.joinToString(", "), style = MaterialTheme.typography.bodyLarge, color = c.onSurfaceVariant)
            TextButton(onClick = onReadAll, contentPadding = PaddingValues(0.dp)) { Text("Read all of version ${p.number}", color = c.primary) }
        }
    }
}

/** Rules or protocols changed after the version in force was written, so what's signed no longer matches them. */
@Composable
private fun DriftNote(a: Agreement, session: Session, onPropose: () -> Unit) {
    val what = a.drift.map { if (it.kind == "rules") "Rules" else "Protocols" }.distinct().joinToString(" and ")
    val everyone = if (session.partners.size > 1) "all" else "both"
    fun titles(verb: String) = a.drift.filter { it.verb == verb }.joinToString(", ") { it.title }
    val c = MaterialTheme.colorScheme
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        HorizontalDivider(color = c.outlineVariant)
        Text("$what changed since you $everyone signed.", style = MaterialTheme.typography.bodyLarge, modifier = Modifier.padding(top = 12.dp))
        titles("added").ifEmpty { null }?.let { Text("Added: $it", style = MaterialTheme.typography.bodyMedium, color = c.onSurfaceVariant) }
        titles("removed").ifEmpty { null }?.let { Text("Removed: $it", style = MaterialTheme.typography.bodyMedium, color = c.onSurfaceVariant) }
        if (!session.readOnly) TextButton(onClick = onPropose, contentPadding = PaddingValues(0.dp)) { Text("Propose an update", color = c.primary) }
        HorizontalDivider(color = c.outlineVariant)
    }
}

/** The open proposal, on the one box the mockup keeps: what it needs from you, or who it's waiting for. */
@Composable
private fun ProposalBanner(
    p: AgreementVersion,
    inForce: Int?,
    session: Session,
    onAgree: () -> Unit,
    onAsk: () -> Unit,
    onRead: () -> Unit,
    onEdit: () -> Unit,
    onWithdraw: () -> Unit,
) {
    val me = session.userId
    val mine = p.proposedBy == me
    val agreed = p.agreements.any { it.userId == me }
    val asked = p.status == "changes_requested"
    val everyone = if (session.partners.size > 1) "all" else "both"
    val stays = inForce?.let { " Version $it stays in force until you $everyone agree." } ?: ""
    val text = buildAnnotatedString {
        if (asked) {
            append(p.feedback?.userId?.let { if (it == me) "You" else session.nameOf(it) } ?: "Someone")
            append(" asked for changes to ")
        } else {
            append(if (mine) "You" else proposer(p, session))
            append(" proposed ")
        }
        withStyle(SpanStyle(fontWeight = FontWeight.SemiBold)) { append("version ${p.number}") }
        append(".$stays")
        if (mine && !asked) append(" Waiting for ${waitingFor(p, session)}.")
        if (agreed && !mine) append(" You've agreed; waiting for ${waitingFor(p, session)}.")
    }
    val quote = (if (asked) p.feedback?.note else p.note)?.takeIf { it.isNotBlank() }
    val c = MaterialTheme.colorScheme
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(c.surfaceContainerLowest).border(1.dp, c.outlineVariant, RoundedCornerShape(12.dp)).padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text(text, style = MaterialTheme.typography.bodyLarge)
        quote?.let { Text("“$it”", style = serifBody.copy(fontStyle = FontStyle.Italic)) }
        if (!session.readOnly) {
            Row(Modifier.padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                when {
                    !mine && p.status == "proposed" && !agreed -> {
                        Button(onClick = onAgree, colors = inkButtonColors()) { Text("Agree") }
                        OutlinedButton(onClick = onAsk) { Text("Ask for changes") }
                    }
                    mine || asked -> {
                        OutlinedButton(onClick = onEdit) { Text("Edit") }
                        if (mine) TextButton(onClick = onWithdraw) { Text("Withdraw") }
                    }
                    else -> TextButton(onClick = onRead) { Text("Read it") }
                }
            }
        }
    }
}

/** A proposal to read in full, with what changed marked. */
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
    val prev = previousAgreed(a, p.number)
    ProposalBanner(p, a.current?.number, session, onAgree, onAsk, {}, onEdit, onWithdraw)
    PageCard(p, marked = prev != null, onlyChanged = false, prevNumber = prev, onOpenNote = onOpenNote)
    Signatures(p, session)
}

/** The proposer's note, quoted in the serif. */
@Composable
private fun NoteBanner(heading: String?, note: String?) {
    if (heading == null && note == null) return
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        heading?.let { Eyebrow(it) }
        note?.let { Text(it, style = serifBody.copy(fontStyle = FontStyle.Italic)) }
    }
}

private val serifBody @Composable get() = MaterialTheme.typography.titleLarge.copy(fontSize = 22.sp, lineHeight = 31.sp)

/** A section's lines as they stand, with nothing marked. */
private fun plainLines(s: AgreementSection): List<AgreementLine> =
    (if (s.kind == "text") s.body.split("\n").map { it.trimEnd() }.filter { it.isNotBlank() } else s.items).map { AgreementLine("same", it) }

/** The whole page as eyebrowed sections; [marked] shows what was added and removed, [onlyChanged] folds away the sections that didn't change. */
@Composable
private fun PageCard(v: AgreementVersion, marked: Boolean, onlyChanged: Boolean, prevNumber: Int?, onOpenNote: (String) -> Unit) {
    val c = MaterialTheme.colorScheme
    var showAll by rememberSaveable(v.id) { mutableStateOf(false) }
    val unchanged = v.sections.count { it.change == "same" }
    val sections = if (onlyChanged && !showAll) v.sections.filter { it.change != "same" } else v.sections
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(28.dp)) {
        sections.forEach { s -> key(s.id) { SectionView(s, marked, prevNumber, onOpenNote) } }
        if (marked) v.removed.forEach { t -> Text(t.uppercase(), style = MaterialTheme.typography.labelMedium.copy(letterSpacing = 1.5.sp), color = c.onSurfaceVariant, textDecoration = TextDecoration.LineThrough) }
        v.reviewBy?.let { date ->
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Eyebrow("Review")
                Text("We'll read this again together by ${plainDate(date)}.", style = serifBody)
            }
        }
        if (onlyChanged && unchanged > 0) {
            TextButton(onClick = { showAll = !showAll }, contentPadding = PaddingValues(0.dp)) {
                Text(if (showAll) "Show only what changed" else "${plural(unchanged, "section")} unchanged · Show all", color = c.primary)
            }
        }
    }
}

@Composable
private fun SectionTitle(title: String, tag: String? = null) {
    Eyebrow(title + (tag?.let { " · $it" } ?: ""))
}

@Composable
private fun SectionView(s: AgreementSection, marked: Boolean, prevNumber: Int?, onOpenNote: (String) -> Unit) {
    val c = MaterialTheme.colorScheme
    val lines = if (marked) s.lines else plainLines(s)
    val list = s.kind != "text"
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        SectionTitle(s.title, if (marked && s.change == "new") "new" else null)
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
                Icon(Icons.Outlined.Link, null, Modifier.size(18.dp), tint = c.onSurfaceVariant)
                Spacer(Modifier.width(6.dp))
                Text("Your limits list", color = c.onSurfaceVariant)
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
    Row {
        if (bullet) Text("– ", style = serifBody, color = if (removed) c.onSurfaceVariant else c.onSurface)
        Text(
            text,
            style = serifBody,
            color = if (removed) c.onSurfaceVariant else c.onSurface,
            textDecoration = if (removed) TextDecoration.LineThrough else null,
            modifier = if (added) Modifier.background(c.tertiaryContainer).padding(horizontal = 4.dp) else Modifier,
        )
    }
}

/** Each person on a hairline: their name in the serif italic once they've agreed. */
@Composable
private fun Signatures(v: AgreementVersion, session: Session) {
    val c = MaterialTheme.colorScheme
    val members = session.relationship?.members.orEmpty()
    if (members.isEmpty()) return
    Column {
        Eyebrow("Agreed by")
        Spacer(Modifier.height(8.dp))
        HorizontalDivider(color = c.outlineVariant)
        members.forEach { m ->
            val sig = v.agreements.firstOrNull { it.userId == m.userId }
            Row(Modifier.fillMaxWidth().padding(vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                if (sig != null) {
                    Text(m.displayName, style = serifBody.copy(fontStyle = FontStyle.Italic, fontSize = 24.sp), maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                    Text(signedDay(sig.agreedAt), style = MaterialTheme.typography.bodyMedium, color = c.onSurfaceVariant)
                } else {
                    Text("Waiting for ${m.displayName}", style = MaterialTheme.typography.bodyLarge, color = c.onSurfaceVariant)
                }
            }
            HorizontalDivider(color = c.outlineVariant)
        }
    }
}

/** Mockup 75: every version on hairlines, the open one to review, the rest to read. */
@Composable
private fun VersionList(a: Agreement, session: Session, onOpen: (String) -> Unit) {
    val c = MaterialTheme.colorScheme
    if (a.versions.isEmpty()) {
        Text("No versions yet.", style = MaterialTheme.typography.bodyLarge, color = c.onSurfaceVariant)
        return
    }
    val everyone = if ((session.relationship?.members?.size ?: 0) > 2) "everyone" else "both"
    Column {
        a.versions.forEachIndexed { i, s ->
            key(s.id) {
                // A replaced version ran from its own agreement to the next one's.
                val until = a.versions.take(i).lastOrNull { it.agreedAt != null }?.agreedAt
                VersionRow(s, a, session, everyone, until) { onOpen(s.id) }
            }
            HorizontalDivider(color = c.outlineVariant)
        }
    }
}

@Composable
private fun VersionRow(s: AgreementVersionSummary, a: Agreement, session: Session, everyone: String, until: String?, onClick: () -> Unit) {
    val c = MaterialTheme.colorScheme
    val who = s.proposedBy?.let { if (it == session.userId) "you" else session.nameOf(it) } ?: "a former member"
    val needsMe = a.proposal?.takeIf { it.id == s.id }?.let { agreementNeedsMe(it, session) && it.proposedBy != session.userId } == true
    val short = DateTimeFormatter.ofPattern("MMM d")
    val agreedAt = s.agreedAt
    val line = when {
        s.status in OPEN -> "Proposed by $who · " + when {
            s.status == "changes_requested" -> "changes asked for"
            needsMe -> "waiting on you"
            else -> a.proposal?.takeIf { it.id == s.id }?.let { "waiting for ${waitingFor(it, session)}" } ?: "waiting"
        }
        s.status == "agreed" -> "In force since ${agreedAt?.let { dayOf(it).format(short) } ?: ""} · agreed by $everyone"
        agreedAt != null -> "${dayOf(agreedAt).format(short)} – ${until?.let { dayOf(it).format(short) } ?: "replaced"}"
        else -> "Proposed by $who ${relDay(s.proposedAt)}"
    }
    Row(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(vertical = 18.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text("Version ${s.number}", style = MaterialTheme.typography.headlineSmall)
            Text(line, style = MaterialTheme.typography.bodyLarge, color = c.onSurfaceVariant)
        }
        if (needsMe) Button(onClick = onClick, colors = inkButtonColors()) { Text("Review") }
        else Text("Read", style = MaterialTheme.typography.labelLarge, color = c.primary)
    }
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
                CenterAlignedTopAppBar(
                    title = { Text("Propose version ${start.number}", style = MaterialTheme.typography.titleMedium) },
                    navigationIcon = { TextButton(onClick = onDismiss) { Text("Cancel", color = MaterialTheme.colorScheme.onSurfaceVariant) } },
                    actions = { TextButton(onClick = ::send, enabled = ok && !busy) { Text("Send", color = MaterialTheme.colorScheme.primary) } },
                )
            },
            snackbarHost = { SnackbarHost(snackbar) },
        ) { padding ->
            Column(
                Modifier.padding(padding).fillMaxSize().imePadding().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp).padding(bottom = 24.dp),
                verticalArrangement = Arrangement.spacedBy(24.dp),
            ) {
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
                TextButton(onClick = { sections = sections + DraftSection("s-" + UUID.randomUUID().toString().take(8), "text", "", "", null) }, enabled = sections.size < 30, contentPadding = PaddingValues(0.dp)) {
                    Text("+ Add a section", color = MaterialTheme.colorScheme.primary)
                }
                Box {
                    LettersField(
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
                LettersField(
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
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            val titleStyle = MaterialTheme.typography.labelMedium.copy(letterSpacing = 1.5.sp, color = c.onSurfaceVariant)
            BasicTextField(
                value = s.title,
                onValueChange = { onChange(s.copy(title = it.take(80))) },
                textStyle = titleStyle,
                cursorBrush = SolidColor(c.primary),
                singleLine = true,
                modifier = Modifier.weight(1f),
                decorationBox = { inner ->
                    Box {
                        if (s.title.isEmpty()) Text("SECTION TITLE", style = titleStyle)
                        inner()
                    }
                },
            )
            Box {
                IconButton(onClick = { menu = true }) { Icon(Icons.Outlined.MoreHoriz, "Section options", tint = c.onSurfaceVariant) }
                DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                    DropdownMenuItem(text = { Text("Move up") }, onClick = { menu = false; onMove(-1) }, enabled = canMoveUp)
                    DropdownMenuItem(text = { Text("Move down") }, onClick = { menu = false; onMove(1) }, enabled = canMoveDown)
                    DropdownMenuItem(text = { Text("Remove") }, onClick = { menu = false; onRemove() }, enabled = canRemove)
                }
            }
        }
        val listText = when (s.kind) {
            "rules" -> (counts.first?.let { plural(it, "rule") } ?: "The rules") + ", taken from Rules when you send"
            "protocols" -> (counts.second?.let { plural(it, "protocol") } ?: "The protocols") + ", taken from Protocols when you send"
            else -> null
        }
        if (listText != null) {
            Text(listText, style = MaterialTheme.typography.bodyLarge, color = c.onSurfaceVariant)
        } else {
            if (s.id == "limits" && LocalFeatures.current.limits) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Icon(Icons.Outlined.Link, null, Modifier.size(18.dp), tint = c.onSurfaceVariant)
                    Text("Links to your limits list", style = MaterialTheme.typography.bodyLarge, color = c.onSurfaceVariant)
                }
            }
            val bodyStyle = MaterialTheme.typography.titleLarge.copy(fontSize = 22.sp, lineHeight = 31.sp, color = c.onSurface)
            BasicTextField(
                value = s.body,
                onValueChange = { onChange(s.copy(body = it.take(5000))) },
                textStyle = bodyStyle,
                cursorBrush = SolidColor(c.primary),
                minLines = 2,
                modifier = Modifier.fillMaxWidth(),
                decorationBox = { inner ->
                    Box {
                        if (s.body.isEmpty()) Text("Start a line with “- ” for a bullet", style = bodyStyle.copy(color = c.onSurfaceVariant))
                        inner()
                    }
                },
            )
        }
        if (s.noteId != null) {
            Text("Links to the note ${s.noteTitle ?: "it points to"}", style = MaterialTheme.typography.bodyMedium, color = c.onSurfaceVariant)
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
            app.obey.ui.common.DiamondCheckbox(checked = read, onCheckedChange = { read = it })
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
        LettersField(note, { note = it.take(1000) }, label = { Text("Note to $name") }, minLines = 2, modifier = Modifier.fillMaxWidth())
    }
}

/** Whether [v] is waiting on [session]'s person: a partner's proposal they haven't agreed to, or changes asked of their own. */
fun agreementNeedsMe(v: AgreementVersion?, session: Session): Boolean {
    if (v == null || v.status !in OPEN) return false
    val me = session.userId
    return if (v.proposedBy == me) v.status == "changes_requested" else v.status == "proposed" && v.agreements.none { it.userId == me }
}
