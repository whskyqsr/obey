package app.obey.ui.onboarding

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import app.obey.ui.common.LettersField
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
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.obey.api.Role
import app.obey.ui.common.MessageEffect
import app.obey.ui.settings.SettingsViewModel

/**
 * The first screen after signing in, for someone with no dynamic yet (mockup 33): start one, picking a role, or join
 * with an invite, then Continue. The new dynamic then opens on its setup steps (WelcomeScreen).
 */
@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
fun RelationshipSetupScreen(vm: SettingsViewModel = hiltViewModel()) {
    val busy by vm.busy.collectAsStateWithLifecycle()
    val message by vm.message.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    MessageEffect(message, snackbar, vm::messageShown)
    var joining by rememberSaveable { mutableStateOf(false) }
    var role by rememberSaveable { mutableStateOf(Role.Dominant) }
    var joinRole by rememberSaveable { mutableStateOf(Role.Submissive) }
    var name by rememberSaveable { mutableStateOf("") }
    var code by rememberSaveable { mutableStateOf("") }
    val colors = MaterialTheme.colorScheme

    Scaffold(snackbarHost = { SnackbarHost(snackbar) }) { padding ->
        Box(Modifier.padding(padding)) {
            FirstRunPage(
                actions = {
                    Button(
                        onClick = { if (joining) vm.join(code, joinRole) else vm.createRelationship(name, role) },
                        enabled = !busy && (!joining || code.length >= 4),
                        colors = app.obey.ui.common.inkButtonColors(),
                        modifier = Modifier.fillMaxWidth().height(52.dp),
                    ) { Text("Continue") }
                    TextButton(onClick = vm::signOut, modifier = Modifier.align(Alignment.CenterHorizontally)) { Text("Sign out", color = colors.onSurfaceVariant) }
                },
            ) {
                FirstRunTitle("Welcome.", "Are you starting something new, or joining your partner?")
                Spacer(Modifier.height(28.dp))
                ChoiceBox(selected = !joining, onSelect = { joining = false }) {
                    Text("Start a new dynamic", style = MaterialTheme.typography.headlineSmall)
                    Text("You'll invite your partner next.", style = MaterialTheme.typography.bodyMedium, color = colors.onSurfaceVariant)
                    Text("Your role", style = MaterialTheme.typography.bodySmall, color = colors.onSurfaceVariant, modifier = Modifier.padding(top = 12.dp))
                    androidx.compose.foundation.layout.FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Role.entries.forEach { r -> app.obey.ui.common.LettersChip(r.label, role == r, { role = r; joining = false }) }
                    }
                    LettersField(
                        value = name,
                        onValueChange = { name = it.take(80); joining = false },
                        label = { Text("Name for the dynamic (optional)") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words),
                        modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                    )
                }
                Spacer(Modifier.height(12.dp))
                ChoiceBox(selected = joining, onSelect = { joining = true }) {
                    Text("I have an invite", style = MaterialTheme.typography.headlineSmall)
                    Text("Paste the link or type the code from it.", style = MaterialTheme.typography.bodyMedium, color = colors.onSurfaceVariant)
                    LettersField(
                        value = code,
                        onValueChange = { code = it.trim().take(200); joining = true },
                        label = { Text("Invite link or code") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters),
                        modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                    )
                    if (joining) {
                        Text("Your role, if the invite leaves it to you", style = MaterialTheme.typography.bodySmall, color = colors.onSurfaceVariant, modifier = Modifier.padding(top = 12.dp))
                        androidx.compose.foundation.layout.FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Role.entries.forEach { r -> app.obey.ui.common.LettersChip(r.label, joinRole == r, { joinRole = r }) }
                        }
                    }
                }
            }
        }
    }
}

/** One of the two choices on the first screen: a hairline box, outlined in ink while it's the one Continue acts on. */
@Composable
private fun ChoiceBox(selected: Boolean, onSelect: () -> Unit, content: @Composable androidx.compose.foundation.layout.ColumnScope.() -> Unit) {
    val c = MaterialTheme.colorScheme
    Surface(
        onClick = onSelect,
        color = c.surfaceContainerLowest,
        border = BorderStroke(1.dp, if (selected) c.onSurface else c.outlineVariant),
        shape = androidx.compose.foundation.shape.RoundedCornerShape(8.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(horizontal = 20.dp, vertical = 20.dp), verticalArrangement = Arrangement.spacedBy(4.dp), content = content)
    }
}
