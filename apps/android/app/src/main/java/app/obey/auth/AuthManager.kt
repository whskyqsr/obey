package app.obey.auth

import android.content.Context
import app.obey.BuildConfig
import app.obey.data.SettingsStore
import com.google.firebase.FirebaseApp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.GoogleAuthProvider
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.tasks.await

/** Who the API will see us as. */
sealed interface AuthState {
    data object SignedOut : AuthState
    data class Firebase(val uid: String, val email: String?) : AuthState
    data class Dev(val userId: String) : AuthState
}

/**
 * Wraps Firebase Auth, which is only usable when the build had google-services.json.
 * In debug builds a dev user id from Settings takes precedence (the API accepts X-Dev-User when DEV_AUTH=1).
 */
@Singleton
class AuthManager @Inject constructor(
    @ApplicationContext private val context: Context,
    private val settings: SettingsStore,
) {
    /** True when Firebase was configured at build time and initialised at startup. */
    val firebaseAvailable: Boolean
        get() = BuildConfig.FIREBASE_CONFIGURED && FirebaseApp.getApps(context).isNotEmpty()

    private val auth: FirebaseAuth? get() = if (firebaseAvailable) FirebaseAuth.getInstance() else null

    private val firebaseUser: Flow<AuthState> =
        if (!firebaseAvailable) flowOf(AuthState.SignedOut) else callbackFlow<AuthState> {
            val firebaseAuth = FirebaseAuth.getInstance()
            val listener = FirebaseAuth.AuthStateListener { a ->
                val u = a.currentUser
                trySend(if (u == null) AuthState.SignedOut else AuthState.Firebase(u.uid, u.email))
            }
            firebaseAuth.addAuthStateListener(listener)
            awaitClose { firebaseAuth.removeAuthStateListener(listener) }
        }

    val state: Flow<AuthState> = combine(settings.devUserId, firebaseUser) { dev, fb ->
        if (dev != null) AuthState.Dev(dev) else fb
    }

    /** Fresh-enough Firebase ID token for the Authorization header, or null. */
    suspend fun idToken(forceRefresh: Boolean = false): String? {
        val user = auth?.currentUser ?: return null
        return user.getIdToken(forceRefresh).await().token
    }

    suspend fun signInWithEmail(email: String, password: String) {
        val a = auth ?: error("Firebase isn't configured in this build")
        a.signInWithEmailAndPassword(email.trim(), password).await()
    }

    suspend fun createAccount(email: String, password: String) {
        val a = auth ?: error("Firebase isn't configured in this build")
        a.createUserWithEmailAndPassword(email.trim(), password).await()
    }

    suspend fun signInWithGoogleIdToken(idToken: String) {
        val a = auth ?: error("Firebase isn't configured in this build")
        a.signInWithCredential(GoogleAuthProvider.getCredential(idToken, null)).await()
    }

    /**
     * The OAuth web client id that the google-services plugin generates as R.string.default_web_client_id.
     * Looked up by name so the app compiles without google-services.json.
     */
    fun googleWebClientId(): String? {
        val res = context.resources
        @Suppress("DiscouragedApi")
        val id = res.getIdentifier("default_web_client_id", "string", context.packageName)
        return if (id == 0) null else res.getString(id)
    }

    suspend fun signOut() {
        settings.setDevUserId(null)
        settings.setSelectedRelationshipId(null)
        auth?.signOut()
    }
}
