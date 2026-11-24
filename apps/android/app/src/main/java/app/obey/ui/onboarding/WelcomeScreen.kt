package app.obey.ui.onboarding

import android.content.Intent
import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ContentCopy
import androidx.compose.material.icons.outlined.NotificationsOff
import androidx.compose.material.icons.outlined.Share
import app.obey.ui.common.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.obey.api.Role
import app.obey.api.StarterKit
import app.obey.data.Session
import app.obey.data.SessionState
import app.obey.lock.AppLockSetting
import app.obey.ui.common.Diamond
import app.obey.ui.common.DiamondState
import app.obey.ui.common.ErrorBox
import app.obey.ui.common.Eyebrow
import app.obey.ui.common.LettersChip
import app.obey.ui.common.Load
import app.obey.ui.common.LoadingBox
import app.obey.ui.common.MessageEffect
import app.obey.ui.common.formatDateTime
import app.obey.ui.common.inkButtonColors
import app.obey.ui.kits.KitSheet
import app.obey.ui.kits.KitSource
import app.obey.ui.kits.KitsViewModel
import app.obey.ui.kits.describe
import app.obey.ui.kits.usable
import app.obey.ui.settings.AppIconPicker
import app.obey.ui.settings.SettingsViewModel
import app.obey.ui.settings.featureRows

private enum class Step { Features, Invite, Finish }

/**
 * First-run setup right after starting or joining a dynamic (mockups 34–36), shown instead of the app until it's
 * finished or skipped: what it uses, inviting the partner, then a starter kit and privacy. Matches the web's Welcome
 * page, except that privacy also offers Android's discreet app icon. Step 1 is the screen before it, so the count
 * starts at 2. Everything here can be changed later.
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
    val steps = listOfNotNull(Step.Features.takeIf { isDom }, Step.Invite.takeIf { started }, Step.Finish)
    var at by rememberSaveable { mutableIntStateOf(0) }
    val step = steps[at.coerceAtMost(steps.lastIndex)]
    val last = at >= steps.lastIndex
    val colors = MaterialTheme.colorScheme
    BackHandler(enabled = at > 0) { at-- }

    Scaffold(snackbarHost = { SnackbarHost(snackbar) }) { padding ->
        Box(Modifier.padding(padding)) {
            FirstRunPage(
                top = {
                    Box(Modifier.weight(1f)) { if (at > 0) TextButton(onClick = { at-- }) { Text("‹ Back") } }
                    Text("${at + 2} of ${steps.size + 1}", style = MaterialTheme.typography.bodyMedium, color = colors.onSurfaceVariant)
                    Box(Modifier.weight(1f), contentAlignment = Alignment.CenterEnd) {
                        if (!last) {
                            if (step == Step.Invite) TextButton(onClick = { at++ }) { Text("Later") }
                            else TextButton(onClick = vm::finishWelcome) { Text("Skip setup") }
                        }
                    }
                },
                actions = {
                    Button(
                        onClick = { if (last) vm.finishWelcome() else at++ },
                        colors = inkButtonColors(),
                        modifier = Modifier.fillMaxWidth().height(52.dp),
                    ) { Text(if (last) "I'm all set" else "Continue") }
                },
            ) {
                when (step) {
                    Step.Features -> FeaturesStep(session, vm)
                    Step.Invite -> InviteStep(session, vm)
                    Step.Finish -> FinishStep(session, isDom, vm)
                }
            }
        }
    }
}

@Composable
private fun FeaturesStep(session: Session, vm: SettingsViewModel) {
    val busy by vm.busy.collectAsStateWithLifecycle()
    val features = session.relationship?.features ?: return
    FirstRunTitle("What will you use?", "Tasks and notes are always there. Anything off is hidden for both of you, and nothing is deleted.")
    Spacer(Modifier.height(24.dp))
    featureRows.forEachIndexed { i, (label, _, get, set) ->
        if (i > 0) HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        Row(Modifier.fillMaxWidth().padding(vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(label, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
            Switch(checked = get(features), enabled = !busy, onCheckedChange = { on -> vm.setFeatures(set(features, on), if (on) "$label on" else "$label off") })
        }
    }
}

@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
private fun InviteStep(session: Session, vm: SettingsViewModel) {
    val invite by vm.invite.collectAsStateWithLifecycle()
    val busy by vm.busy.collectAsStateWithLifecycle()
    val clipboard = LocalClipboardManager.current
    val context = LocalContext.current
    val colors = MaterialTheme.colorScheme
    var role by rememberSaveable {
        mutableStateOf(
            when (session.myRole) {
                Role.Dominant -> Role.Submissive
                Role.Submissive -> Role.Dominant
                else -> null
            },
        )
    }
    // A fresh link for each choice of role, so what's shown always matches it.
    LaunchedEffect(role) {
        vm.clearInvite()
        vm.createInvite(role)
    }
    FirstRunTitle("Invite your partner.", "They open the link, sign in or make an account, and accept.")
    Text("They'll join as", style = MaterialTheme.typography.bodySmall, color = colors.onSurfaceVariant, modifier = Modifier.padding(top = 24.dp, bottom = 8.dp))
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        (listOf<Role?>(Role.Submissive, Role.Dominant, Role.Switch) + null).forEach { r -> LettersChip(r?.label ?: "Let them choose", role == r, { role = r }) }
    }
    Spacer(Modifier.height(24.dp))
    Surface(
        color = colors.surfaceContainerLowest,
        border = BorderStroke(1.dp, colors.outlineVariant),
        shape = RoundedCornerShape(8.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(horizontal = 20.dp, vertical = 24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
            val inv = invite
            if (inv == null) {
                Text(if (busy) "Making a link…" else "No link yet.", style = MaterialTheme.typography.bodyMedium, color = colors.onSurfaceVariant, modifier = Modifier.padding(vertical = 24.dp))
            } else {
                Text(inv.link.removePrefix("https://").removePrefix("http://").replace(inv.code, ""), style = MaterialTheme.typography.bodyMedium, color = colors.onSurfaceVariant)
                Text(inv.code, style = MaterialTheme.typography.displayMedium.copy(fontSize = 44.sp, letterSpacing = 1.sp))
                Text("Works once · expires ${formatDateTime(inv.expiresAt)}", style = MaterialTheme.typography.bodySmall, color = colors.onSurfaceVariant)
                Row(Modifier.fillMaxWidth().padding(top = 16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    OutlinedButton(
                        onClick = {
                            clipboard.setText(AnnotatedString(inv.link))
                            Toast.makeText(context, "Link copied", Toast.LENGTH_SHORT).show()
                        },
                        modifier = Modifier.weight(1f),
                    ) {
                        Icon(Icons.Outlined.ContentCopy, null, Modifier.size(18.dp))
                        Text("  Copy link")
                    }
                    Button(
                        onClick = {
                            val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, inv.link)
                            context.startActivity(Intent.createChooser(send, "Join me on Fealty"))
                        },
                        colors = inkButtonColors(),
                        modifier = Modifier.weight(1f),
                    ) {
                        Icon(Icons.Outlined.Share, null, Modifier.size(18.dp))
                        Text("  Share")
                    }
                }
            }
        }
    }
    Row(Modifier.padding(top = 16.dp), verticalAlignment = Alignment.Top) {
        Icon(Icons.Outlined.NotificationsOff, null, tint = colors.onSurfaceVariant, modifier = Modifier.padding(top = 2.dp).size(18.dp))
        Spacer(Modifier.width(8.dp))
        Text("Notifications never name a task unless you both turn that on.", style = MaterialTheme.typography.bodyMedium, color = colors.onSurfaceVariant)
    }
}

/** A Dominant's last step: a starter kit, then privacy. Someone who joined gets privacy alone. */
@Composable
private fun FinishStep(session: Session, isDom: Boolean, vm: SettingsViewModel) {
    val appIcon by vm.appIcon.collectAsStateWithLifecycle()
    if (isDom) {
        FirstRunTitle("Start with a kit?", "Ready-made tasks and rules you can edit. Or start blank.")
        Spacer(Modifier.height(16.dp))
        Kits(session)
    } else {
        val partner = session.partners.firstOrNull()?.displayName
        FirstRunTitle(
            "You're all set.",
            if (partner != null) "Today shows what's due. $partner adds your tasks, and you'll hear when something new arrives."
            else "Today shows what's due. Your tasks appear there once they're added.",
        )
    }
    Spacer(Modifier.height(32.dp))
    Eyebrow("Keep it private")
    AppLockSetting()
    Text("Discreet app icon", style = MaterialTheme.typography.bodyLarge, modifier = Modifier.padding(start = 16.dp, top = 8.dp, bottom = 8.dp))
    AppIconPicker(appIcon, vm::setAppIcon)
}

