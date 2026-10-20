package app.obey.ui.settings

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
import androidx.compose.material.icons.outlined.Share
import androidx.compose.material.icons.outlined.SwapHoriz
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Switch
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
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
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

private data class FeatureRow(val label: String, val help: String, val get: (Features) -> Boolean, val set: (Features, Boolean) -> Features)

private val featureRows = listOf(
    FeatureRow("Points and rewards", "Tasks earn points that can be spent on rewards.", { it.points }, { f, on -> f.copy(points = on) }),
    FeatureRow("Consequences", "A list of consequences, and one per task if it's missed.", { it.consequences }, { f, on -> f.copy(consequences = on) }),
    FeatureRow("Rules", "A shared list of standing rules.", { it.rules }, { f, on -> f.copy(rules = on) }),
    FeatureRow("Protocols", "Exactly what's expected, and when and how it's done.", { it.protocols }, { f, on -> f.copy(protocols = on) }),
    FeatureRow("Journal", "Dated entries with a mood.", { it.journal }, { f, on -> f.copy(journal = on) }),
)

/** "Jake & Kitten": the relationship's own name, or everyone in it with you first. */
fun dynamicTitle(rel: Relationship, myId: String): String {
    rel.name?.let { return it }
    val names = rel.members.sortedByDescending { it.userId == myId }.map { it.displayName }
    return if (names.size > 1) names.dropLast(1).joinToString(", ") + " & " + names.last() else "${names.firstOrNull().orEmpty()} (waiting for a partner)"
}

/** The people in a dynamic as overlapping avatars. [ring] matches the surface behind them. */
@Composable
fun AvatarStack(members: List<Member>, load: suspend (String, String) -> androidx.compose.ui.graphics.ImageBitmap?, size: Dp, ring: Color) {
    Row {
        members.take(4).forEachIndexed { i, m ->
            Avatar(
                m.userId, m.displayName, m.avatarVersion, load,
                modifier = Modifier
                    .offset(x = -(size / 5) * i)
                    .border(4.dp, ring, CircleShape),
                size = size,
            )
        }
    }
}

private fun inviteDefault(role: Role?): Role? = when (role) {
    Role.Dominant -> Role.Submissive
    Role.Submissive -> Role.Dominant
    else -> null
}

