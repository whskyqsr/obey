package app.obey.ui.common

import androidx.compose.ui.draw.alpha
import androidx.compose.foundation.selection.toggleable
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.selection.selectable
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
fun SectionHeader(text: String, modifier: Modifier = Modifier, horizontalPadding: Dp = 16.dp, action: Pair<String, () -> Unit>? = null) {
    androidx.compose.foundation.layout.Row(
        modifier.fillMaxWidth().padding(start = horizontalPadding, end = horizontalPadding, top = 24.dp, bottom = 8.dp),
        verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
    ) {
        Text(
            text.uppercase(),
            style = MaterialTheme.typography.labelMedium.copy(letterSpacing = 1.2.sp),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.weight(1f),
        )
        // A quiet text link on the right, such as "More time for today".
        action?.let { (label, go) ->
            Text(
                label,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier.clickable(onClick = go).padding(vertical = 2.dp),
            )
        }
    }
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

/**
 * The checkbox: an open diamond, filled ink with a check drawn inside when ticked (Jake, 2026-11-24), so it reads as a
 * choice rather than a status. Pass a null onCheckedChange when the row around it handles the tap.
 */
@Composable
fun DiamondCheckbox(checked: Boolean, onCheckedChange: ((Boolean) -> Unit)?, modifier: Modifier = Modifier, enabled: Boolean = true) {
    val c = MaterialTheme.colorScheme
    val ink = c.onSurface
    val paper = c.surface
    val toggle = if (onCheckedChange != null) {
        Modifier.toggleable(value = checked, enabled = enabled, role = androidx.compose.ui.semantics.Role.Checkbox, onValueChange = onCheckedChange)
    } else {
        Modifier
    }
    androidx.compose.foundation.Canvas(
        modifier.then(toggle).size(48.dp).padding(14.dp).then(if (enabled) Modifier else Modifier.alpha(0.4f)),
    ) {
        val w = size.width
        val half = w / 2
        val stroke = 1.5.dp.toPx()
        val r = half - stroke / 2
        val shape = androidx.compose.ui.graphics.Path().apply {
            moveTo(half, half - r); lineTo(half + r, half); lineTo(half, half + r); lineTo(half - r, half); close()
        }
        if (checked) drawPath(shape, ink)
        drawPath(shape, ink, style = androidx.compose.ui.graphics.drawscope.Stroke(stroke, join = androidx.compose.ui.graphics.StrokeJoin.Miter))
        if (checked) {
            val tick = androidx.compose.ui.graphics.Path().apply {
                moveTo(w * 0.33f, w * 0.51f); lineTo(w * 0.45f, w * 0.63f); lineTo(w * 0.68f, w * 0.39f)
            }
            drawPath(
                tick,
                paper,
                style = androidx.compose.ui.graphics.drawscope.Stroke(1.6.dp.toPx(), cap = androidx.compose.ui.graphics.StrokeCap.Round, join = androidx.compose.ui.graphics.StrokeJoin.Round),
            )
        }
    }
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

/**
 * The large serif page title with a pill toggle beside it, as in the mockups for Rules | Protocols.
 * [showToggle] is false when only one of the pair is switched on, and then only the title shows.
 */
@Composable
fun TitleWithToggle(title: String, options: List<String>, selected: Int, onSelect: (Int) -> Unit, showToggle: Boolean = true) {
    androidx.compose.foundation.layout.Row(
        Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 4.dp, bottom = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            title,
            style = MaterialTheme.typography.displaySmall,
            maxLines = 1,
            modifier = Modifier.weight(1f).semantics { heading() },
        )
        if (showToggle) PillToggle(options, selected, onSelect)
    }
}

/** Two or three choices in an outlined pill; the chosen one is filled in ink. */
@Composable
fun PillToggle(options: List<String>, selected: Int, onSelect: (Int) -> Unit) {
    val c = MaterialTheme.colorScheme
    androidx.compose.foundation.layout.Row(
        Modifier
            .border(1.dp, c.outlineVariant, androidx.compose.foundation.shape.CircleShape)
            .padding(4.dp)
            .selectableGroup(),
        horizontalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        options.forEachIndexed { i, label ->
            val on = i == selected
            Text(
                label,
                style = MaterialTheme.typography.labelLarge.copy(fontSize = 15.sp),
                color = if (on) c.surface else c.onSurfaceVariant,
                modifier = Modifier
                    .clip(androidx.compose.foundation.shape.CircleShape)
                    .background(if (on) c.onSurface else androidx.compose.ui.graphics.Color.Transparent)
                    .selectable(selected = on, role = androidx.compose.ui.semantics.Role.Tab) { if (!on) onSelect(i) }
                    .padding(horizontal = 16.dp, vertical = 8.dp),
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
