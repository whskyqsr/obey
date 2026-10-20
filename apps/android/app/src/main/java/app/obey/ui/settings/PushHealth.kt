package app.obey.ui.settings

import android.Manifest
import android.content.Intent
import android.os.Build
import android.provider.Settings
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.NotificationsOff
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.app.NotificationManagerCompat
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import app.obey.api.DeviceStatus
import app.obey.api.ObeyApi
import app.obey.auth.AuthManager
import app.obey.data.SettingsStore
import app.obey.push.DeviceRegistrar
import app.obey.ui.common.BaseViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.Duration
import java.time.Instant
import javax.inject.Inject
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

data class PushDevices(val here: DeviceStatus?, val others: List<DeviceStatus>, val loaded: Boolean)

/** Whether push gets through to this phone: its registration, the last push sent and received, and a test. */
@HiltViewModel
class PushHealthViewModel @Inject constructor(
    private val api: ObeyApi,
    private val registrar: DeviceRegistrar,
    private val settings: SettingsStore,
    auth: AuthManager,
) : BaseViewModel() {
    val available = auth.firebaseAvailable

    private val _devices = MutableStateFlow(PushDevices(null, emptyList(), false))
    val devices: StateFlow<PushDevices> = _devices.asStateFlow()

    val receivedAt: StateFlow<String?> = settings.pushReceivedAt.stateIn(viewModelScope, SharingStarted.Eagerly, null)

    private suspend fun show(list: List<DeviceStatus>) {
        val tail = settings.pushToken()?.takeLast(12)
        val here = list.firstOrNull { it.tokenTail == tail }
        _devices.value = PushDevices(here, list.filter { it !== here }, true)
    }

    fun load() {
        if (!available) return
        viewModelScope.launch { runCatching { api.devices() }.onSuccess { show(it) } }
    }

    fun test() = action {
        val list = api.testPush()
        show(list)
        say(if (list.isEmpty()) "No devices to send to yet" else "Test sent. It should arrive in a few seconds.")
    }

    fun reRegister() = action {
        val ok = registrar.register()
        say(if (ok) "This phone is registered for notifications" else "Couldn't register this phone; try again later")
        delay(300)
        load()
    }
}

private fun ago(iso: String?): String {
    val at = iso?.let { runCatching { Instant.parse(it) }.getOrNull() ?: runCatching { java.time.OffsetDateTime.parse(it).toInstant() }.getOrNull() } ?: return "not yet"
    val d = Duration.between(at, Instant.now())
    return when {
        d.toMinutes() < 1 -> "just now"
        d.toHours() < 1 -> "${d.toMinutes()} min ago"
        d.toDays() < 1 -> "${d.toHours()} h ago"
        else -> "${d.toDays()} d ago"
    }
}

/** What a failed send means, in words; FCM's code otherwise. */
private fun errorText(code: String) = when {
    "invalid-registration-token" in code || "invalid-argument" in code -> "this phone's registration is no longer valid"
    "third-party-auth-error" in code -> "the push service rejected the credentials"
    else -> code.removePrefix("messaging/").replace('-', ' ')
}

/**
 * The Notifications section of Settings: permission, whether this phone is registered, when a push was last sent and
 * received, the account's other devices, and "Send me a test". A broken setup says so instead of failing quietly.
 */
@Composable
fun PushHealthSection(vm: PushHealthViewModel = hiltViewModel()) {
    val context = LocalContext.current
    val devices by vm.devices.collectAsStateWithLifecycle()
    val receivedAt by vm.receivedAt.collectAsStateWithLifecycle()
    val busy by vm.busy.collectAsStateWithLifecycle()
    val message by vm.message.collectAsStateWithLifecycle()
    LaunchedEffect(message) {
        message?.let { Toast.makeText(context, it, Toast.LENGTH_SHORT).show(); vm.messageShown() }
    }
    // Re-read permission whenever we come back, e.g. from system settings.
    val resumes = remember { mutableIntStateOf(0) }
    LifecycleResumeEffect(Unit) {
        resumes.intValue++
        vm.load()
        onPauseOrDispose { }
    }
    val allowed = remember(resumes.intValue) { NotificationManagerCompat.from(context).areNotificationsEnabled() }
    val ask = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { resumes.intValue++ }
    val colors = MaterialTheme.colorScheme

    val problem = when {
        !vm.available -> "this build has no push set up"
        !allowed -> "notifications are turned off for this app"
        devices.loaded && devices.here == null -> "this phone isn't registered yet"
        devices.here?.lastError != null -> errorText(devices.here!!.lastError!!)
        else -> null
    }

    Surface(color = colors.surfaceContainerLow, shape = MaterialTheme.shapes.large, modifier = Modifier.padding(horizontal = 16.dp).fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.Top) {
                Icon(
                    when {
                        !allowed -> Icons.Outlined.NotificationsOff
                        problem != null -> Icons.Outlined.ErrorOutline
                        else -> Icons.Outlined.CheckCircle
                    },
                    null,
                    tint = if (problem != null) colors.error else colors.primary,
                )
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(if (problem != null) "Push needs attention" else "Push is set up on this phone", style = MaterialTheme.typography.bodyLarge)
                    problem?.let { Text("Problem: $it.", style = MaterialTheme.typography.bodyMedium, color = colors.error) }
                    val muted = MaterialTheme.typography.bodyMedium
                    devices.here?.let { Text("Last sent here: ${ago(it.lastSentAt)}", style = muted, color = colors.onSurfaceVariant) }
                    Text("Last received here: ${ago(receivedAt)}", style = muted, color = colors.onSurfaceVariant)
                    devices.others.forEach { d ->
                        val name = if (d.platform == "android") "Another Android phone" else "Browser"
                        Text(
                            if (d.lastError != null) "$name: last push failed (${errorText(d.lastError)})" else "$name: last push sent ${ago(d.lastSentAt)}",
                            style = muted,
                            color = colors.onSurfaceVariant,
                        )
                    }
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (!allowed) {
                    FilledTonalButton(onClick = {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) ask.launch(Manifest.permission.POST_NOTIFICATIONS)
                        else context.startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName))
                    }) { Text("Turn on") }
                } else if (vm.available) {
                    FilledTonalButton(onClick = vm::test, enabled = !busy) { Text("Send me a test") }
                    TextButton(onClick = vm::reRegister, enabled = !busy) { Text("Re-register") }
                }
            }
        }
    }
}
