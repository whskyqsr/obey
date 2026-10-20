package app.obey.ui.settings

import androidx.compose.material3.Switch
import app.obey.api.Features
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.automirrored.outlined.Logout
import androidx.compose.material.icons.outlined.ContentCopy
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material3.AlertDialog
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
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
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
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.obey.api.ReschedulePolicy
import app.obey.api.title
import app.obey.auth.AuthState
import app.obey.ui.common.Avatar
import app.obey.data.SessionState
import app.obey.ui.common.MessageEffect
import app.obey.ui.common.SectionHeader
import app.obey.ui.common.formatDateTime
import app.obey.ui.onboarding.CreateRelationshipForm
import app.obey.ui.onboarding.JoinRelationshipForm
import app.obey.ui.onboarding.label
import app.obey.ui.tasks.Stepper

private data class FeatureRow(val label: String, val help: String, val get: (Features) -> Boolean, val set: (Features, Boolean) -> Features)

private val featureRows = listOf(
    FeatureRow("Points and rewards", "Tasks earn points that can be spent on rewards.", { it.points }, { f, on -> f.copy(points = on) }),
    FeatureRow("Consequences", "A list of consequences, and one per task if it's missed.", { it.consequences }, { f, on -> f.copy(consequences = on) }),
    FeatureRow("Rules", "A shared list of standing rules.", { it.rules }, { f, on -> f.copy(rules = on) }),
    FeatureRow("Journal", "Dated entries with a mood.", { it.journal }, { f, on -> f.copy(journal = on) }),
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(onBack: () -> Unit, vm: SettingsViewModel = hiltViewModel()) {
    val sessionState by vm.session.collectAsStateWithLifecycle()
    val devUserId by vm.devUserId.collectAsStateWithLifecycle()
    val invite by vm.invite.collectAsStateWithLifecycle()
    val appIcon by vm.appIcon.collectAsStateWithLifecycle()
    val authState by vm.authState.collectAsStateWithLifecycle()
    val pickPhoto = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        uri?.let(vm::setAvatar)
    }
    val busy by vm.busy.collectAsStateWithLifecycle()
    val message by vm.message.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    MessageEffect(message, snackbar, vm::messageShown)
    val clipboard = LocalClipboardManager.current

    var devField by rememberSaveable { mutableStateOf("") }
    LaunchedEffect(devUserId) { devField = devUserId.orEmpty() }
    var dialog by rememberSaveable { mutableStateOf<String?>(null) } // "create" | "join" | "name" | "relname"

    val session = (sessionState as? SessionState.Ready)?.session

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Settings") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Back") } },
            )
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        Box(Modifier.padding(padding).fillMaxSize(), contentAlignment = Alignment.TopCenter) {
            Column(Modifier.widthIn(max = 720.dp).fillMaxWidth().verticalScroll(rememberScrollState())) {
                SectionHeader("Account")
                if (session != null) {
                    val user = session.me.user
                    ListItem(
                        modifier = Modifier.clickable { dialog = "name" },
                        leadingContent = { Avatar(user.id, user.displayName, user.avatarVersion, vm::loadAvatar, size = 56.dp) },
                        headlineContent = { Text(user.displayName) },
                        trailingContent = { Icon(Icons.Outlined.Edit, "Change display name") },
                        supportingContent = {
                            val method = when ((authState as? AuthState.Firebase)?.provider) {
                                "password" -> "Signed in with email"
                                "google.com" -> "Signed in with Google"
                                else -> if (authState is AuthState.Dev) "Dev sign-in" else "Signed in"
                            }
                            Text(listOfNotNull(method, user.email).joinToString("\n"))
                        },
                    )
                    Row(Modifier.padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        FilledTonalButton(
                            onClick = { pickPhoto.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
                            enabled = !busy,
                        ) { Text(if (user.avatarVersion == null) "Add photo" else "Change photo") }
                        if (user.avatarVersion != null) TextButton(onClick = vm::removeAvatar, enabled = !busy) { Text("Remove") }
                    }
                }

                SectionHeader("App icon")
                AppIconPicker(appIcon, vm::setAppIcon)

                session?.let { s ->
                    SectionHeader("Relationship")
                    if (s.me.relationships.size > 1) {
                        s.me.relationships.forEach { r ->
                            ListItem(
                                modifier = Modifier.clickable { vm.selectRelationship(r.id) },
                                leadingContent = { RadioButton(selected = r.id == s.relationship?.id, onClick = { vm.selectRelationship(r.id) }) },
                                headlineContent = { Text(r.title(s.userId)) },
                                supportingContent = { Text(r.members.joinToString { it.displayName }) },
                            )
                        }
                        HorizontalDivider()
                    }
                    s.relationship?.let { rel ->
                        ListItem(
                            modifier = if (s.canManage) Modifier.clickable { dialog = "relname" } else Modifier,
                            headlineContent = { Text(rel.title(s.userId)) },
                            supportingContent = { Text(if (rel.name == null) "No name; your partner's name shows instead" else "Relationship name") },
                            trailingContent = { if (s.canManage) Icon(Icons.Outlined.Edit, "Name this relationship") },
                        )
                        rel.members.forEach { m ->
                            ListItem(
                                leadingContent = { Avatar(m.userId, m.displayName, m.avatarVersion, vm::loadAvatar) },
                                headlineContent = { Text(m.displayName + if (m.userId == s.userId) " (you)" else "") },
                                supportingContent = { Text(m.role.label) },
                            )
                        }
                        Row(Modifier.padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            FilledTonalButton(onClick = vm::createInvite, enabled = !busy) { Text("Invite partner") }
                            OutlinedButton(onClick = { dialog = "join" }) { Text("Join another") }
                            TextButton(onClick = { dialog = "create" }) { Text("New") }
                        }
                        invite?.let { inv ->
                            Card(
                                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.tertiaryContainer),
                                modifier = Modifier.padding(16.dp).fillMaxWidth(),
                            ) {
                                Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                                    Column(Modifier.weight(1f)) {
                                        Text("Invite code", style = MaterialTheme.typography.labelLarge)
                                        Text(inv.code, style = MaterialTheme.typography.headlineMedium.copy(fontFamily = FontFamily.Monospace))
                                        Text("Expires ${formatDateTime(inv.expiresAt)}", style = MaterialTheme.typography.bodySmall)
                                    }
                                    IconButton(onClick = { clipboard.setText(AnnotatedString(inv.code)) }) {
                                        Icon(Icons.Outlined.ContentCopy, "Copy code")
                                    }
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
                            if (s.canManage) "Switched-off features are hidden for everyone in this relationship. Nothing is deleted."
                            else "Only a Dominant can change these.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
                        )

                        if (s.canManage) {
                            SectionHeader("Rescheduling")
                            Text(
                                "Who can move deadlines.",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(horizontal = 16.dp),
                            )
                            Row(
                                Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 8.dp),
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                listOf(
                                    ReschedulePolicy.DominantOnly to "Only me",
                                    ReschedulePolicy.Request to "Sub asks, I approve",
                                    ReschedulePolicy.Allowance to "Free delays per week",
                                ).forEach { (p, label) ->
                                    FilterChip(
                                        selected = rel.reschedulePolicy == p,
                                        onClick = { vm.updatePolicy(policy = p) },
                                        label = { Text(label) },
                                    )
                                }
                            }
                            if (rel.reschedulePolicy == ReschedulePolicy.Allowance) {
                                Box(Modifier.padding(horizontal = 16.dp)) {
                                    Stepper("", rel.weeklyDelayAllowance, "free delays a week", 0..50) {
                                        vm.updatePolicy(allowance = it)
                                    }
                                }
                            }
                        }
                    }
                }

                if (vm.devAuthAllowed) {
                    SectionHeader("Developer")
                    Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("API: ${vm.apiBaseUrl}", style = MaterialTheme.typography.bodySmall)
                        Text(
                            "Firebase: " + if (vm.firebaseAvailable) "configured" else "not configured (no google-services.json)",
                            style = MaterialTheme.typography.bodySmall,
                        )
                        OutlinedTextField(
                            value = devField,
                            onValueChange = { devField = it.trim() },
                            label = { Text("Dev user id (X-Dev-User)") },
                            supportingText = { Text("Overrides Firebase. The API must run with DEV_AUTH=1.") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth(),
                        )
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            FilledTonalButton(onClick = { vm.setDevUser(devField) }, enabled = !busy && devField != devUserId.orEmpty()) {
                                Text("Apply")
                            }
                            if (devUserId != null) TextButton(onClick = { vm.setDevUser("") }) { Text("Clear") }
                        }
                    }
                }

                HorizontalDivider(Modifier.padding(top = 24.dp))
                ListItem(
                    modifier = Modifier.clickable(onClick = vm::signOut),
                    leadingContent = { Icon(Icons.AutoMirrored.Outlined.Logout, null, tint = MaterialTheme.colorScheme.error) },
                    headlineContent = { Text("Sign out", color = MaterialTheme.colorScheme.error) },
                )
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
        "name" -> session?.let { s ->
            var name by rememberSaveable { mutableStateOf(s.me.user.displayName) }
            AlertDialog(
                onDismissRequest = { dialog = null },
                title = { Text("Display name") },
                text = {
                    OutlinedTextField(
                        value = name,
                        onValueChange = { name = it.take(40) },
                        singleLine = true,
                        supportingText = { Text("This is what your partner sees in the app and in notifications.") },
                    )
                },
                confirmButton = {
                    TextButton(
                        enabled = !busy && name.isNotBlank() && name.trim() != s.me.user.displayName,
                        onClick = { vm.updateDisplayName(name); dialog = null },
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
            title = { Text("Join with a code") },
            text = { JoinRelationshipForm(busy) { code, role -> vm.join(code, role); dialog = null } },
            confirmButton = {},
            dismissButton = { TextButton(onClick = { dialog = null }) { Text("Cancel") } },
        )
    }
}
