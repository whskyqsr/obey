package app.obey.ui.settings

import android.content.Intent
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
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material.icons.automirrored.outlined.Logout
import androidx.compose.material.icons.outlined.ContentCopy
import androidx.compose.material.icons.outlined.DeleteForever
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.ToggleOn
import androidx.compose.material.icons.outlined.Share
import androidx.compose.material3.AlertDialog
import app.obey.ui.common.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import app.obey.ui.common.TonalButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import app.obey.ui.common.LettersField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import app.obey.ui.common.PillSegment
import app.obey.ui.common.PillRow
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import app.obey.ui.common.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.LargeTopAppBar
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.obey.ui.common.BackLink
import app.obey.api.Features
import app.obey.api.ReschedulePolicy
import app.obey.api.title
import app.obey.auth.AuthState
import app.obey.data.SessionState
import app.obey.ui.common.Avatar
import app.obey.ui.common.MessageEffect
import app.obey.ui.common.SectionHeader
import app.obey.ui.common.formatDateTime
import app.obey.ui.onboarding.CreateRelationshipForm
import app.obey.ui.onboarding.JoinRelationshipForm
import app.obey.ui.onboarding.label
import app.obey.ui.tasks.Stepper

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(onBack: () -> Unit, onOpenDynamic: () -> Unit, onOpenFeatures: () -> Unit = onOpenDynamic, vm: SettingsViewModel = hiltViewModel()) {
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

    // Each group opens as its own page, as in the mockups; the list shows each setting's value.
    var page by rememberSaveable { mutableStateOf<String?>(null) } // "you" | "notifications" | "privacy" | "features"
    androidx.activity.compose.BackHandler(page != null) { page = null }
    val lockVm: app.obey.lock.AppLockViewModel = hiltViewModel()
    val lockOn by lockVm.on.collectAsStateWithLifecycle()

    Scaffold(
        topBar = {
            LargeTopAppBar(
                title = {
                    Text(
                        when (page) {
                            "you" -> "You"
                            "notifications" -> "Notifications"
                            "privacy" -> "Privacy"
                            "features" -> "Features"
                            else -> "Settings"
                        },
                    )
                },
                navigationIcon = { if (page == null) BackLink("Us", onBack) else BackLink("Settings") { page = null } },
            )
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        Box(Modifier.padding(padding).fillMaxSize(), contentAlignment = Alignment.TopCenter) {
            Column(Modifier.widthIn(max = 720.dp).fillMaxWidth().verticalScroll(rememberScrollState())) {
                val user = session?.me?.user
                when (page) {
                    null -> if (session != null && user != null) {
                        SectionHeader("You")
                        ValueRow("Name, photo, email", user.displayName) { page = "you" }
                        ValueRow("Week starts on", if (session.weekStart == java.time.DayOfWeek.MONDAY) "Monday" else "Sunday") { page = "you" }

                        SectionHeader("Notifications")
                        val (heard, total) = notifyCount(user.mutedNotifications, session.relationship?.features?.points == true)
                        ValueRow("What you hear about", "$heard of $total") { page = "notifications" }
                        ValueRow("Quiet hours", user.quietHours?.let { quietSpan(it.start, it.end) } ?: "Off") { page = "notifications" }
                        ListItem(
                            headlineContent = { Text("Show your partner's words") },
                            trailingContent = { Switch(checked = user.notifyDetails, enabled = !busy, onCheckedChange = vm::setNotifyDetails) },
                        )
                        Hairline()

                        SectionHeader("Privacy")
                        ValueRow("App lock", if (lockOn) "On" else "Off") { page = "privacy" }
                        app.obey.ui.proof.ProofBlurSetting()
                        Hairline()
                        ValueRow("Discreet app icon", androidx.compose.ui.res.stringResource(appIcon.label)) { page = "privacy" }
                        ValueRow("Widgets", null) { page = "privacy" }

                        session.relationship?.let { rel ->
                            SectionHeader("This dynamic")
                            ValueRow("Your dynamic", dynamicTitle(rel, session.userId), onClick = onOpenDynamic)
                            if (!rel.ended) {
                                ValueRow("Features", "${featureRows.count { it.get(rel.features) }} of ${featureRows.size} on") { page = "features" }
                            }
                            ValueRow("Proof photos delete after", rel.proofDays?.let { if (it == 1) "1 day" else "$it days" } ?: "Never", onClick = onOpenFeatures)
                        }

                        Spacer(Modifier.height(24.dp))
                        Hairline()
                        ListItem(
                            modifier = Modifier.clickable(onClick = vm::signOut),
                            leadingContent = { Icon(Icons.AutoMirrored.Outlined.Logout, null) },
                            headlineContent = { Text("Sign out") },
                        )
                        Hairline()
                        Spacer(Modifier.height(24.dp))
                    }

                    "you" -> if (user != null && session != null) {
                        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                            Avatar(user.id, user.displayName, user.avatarVersion, vm::loadAvatar, size = 72.dp, serif = true)
                            OutlinedButton(
                                onClick = { pickPhoto.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
                                enabled = !busy,
                            ) { Text(if (user.avatarVersion == null) "Add photo" else "Change photo") }
                            if (user.avatarVersion != null) TextButton(onClick = vm::removeAvatar, enabled = !busy) { Text("Remove") }
                        }
                        ValueRow("Name", user.displayName) { dialog = "name" }
                        ListItem(headlineContent = { Text("Email") }, trailingContent = { Text(user.email ?: "None", color = MaterialTheme.colorScheme.onSurfaceVariant) })
                        Hairline()
                        SectionHeader("Week starts on")
                        PillRow(Modifier.padding(horizontal = 16.dp).fillMaxWidth()) {
                            listOf(false to "Sunday", true to "Monday").forEachIndexed { i, (monday, label) ->
                                PillSegment(
                                    selected = (session.weekStart == java.time.DayOfWeek.MONDAY) == monday,
                                    onClick = { vm.setWeekStart(monday) },
                                    enabled = !busy,
                                ) { Text(label) }
                            }
                        }
                        Spacer(Modifier.height(24.dp))
                        Hairline()
                        val method = when ((authState as? AuthState.Firebase)?.provider) {
                            "password" -> "Signed in with email"
                            "google.com" -> "Signed in with Google"
                            else -> if (authState is AuthState.Dev) "Dev sign-in" else "Signed in"
                        }
                        if (vm.devAuthAllowed) {
                            SectionHeader("Developer")
                            Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text("API: ${vm.apiBaseUrl}", style = MaterialTheme.typography.bodySmall)
                                Text(
                                    "Firebase: " + if (vm.firebaseAvailable) "configured" else "not configured (no google-services.json)",
                                    style = MaterialTheme.typography.bodySmall,
                                )
                                LettersField(
                                    value = devField,
                                    onValueChange = { devField = it.trim() },
                                    label = { Text("Dev user id (X-Dev-User)") },
                                    supportingText = { Text("Overrides Firebase. The API must run with DEV_AUTH=1.") },
                                    singleLine = true,
                                    modifier = Modifier.fillMaxWidth(),
                                )
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    TonalButton(onClick = { vm.setDevUser(devField) }, enabled = !busy && devField != devUserId.orEmpty()) {
                                        Text("Apply")
                                    }
                                    if (devUserId != null) TextButton(onClick = { vm.setDevUser("") }) { Text("Clear") }
                                }
                            }
                        }
                        ListItem(
                            modifier = Modifier.clickable(onClick = vm::signOut),
                            leadingContent = { Icon(Icons.AutoMirrored.Outlined.Logout, null) },
                            headlineContent = { Text("Sign out") },
                            supportingContent = { Text(method) },
                        )
                        Hairline()
                        ListItem(
                            modifier = Modifier.clickable { dialog = "delete" },
                            leadingContent = { Icon(Icons.Outlined.DeleteForever, null, tint = MaterialTheme.colorScheme.error) },
                            headlineContent = { Text("Delete account", color = MaterialTheme.colorScheme.error) },
                        )
                    }

                    "notifications" -> session?.let { s ->
                        PushHealthSection()
                        SectionHeader("What you hear about")
                        NotificationTypes(s.me.user.mutedNotifications, enabled = !busy, onChange = { key, on -> vm.setNotificationType(key, on, s.me.user.mutedNotifications) }, details = s.me.user.notifyDetails, onDetails = vm::setNotifyDetails)
                        SectionHeader("Quiet hours")
                        QuietHoursSetting(s.me.user.quietHours, enabled = !busy, onChange = vm::setQuietHours)
                    }

                    "privacy" -> {
                        app.obey.lock.AppLockSetting()
                        Hairline()
                        app.obey.ui.proof.ProofBlurSetting()
                        Hairline()
                        app.obey.widget.WidgetSetting()
                        SectionHeader("Discreet app icon")
                        AppIconPicker(appIcon, vm::setAppIcon)
                    }

                    "features" -> session?.relationship?.let { rel ->
                        val canChange = session.canManage && !rel.ended
                        if (!canChange) Text(
                            if (rel.ended) "This dynamic has ended, so nothing here can change." else "Only a Dominant can change these.",
                            style = MaterialTheme.typography.bodyLarge,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                        )
                        featureRows.forEach { (label, _, get, set) ->
                            ListItem(
                                headlineContent = { Text(label) },
                                trailingContent = {
                                    Switch(
                                        checked = get(rel.features),
                                        onCheckedChange = { on -> vm.setFeatures(set(rel.features, on), if (on) "$label on" else "$label off") },
                                        enabled = canChange && !busy,
                                    )
                                },
                            )
                            Hairline()
                        }
                    }

                    }
                }
            }
        }
    }

    if (dialog == "delete") session?.let { s ->
        var typed by rememberSaveable { mutableStateOf("") }
        // Everyone sharing a dynamic that hasn't ended: it ends for them too.
        val partners = s.me.relationships.filter { it.endedAt == null }
            .flatMap { r -> r.members.filter { it.userId != s.userId }.map { it.displayName } }
            .distinct()
        AlertDialog(
            onDismissRequest = { if (!busy) dialog = null },
            title = { Text("Delete your account?") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    if (partners.isNotEmpty()) Text(
                        "Your dynamic with ${partners.joinToString(" and ")} ends for both of you. They keep a read-only copy of the tasks and notes you shared, shown as from a deleted account.",
                    )
                    Text("Your profile, photo, private notes, journal and proof photos are deleted, and so is your sign-in. This can't be undone.")
                    LettersField(typed, { typed = it }, label = { Text("Type \"delete\" to confirm") }, singleLine = true)
                }
            },
            confirmButton = {
                TextButton(
                    enabled = !busy && typed.trim().equals("delete", ignoreCase = true),
                    onClick = { vm.deleteAccount() },
                    colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error),
                ) { Text("Delete for good") }
            },
            dismissButton = { TextButton(enabled = !busy, onClick = { dialog = null }) { Text("Cancel") } },
        )
    }

    if (dialog == "name") session?.let { s ->
            var name by rememberSaveable { mutableStateOf(s.me.user.displayName) }
            AlertDialog(
                onDismissRequest = { dialog = null },
                title = { Text("Display name") },
                text = {
                    LettersField(
                        value = name,
                        onValueChange = { name = it.take(40) },
                        singleLine = true,
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

/** A setting that opens somewhere else: its name, and its value on the right. */
@Composable
private fun ValueRow(label: String, value: String?, onClick: () -> Unit) {
    ListItem(
        modifier = Modifier.clickable(onClick = onClick),
        headlineContent = { Text(label) },
        trailingContent = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (value != null) Text(value, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis, modifier = Modifier.widthIn(max = 180.dp))
                Icon(Icons.AutoMirrored.Outlined.KeyboardArrowRight, null, Modifier.size(18.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        },
    )
    Hairline()
}

@Composable
private fun Hairline() = HorizontalDivider(Modifier.padding(horizontal = 16.dp), color = MaterialTheme.colorScheme.outlineVariant)

/** "11 PM–7 AM". */
private fun quietSpan(start: String, end: String): String {
    val f = { t: String ->
        runCatching { java.time.LocalTime.parse(t) }.getOrNull()?.let { lt ->
            lt.format(java.time.format.DateTimeFormatter.ofPattern(if (lt.minute == 0) "h a" else "h:mm a"))
        } ?: t
    }
    return "${f(start)}–${f(end)}"
}
