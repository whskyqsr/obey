package app.obey.push

import android.util.Log
import app.obey.api.ObeyApi
import app.obey.api.RegisterDeviceInput
import app.obey.auth.AuthManager
import app.obey.data.SettingsStore
import com.google.firebase.messaging.FirebaseMessaging
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.tasks.await

/** Sends this device's FCM token to POST /devices so the API can push to it. */
@Singleton
class DeviceRegistrar @Inject constructor(
    private val api: ObeyApi,
    private val auth: AuthManager,
    private val settings: SettingsStore,
) {
    /** Returns whether the API now has this device's token. */
    suspend fun register(token: String? = null): Boolean {
        if (!auth.firebaseAvailable) return false
        try {
            val t = token ?: FirebaseMessaging.getInstance().token.await()
            api.registerDevice(RegisterDeviceInput(token = t, platform = "android"))
            settings.setPushToken(t)
            return true
        } catch (c: CancellationException) {
            throw c
        } catch (t: Throwable) {
            // Not fatal: we'll try again on next launch or token refresh.
            Log.w("Obey", "Device registration failed", t)
            return false
        }
    }
}
