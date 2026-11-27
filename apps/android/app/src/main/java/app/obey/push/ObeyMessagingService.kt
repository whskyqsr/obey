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
    @Inject lateinit var auth: app.obey.auth.AuthManager

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onNewToken(token: String) {
        scope.launch { registrar.register(token) }
    }

    @SuppressLint("MissingPermission") // checked just below for API 33+
    override fun onMessageReceived(message: RemoteMessage) {
        // Signed out: whatever was still queued for the old account isn't shown.
        if (!auth.hasFirebaseUser) return
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
        // A safe call gets its own urgent channel and stays out of the group, so it can't sit unnoticed in a bundle.
        val urgent = message.data["urgent"] == "1"
        val quiet = !urgent && message.data["quiet"] == "1"
        val channel = getString(
            when {
                urgent -> R.string.notification_channel_urgent
                quiet -> R.string.notification_channel_quiet
                else -> R.string.notification_channel_default
            },
        )
        // Pushes about the same thing (one plan, rule changes, location) share a tag: the newest replaces the last one,
        // and doesn't buzz again while that one is still showing.
        val tag = message.data["tag"]
        val notification = NotificationCompat.Builder(this, channel)
            .setSilent(quiet)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setContentIntent(pending)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setOnlyAlertOnce(tag != null)
            .apply {
                if (urgent) {
                    setPriority(NotificationCompat.PRIORITY_HIGH)
                    setCategory(NotificationCompat.CATEGORY_ALARM)
                } else {
                    setGroup(GROUP)
                    setGroupAlertBehavior(NotificationCompat.GROUP_ALERT_CHILDREN)
                }
            }
            .build()
        val manager = NotificationManagerCompat.from(this)
        if (tag != null) manager.notify(tag, TAGGED_ID, notification) else manager.notify(message.messageId?.hashCode() ?: 0, notification)
        if (!urgent) {
            // Everything else is bundled under one summary once there are two or more.
            val summary = NotificationCompat.Builder(this, getString(R.string.notification_channel_default))
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(title)
                .setAutoCancel(true)
                .setContentIntent(PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP), PendingIntent.FLAG_IMMUTABLE))
                .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
                .setGroup(GROUP)
                .setGroupSummary(true)
                .setGroupAlertBehavior(NotificationCompat.GROUP_ALERT_CHILDREN)
                .setSilent(true)
                .build()
            manager.notify(SUMMARY_ID, summary)
        }
    }

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }

    private companion object {
        const val GROUP = "fealty"
        const val SUMMARY_ID = Int.MIN_VALUE
        // Tagged notifications are told apart by their tag; the id only has to be the same each time.
        const val TAGGED_ID = 1
    }
}
