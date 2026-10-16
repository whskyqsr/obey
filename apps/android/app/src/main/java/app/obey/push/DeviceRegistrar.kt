package app.obey.push

import android.util.Log
import app.obey.api.ObeyApi
import app.obey.api.RegisterDeviceInput
import app.obey.auth.AuthManager
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
) {
    suspend fun register(token: String? = null) {
        if (!auth.firebaseAvailable) return
        try {
            val t = token ?: FirebaseMessaging.getInstance().token.await()
            api.registerDevice(RegisterDeviceInput(token = t, platform = "android"))
        } catch (c: CancellationException) {
            throw c
        } catch (t: Throwable) {
            // Not fatal: we'll try again on next launch or token refresh.
            Log.w("Obey", "Device registration failed", t)
        }
    }
}
