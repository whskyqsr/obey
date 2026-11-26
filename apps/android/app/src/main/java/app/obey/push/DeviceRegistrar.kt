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
import kotlinx.coroutines.withTimeoutOrNull
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
        // A token refreshed while signed out waits for the next sign-in, which registers it then.
        if (!auth.hasFirebaseUser) return false
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

    /**
     * Call before signing out, while the API still knows who we are: the account stops pushing here.
     * The token is deleted as well, so even if the API couldn't be reached, FCM refuses later pushes
     * to it and the worker drops it. The next sign-in registers a fresh token.
     */
    suspend fun unregister() {
        if (!auth.firebaseAvailable) return
        val token = settings.pushToken()
        withTimeoutOrNull(5_000) {
            try {
                if (token != null && auth.hasFirebaseUser) api.unregisterDevice(token)
            } catch (c: CancellationException) {
                throw c
            } catch (t: Throwable) {
                Log.w("Obey", "Device unregistration failed", t)
            }
        }
        withTimeoutOrNull(5_000) {
            try {
                FirebaseMessaging.getInstance().deleteToken().await()
            } catch (c: CancellationException) {
                throw c
            } catch (t: Throwable) {
                Log.w("Obey", "Deleting the push token failed", t)
            }
        }
        settings.setPushToken(null)
    }
}
