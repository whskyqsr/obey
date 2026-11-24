package app.obey.ui.settings

import androidx.compose.material.icons.outlined.Inventory2
import androidx.compose.material.icons.outlined.LocationOn
import androidx.compose.material.icons.outlined.MyLocation
import androidx.compose.material.icons.outlined.Bedtime
import androidx.compose.material.icons.outlined.Block
import android.content.Intent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material.icons.automirrored.outlined.Logout
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.AddLink
import androidx.compose.material.icons.outlined.ContentCopy
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.PersonAdd
import androidx.compose.material.icons.outlined.Group
import androidx.compose.material.icons.outlined.Share
import androidx.compose.material.icons.outlined.SwapHoriz
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material3.AlertDialog
import app.obey.ui.common.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import app.obey.ui.common.TonalButton
import app.obey.ui.common.ChoiceChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import app.obey.ui.common.LettersField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import app.obey.ui.common.PillSegment
import app.obey.ui.common.PillRow
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import app.obey.ui.common.Switch
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.zIndex
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.obey.ui.common.BackLink
import app.obey.ui.common.PageHeader
import app.obey.api.DynamicDate
import app.obey.api.Features
import app.obey.api.Member
import app.obey.api.Relationship
import app.obey.api.ReschedulePolicy
import app.obey.api.Role
import app.obey.api.title
import app.obey.auth.AuthState
import app.obey.data.SessionState
import app.obey.ui.common.Avatar
import app.obey.ui.common.MessageEffect
import app.obey.ui.common.SectionHeader
import app.obey.ui.common.formatDate
import app.obey.ui.common.formatDateTime
import app.obey.ui.onboarding.CreateRelationshipForm
import app.obey.ui.onboarding.JoinRelationshipForm
import app.obey.ui.onboarding.label
import app.obey.ui.tasks.Stepper
import java.time.Instant
import java.time.ZoneId

internal data class FeatureRow(val label: String, val help: String, val get: (Features) -> Boolean, val set: (Features, Boolean) -> Features)

internal val featureRows = listOf(
    FeatureRow("Points and rewards", "Tasks earn points that can be spent on rewards.", { it.points }, { f, on -> f.copy(points = on) }),
    FeatureRow("Consequences", "A list of consequences, and one per task if it's missed.", { it.consequences }, { f, on -> f.copy(consequences = on) }),
    FeatureRow("Rules", "A shared list of standing rules.", { it.rules }, { f, on -> f.copy(rules = on) }),
    FeatureRow("Protocols", "Exactly what's expected, and when and how it's done.", { it.protocols }, { f, on -> f.copy(protocols = on) }),
    FeatureRow("Journal", "Dated entries with a mood.", { it.journal }, { f, on -> f.copy(journal = on) }),
    FeatureRow("Stats", "How tasks are going: done and missed over time, by weekday and by task.", { it.stats }, { f, on -> f.copy(stats = on) }),
    FeatureRow("Monthly review", "A focus for each month, and a look back on it together at the end.", { it.review }, { f, on -> f.copy(review = on) }),
    FeatureRow("Location tasks", "Tasks done by getting somewhere, like the gym by 6, checked by the sub's phone.", { it.location }, { f, on -> f.copy(location = on) }),
    FeatureRow("Limits", "A shared list you each rate, from love to hard limit, seen side by side once you've both finished.", { it.limits }, { f, on -> f.copy(limits = on) }),
    FeatureRow("Agreement", "One page you both sign: why you're doing this, what each of you will do, limits and safewords.", { it.agreement }, { f, on -> f.copy(agreement = on) }),
    FeatureRow("Scenes", "Log scenes and how each of you felt about them, keep aftercare plans, and check in the day after.", { it.scenes }, { f, on -> f.copy(scenes = on) }),
    FeatureRow(
        "Chastity",
        "Locks with a set time or until released, a sealed keybox code, asks for a break or release, and consequences and rewards that add or take off time.",
        { it.chastity },
        { f, on -> f.copy(chastity = on) },
    ),
)

