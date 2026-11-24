package app.obey.ui.common

import androidx.compose.foundation.border
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties

/** Small capitals over a section, the web's `.eyebrow`, without SectionHeader's padding. */
@Composable
fun Eyebrow(text: String, modifier: Modifier = Modifier, color: Color = MaterialTheme.colorScheme.onSurfaceVariant) {
    Text(text.uppercase(), style = MaterialTheme.typography.labelMedium.copy(letterSpacing = 1.5.sp), color = color, modifier = modifier)
}

/** The ink button: the one filled button in Letters. */
@Composable
fun inkButtonColors() = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.onSurface, contentColor = MaterialTheme.colorScheme.surface)

/** A read-only pill on a hairline, such as each aftercare given on a scene. */
@Composable
fun Pill(text: String, modifier: Modifier = Modifier) {
    val c = MaterialTheme.colorScheme
    Text(
        text,
        style = MaterialTheme.typography.bodyLarge,
        color = c.onSurface,
        modifier = modifier.border(1.dp, c.outlineVariant, CircleShape).padding(horizontal = 18.dp, vertical = 8.dp),
    )
}

/** A full-screen form with "Cancel · title · Save" across the top (mockup 76). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FormScreen(
    title: String,
    onCancel: () -> Unit,
    onSave: () -> Unit,
    canSave: Boolean = true,
    saveLabel: String = "Save",
    content: @Composable ColumnScope.() -> Unit,
) {
    Dialog(onDismissRequest = onCancel, properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false)) {
        Scaffold(
            topBar = {
                CenterAlignedTopAppBar(
                    title = { Text(title, style = MaterialTheme.typography.titleMedium) },
                    navigationIcon = { TextButton(onClick = onCancel) { Text("Cancel", color = MaterialTheme.colorScheme.onSurfaceVariant) } },
                    actions = { TextButton(onClick = onSave, enabled = canSave) { Text(saveLabel, color = MaterialTheme.colorScheme.primary.copy(alpha = if (canSave) 1f else 0.4f)) } },
                )
            },
        ) { padding ->
            Column(
                Modifier.padding(padding).fillMaxSize().imePadding().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp).padding(bottom = 32.dp),
                verticalArrangement = Arrangement.spacedBy(20.dp),
                content = content,
            )
        }
    }
}

/** The web's "tonal" button in Letters: a hairline on paper, not a filled container. */
@Composable
fun TonalButton(onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true, content: @Composable androidx.compose.foundation.layout.RowScope.() -> Unit) {
    val c = MaterialTheme.colorScheme
    androidx.compose.material3.OutlinedButton(
        onClick = onClick,
        modifier = modifier,
        enabled = enabled,
        colors = ButtonDefaults.outlinedButtonColors(containerColor = c.surfaceContainerLowest, contentColor = c.onSurface),
        border = androidx.compose.foundation.BorderStroke(1.dp, c.outlineVariant),
        content = content,
    )
}

/** [TonalButton] for a single icon. */
@Composable
fun TonalIconButton(onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true, content: @Composable () -> Unit) {
    val c = MaterialTheme.colorScheme
    androidx.compose.material3.OutlinedIconButton(
        onClick = onClick,
        modifier = modifier,
        enabled = enabled,
        colors = androidx.compose.material3.IconButtonDefaults.outlinedIconButtonColors(containerColor = c.surfaceContainerLowest, contentColor = c.onSurface),
        border = androidx.compose.foundation.BorderStroke(1.dp, c.outlineVariant),
        content = content,
    )
}

/** The ink pill toggle ([PillToggle]) for choices with their own labels: an outlined pill holding [PillSegment]s. */
@Composable
fun PillRow(modifier: Modifier = Modifier, content: @Composable androidx.compose.foundation.layout.RowScope.() -> Unit) {
    androidx.compose.foundation.layout.Row(
        modifier.border(1.dp, MaterialTheme.colorScheme.outlineVariant, CircleShape).padding(4.dp).selectableGroup(),
        horizontalArrangement = Arrangement.spacedBy(2.dp),
        content = content,
    )
}

/** One choice in a [PillRow]: filled in ink when chosen. */
@Composable
fun androidx.compose.foundation.layout.RowScope.PillSegment(selected: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true, label: @Composable () -> Unit) {
    val c = MaterialTheme.colorScheme
    val color = when {
        selected -> c.surface
        !enabled -> c.onSurfaceVariant.copy(alpha = 0.4f)
        else -> c.onSurfaceVariant
    }
    androidx.compose.foundation.layout.Box(
        modifier
            .weight(1f)
            .clip(CircleShape)
            .background(if (selected) c.onSurface else Color.Transparent)
            .selectable(selected = selected, enabled = enabled, role = androidx.compose.ui.semantics.Role.Tab, onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 8.dp),
        contentAlignment = androidx.compose.ui.Alignment.Center,
    ) {
        androidx.compose.runtime.CompositionLocalProvider(
            androidx.compose.material3.LocalContentColor provides color,
            androidx.compose.material3.LocalTextStyle provides MaterialTheme.typography.labelLarge.copy(color = color, fontSize = 15.sp),
        ) { label() }
    }
}

/** Something waiting on you (a request, an aftercare plan): paper in an accent hairline. */
@Composable
fun AccentBox(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    val c = MaterialTheme.colorScheme
    val shape = androidx.compose.foundation.shape.RoundedCornerShape(8.dp)
    Column(
        modifier.fillMaxWidth().clip(shape).border(1.dp, c.primary, shape).background(c.surfaceContainerLowest).padding(horizontal = 20.dp, vertical = 16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
        content = content,
    )
}

/** A rule down the left edge, the way plans and status lines carry their tone. */
fun Modifier.sideRule(color: Color): Modifier =
    drawBehind { drawRect(color, size = androidx.compose.ui.geometry.Size(2.dp.toPx(), size.height)) }.padding(start = 16.dp)

/** The Letters switch: an ink track when on, as on the web. Use it in place of Material's, whose track is the oxblood accent. */
@Composable
fun Switch(checked: Boolean, onCheckedChange: ((Boolean) -> Unit)?, modifier: Modifier = Modifier, enabled: Boolean = true) {
    val c = MaterialTheme.colorScheme
    androidx.compose.material3.Switch(
        checked = checked,
        onCheckedChange = onCheckedChange,
        modifier = modifier,
        enabled = enabled,
        colors = androidx.compose.material3.SwitchDefaults.colors(
            checkedTrackColor = c.onSurface,
            checkedThumbColor = c.surface,
            checkedBorderColor = c.onSurface,
            uncheckedThumbColor = c.outlineVariant,
            uncheckedTrackColor = c.surfaceContainerLowest,
            uncheckedBorderColor = c.outline,
        ),
    )
}
