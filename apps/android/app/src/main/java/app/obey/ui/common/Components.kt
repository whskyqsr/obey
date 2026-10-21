package app.obey.ui.common

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.FrontHand
import androidx.compose.material.icons.outlined.Menu
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

@Composable
fun LoadingBox(modifier: Modifier = Modifier) {
    Box(modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
}

@Composable
fun ErrorBox(message: String, onRetry: () -> Unit, modifier: Modifier = Modifier) {
    Column(
        modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(message, style = MaterialTheme.typography.bodyLarge, textAlign = TextAlign.Center)
        Button(onClick = onRetry) { Text("Try again") }
    }
}

@Composable
fun EmptyBox(title: String, body: String? = null, modifier: Modifier = Modifier) {
    Column(
        modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 48.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(title, style = MaterialTheme.typography.titleMedium, textAlign = TextAlign.Center)
        if (body != null) {
            Text(
                body,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
        }
    }
}

@Composable
fun SectionHeader(text: String, modifier: Modifier = Modifier, horizontalPadding: Dp = 16.dp) {
    Text(
        text,
        style = MaterialTheme.typography.titleSmall,
        color = MaterialTheme.colorScheme.primary,
        modifier = modifier.padding(start = horizontalPadding, end = horizontalPadding, top = 20.dp, bottom = 8.dp),
    )
}

/** The phone menu's button, at the start of a top-level screen's top bar. */
@Composable
fun MenuButton() {
    val open = LocalOpenMenu.current ?: return
    IconButton(onClick = open) { Icon(Icons.Outlined.Menu, contentDescription = "Menu") }
}

/** The safe word, before Settings in a main page's top bar; nothing for a Dominant. */
@Composable
fun SafeWordAction() {
    val open = LocalSafeWord.current ?: return
    IconButton(onClick = open) { Icon(Icons.Filled.FrontHand, contentDescription = "Safe word", tint = MaterialTheme.colorScheme.error) }
}

@Composable
fun SettingsAction(onClick: () -> Unit) {
    IconButton(onClick = onClick) { Icon(Icons.Outlined.Settings, contentDescription = "Settings") }
}

/** Shows the ViewModel's pending message once, then clears it. */
@Composable
fun MessageEffect(message: String?, snackbar: SnackbarHostState, onShown: () -> Unit) {
    LaunchedEffect(message) {
        if (message != null) {
            snackbar.showSnackbar(message)
            onShown()
        }
    }
}
