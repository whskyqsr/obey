package app.obey.ui.common

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp

/**
 * The Letters pill: a hairline outline, ink outline when chosen. [check] adds a tick to a chosen one, for chips that
 * switch something on (the editor's "Also" row); filter pills leave it off.
 */
@Composable
fun LettersChip(label: String, selected: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier, check: Boolean = false) {
    val c = MaterialTheme.colorScheme
    Row(
        modifier
            .clip(CircleShape)
            .border(1.dp, if (selected) c.onSurface else c.outlineVariant, CircleShape)
            .background(if (selected) c.surfaceContainerLowest else Color.Transparent)
            .toggleable(value = selected, role = Role.Checkbox, onValueChange = { onClick() })
            .padding(horizontal = 14.dp, vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        if (check && selected) Icon(Icons.Outlined.Check, null, Modifier.size(16.dp), tint = c.onSurface)
        Text(label, style = MaterialTheme.typography.labelLarge, color = if (selected) c.onSurface else c.onSurfaceVariant)
    }
}

/**
 * [LettersChip] with a composable label and optional leading icon, in place of Material's FilterChip (which brings a
 * filled, tinted container the redesign doesn't use).
 */
@Composable
fun ChoiceChip(
    selected: Boolean,
    onClick: () -> Unit,
    label: @Composable () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    leadingIcon: (@Composable () -> Unit)? = null,
) {
    val c = MaterialTheme.colorScheme
    Row(
        modifier
            .clip(CircleShape)
            .border(1.dp, if (selected) c.onSurface else c.outlineVariant, CircleShape)
            .background(if (selected) c.surfaceContainerLowest else Color.Transparent)
            .toggleable(value = selected, enabled = enabled, role = Role.Checkbox, onValueChange = { onClick() })
            .padding(horizontal = 14.dp, vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        val color = when {
            !enabled -> c.onSurfaceVariant.copy(alpha = 0.4f)
            selected -> c.onSurface
            else -> c.onSurfaceVariant
        }
        androidx.compose.runtime.CompositionLocalProvider(
            androidx.compose.material3.LocalContentColor provides color,
            androidx.compose.material3.LocalTextStyle provides MaterialTheme.typography.labelLarge.copy(color = color),
        ) {
            leadingIcon?.invoke()
            label()
        }
    }
}
