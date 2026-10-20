package app.obey.ui.onboarding

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Key
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role as SemanticsRole
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.obey.api.Role
import app.obey.ui.common.MessageEffect
import app.obey.ui.settings.SettingsViewModel

private val Role.help: String
    get() = when (this) {
        Role.Dominant -> "You set tasks, rules and rewards, and approve what's done."
        Role.Submissive -> "You see what's due, complete it, and ask for more time when you need it."
        Role.Switch -> "Some of both. You can set and manage tasks like a Dominant."
    }

/**
 * The first screen after signing in, for someone with no dynamic yet: start one (picking a role) or join with an
 * invite. The new dynamic then opens on its setup steps (WelcomeScreen).
 */
@Composable
fun RelationshipSetupScreen(vm: SettingsViewModel = hiltViewModel()) {
    val busy by vm.busy.collectAsStateWithLifecycle()
    val message by vm.message.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    MessageEffect(message, snackbar, vm::messageShown)
    var stage by rememberSaveable { mutableStateOf("choose") } // "choose" | "create" | "join"
    BackHandler(enabled = stage != "choose") { stage = "choose" }

    Scaffold(snackbarHost = { SnackbarHost(snackbar) }) { padding ->
        Box(Modifier.padding(padding).fillMaxSize(), contentAlignment = Alignment.TopCenter) {
            Column(
                Modifier.widthIn(max = 480.dp).fillMaxWidth().verticalScroll(rememberScrollState()).imePadding().padding(24.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                when (stage) {
                    "create" -> CreateStage(busy, onBack = { stage = "choose" }) { name, role -> vm.createRelationship(name, role) }
                    "join" -> JoinStage(busy, onBack = { stage = "choose" }) { code, role -> vm.join(code, role) }
                    else -> {
                        Icon(Icons.Filled.Favorite, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(40.dp))
                        Text("Welcome to Obey", style = MaterialTheme.typography.headlineMedium)
                        Text(
                            "Tasks, rules and rewards for your dynamic, shared between the two of you.",
                            style = MaterialTheme.typography.bodyLarge,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Spacer(Modifier.height(8.dp))
                        Choice(Icons.Outlined.Add, "Start a new dynamic", "Set it up, then invite your partner.") { stage = "create" }
                        Choice(Icons.Outlined.Key, "I have an invite", "Use the link or code your partner sent you.") { stage = "join" }
                        Spacer(Modifier.height(8.dp))
                        TextButton(onClick = vm::signOut, modifier = Modifier.align(Alignment.CenterHorizontally)) { Text("Sign out") }
                    }
                }
            }
        }
    }
}

@Composable
private fun Choice(icon: ImageVector, title: String, body: String, onClick: () -> Unit) {
    val colors = MaterialTheme.colorScheme
    Surface(onClick = onClick, color = colors.surfaceContainerLow, shape = MaterialTheme.shapes.large, modifier = Modifier.fillMaxWidth()) {
        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Surface(color = colors.primaryContainer, shape = CircleShape, modifier = Modifier.size(48.dp)) {
                Box(contentAlignment = Alignment.Center) { Icon(icon, null, tint = colors.onPrimaryContainer) }
            }
            Spacer(Modifier.width(16.dp))
            Column(Modifier.weight(1f)) {
                Text(title, style = MaterialTheme.typography.titleMedium)
                Text(body, style = MaterialTheme.typography.bodyMedium, color = colors.onSurfaceVariant)
            }
            Icon(Icons.AutoMirrored.Outlined.KeyboardArrowRight, null, tint = colors.onSurfaceVariant)
        }
    }
}

@Composable
private fun CreateStage(busy: Boolean, onBack: () -> Unit, onCreate: (String, Role) -> Unit) {
    var name by rememberSaveable { mutableStateOf("") }
    var role by rememberSaveable { mutableStateOf(Role.Dominant) }
    val colors = MaterialTheme.colorScheme
    Text("What's your role?", style = MaterialTheme.typography.headlineSmall)
    Text(
        "This decides what you see. You can start another dynamic with a different role later.",
        style = MaterialTheme.typography.bodyLarge,
        color = colors.onSurfaceVariant,
    )
    Column(Modifier.selectableGroup(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Role.entries.forEach { r ->
            val on = role == r
            Surface(
                color = if (on) colors.primaryContainer else colors.surface,
                contentColor = if (on) colors.onPrimaryContainer else colors.onSurface,
                border = BorderStroke(1.dp, if (on) colors.primary else colors.outlineVariant),
                shape = MaterialTheme.shapes.large,
                modifier = Modifier.fillMaxWidth().selectable(selected = on, onClick = { role = r }, role = SemanticsRole.RadioButton),
            ) {
                Row(Modifier.padding(start = 4.dp, end = 16.dp, top = 8.dp, bottom = 12.dp), verticalAlignment = Alignment.Top) {
                    RadioButton(selected = on, onClick = null, modifier = Modifier.padding(12.dp))
                    Column(Modifier.padding(top = 10.dp)) {
                        Text(r.label, style = MaterialTheme.typography.titleMedium)
                        Text(r.help, style = MaterialTheme.typography.bodyMedium)
                    }
                }
            }
        }
    }
    OutlinedTextField(
        value = name,
        onValueChange = { name = it.take(80) },
        label = { Text("Name for the dynamic (optional)") },
        supportingText = { Text("Leave it blank to show your partner's name instead.") },
        singleLine = true,
        keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words),
        modifier = Modifier.fillMaxWidth(),
    )
    Row(verticalAlignment = Alignment.CenterVertically) {
        TextButton(onClick = onBack) { Text("Back") }
        Spacer(Modifier.weight(1f))
        Button(onClick = { onCreate(name, role) }, enabled = !busy) { Text("Continue") }
    }
}

@Composable
private fun JoinStage(busy: Boolean, onBack: () -> Unit, onJoin: (String, Role) -> Unit) {
    var code by rememberSaveable { mutableStateOf("") }
    var role by rememberSaveable { mutableStateOf(Role.Submissive) }
    Text("Join your partner", style = MaterialTheme.typography.headlineSmall)
    Text("Paste the invite link or type the code from it.", style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
    OutlinedTextField(
        value = code,
        onValueChange = { code = it.trim().take(200) },
        label = { Text("Invite link or code") },
        singleLine = true,
        keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters),
        modifier = Modifier.fillMaxWidth(),
    )
    Text("Your role", style = MaterialTheme.typography.labelLarge)
    RolePicker(role, { role = it })
    Text(
        "If the invite already names your role, that's the one you get.",
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
    Row(verticalAlignment = Alignment.CenterVertically) {
        TextButton(onClick = onBack) { Text("Back") }
        Spacer(Modifier.weight(1f))
        Button(onClick = { onJoin(code, role) }, enabled = !busy && code.length >= 4) { Text("Join") }
    }
}
