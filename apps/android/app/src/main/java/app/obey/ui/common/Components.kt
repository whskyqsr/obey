package app.obey.ui.common

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowLeft
import androidx.compose.material.icons.outlined.FrontHand
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

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
fun EmptyBox(title: String, body: String? = null, modifier: Modifier = Modifier, icon: androidx.compose.ui.graphics.vector.ImageVector? = null) {
    Column(
        modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 48.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        // The same icon the web's empty state shows for this page.
        if (icon != null) Icon(icon, null, Modifier.size(40.dp), tint = MaterialTheme.colorScheme.primary)
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

/** A section's eyebrow: small capitals in the muted ink, the same as the web's `.eyebrow`. */
@Composable
fun SectionHeader(text: String, modifier: Modifier = Modifier, horizontalPadding: Dp = 16.dp) {
    Text(
        text.uppercase(),
        style = MaterialTheme.typography.labelMedium.copy(letterSpacing = 1.2.sp),
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = modifier.padding(start = horizontalPadding, end = horizontalPadding, top = 24.dp, bottom = 8.dp),
    )
}

enum class DiamondState { Open, Done, Owed, Waiting, Off }

/**
 * The one shape: a small square turned 45 degrees. Open while it's to do, filled ink when done, oxblood when missed or
 * owed, half filled while it waits for approval, muted when it no longer counts.
 */
@Composable
fun Diamond(state: DiamondState, modifier: Modifier = Modifier, size: Dp = 14.dp) {
    val c = MaterialTheme.colorScheme
    val line = when (state) {
        DiamondState.Owed -> c.primary
        DiamondState.Off -> c.outline
        else -> c.onSurface
    }
    val fill = when (state) {
        DiamondState.Done -> c.onSurface
        DiamondState.Owed -> c.primaryContainer
        else -> androidx.compose.ui.graphics.Color.Transparent
    }
    Box(
        modifier
            .size(size)
            .rotate(45f)
            .background(fill)
            .then(
                if (state == DiamondState.Waiting) {
                    Modifier.background(
                        androidx.compose.ui.graphics.Brush.linearGradient(
                            0f to c.onSurface, 0.5f to c.onSurface, 0.5f to androidx.compose.ui.graphics.Color.Transparent,
                        ),
                    )
                } else {
                    Modifier
                },
            )
            .border(1.5.dp, line),
    )
}

/** What leads a main screen's top bar: the dynamic switcher (Today, Week, Us) or back to Us (the pages listed there). */
@Composable
fun MenuButton() {
    LocalNavLead.current?.invoke()
}

/** The safe word, at the end of a main page's top bar; nothing for a Dominant. */
@Composable
fun SafeWordAction() {
    val open = LocalSafeWord.current ?: return
    IconButton(onClick = open) { Icon(Icons.Outlined.FrontHand, contentDescription = "Safe word", tint = MaterialTheme.colorScheme.primary) }
}

/**
 * A title that is also a toggle between two pages that live together, such as Rules and Protocols: the current one in
 * ink, the other muted beside it.
 */
@Composable
fun PairedTitle(current: String, other: String?, onOther: () -> Unit) {
    androidx.compose.foundation.layout.Row(horizontalArrangement = Arrangement.spacedBy(16.dp), verticalAlignment = Alignment.Bottom) {
        Text(current)
        if (other != null) {
            Text(
                other,
                color = MaterialTheme.colorScheme.outline,
                modifier = Modifier.clip(MaterialTheme.shapes.small).clickable(onClick = onOther),
            )
        }
    }
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

/** A text link back to where you came from, as in the mockups: "‹ Us". */
@Composable
fun BackLink(label: String, onClick: () -> Unit) {
    androidx.compose.foundation.layout.Row(
        Modifier.padding(start = 4.dp).clip(MaterialTheme.shapes.small).clickable(onClick = onClick).padding(vertical = 8.dp, horizontal = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Icon(Icons.AutoMirrored.Outlined.KeyboardArrowLeft, null, Modifier.size(22.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(label, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
