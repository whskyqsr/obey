package app.obey.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.obey.auth.AuthManager
import app.obey.auth.AuthState
import app.obey.data.SessionRepository
import app.obey.data.SessionState
import app.obey.push.DeviceRegistrar
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/** Decides between sign-in, relationship setup and the main app, and keeps the session loaded. */
@HiltViewModel
class RootViewModel @Inject constructor(
    auth: AuthManager,
    private val sessions: SessionRepository,
    private val registrar: DeviceRegistrar,
    settings: app.obey.data.SettingsStore,
    private val watcher: app.obey.location.LocationWatcher,
    placeStore: app.obey.location.PlaceStore,
) : ViewModel() {
    /** Each dynamic's places, for showing location tasks' places by name. */
    val places = placeStore.byRelationship
    /** null until the first auth state arrives, so we don't flash the sign-in screen. */
    val authState: StateFlow<AuthState?> = auth.state.stateIn(viewModelScope, SharingStarted.Eagerly, null)
    val session: StateFlow<SessionState> = sessions.state
    /** The dynamic whose setup steps show instead of the app; see WelcomeScreen. */
    val welcome: StateFlow<String?> = settings.welcome.stateIn(viewModelScope, SharingStarted.Eagerly, null)

    init {
        viewModelScope.launch {
            auth.state.distinctUntilChanged().collect { state ->
                if (state is AuthState.SignedOut) {
                    sessions.clear()
                } else if (state is AuthState.Firebase && state.needsVerification) {
                    // The API refuses unverified email accounts; ObeyRoot shows the verify screen instead.
                } else {
                    sessions.refresh()
                    if (state is AuthState.Firebase) registrar.register()
                    // Geofences go up (or come down) for the account now signed in.
                    launch { watcher.sync() }
                }
            }
        }
    }

    fun retry() {
        viewModelScope.launch { sessions.refresh() }
    }
}