/** "Jake & Kitten": the relationship's own name, or everyone in it with you first. */
fun dynamicTitle(rel: Relationship, myId: String): String {
    rel.name?.let { return it }
    val names = rel.members.sortedByDescending { it.userId == myId }.map { it.displayName }
    return if (names.size > 1) names.dropLast(1).joinToString(", ") + " & " + names.last() else "${names.firstOrNull().orEmpty()} (waiting for a partner)"
}

/** The people in a dynamic as overlapping avatars. [ring] matches the surface behind them. */
@Composable
fun AvatarStack(members: List<Member>, load: suspend (String, String) -> androidx.compose.ui.graphics.ImageBitmap?, size: Dp, ring: Color, collared: (Member) -> Boolean = { false }, serif: Boolean = false) {
    Row {
        members.take(4).forEachIndexed { i, m ->
            val c = collared(m)
            Avatar(
                m.userId, m.displayName, m.avatarVersion, load,
                // A collared sub sits on top so the badge isn't hidden under the next picture.
                modifier = Modifier
                    .zIndex(if (c) 1f else 0f)
                    .offset(x = -(size / (if (serif) 4 else 5)) * i)
                    .border(if (serif) 1.dp else 4.dp, ring, CircleShape),
                size = size,
                collared = c,
                serif = serif,
            )
        }
    }
}

/** "Sir leads · Kitten is the submissive"; a switch "switches". */
fun whoLeads(members: List<Member>): String = members.joinToString(" · ") {
    when (it.role) {
        Role.Dominant -> "${it.displayName} leads"
        Role.Submissive -> "${it.displayName} is the submissive"
        else -> "${it.displayName} switches"
    }
}

/** The hairline between rows. */
@Composable
private fun Hair() = HorizontalDivider(Modifier.padding(horizontal = 16.dp), color = MaterialTheme.colorScheme.outlineVariant)

/** An action written as a link: "Add a date", "Join with a link or code". */
@Composable
private fun LinkRow(text: String, onClick: () -> Unit) {
    Text(
        text,
        style = MaterialTheme.typography.bodyLarge,
        color = MaterialTheme.colorScheme.primary,
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 16.dp, vertical = 16.dp),
    )
}

