package app.obey.lock

import android.content.Context
import android.content.ContextWrapper
import android.widget.Toast
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.fragment.app.FragmentActivity
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import app.obey.data.SettingsStore
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

@HiltViewModel
class AppLockViewModel @Inject constructor(private val settings: SettingsStore) : ViewModel() {
    val on = settings.appLock.stateIn(viewModelScope, SharingStarted.Eagerly, false)
    val after = settings.lockAfterSeconds.stateIn(viewModelScope, SharingStarted.Eagerly, 60)
    fun setOn(value: Boolean) = viewModelScope.launch { settings.setAppLock(value) }
    fun setAfter(seconds: Int) = viewModelScope.launch { settings.setLockAfterSeconds(seconds) }
}

private tailrec fun Context.fragmentActivity(): FragmentActivity? = when (this) {
    is FragmentActivity -> this
    is ContextWrapper -> baseContext.fragmentActivity()
    else -> null
}

private val AFTER = listOf(0 to "Right away", 60 to "1 min", 300 to "5 min")

/** The App lock card in Settings: on or off (checked against the phone's screen lock), and when it locks again. */
@Composable
fun AppLockSetting(vm: AppLockViewModel = hiltViewModel()) {
    val context = LocalContext.current
    val on by vm.on.collectAsStateWithLifecycle()
    val after by vm.after.collectAsStateWithLifecycle()
    val colors = MaterialTheme.colorScheme
    Surface(color = colors.surfaceContainerLow, shape = MaterialTheme.shapes.large, modifier = Modifier.padding(horizontal = 16.dp).fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Outlined.Lock, null, tint = colors.primary)
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text("App lock", style = MaterialTheme.typography.bodyLarge)
                    Text("Ask for your fingerprint, face or screen lock to open the app", style = MaterialTheme.typography.bodyMedium, color = colors.onSurfaceVariant)
                }
                Switch(
                    checked = on,
                    onCheckedChange = { want ->
                        val activity = context.fragmentActivity() ?: return@Switch
                        when {
                            !want -> vm.setOn(false)
                            !AppLock.available(activity) -> Toast.makeText(context, "Set a screen lock on this phone first", Toast.LENGTH_LONG).show()
                            // Confirm it works before turning it on, so nobody locks themselves out.
                            else -> AppLock.prompt(activity, "Turn on app lock") { ok -> if (ok) vm.setOn(true) }
                        }
                    },
                )
            }
            if (on) {
                Text("Lock again when you've been away", style = MaterialTheme.typography.bodyMedium, color = colors.onSurfaceVariant)
                SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                    AFTER.forEachIndexed { i, (seconds, label) ->
                        SegmentedButton(selected = after == seconds, onClick = { vm.setAfter(seconds) }, shape = SegmentedButtonDefaults.itemShape(i, AFTER.size)) { Text(label) }
                    }
                }
            }
        }
    }
}
