package app.obey.widget

import android.content.Context
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Widgets
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import app.obey.data.SettingsStore
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

@HiltViewModel
class WidgetSettingViewModel @Inject constructor(
    private val settings: SettingsStore,
    @ApplicationContext private val context: Context,
) : ViewModel() {
    val names = settings.widgetNames.stateIn(viewModelScope, SharingStarted.Eagerly, false)
    val tick = settings.widgetTick.stateIn(viewModelScope, SharingStarted.Eagerly, true)
    val appLock = settings.appLock.stateIn(viewModelScope, SharingStarted.Eagerly, false)

    fun setNames(on: Boolean) = viewModelScope.launch {
        settings.setWidgetNames(on)
        Widgets.update(context)
    }

    fun setTick(on: Boolean) = viewModelScope.launch {
        settings.setWidgetTick(on)
        Widgets.update(context)
    }
}

/** Home screen widgets in Settings: whether they name tasks, and whether the Today widget can tick them done. */
@Composable
fun WidgetSetting(vm: WidgetSettingViewModel = hiltViewModel()) {
    val names by vm.names.collectAsStateWithLifecycle()
    val tick by vm.tick.collectAsStateWithLifecycle()
    val locked by vm.appLock.collectAsStateWithLifecycle()
    val colors = MaterialTheme.colorScheme
    Surface(color = colors.surfaceContainerLow, shape = MaterialTheme.shapes.large, modifier = Modifier.padding(horizontal = 16.dp).fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Outlined.Widgets, null, tint = colors.primary)
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text("Show task names on widgets", style = MaterialTheme.typography.bodyLarge)
                    Text(
                        if (locked) "Off while the app lock is on" else "Off, widgets show counts and times only, like your notifications",
                        style = MaterialTheme.typography.bodyMedium,
                        color = colors.onSurfaceVariant,
                    )
                }
                Switch(checked = names && !locked, enabled = !locked, onCheckedChange = vm::setNames)
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Spacer(Modifier.width(36.dp))
                Column(Modifier.weight(1f)) {
                    Text("Mark done from the widget", style = MaterialTheme.typography.bodyLarge)
                    Text("Tasks that need proof, steps, a mood or an entry still open the app", style = MaterialTheme.typography.bodyMedium, color = colors.onSurfaceVariant)
                }
                Switch(checked = tick, onCheckedChange = vm::setTick)
            }
        }
    }
}