/** Everyone's mood over the last month, one line each: the submissive's in ink, the others dashed in the accent. */
@Composable
private fun BothMoods(rel: Relationship, myId: String, header: @Composable () -> Unit) {
    val vm: app.obey.ui.common.MoodViewModel = hiltViewModel(key = "moods-both")
    LaunchedEffect(Unit) { vm.load(30) }
    val all by vm.entries.collectAsStateWithLifecycle()
    val list = all.orEmpty()
    if (list.isEmpty()) return
    val people = list.map { it.userId }.distinct().sortedBy { id -> if (rel.members.firstOrNull { it.userId == id }?.role == Role.Submissive) 0 else 1 }
    val ink = MaterialTheme.colorScheme.onSurface
    val accent = MaterialTheme.colorScheme.primary
    header()
    val end = System.currentTimeMillis()
    val start = end - 30L * 86_400_000L
    androidx.compose.foundation.Canvas(Modifier.padding(horizontal = 16.dp, vertical = 8.dp).fillMaxWidth().height(90.dp)) {
        val y = { m: Int -> 6.dp.toPx() + ((5 - m) / 4f) * (size.height - 12.dp.toPx()) }
        people.forEachIndexed { i, id ->
            val pts = list.filter { it.userId == id }.sortedBy { it.at }.map { e ->
                val t = runCatching { Instant.parse(e.at).toEpochMilli() }.getOrDefault(end)
                androidx.compose.ui.geometry.Offset(((t - start).toFloat() / (end - start)) * size.width, y(e.mood))
            }
            val path = androidx.compose.ui.graphics.Path()
            if (pts.size == 1) {
                path.moveTo(0f, pts[0].y); path.lineTo(size.width, pts[0].y)
            } else pts.forEachIndexed { j, p -> if (j == 0) path.moveTo(p.x, p.y) else path.lineTo(p.x, p.y) }
            drawPath(
                path,
                color = if (i == 0) ink else accent,
                style = androidx.compose.ui.graphics.drawscope.Stroke(
                    width = (if (i == 0) 2f else 1.75f).dp.toPx(),
                    join = androidx.compose.ui.graphics.StrokeJoin.Round,
                    pathEffect = if (i == 0) null else androidx.compose.ui.graphics.PathEffect.dashPathEffect(floatArrayOf(5.dp.toPx(), 4.dp.toPx())),
                ),
            )
        }
    }
    Row(Modifier.padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(20.dp)) {
        people.forEachIndexed { i, id ->
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                androidx.compose.foundation.Canvas(Modifier.width(20.dp).height(2.dp)) {
                    drawLine(
                        if (i == 0) ink else accent,
                        androidx.compose.ui.geometry.Offset(0f, size.height / 2),
                        androidx.compose.ui.geometry.Offset(size.width, size.height / 2),
                        strokeWidth = 2.dp.toPx(),
                        pathEffect = if (i == 0) null else androidx.compose.ui.graphics.PathEffect.dashPathEffect(floatArrayOf(4.dp.toPx(), 3.dp.toPx())),
                    )
                }
                Text(if (id == myId) "You" else rel.members.firstOrNull { it.userId == id }?.displayName ?: "Someone", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

internal fun inviteDefault(role: Role?): Role? = when (role) {
    Role.Dominant -> Role.Submissive
    Role.Submissive -> Role.Dominant
    else -> null
}

/** Everything about the relationship itself: who's in it, inviting, how it works, and which features are on. */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun DynamicScreen(onBack: () -> Unit, startInvite: Boolean = false, startFeatures: Boolean = false, onPlaces: () -> Unit = {}, onLocation: () -> Unit = {}, onCurfew: () -> Unit = {}, vm: SettingsViewModel = hiltViewModel()) {
    val sessionState by vm.session.collectAsStateWithLifecycle()
    val busy by vm.busy.collectAsStateWithLifecycle()
    val message by vm.message.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    MessageEffect(message, snackbar, vm::messageShown)
    var dialog by rememberSaveable { mutableStateOf(if (startInvite) "invite" else null) } // "relname" | "create" | "join" | "invite"
    val session = (sessionState as? SessionState.Ready)?.session
    var editingDate by remember { mutableStateOf<DynamicDate?>(null) }

    // People, other dynamics and leaving open as their own page, as in the mockups.
    var people by rememberSaveable { mutableStateOf(false) }
    androidx.activity.compose.BackHandler(people) { people = false }
    // How it works (mockup 87): the app's own rules for this dynamic, on a page of its own. Settings' proof-photo row opens it directly.
    var how by rememberSaveable { mutableStateOf(startFeatures) }
    androidx.activity.compose.BackHandler(how) { how = false }
    var ai by rememberSaveable { mutableStateOf(false) }
    androidx.activity.compose.BackHandler(ai) { ai = false }
    val ended = session?.relationship?.ended == true

    Scaffold(
        topBar = {
            if (people) {
                PageHeader(
                title = "People", navigation = { BackLink("Your dynamic") { people = false } })
            } else if (ai) {
                PageHeader(
                title = "AI access", navigation = { BackLink("Your dynamic") { ai = false } })
            } else if (how) {
                PageHeader(
                title = "How it works", navigation = { BackLink("Your dynamic") { how = false } })
            } else {
                TopAppBar(
                    title = {},
                    navigationIcon = { BackLink("Us", onBack) },
                    actions = {
                        if (!ended) IconButton(onClick = { vm.clearInvite(); dialog = "invite" }) { Icon(Icons.Outlined.PersonAdd, "Invite someone") }
                    },
                )
            }
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        val s = session ?: return@Scaffold
        val rel = s.relationship ?: return@Scaffold
        val me = rel.members.firstOrNull { it.userId == s.userId }
        val c = MaterialTheme.colorScheme
        Box(Modifier.padding(padding).fillMaxSize(), contentAlignment = Alignment.TopCenter) {
            val scroll = rememberScrollState()
            if (ai) {
                AiAccessPage(s, rel)
            } else if (how) {
                HowItWorks(s, rel, busy, vm, onRename = { dialog = "relname" })
            } else if (people) {
                Column(Modifier.widthIn(max = 720.dp).fillMaxWidth().verticalScroll(rememberScrollState())) {
                    rel.members.forEach { m ->
                        ListItem(
                            leadingContent = { Avatar(m.userId, m.displayName, m.avatarVersion, vm::loadAvatar, size = 44.dp, collared = rel.isCollared(m.userId), serif = true) },
                            headlineContent = { Text(m.displayName) },
                            supportingContent = { Text(if (m.userId == s.userId) "${m.role.label} · you" else m.role.label) },
                            trailingContent = { if (m.userId != s.userId) app.obey.ui.proof.ReportPersonButton(m.userId, text = true) },
                        )
                        Hair()
                    }
                    if (!rel.ended) {
                        OutlinedButton(
                            onClick = { vm.clearInvite(); dialog = "invite" },
                            modifier = Modifier.padding(16.dp).fillMaxWidth().height(56.dp),
                        ) {
                            Icon(Icons.Outlined.PersonAdd, null, Modifier.size(18.dp))
                            Spacer(Modifier.width(8.dp))
                            Text("Invite someone")
                        }
                    }
                    SectionHeader("Other dynamics")
                    s.me.relationships.filter { it.id != rel.id }.forEach { r ->
                        ListItem(
                            modifier = Modifier.clickable { vm.selectRelationship(r.id) },
                            headlineContent = { Text(r.title(s.userId)) },
                            trailingContent = { Icon(Icons.AutoMirrored.Outlined.KeyboardArrowRight, null) },
                        )
                        Hair()
                    }
                    LinkRow("Join with a link or code") { dialog = "join" }
                    Hair()
                    LinkRow("Start a new one") { dialog = "create" }
                    Hair()
                    SectionHeader(if (rel.ended) "Blocking" else "Leaving")
                    Text(
                        if (rel.ended) "Blocking stops them pairing with you again."
                        else "Leaving or blocking ends this dynamic for everyone in it. You each keep a read-only copy. Proof photos are deleted.",
                        style = MaterialTheme.typography.bodyLarge,
                        color = c.onSurfaceVariant,
                        modifier = Modifier.padding(horizontal = 16.dp),
                    )
                    // Kept apart from everything that edits, so it's never hit by accident.
                    androidx.compose.foundation.layout.FlowRow(Modifier.padding(16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        if (!rel.ended) OutlinedButton(onClick = { dialog = "leave" }) { Text("Leave") }
                        s.partners.forEach { p ->
                            OutlinedButton(
                                onClick = { dialog = "block:${p.userId}" },
                                border = androidx.compose.foundation.BorderStroke(1.dp, c.error),
                            ) { Text(if (s.partners.size > 1) "Block ${p.displayName}" else "Block", color = c.error) }
                        }
                    }
                    Spacer(Modifier.height(24.dp))
                }
            } else Column(Modifier.widthIn(max = 720.dp).fillMaxWidth().verticalScroll(scroll)) {
                Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    AvatarStack(rel.members, vm::loadAvatar, size = 72.dp, ring = c.outlineVariant, collared = { rel.isCollared(it.userId) }, serif = true)
                    Spacer(Modifier.height(12.dp))
                    Text(dynamicTitle(rel, s.userId), style = MaterialTheme.typography.displaySmall, textAlign = TextAlign.Center)
                    Text(
                        whoLeads(rel.members),
                        style = MaterialTheme.typography.bodyLarge,
                        color = c.onSurfaceVariant,
                        textAlign = TextAlign.Center,
                    )
                }

                if (rel.ended) {
                    Surface(
                        color = c.surface,
                        contentColor = c.onSurfaceVariant,
                        border = androidx.compose.foundation.BorderStroke(1.dp, c.outlineVariant),
                        shape = androidx.compose.foundation.shape.RoundedCornerShape(8.dp),
                        modifier = Modifier.padding(horizontal = 16.dp).fillMaxWidth(),
                    ) {
                        Row(Modifier.padding(16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            Icon(Icons.Outlined.Inventory2, null)
                            Text(endedLine(rel, s), style = MaterialTheme.typography.bodyMedium)
                        }
                    }
                }

                val today = java.time.LocalDate.now()
                val dates = rel.dates.sortedBy { d -> runCatching { daysUntilNext(java.time.LocalDate.parse(d.date), today) }.getOrDefault(Long.MAX_VALUE) }
                if (s.canManage || dates.isNotEmpty()) {
                    SectionHeader("Dates")
                    dates.forEach { d ->
                        ListItem(
                            modifier = if (s.canManage) Modifier.clickable { editingDate = d } else Modifier,
                            headlineContent = { Text(d.label) },
                            trailingContent = {
                                Text(
                                    runCatching { describeDate(java.time.LocalDate.parse(d.date), today) }.getOrDefault(d.date),
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = c.onSurfaceVariant,
                                    textAlign = TextAlign.End,
                                    modifier = Modifier.widthIn(max = 220.dp),
                                )
                            },
                        )
                        Hair()
                    }
                    if (s.canManage) {
                        LinkRow("Add a date") { editingDate = DynamicDate("", "", "") }
                        Hair()
                    }
                }

                BothMoods(rel, s.userId) { SectionHeader("Mood, both of you") }

                val swapWith = app.obey.ui.roles.swapPartner(s)
                val swap = rel.roleSwap
                val inSwap = swap != null && (swap.requestedBy == s.userId || swap.partnerId == s.userId)
                if (!rel.ended) {
                    SectionHeader("Together")
                    if (swapWith != null || inSwap) {
                        val opens = swap == null || swap.active || swap.requestedBy == s.userId
                        ListItem(
                            modifier = if (opens) Modifier.clickable { dialog = if (swap == null) "swap" else "end-swap" } else Modifier,
                            leadingContent = { Icon(Icons.Outlined.SwapHoriz, null) },
                            headlineContent = { Text(if (swap?.active == true) "Roles swapped" else if (swap != null) "Swap asked for" else "Swap roles for a while") },
                            supportingContent = {
                                Text(
                                    when {
                                        swap == null -> "Both of you agree first"
                                        swap.active -> swap.endsAt?.let { "Until ${app.obey.ui.roles.formatSwapEnd(it)}" } ?: "Until one of you swaps back"
                                        swap.requestedBy == s.userId -> "Waiting for ${s.nameOf(swap.partnerId)} to accept"
                                        else -> "${s.nameOf(swap.requestedBy)} asked; answer on Today"
                                    },
                                )
                            },
                        )
                        Hair()
                        when (dialog) {
                            "swap" -> app.obey.ui.roles.SwapSheet(s, onDismiss = { dialog = null })
                            "end-swap" -> swap?.let { app.obey.ui.roles.EndSwapDialog(s, it, onDismiss = { dialog = null }) }
                        }
                    }
                    ListItem(
                        modifier = Modifier.clickable { vm.clearInvite(); dialog = "invite" },
                        leadingContent = { Icon(Icons.Outlined.PersonAdd, null) },
                        headlineContent = { Text("Invite someone") },
                        supportingContent = { Text("Link or code") },
                    )
                    Hair()
                    ListItem(
                        modifier = Modifier.clickable { ai = true },
                        leadingContent = { Icon(Icons.Outlined.AutoAwesome, null) },
                        headlineContent = { Text("AI access") },
                        trailingContent = {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(aiAccessState(rel, s.userId), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                Icon(Icons.AutoMirrored.Outlined.KeyboardArrowRight, null)
                            }
                        },
                    )
                    Hair()
                }

                SectionHeader("People")
                ListItem(
                    modifier = Modifier.clickable { people = true },
                    leadingContent = { Icon(Icons.Outlined.Group, null) },
                    headlineContent = { Text(rel.members.joinToString(", ") { if (it.userId == s.userId) "You" else it.displayName }) },
                    trailingContent = { Icon(Icons.AutoMirrored.Outlined.KeyboardArrowRight, null) },
                )
                Hair()

                ListItem(
                    modifier = Modifier.clickable { how = true },
                    headlineContent = { Text("How it works") },
                    trailingContent = { Icon(Icons.AutoMirrored.Outlined.KeyboardArrowRight, null) },
                )
                Hair()
                if (rel.ended && me?.aiAccess == true) {
                    ListItem(
                        modifier = Modifier.clickable { ai = true },
                        headlineContent = { Text("AI access") },
                        trailingContent = { Icon(Icons.AutoMirrored.Outlined.KeyboardArrowRight, null) },
                    )
                    Hair()
                }

                Spacer(Modifier.height(24.dp))
            }
        }

        if (dialog == "leave" || dialog?.startsWith("block:") == true) {
            val target = dialog?.removePrefix("block:")?.let { id -> s.partners.firstOrNull { it.userId == id } }
            LeaveDialog(
                partners = s.partners,
                target = target,
                ended = rel.ended,
                busy = busy,
                onDismiss = { dialog = null },
                onConfirm = { block -> vm.leave(block, blockOnly = target != null); dialog = null },
            )
        }

        if (dialog == "invite") {
            ModalBottomSheet(onDismissRequest = { dialog = null }) {
                Column(Modifier.padding(start = 24.dp, end = 24.dp, bottom = 32.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("Invite someone", style = MaterialTheme.typography.headlineSmall)
                    Text(
                        "They open the link, sign in or create an account, and accept.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    InviteControls(vm, initialRole = me?.role)
                }
            }
        }
    }

    editingDate?.let { d ->
        DynamicDateDialog(
            d,
            onDismiss = { editingDate = null },
            onSave = { vm.saveDate(it); editingDate = null },
            onDelete = { vm.saveDate(null, removeId = d.id); editingDate = null },
        )
    }

    when (dialog) {
        "relname" -> session?.relationship?.let { rel ->
            var name by rememberSaveable { mutableStateOf(rel.name.orEmpty()) }
            AlertDialog(
                onDismissRequest = { dialog = null },
                title = { Text("Name this relationship") },
                text = {
                    LettersField(
                        value = name,
                        onValueChange = { name = it.take(80) },
                        singleLine = true,
                        placeholder = { Text(rel.copy(name = null).title(session.userId)) },
                        supportingText = { Text("Optional. Leave it blank to show your partner's name.") },
                    )
                },
                confirmButton = {
                    TextButton(
                        enabled = !busy && name.trim() != rel.name.orEmpty(),
                        onClick = { vm.renameRelationship(name); dialog = null },
                    ) { Text("Save") }
                },
                dismissButton = { TextButton(onClick = { dialog = null }) { Text("Cancel") } },
            )
        }
        "create" -> AlertDialog(
            onDismissRequest = { dialog = null },
            title = { Text("New relationship") },
            text = { CreateRelationshipForm(busy) { name, role -> vm.createRelationship(name, role); dialog = null } },
            confirmButton = {},
            dismissButton = { TextButton(onClick = { dialog = null }) { Text("Cancel") } },
        )
        "join" -> AlertDialog(
            onDismissRequest = { dialog = null },
            title = { Text("Join with a link or code") },
            text = { JoinRelationshipForm(busy, vm::previewInvite) { code, role -> vm.join(code, role); dialog = null } },
            confirmButton = {},
            dismissButton = { TextButton(onClick = { dialog = null }) { Text("Cancel") } },
        )
    }
}

/** Name, who moves deadlines, when "any time" tasks are reminded, sub notes and how long proof photos stay: mockup 87. Only a Dominant changes them. */
@Composable
private fun HowItWorks(s: app.obey.data.Session, rel: Relationship, busy: Boolean, vm: SettingsViewModel, onRename: () -> Unit) {
    val manage = s.canManage && !rel.ended
    val subName = rel.members.firstOrNull { it.role == Role.Submissive }?.displayName ?: "The submissive"
    var pickingProofDays by remember { mutableStateOf(false) }
    var pickingAnytime by remember { mutableStateOf(false) }
    Column(Modifier.widthIn(max = 720.dp).fillMaxWidth().verticalScroll(rememberScrollState())) {
        if (!manage) {
            Text(
                if (rel.ended) "This dynamic has ended, so nothing here can change." else "Only a Dominant changes these.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = 16.dp),
            )
        }
        ListItem(
            modifier = if (manage) Modifier.clickable(onClick = onRename) else Modifier,
            headlineContent = { Text("Name") },
            supportingContent = { Text(rel.name ?: "None set, so it shows ${rel.copy(name = null).title(s.userId)}") },
            trailingContent = { if (manage) Icon(Icons.Outlined.Edit, "Name this relationship") },
        )
        Hair()
        SectionHeader("Moving deadlines")
        listOf(
            Triple(ReschedulePolicy.DominantOnly, "Dominant only", null),
            Triple(ReschedulePolicy.Request, "$subName may ask", if (manage) "You approve or decline" else "A Dominant approves or declines"),
            Triple(ReschedulePolicy.Allowance, "Weekly allowance", "Free delays each week, more need a yes"),
        ).forEach { (p, label, supporting) ->
            ListItem(
                modifier = if (manage && rel.reschedulePolicy != p) Modifier.clickable { vm.updatePolicy(policy = p) } else Modifier,
                leadingContent = { app.obey.ui.common.Diamond(if (rel.reschedulePolicy == p) app.obey.ui.common.DiamondState.Done else app.obey.ui.common.DiamondState.Open) },
                headlineContent = { Text(label) },
                supportingContent = supporting?.let { { Text(it) } },
            )
            Hair()
        }
        if (rel.reschedulePolicy == ReschedulePolicy.Allowance) {
            Box(Modifier.padding(horizontal = 16.dp)) {
                if (manage) Stepper("", rel.weeklyDelayAllowance, "free delays a week", 0..50) { vm.updatePolicy(allowance = it) }
                else Text("${rel.weeklyDelayAllowance} free delays a week", style = MaterialTheme.typography.bodyLarge)
            }
        }
        SectionHeader("Reminders")
        ListItem(
            modifier = if (manage) Modifier.clickable { pickingAnytime = true } else Modifier,
            overlineContent = { Text("Tasks with no time") },
            headlineContent = { Text(app.obey.ui.common.formatClock(rel.anytimeReminder)) },
        )
        Hair()
        SectionHeader("Notes")
        ListItem(
            headlineContent = { Text("$subName can write their own notes") },
            trailingContent = { Switch(checked = rel.subNotes, onCheckedChange = vm::setSubNotes, enabled = manage && !busy) },
        )
        Hair()
        SectionHeader("Proof photos")
        ListItem(
            modifier = if (rel.ended) Modifier else Modifier.clickable { pickingProofDays = true },
            overlineContent = { Text("Keep them") },
            headlineContent = { Text(rel.proofDays?.let(::proofDaysLabel) ?: "Until you delete them") },
        )
        Hair()
        Spacer(Modifier.height(24.dp))
    }
    if (pickingAnytime) {
        AnytimeReminderDialog(rel.anytimeReminder, onDismiss = { pickingAnytime = false }) { vm.setAnytimeReminder(it); pickingAnytime = false }
    }
    if (pickingProofDays) {
        ProofDaysDialog(rel.proofDays, onDismiss = { pickingProofDays = false }) { vm.setProofDays(it); pickingProofDays = false }
    }
}

/** Who the invite is for, then its link with Copy and Share. Used in Your dynamic and the first-run setup. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun InviteControls(vm: SettingsViewModel, initialRole: Role?) {
    val invite by vm.invite.collectAsStateWithLifecycle()
    val busy by vm.busy.collectAsStateWithLifecycle()
    val clipboard = LocalClipboardManager.current
    val context = LocalContext.current
    var role by rememberSaveable { mutableStateOf(inviteDefault(initialRole)) }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("They'll join as", style = MaterialTheme.typography.labelLarge)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            (listOf<Role?>(Role.Submissive, Role.Dominant, Role.Switch) + null).forEach { r ->
                ChoiceChip(
                    selected = role == r,
                    onClick = { role = r; vm.clearInvite() },
                    label = { Text(r?.label ?: "Let them choose") },
                )
            }
        }
        val inv = invite
        if (inv == null) {
            Button(onClick = { vm.createInvite(role) }, enabled = !busy, modifier = Modifier.fillMaxWidth()) { Text("Create link") }
        } else {
            Surface(color = MaterialTheme.colorScheme.surface, shape = MaterialTheme.shapes.medium) {
                Text(inv.link.removePrefix("https://"), style = MaterialTheme.typography.bodyLarge, modifier = Modifier.padding(16.dp).fillMaxWidth())
            }
            Text(
                "Works once · code ${inv.code} · expires ${formatDateTime(inv.expiresAt)}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = { clipboard.setText(AnnotatedString(inv.link)) }, modifier = Modifier.weight(1f)) {
                    Icon(Icons.Outlined.ContentCopy, null)
                    Text("  Copy")
                }
                Button(
                    onClick = {
                        val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, inv.link)
                        context.startActivity(Intent.createChooser(send, "Share invite link"))
                    },
                    modifier = Modifier.weight(1f),
                ) {
                    Icon(Icons.Outlined.Share, null)
                    Text("  Share")
                }
            }
        }
    }
}

/** "Kit ended this dynamic on 20 Oct 2026. It's kept here…" */
private fun endedLine(rel: app.obey.api.Relationship, s: app.obey.data.Session): String {
    val who = when (rel.endedBy) {
        s.userId -> "You"
        null -> "Someone"
        else -> s.nameOf(rel.endedBy)
    }
    val on = rel.endedAt?.let { runCatching { formatDate(java.time.OffsetDateTime.parse(it).atZoneSameInstant(ZoneId.systemDefault()).toLocalDate()) }.getOrNull() }
    return "$who ended this dynamic${on?.let { " on $it" } ?: ""}. It's kept here so you can look back, but nothing in it can change."
}

/**
 * Leaving ends the dynamic for both (Jake's "archive for both"). Blocking one person does the same and stops that
 * person pairing with you again; it still works on a dynamic that already ended.
 */
@Composable
private fun LeaveDialog(
    partners: List<app.obey.api.Member>,
    target: app.obey.api.Member?,
    ended: Boolean,
    busy: Boolean,
    onDismiss: () -> Unit,
    onConfirm: (List<String>) -> Unit,
) {
    var block by remember { mutableStateOf(listOfNotNull(target?.userId)) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(
                when {
                    target == null -> "Leave this dynamic?"
                    ended -> "Block ${target.displayName}?"
                    else -> "Block ${target.displayName} and end this dynamic?"
                },
            )
        },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                if (!ended) {
                    Text("This ends the dynamic for everyone in it. You each keep a read-only copy of its tasks, notes and history. Open tasks are cancelled and proof photos are deleted.")
                }
                if (target != null) {
                    Text("${target.displayName} won't be able to pair with you again. They aren't told you blocked them.")
                } else {
                    partners.forEach { p ->
                        val on = p.userId in block
                        Row(Modifier.fillMaxWidth().clickable { block = if (on) block - p.userId else block + p.userId }, verticalAlignment = Alignment.CenterVertically) {
                            app.obey.ui.common.DiamondCheckbox(checked = on, onCheckedChange = { block = if (it) block + p.userId else block - p.userId })
                            Text("Also block ${p.displayName}, so they can't pair with you again")
                        }
                    }
                }
            }
        },
        confirmButton = {
            androidx.compose.material3.Button(
                onClick = { onConfirm(block) },
                enabled = !busy,
                colors = androidx.compose.material3.ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error, contentColor = MaterialTheme.colorScheme.onError),
            ) { Text(if (target != null) "Block" else "Leave") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

/** Hourly from noon to 11 PM, plus whatever is stored if it's off the hour. Same list as on web. */
private fun anytimeTimes(current: String): List<String> {
    val hours = (12..23).map { "%02d:00".format(it) }
    return if (current in hours) hours else (hours + current).sorted()
}

@Composable
private fun AnytimeReminderDialog(current: String, onDismiss: () -> Unit, onPick: (String) -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Tasks with no time") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                anytimeTimes(current).forEach { t ->
                    Row(
                        Modifier.fillMaxWidth().clickable { onPick(t) }.padding(vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        RadioButton(selected = current == t, onClick = { onPick(t) })
                        Text(app.obey.ui.common.formatClock(t))
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

/** How long proof photos are kept once their task is done. */
private val PROOF_DAYS = listOf(1, 7, 30)

fun proofDaysLabel(days: Int) = when (days) {
    1 -> "A day after the task is done"
    7 -> "A week after the task is done"
    else -> "$days days after the task is done"
}

@Composable
private fun ProofDaysDialog(current: Int?, onDismiss: () -> Unit, onPick: (Int?) -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Keep proof photos") },
        text = {
            Column {
                (listOf<Int?>(null) + PROOF_DAYS).forEach { d ->
                    Row(
                        Modifier.fillMaxWidth().clickable { onPick(d) }.padding(vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        RadioButton(selected = current == d, onClick = { onPick(d) })
                        Text(d?.let(::proofDaysLabel) ?: "Until you delete them")
                    }
                }
                Text(
                    "Either of you can change this. A photo that's been reported stays until it's reviewed.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 8.dp),
                )
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}
