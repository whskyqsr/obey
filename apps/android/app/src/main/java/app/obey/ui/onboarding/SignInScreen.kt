package app.obey.ui.onboarding

import android.content.Context
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.obey.ui.common.MessageEffect
import app.obey.ui.settings.SettingsViewModel
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import kotlinx.coroutines.launch

@Composable
fun SignInScreen(vm: SettingsViewModel = hiltViewModel()) {
    val busy by vm.busy.collectAsStateWithLifecycle()
    val message by vm.message.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    MessageEffect(message, snackbar, vm::messageShown)
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var email by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }
    var devId by rememberSaveable { mutableStateOf("") }

    Scaffold(snackbarHost = { SnackbarHost(snackbar) }) { padding ->
        Box(Modifier.padding(padding).fillMaxSize(), contentAlignment = Alignment.Center) {
            Column(
                Modifier
                    .widthIn(max = 420.dp)
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState())
                    .imePadding()
                    .padding(24.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text("Fealty", style = MaterialTheme.typography.displaySmall, color = MaterialTheme.colorScheme.primary)
                Text("Tasks, rules and rewards for the two of you.", style = MaterialTheme.typography.bodyLarge)

                if (vm.firebaseAvailable) {
                    Button(
                        onClick = { scope.launch { googleSignIn(context, vm) } },
                        enabled = !busy,
                        modifier = Modifier.fillMaxWidth().padding(top = 16.dp),
                    ) { Text("Continue with Google") }

                    HorizontalDivider(Modifier.padding(vertical = 8.dp))
                    OutlinedTextField(
                        value = email,
                        onValueChange = { email = it },
                        label = { Text("Email") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                        modifier = Modifier.fillMaxWidth(),
                    )
                    OutlinedTextField(
                        value = password,
                        onValueChange = { password = it },
                        label = { Text("Password") },
                        singleLine = true,
                        visualTransformation = PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Button(
                        onClick = { vm.signInEmail(email, password, create = false) },
                        enabled = !busy && email.isNotBlank() && password.length >= 6,
                        modifier = Modifier.fillMaxWidth(),
                    ) { Text("Sign in") }
                    TextButton(
                        onClick = { vm.signInEmail(email, password, create = true) },
                        enabled = !busy && email.isNotBlank() && password.length >= 6,
                        modifier = Modifier.fillMaxWidth(),
                    ) { Text("Create an account") }
                } else {
                    Text(
                        "Firebase isn't configured in this build yet (no google-services.json), so normal sign-in is unavailable.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 16.dp),
                    )
                }

                if (vm.devAuthAllowed) {
                    HorizontalDivider(Modifier.padding(vertical = 8.dp))
                    Text("Developer sign-in", style = MaterialTheme.typography.titleSmall)
                    Text(
                        "Sends X-Dev-User to ${vm.apiBaseUrl}. The API must run with DEV_AUTH=1.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    OutlinedTextField(
                        value = devId,
                        onValueChange = { devId = it.trim() },
                        label = { Text("Dev user id (UUID)") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    OutlinedButton(
                        onClick = { vm.setDevUser(devId) },
                        enabled = !busy && devId.isNotBlank(),
                        modifier = Modifier.fillMaxWidth(),
                    ) { Text("Use dev user") }
                }
            }
        }
    }
}

/** Google sign-in through Credential Manager, then exchanged for a Firebase session. */
private suspend fun googleSignIn(context: Context, vm: SettingsViewModel) {
    val clientId = vm.googleClientId()
    if (clientId == null) {
        vm.reportError("Google sign-in needs the web client id from google-services.json")
        return
    }
    val option = GetGoogleIdOption.Builder()
        .setFilterByAuthorizedAccounts(false)
        .setServerClientId(clientId)
        .build()
    val request = GetCredentialRequest.Builder().addCredentialOption(option).build()
    try {
        val result = CredentialManager.create(context).getCredential(context, request)
        val credential = result.credential
        if (credential is CustomCredential && credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
            vm.signInGoogle(GoogleIdTokenCredential.createFrom(credential.data).idToken)
        } else {
            vm.reportError("Unexpected credential type")
        }
    } catch (e: GetCredentialCancellationException) {
        // User backed out.
    } catch (e: GetCredentialException) {
        vm.reportError(e.message ?: "Google sign-in failed")
    }
}
