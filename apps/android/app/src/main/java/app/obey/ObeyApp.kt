package app.obey

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import dagger.hilt.android.HiltAndroidApp

@HiltAndroidApp
class ObeyApp : Application() {
    override fun onCreate() {
        super.onCreate()
        // minSdk 26, so channels always exist.
        val channel = NotificationChannel(
            getString(R.string.notification_channel_default),
            getString(R.string.notification_channel_name),
            NotificationManager.IMPORTANCE_DEFAULT,
        )
        // Quiet hours: the same notifications, without sound or vibration.
        val quiet = NotificationChannel(
            getString(R.string.notification_channel_quiet),
            getString(R.string.notification_channel_quiet_name),
            NotificationManager.IMPORTANCE_LOW,
        )
        // Safe calls: sound even in quiet hours, shown as a heads-up.
        val urgent = NotificationChannel(
            getString(R.string.notification_channel_urgent),
            getString(R.string.notification_channel_urgent_name),
            NotificationManager.IMPORTANCE_HIGH,
        )
        getSystemService(NotificationManager::class.java).createNotificationChannels(listOf(channel, quiet, urgent))
    }
}