/** Everything about the relationship itself: who's in it, inviting, how it works, and which features are on. */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun DynamicScreen(onBack: () -> Unit, vm: SettingsViewModel = hiltViewModel()) {
    val sessionState by vm.session.collectAsStateWithLifecycle()
    val invite by vm.invite.collectAsStateWithLifecycle()
    val busy by vm.busy.collectAsStateWithLifecycle()
    val message by vm.message.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    MessageEffect(message, snackbar, vm::messageShown)
    val clipboard = LocalClipboardManager.current
    val context = LocalContext.current
    var dialog by rememberSaveable { mutableStateOf<String?>(null) } // "relname" | "create" | "join" | "invite"
    val session = (sessionState as? SessionState.Ready)?.session

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Your dynamic") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Back") } },
            )
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        val s = session ?: return@Scaffold
        val rel = s.relationship ?: return@Scaffold
        val me = rel.members.firstOrNull { it.userId == s.userId }
        Box(Modifier.padding(padding).fillMaxSize(), contentAlignment = Alignment.TopCenter) {
            Column(Modifier.widthIn(max = 720.dp).fillMaxWidth().verticalScroll(rememberScrollState())) {
                Column(Modifier.fillMaxWidth().padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    AvatarStack(rel.members, vm::loadAvatar, size = 64.dp, ring = MaterialTheme.colorScheme.surface)
                    Spacer(Modifier.height(12.dp))
                    Text(dynamicTitle(rel, s.userId), style = MaterialTheme.typography.headlineSmall, textAlign = TextAlign.Center)
                    val since = runCatching { formatDate(Instant.parse(rel.createdAt).atZone(ZoneId.systemDefault()).toLocalDate()) }.getOrNull()
                    Text(
                        listOfNotNull(me?.let { "You're the ${it.role.label}" }, since?.let { "together in Obey since $it" }).joinToString(" · "),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center,
                    )
                }

                SectionHeader("People")
                rel.members.forEach { m ->
                    ListItem(
                        leadingContent = { Avatar(m.userId, m.displayName, m.avatarVersion, vm::loadAvatar) },
                        headlineContent = { Text(m.displayName + if (m.userId == s.userId) " (you)" else "") },
                        supportingContent = { Text(m.role.label) },
                    )
                }
                ListItem(
                    modifier = Modifier.clickable { vm.clearInvite(); dialog = "invite" },
                    leadingContent = { Icon(Icons.Outlined.PersonAdd, null) },
                    headlineContent = { Text("Invite someone") },
                )

                SectionHeader("How it works")
                ListItem(
                    modifier = if (s.canManage) Modifier.clickable { dialog = "relname" } else Modifier,
                    headlineContent = { Text("Name") },
                    supportingContent = { Text(rel.name ?: "None set, so it shows ${rel.copy(name = null).title(s.userId)}") },
                    trailingContent = { if (s.canManage) Icon(Icons.Outlined.Edit, "Name this relationship") },
                )
                ListItem(
                    headlineContent = { Text("Moving deadlines") },
                    supportingContent = {
                        Text(
                            when (rel.reschedulePolicy) {
                                ReschedulePolicy.DominantOnly -> "Only a Dominant can move deadlines."
                                ReschedulePolicy.Request -> "The sub asks; a Dominant approves or declines."
                                ReschedulePolicy.Allowance -> "${rel.weeklyDelayAllowance} free delays a week; more need approval."
                            },
                        )
                    },
                )
                if (s.canManage) {
                    Row(
                        Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        listOf(
                            ReschedulePolicy.DominantOnly to "Only me",
                            ReschedulePolicy.Request to "Sub asks, I approve",
                            ReschedulePolicy.Allowance to "Free delays per week",
                        ).forEach { (p, label) ->
                            FilterChip(selected = rel.reschedulePolicy == p, onClick = { vm.updatePolicy(policy = p) }, label = { Text(label) })
                        }
                    }
                    if (rel.reschedulePolicy == ReschedulePolicy.Allowance) {
                        Box(Modifier.padding(horizontal = 16.dp)) {
                            Stepper("", rel.weeklyDelayAllowance, "free delays a week", 0..50) { vm.updatePolicy(allowance = it) }
                        }
                    }
                }

                SectionHeader("Features")
                featureRows.forEach { (label, help, get, set) ->
                    ListItem(
                        headlineContent = { Text(label) },
                        supportingContent = { Text(help) },
                        trailingContent = {
                            Switch(
                                checked = get(rel.features),
                                onCheckedChange = { on -> vm.setFeatures(set(rel.features, on), if (on) "$label on" else "$label off") },
                                enabled = s.canManage && !busy,
                            )
                        },
                    )
                }
                Text(
                    if (s.canManage) "Switched-off features are hidden for everyone here. Nothing is deleted."
                    else "Only a Dominant can change how this dynamic works.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
                )

                SectionHeader("Other dynamics")
                s.me.relationships.filter { it.id != rel.id }.forEach { r ->
                    ListItem(
                        modifier = Modifier.clickable { vm.selectRelationship(r.id) },
                        leadingContent = { Icon(Icons.Outlined.SwapHoriz, null) },
                        headlineContent = { Text("Switch to ${r.title(s.userId)}") },
                    )
                }
                ListItem(
                    modifier = Modifier.clickable { dialog = "join" },
                    leadingContent = { Icon(Icons.Outlined.AddLink, null) },
                    headlineContent = { Text("Join with a link or code") },
                )
                ListItem(
                    modifier = Modifier.clickable { dialog = "create" },
                    leadingContent = { Icon(Icons.Outlined.Add, null) },
                    headlineContent = { Text("Start a new one") },
                )
                Spacer(Modifier.height(24.dp))
            }
        }

        if (dialog == "invite") {
            var role by rememberSaveable { mutableStateOf(inviteDefault(me?.role)) }
            ModalBottomSheet(onDismissRequest = { dialog = null }) {
                Column(Modifier.padding(start = 24.dp, end = 24.dp, bottom = 32.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("Invite someone", style = MaterialTheme.typography.headlineSmall)
                    Text(
                        "They open the link, sign in or create an account, and accept.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text("They'll join as", style = MaterialTheme.typography.labelLarge)
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        (listOf<Role?>(Role.Submissive, Role.Dominant, Role.Switch) + null).forEach { r ->
                            FilterChip(
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
        }
    }

    when (dialog) {
        "relname" -> session?.relationship?.let { rel ->
            var name by rememberSaveable { mutableStateOf(rel.name.orEmpty()) }
            AlertDialog(
                onDismissRequest = { dialog = null },
                title = { Text("Name this relationship") },
                text = {
                    OutlinedTextField(
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
            text = { JoinRelationshipForm(busy) { code, role -> vm.join(code, role); dialog = null } },
            confirmButton = {},
            dismissButton = { TextButton(onClick = { dialog = null }) { Text("Cancel") } },
        )
    }
}
