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

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onNewToken(token: String) {
        scope.launch { registrar.register(token) }
    }

    @SuppressLint("MissingPermission") // checked just below for API 33+
    override fun onMessageReceived(message: RemoteMessage) {
        scope.launch { settings.markPushReceived() }
        // Always the launcher name, so a discreet icon isn't given away by an "Obey" title.
        val title = appIcons.currentLabel()
        val body = message.notification?.body ?: message.data["body"] ?: "You have an update"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return

        val intent = Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
        val pending = PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_IMMUTABLE)
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
