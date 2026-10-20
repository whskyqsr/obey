package app.obey.ui.onboarding

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.MarkEmailUnread
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.obey.ui.common.MessageEffect
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
        Box(Modifier.padding(padding).fillMaxSize(), contentAlignment = Alignment.Center) {
            Column(
                Modifier.widthIn(max = 420.dp).fillMaxWidth().verticalScroll(rememberScrollState()).padding(24.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Icon(Icons.Outlined.MarkEmailUnread, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(48.dp))
                Text("Check your email", style = MaterialTheme.typography.headlineMedium)
                Text(
                    "We sent a link to ${email ?: "your address"}. Open it to confirm the address is yours, then come back here.",
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Button(onClick = { vm.checkVerification() }, enabled = !busy, modifier = Modifier.fillMaxWidth().padding(top = 16.dp)) { Text("I've verified") }
                OutlinedButton(onClick = vm::resendVerification, enabled = !busy, modifier = Modifier.fillMaxWidth()) { Text("Resend email") }
                TextButton(onClick = vm::signOut, enabled = !busy, modifier = Modifier.fillMaxWidth()) { Text("Use a different account") }
            }
        }
    }
}
