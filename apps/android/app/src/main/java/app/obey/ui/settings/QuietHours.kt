package app.obey.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Bedtime
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.obey.api.QuietHours
import java.time.LocalTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle

private val HHMM = DateTimeFormatter.ofPattern("HH:mm")

/**
 * Quiet hours for the whole account: notifications still arrive in that window, but without sound or vibration.
 * Times are kept in the time zone they were set in; changing one moves them to this phone's zone.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun QuietHoursSetting(saved: QuietHours?, enabled: Boolean, onChange: (start: String?, end: String?) -> Unit) {
    val colors = MaterialTheme.colorScheme
    var picking by remember { mutableStateOf<String?>(null) }
    val start = saved?.start ?: "22:00"
    val end = saved?.end ?: "07:00"
    fun label(hhmm: String) = LocalTime.parse(hhmm).format(DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT))

    Surface(color = colors.surfaceContainerLow, shape = MaterialTheme.shapes.large, modifier = Modifier.padding(horizontal = 16.dp).padding(top = 8.dp).fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Outlined.Bedtime, null, tint = colors.primary)
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text("Quiet hours", style = MaterialTheme.typography.bodyLarge)
                    Text("Notifications still arrive, just without sound or vibration.", style = MaterialTheme.typography.bodyMedium, color = colors.onSurfaceVariant)
                }
                Switch(checked = saved != null, enabled = enabled, onCheckedChange = { on -> if (on) onChange(start, end) else onChange(null, null) })
            }
            if (saved != null) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    OutlinedButton(onClick = { picking = "start" }, enabled = enabled) { Text("From ${label(start)}") }
                    OutlinedButton(onClick = { picking = "end" }, enabled = enabled) { Text("Until ${label(end)}") }
                }
                if (saved.timezone != ZoneId.systemDefault().id) {
                    Text("Set in ${saved.timezone}.", style = MaterialTheme.typography.bodySmall, color = colors.onSurfaceVariant)
                }
            }
        }
    }

    picking?.let { which ->
        val at = LocalTime.parse(if (which == "start") start else end)
        val state = rememberTimePickerState(initialHour = at.hour, initialMinute = at.minute)
        AlertDialog(
            onDismissRequest = { picking = null },
            title = { Text(if (which == "start") "Quiet from" else "Quiet until") },
            text = { TimePicker(state = state) },
            confirmButton = {
                TextButton(onClick = {
                    val t = LocalTime.of(state.hour, state.minute).format(HHMM)
                    if (which == "start") onChange(t, end) else onChange(start, t)
                    picking = null
                }) { Text("Set") }
            },
            dismissButton = { TextButton(onClick = { picking = null }) { Text("Cancel") } },
        )
    }
}
