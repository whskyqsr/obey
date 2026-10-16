package app.obey.ui.settings

import androidx.lifecycle.viewModelScope
import app.obey.BuildConfig
import app.obey.api.CreateRelationshipInput
import app.obey.api.Invite
import app.obey.api.JoinRelationshipInput
import app.obey.api.ObeyApi
import app.obey.api.ReschedulePolicy
import app.obey.api.Role
import app.obey.api.UpdateRelationshipInput
import app.obey.auth.AuthManager
import app.obey.auth.AuthState
import app.obey.data.SessionRepository
import app.obey.data.SessionState
import app.obey.data.SettingsStore
import app.obey.ui.common.BaseViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn

/** Shared by Settings, sign-in and relationship setup. */
@HiltViewModel
class SettingsViewModel @Inject constructor(
    private val api: ObeyApi,
    private val sessions: SessionRepository,
    private val settings: SettingsStore,
    private val auth: AuthManager,
) : BaseViewModel() {
    val session: StateFlow<SessionState> = sessions.state
    val authState: StateFlow<AuthState> = auth.state.stateIn(viewModelScope, SharingStarted.Eagerly, AuthState.SignedOut)
    val devUserId: StateFlow<String?> = settings.devUserId.stateIn(viewModelScope, SharingStarted.Eagerly, null)

    val firebaseAvailable: Boolean get() = auth.firebaseAvailable
    val devAuthAllowed: Boolean = BuildConfig.DEV_AUTH_ALLOWED
    val apiBaseUrl: String = BuildConfig.API_BASE_URL

    private val _invite = MutableStateFlow<Invite?>(null)
    val invite: StateFlow<Invite?> = _invite.asStateFlow()

    fun setDevUser(id: String) = action {
        settings.setDevUserId(id)
        sessions.refresh()
        say(if (id.isBlank()) "Dev user cleared" else "Using dev user")
    }

    fun selectRelationship(id: String) = action { sessions.select(id) }

    fun createInvite() = action {
        val rel = sessions.requireRelationshipId()
        _invite.value = api.createInvite(rel)
    }

    fun createRelationship(name: String, role: Role) = action {
        sessions.onRelationshipChanged(api.createRelationship(CreateRelationshipInput(name.trim(), role)))
    }

    fun join(code: String, role: Role) = action {
        sessions.onRelationshipChanged(api.joinRelationship(JoinRelationshipInput(code.trim(), role)))
        say("Joined")
    }

    fun updatePolicy(policy: ReschedulePolicy? = null, allowance: Int? = null) = action {
        val rel = sessions.requireRelationshipId()
        sessions.onRelationshipChanged(
            api.updateRelationship(rel, UpdateRelationshipInput(reschedulePolicy = policy, weeklyDelayAllowance = allowance)),
        )
    }

    fun signInEmail(email: String, password: String, create: Boolean) = action {
        if (create) auth.createAccount(email, password) else auth.signInWithEmail(email, password)
    }

    fun signInGoogle(idToken: String) = action { auth.signInWithGoogleIdToken(idToken) }

    fun googleClientId(): String? = auth.googleWebClientId()

    fun reportError(text: String) = say(text)

    fun signOut() = action {
        auth.signOut()
        sessions.clear()
    }
}
