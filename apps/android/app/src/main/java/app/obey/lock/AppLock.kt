package app.obey.lock

import android.os.Build
import android.os.SystemClock
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_WEAK
import androidx.biometric.BiometricManager.Authenticators.DEVICE_CREDENTIAL
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import app.obey.data.SettingsStore
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first

/**
 * App lock: when on, the app is covered until the phone's own screen lock (fingerprint, face, PIN, pattern or
 * password) is passed, on launch and after it has been away for the chosen time. Nothing is stored but the setting.
 */
@Singleton
class AppLock @Inject constructor(private val settings: SettingsStore) {
    private val _locked = MutableStateFlow(false)
    val locked: StateFlow<Boolean> = _locked.asStateFlow()
    private var awaySince: Long? = null
    private var started = false

    /** On launch, before anything draws, so a locked app never shows a frame of content. */
    fun launch(lockOn: Boolean) {
        if (!started) _locked.value = lockOn
    }

    /** Called when the activity starts: locks on first launch, or when it was away long enough. */
    suspend fun onForeground() {
        val on = settings.appLock.first()
        if (!on) {
            _locked.value = false
        } else if (!started) {
            _locked.value = true
        } else {
            val away = awaySince?.let { SystemClock.elapsedRealtime() - it } ?: 0
            // A few seconds of grace so opening the photo picker or a share sheet doesn't lock "right away".
            val after = maxOf(settings.lockAfterSeconds.first(), 5) * 1000L
            if (away >= after) _locked.value = true
        }
        started = true
        awaySince = null
    }

    fun onBackground() {
        awaySince = SystemClock.elapsedRealtime()
    }

    fun unlocked() {
        _locked.value = false
    }

    companion object {
        private val authenticators = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) BIOMETRIC_WEAK or DEVICE_CREDENTIAL else BIOMETRIC_WEAK

        /** Whether this phone has a screen lock the app can ask for. */
        fun available(activity: FragmentActivity): Boolean {
            val m = BiometricManager.from(activity)
            return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                m.canAuthenticate(authenticators) == BiometricManager.BIOMETRIC_SUCCESS
            } else {
                // Before Android 11 the device-credential fallback can't be checked here; the keyguard decides.
                val keyguard = activity.getSystemService(android.app.KeyguardManager::class.java)
                keyguard?.isDeviceSecure == true
            }
        }

        /** Shows the system prompt; [onResult] gets true when the person got through. */
        @Suppress("DEPRECATION")
        fun prompt(activity: FragmentActivity, title: String, onResult: (Boolean) -> Unit) {
            val prompt = BiometricPrompt(
                activity,
                ContextCompat.getMainExecutor(activity),
                object : BiometricPrompt.AuthenticationCallback() {
                    override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) = onResult(true)
                    override fun onAuthenticationError(errorCode: Int, errString: CharSequence) = onResult(false)
                },
            )
            val info = BiometricPrompt.PromptInfo.Builder().setTitle(title).setSubtitle("Use your fingerprint, face or screen lock")
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) info.setAllowedAuthenticators(authenticators) else info.setDeviceCredentialAllowed(true)
            prompt.authenticate(info.build())
        }
    }
}
