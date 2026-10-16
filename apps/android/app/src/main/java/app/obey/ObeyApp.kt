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
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }
}
