package app.obey.ui.settings

import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight

import androidx.compose.material3.Button
import androidx.compose.material.icons.outlined.Share
import androidx.compose.ui.platform.LocalContext
import android.content.Intent

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
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(onBack: () -> Unit, onOpenDynamic: () -> Unit, vm: SettingsViewModel = hiltViewModel()) {
    val sessionState by vm.session.collectAsStateWithLifecycle()
    val devUserId by vm.devUserId.collectAsStateWithLifecycle()
    val appIcon by vm.appIcon.collectAsStateWithLifecycle()
    val authState by vm.authState.collectAsStateWithLifecycle()
    val pickPhoto = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        uri?.let(vm::setAvatar)
    }
    val busy by vm.busy.collectAsStateWithLifecycle()
    val message by vm.message.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    MessageEffect(message, snackbar, vm::messageShown)

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
                session?.relationship?.let { rel ->
                    // The relationship has its own page; Settings is about you.
                    Card(
                        onClick = onOpenDynamic,
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer),
                        shape = MaterialTheme.shapes.extraLarge,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp).fillMaxWidth(),
                    ) {
                        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                            AvatarStack(rel.members, vm::loadAvatar, size = 48.dp, ring = MaterialTheme.colorScheme.primaryContainer, collared = { rel.isCollared(it.userId) })
                            Column(Modifier.weight(1f)) {
                                Text(dynamicTitle(rel, session.userId), style = MaterialTheme.typography.titleLarge)
                                Text("Your dynamic · people, invites, how it works, features", style = MaterialTheme.typography.bodyMedium)
                            }
                            Icon(Icons.AutoMirrored.Outlined.KeyboardArrowRight, null)
                        }
                    }
                }

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

                session?.let { s ->
                    SectionHeader("Week starts on")
                    SingleChoiceSegmentedButtonRow(Modifier.padding(horizontal = 16.dp).fillMaxWidth()) {
                        listOf(false to "Sunday", true to "Monday").forEachIndexed { i, (monday, label) ->
                            SegmentedButton(
                                selected = (s.weekStart == java.time.DayOfWeek.MONDAY) == monday,
                                onClick = { vm.setWeekStart(monday) },
                                enabled = !busy,
                                shape = SegmentedButtonDefaults.itemShape(i, 2),
                            ) { Text(label) }
                        }
                    }
                }

                SectionHeader("Notifications")
                PushHealthSection()
                session?.let { s -> QuietHoursSetting(s.me.user.quietHours, enabled = !busy, onChange = vm::setQuietHours) }
                session?.let { s -> NotificationTypes(s.me.user.mutedNotifications, enabled = !busy) { key, on -> vm.setNotificationType(key, on, s.me.user.mutedNotifications) } }

                SectionHeader("Privacy")
                app.obey.ui.proof.ProofBlurSetting()

                SectionHeader("App icon")
                AppIconPicker(appIcon, vm::setAppIcon)

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

    if (dialog == "name") session?.let { s ->
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
}
