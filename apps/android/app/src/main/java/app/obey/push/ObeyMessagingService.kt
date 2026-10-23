package app.obey.push

import android.Manifest
import android.annotation.SuppressLint
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import app.obey.MainActivity
import app.obey.R
import app.obey.data.AppIcons
import app.obey.data.SettingsStore
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/**
 * FCM entry point. Only receives anything once google-services.json is in place.
 * Notification text should be discreet by default (PLAN.md section 2, item 12); the server decides the copy.
 */
@AndroidEntryPoint
class ObeyMessagingService : FirebaseMessagingService() {
    @Inject lateinit var registrar: DeviceRegistrar
    @Inject lateinit var appIcons: AppIcons
    @Inject lateinit var settings: SettingsStore
    @Inject lateinit var location: app.obey.location.LocationWatcher

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onNewToken(token: String) {
        scope.launch { registrar.register(token) }
    }

    @SuppressLint("MissingPermission") // checked just below for API 33+
    override fun onMessageReceived(message: RemoteMessage) {
        scope.launch { settings.markPushReceived() }
        // A new or changed task may name a place, or a pause may have ended; geofences follow the server.
        scope.launch { location.sync() }
        // Something changed for this dynamic (a task, a review, a request): the widgets catch up.
        app.obey.widget.Widgets.refresh(this)
        // Always the launcher name, so a discreet icon isn't given away by an "Obey" title.
        val title = appIcons.currentLabel()
        val body = message.notification?.body ?: message.data["body"] ?: "You have an update"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return

        val setup = message.data["type"] == "location_setup"
        val agreement = message.data["type"] in setOf("agreement_proposed", "agreement_agreed", "agreement_changes")
        // A rule or protocol someone changed opens that page; the change waits on Today too.
        val library = if (message.data["type"] == "library_changed") (if (message.data["kind"] == "protocols") PendingNav.PROTOCOLS else PendingNav.RULES) else null
        // Someone logged, shared or commented on a scene, or the next-day check-in: that scene opens.
        val scene = message.data["sceneId"]?.takeIf { message.data["type"] in setOf("scene_logged", "scene_side", "scene_comment", "scene_check") }
        val intent = Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
        if (setup) intent.putExtra(PendingNav.EXTRA, PendingNav.LOCATION)
        if (agreement) intent.putExtra(PendingNav.EXTRA, PendingNav.AGREEMENT)
        library?.let { intent.putExtra(PendingNav.EXTRA, it) }
        scene?.let { intent.putExtra(PendingNav.EXTRA, PendingNav.SCENE + it) }
        val code = when {
            setup -> 1
            agreement -> 2
            library == PendingNav.RULES -> 3
            library == PendingNav.PROTOCOLS -> 4
            // One per scene, so an older notification still opens its own scene.
            scene != null -> 5 + (scene.hashCode() and 0xFFFFFF)
            else -> 0
        }
        val pending = PendingIntent.getActivity(this, code, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val quiet = message.data["quiet"] == "1"
        val channel = getString(if (quiet) R.string.notification_channel_quiet else R.string.notification_channel_default)
        val notification = NotificationCompat.Builder(this, channel)
            .setSilent(quiet)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setContentIntent(pending)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .build()
        NotificationManagerCompat.from(this).notify(message.messageId?.hashCode() ?: 0, notification)
    }

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }
}
