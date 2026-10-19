package app.obey.ui.settings

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.colorResource
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import app.obey.data.AppIcon

/** Discreet mode: pick the icon and name the launcher shows. */
@Composable
fun AppIconPicker(current: AppIcon, onPick: (AppIcon) -> Unit) {
    Column(Modifier.padding(horizontal = 16.dp)) {
        Row(
            Modifier.horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            AppIcon.entries.forEach { icon ->
                val selected = icon == current
                Column(
                    Modifier
                        .width(72.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .clickable(role = Role.RadioButton) { onPick(icon) }
                        .semantics { this.selected = selected }
                        .padding(vertical = 8.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Box(
                        Modifier
                            .size(56.dp)
                            .then(if (selected) Modifier.border(3.dp, MaterialTheme.colorScheme.primary, CircleShape) else Modifier)
                            .padding(4.dp)
                            .clip(CircleShape)
                            .background(colorResource(icon.background)),
                        contentAlignment = Alignment.Center,
                    ) {
                        // The foreground is drawn on a 108dp adaptive-icon canvas, so it is drawn larger than the circle and clipped.
                        Image(painterResource(icon.foreground), null, Modifier.size(64.dp))
                    }
                    Text(
                        stringResource(icon.label),
                        style = MaterialTheme.typography.labelMedium,
                        textAlign = TextAlign.Center,
                        color = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 6.dp),
                    )
                }
            }
        }
        Text(
            "Changes the icon and name on your home screen. Notifications use the same name.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 4.dp),
        )
    }
}
