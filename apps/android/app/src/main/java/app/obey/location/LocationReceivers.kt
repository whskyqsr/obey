package app.obey.location

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.google.android.gms.location.GeofencingEvent
import dagger.hilt.android.EntryPointAccessors
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

private fun BroadcastReceiver.work(context: Context, block: suspend (LocationWatcher) -> Unit) {
    val watcher = EntryPointAccessors.fromApplication(context.applicationContext, LocationEntryPoint::class.java).watcher()
    // Keeps the process alive until the server has heard (the system allows about ten seconds).
    val pending = goAsync()
    scope.launch {
        try {
            block(watcher)
        } finally {
            pending.finish()
        }
    }
}

/** The phone arrived at or left a watched place. */
class GeofenceReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val event = GeofencingEvent.fromIntent(intent) ?: return
        if (event.hasError()) return
        work(context) { it.onTransition(event) }
    }
}

/** Geofences don't survive a restart or an update, and a task opening later needs one put up then. */
class LocationRefreshReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED, ACTION_WAKE -> work(context) { it.sync() }
        }
    }

    companion object {
        const val ACTION_WAKE = "app.obey.location.WAKE"
    }
}
