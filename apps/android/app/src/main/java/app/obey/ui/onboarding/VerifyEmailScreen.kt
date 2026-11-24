package app.obey.ui.onboarding

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Drafts
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.obey.ui.common.MessageEffect
import app.obey.ui.common.inkButtonColors
import app.obey.ui.settings.SettingsViewModel

/** Shown to email-and-password accounts until they click the link Firebase emailed them. */
@Composable
fun VerifyEmailScreen(email: String?, vm: SettingsViewModel = hiltViewModel()) {
    val busy by vm.busy.collectAsStateWithLifecycle()
    val message by vm.message.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    MessageEffect(message, snackbar, vm::messageShown)
    // Coming back from the mail app is the usual moment the link was clicked.
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { vm.checkVerification(quiet = true) }

    Scaffold(snackbarHost = { SnackbarHost(snackbar) }) { padding ->
        Box(Modifier.padding(padding)) {
            FirstRunPage(
                actions = {
                    Button(
                        onClick = { vm.checkVerification() },
                        enabled = !busy,
                        colors = inkButtonColors(),
                        modifier = Modifier.fillMaxWidth().height(52.dp),
                    ) { Text("I've verified") }
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        TextButton(onClick = vm::resendVerification, enabled = !busy) { Text("Resend email") }
                        TextButton(onClick = vm::signOut, enabled = !busy) { Text("Use a different account", color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    }
                },
            ) {
                Icon(Icons.Outlined.Drafts, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(bottom = 24.dp).size(40.dp))
                FirstRunTitle("Check your email.", "We sent a link to ${email ?: "your address"}. Open it on any device, then come back here.")
            }
        }
    }
}
