package app.obey.ui.onboarding

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.PrimaryTabRow
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.obey.ui.common.MessageEffect
import app.obey.ui.settings.SettingsViewModel

/** Shown when the signed-in user has no relationship yet: create one (and invite) or join with a code. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RelationshipSetupScreen(vm: SettingsViewModel = hiltViewModel()) {
    val busy by vm.busy.collectAsStateWithLifecycle()
    val message by vm.message.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    MessageEffect(message, snackbar, vm::messageShown)
    var tab by rememberSaveable { mutableIntStateOf(0) }

    Scaffold(snackbarHost = { SnackbarHost(snackbar) }) { padding ->
        Box(Modifier.padding(padding).fillMaxSize(), contentAlignment = Alignment.TopCenter) {
            Column(
                Modifier.widthIn(max = 480.dp).fillMaxWidth().verticalScroll(rememberScrollState()).imePadding().padding(24.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                Text("Set up your dynamic", style = MaterialTheme.typography.headlineMedium)
                Text(
                    "Start a new relationship and invite your partner, or join one with the code they sent you.",
                    style = MaterialTheme.typography.bodyLarge,
                )
                PrimaryTabRow(selectedTabIndex = tab) {
                    Tab(selected = tab == 0, onClick = { tab = 0 }, text = { Text("Start new") })
                    Tab(selected = tab == 1, onClick = { tab = 1 }, text = { Text("Join with code") })
                }
                if (tab == 0) {
                    CreateRelationshipForm(busy) { name, role -> vm.createRelationship(name, role) }
                } else {
                    JoinRelationshipForm(busy) { code, role -> vm.join(code, role) }
                }
                TextButton(onClick = vm::signOut, modifier = Modifier.align(Alignment.CenterHorizontally)) { Text("Sign out") }
            }
        }
    }
}
