package app.obey.ui.onboarding

import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.PersonAdd
import androidx.compose.material.icons.outlined.Tune
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material.icons.outlined.Widgets
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.obey.api.Role
import app.obey.api.StarterKit
import app.obey.data.Session
import app.obey.data.SessionState
import app.obey.lock.AppLockSetting
import app.obey.ui.common.ErrorBox
import app.obey.ui.common.Load
import app.obey.ui.common.LoadingBox
import app.obey.ui.common.MessageEffect
import app.obey.ui.kits.KitSheet
import app.obey.ui.kits.KitsViewModel
import app.obey.ui.kits.describe
import app.obey.ui.kits.kitIcon
import app.obey.ui.kits.usable
import app.obey.ui.settings.AppIconPicker
import app.obey.ui.settings.InviteControls
import app.obey.ui.settings.SettingsViewModel
import app.obey.ui.settings.featureRows

private enum class Step { Features, Privacy, Invite, Kits, Ready }

/**
 * First-run setup right after starting or joining a dynamic, shown instead of the app until it's finished or skipped:
 * which features it uses, privacy, inviting the partner and a starter kit. Matches the web's Welcome page, except that
 * the privacy step offers Android's own app icon picker. Everything here can be changed later.
 */
@Composable
fun WelcomeScreen(vm: SettingsViewModel = hiltViewModel()) {
    val sessionState by vm.session.collectAsStateWithLifecycle()
    val message by vm.message.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    MessageEffect(message, snackbar, vm::messageShown)
    val session = (sessionState as? SessionState.Ready)?.session ?: return
    val rel = session.relationship ?: return
    val isDom = session.myRole != null && session.myRole != Role.Submissive
    // Alone in it means they started it; someone who joined has a partner already.
    val started = rel.members.size == 1
    val steps = listOfNotNull(Step.Features.takeIf { isDom }, Step.Privacy, Step.Invite.takeIf { started }, if (isDom) Step.Kits else Step.Ready)
    var at by rememberSaveable { mutableIntStateOf(0) }
    val step = steps[at.coerceAtMost(steps.lastIndex)]
    val last = at >= steps.lastIndex
    BackHandler(enabled = at > 0) { at-- }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbar) },
        bottomBar = {
            Surface(color = MaterialTheme.colorScheme.surface) {
                Row(
                    Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 16.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    if (at > 0) TextButton(onClick = { at-- }) { Text("Back") }
                    Spacer(Modifier.weight(1f))
                    if (!last) TextButton(onClick = vm::finishWelcome) { Text("Skip setup") }
                    Button(onClick = { if (last) vm.finishWelcome() else at++ }) {
                        Text(if (!last) "Next" else if (step == Step.Kits) "Start from scratch" else "Open Obey")
                    }
                }
            }
        },
    ) { padding ->
        Box(Modifier.padding(padding).fillMaxSize(), contentAlignment = Alignment.TopCenter) {
            Column(Modifier.widthIn(max = 560.dp).fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 8.dp, vertical = 16.dp)) {
                Row(Modifier.padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                    Row(Modifier.weight(1f), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        steps.indices.forEach { i ->
                            val color = if (i <= at) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceContainerHighest
                            Box(Modifier.weight(1f).height(4.dp).background(color, CircleShape))
                        }
                    }
                    Spacer(Modifier.width(12.dp))
                    Text("${at + 1} of ${steps.size}", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Spacer(Modifier.height(24.dp))
                when (step) {
                    Step.Features -> FeaturesStep(session, vm)
                    Step.Privacy -> PrivacyStep(vm)
                    Step.Invite -> InviteStep(session, vm)
                    Step.Kits -> KitsStep(session, onApplied = vm::finishWelcome)
                    Step.Ready -> ReadyStep(session.partners.firstOrNull()?.displayName)
                }
            }
        }
    }
}

@Composable
private fun Heading(icon: ImageVector, title: String, body: String) {
    Column(Modifier.padding(horizontal = 16.dp)) {
        Icon(icon, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(32.dp))
        Spacer(Modifier.height(12.dp))
        Text(title, style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(8.dp))
        Text(body, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(20.dp))
    }
}