@Composable
private fun Kits(session: Session, vm: KitsViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    val added by vm.added.collectAsStateWithLifecycle()
    val context = LocalContext.current
    var open by remember { mutableStateOf<StarterKit?>(null) }
    var pending by remember { mutableStateOf<String?>(null) }
    val applied = remember { mutableStateListOf<String>() }
    LaunchedEffect(added) {
        added?.let {
            Toast.makeText(context, it.describe(), Toast.LENGTH_SHORT).show()
            pending?.let(applied::add)
            pending = null
        }
    }
    val colors = MaterialTheme.colorScheme
    when (val s = state) {
        Load.Loading -> LoadingBox(Modifier.height(120.dp))
        is Load.Failed -> ErrorBox(s.message, vm::refresh)
        is Load.Ready -> Column {
            usable(s.value).forEach { k ->
                Row(Modifier.fillMaxWidth().clickable { open = k }.padding(vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Diamond(if (k.id in applied) DiamondState.Done else DiamondState.Open, Modifier.padding(horizontal = 4.dp), size = 16.dp)
                    Spacer(Modifier.width(16.dp))
                    Column(Modifier.weight(1f)) {
                        Text(k.title, style = MaterialTheme.typography.bodyLarge)
                        Text(
                            "${k.description} · ${k.items.size} items",
                            style = MaterialTheme.typography.bodyMedium,
                            color = colors.onSurfaceVariant,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
                HorizontalDivider(color = colors.outlineVariant)
            }
        }
    }
    open?.let { k ->
        KitSheet(k.title, k.description, k.items, session, onDismiss = { open = null }, onAdd = { items, who ->
            pending = k.id
            vm.apply(KitSource.Saved(k.id), items, who)
            open = null
        })
    }
}