@Composable
private fun InfoCard(icon: ImageVector, title: String, body: String) {
    val colors = MaterialTheme.colorScheme
    Surface(color = colors.surfaceContainerLow, shape = MaterialTheme.shapes.large, modifier = Modifier.padding(horizontal = 16.dp).fillMaxWidth()) {
        Row(Modifier.padding(16.dp)) {
            Icon(icon, null, tint = colors.onSurfaceVariant)
            Spacer(Modifier.width(12.dp))
            Column {
                Text(title, style = MaterialTheme.typography.bodyLarge)
                Text(body, style = MaterialTheme.typography.bodyMedium, color = colors.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun FeaturesStep(session: Session, vm: SettingsViewModel) {
    val busy by vm.busy.collectAsStateWithLifecycle()
    val features = session.relationship?.features ?: return
    Heading(Icons.Outlined.Tune, "What will you use?", "Tasks and notes are always there. Turn off anything else your dynamic doesn't need; it's hidden for both of you.")
    Surface(color = MaterialTheme.colorScheme.surfaceContainerLow, shape = MaterialTheme.shapes.large, modifier = Modifier.padding(horizontal = 16.dp).fillMaxWidth()) {
        Column(Modifier.padding(vertical = 4.dp)) {
            featureRows.forEach { (label, help, get, set) ->
                ListItem(
                    colors = ListItemDefaults.colors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
                    headlineContent = { Text(label) },
                    supportingContent = { Text(help) },
                    trailingContent = {
                        Switch(checked = get(features), enabled = !busy, onCheckedChange = { on -> vm.setFeatures(set(features, on), if (on) "$label on" else "$label off") })
                    },
                )
            }
        }
    }
    Text(
        "You can change these any time in Your dynamic. Nothing is deleted when you switch one off.",
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
    )
}

@Composable
private fun PrivacyStep(vm: SettingsViewModel) {
    val appIcon by vm.appIcon.collectAsStateWithLifecycle()
    Heading(Icons.Outlined.VisibilityOff, "Keep it private", "Obey is built to be discreet. Here's what's already on, and what you can add.")
    InfoCard(
        Icons.Outlined.Notifications,
        "Notifications never name the task",
        "They say who did what kind of thing, like \"Sam finished a task\", so nothing shows on a lock screen.",
    )
    Spacer(Modifier.height(12.dp))
    AppLockSetting()
    Spacer(Modifier.height(20.dp))
    Text("App icon", style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(horizontal = 16.dp))
    Text(
        "Show Obey on your home screen as something ordinary. Its notifications use the same name.",
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 4.dp, bottom = 8.dp),
    )
    AppIconPicker(appIcon, vm::setAppIcon)
}

@Composable
private fun InviteStep(session: Session, vm: SettingsViewModel) {
    LaunchedEffect(Unit) { vm.clearInvite() }
    Heading(
        Icons.Outlined.PersonAdd,
        "Invite your partner",
        "Send them a link. They sign in or create an account, then accept. You can also do this later from Your dynamic.",
    )
    Box(Modifier.padding(horizontal = 16.dp)) { InviteControls(vm, initialRole = session.myRole) }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun KitsStep(session: Session, onApplied: () -> Unit, vm: KitsViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    val added by vm.added.collectAsStateWithLifecycle()
    val context = LocalContext.current
    LaunchedEffect(added) {
        added?.let {
            Toast.makeText(context, it.describe(), Toast.LENGTH_SHORT).show()
            onApplied()
        }
    }
    var open by remember { mutableStateOf<StarterKit?>(null) }
    val colors = MaterialTheme.colorScheme
    Heading(Icons.Outlined.Widgets, "Start with a kit?", "Ready-made tasks, rules and protocols. Pick what you want from a kit, and edit anything afterwards.")
    when (val s = state) {
        Load.Loading -> LoadingBox(Modifier.height(120.dp))
        is Load.Failed -> ErrorBox(s.message, vm::refresh)
        is Load.Ready -> Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            usable(s.value).forEach { k ->
                OutlinedCard(onClick = { open = k }, modifier = Modifier.fillMaxWidth()) {
                    Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                        Surface(color = colors.secondaryContainer, shape = MaterialTheme.shapes.medium, modifier = Modifier.size(40.dp)) {
                            Box(contentAlignment = Alignment.Center) { Icon(kitIcon(k.icon), null, tint = colors.onSecondaryContainer) }
                        }
                        Spacer(Modifier.width(16.dp))
                        Column(Modifier.weight(1f)) {
                            Text(k.title, style = MaterialTheme.typography.titleSmall)
                            Text(k.description, style = MaterialTheme.typography.bodyMedium, color = colors.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        }
                        Icon(Icons.AutoMirrored.Outlined.KeyboardArrowRight, null, tint = colors.onSurfaceVariant)
                    }
                }
            }
        }
    }
    open?.let { k -> KitSheet(k, session, onDismiss = { open = null }, onAdd = { items, who -> vm.apply(k, items, who); open = null }) }
}

@Composable
private fun ReadyStep(partnerName: String?) {
    Heading(
        Icons.Outlined.CheckCircle,
        "You're all set",
        if (partnerName != null) "Today shows what's due. $partnerName adds your tasks, and you'll get a notification when something new arrives."
        else "Today shows what's due. Your tasks appear there once they're added.",
    )
}
