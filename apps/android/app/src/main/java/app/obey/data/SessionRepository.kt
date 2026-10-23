package app.obey.data

import android.content.Context
import app.obey.api.Me
import app.obey.api.Member
import app.obey.api.ObeyApi
import app.obey.api.Relationship
import app.obey.api.Role
import app.obey.api.userMessage
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update

/** The signed-in user, their relationships and which one is selected. */
data class Session(
    val me: Me,
    val relationship: Relationship?,
) {
    val userId: String get() = me.user.id
    /** The day calendars start the week on; Sunday unless the person chose Monday. */
    val weekStart: java.time.DayOfWeek get() = if (me.user.weekStart == "mon") java.time.DayOfWeek.MONDAY else java.time.DayOfWeek.SUNDAY
    val myMember: Member? get() = relationship?.members?.firstOrNull { it.userId == userId }
    val myRole: Role? get() = myMember?.role
    val partners: List<Member> get() = relationship?.members?.filter { it.userId != userId }.orEmpty()

    /** An ended dynamic stays readable, but nothing in it can change. */
    val readOnly: Boolean get() = relationship?.ended == true

    /** On their own in a live dynamic (solo mode): they set and do their own tasks until a partner joins. */
    val solo: Boolean get() = myMember != null && relationship?.members?.size == 1 && !readOnly

    /** Dominants and switches, and anyone on their own, may create and approve things unless the dynamic has ended; the server enforces the real rules. */
    val canManage: Boolean get() = (myRole == Role.Dominant || myRole == Role.Switch || solo) && !readOnly

    fun nameOf(userId: String): String =
        relationship?.members?.firstOrNull { it.userId == userId }?.displayName
            ?: if (userId == this.userId) me.user.displayName else "Someone"
}

sealed interface SessionState {
    data object Loading : SessionState
    data class Error(val message: String) : SessionState
    data class Ready(val session: Session) : SessionState
}

@Singleton
class SessionRepository @Inject constructor(
    private val api: ObeyApi,
    private val settings: SettingsStore,
    private val offline: OfflineStore,
    @ApplicationContext private val context: Context,
) {
    private val _state = MutableStateFlow<SessionState>(SessionState.Loading)
    val state: StateFlow<SessionState> = _state.asStateFlow()

    val session: Session? get() = (_state.value as? SessionState.Ready)?.session

    /** Requires a session; ViewModels call this from screens that are only shown when Ready. */
    fun requireRelationshipId(): String =
        session?.relationship?.id ?: error("No relationship selected")

    suspend fun refresh() {
        if (_state.value !is SessionState.Ready) _state.value = SessionState.Loading
        try {
            val me = try {
                api.me().also { offline.saveMe(it) }
            } catch (e: java.io.IOException) {
                // No signal: open with what we knew last time, so Today still works.
                offline.me() ?: throw e
            }
            val selectedId = settings.selectedRelationshipId.first()
            // An ended dynamic is still there to look back on, but a live one opens first.
            val rel = me.relationships.firstOrNull { it.id == selectedId } ?: me.relationships.firstOrNull { !it.ended } ?: me.relationships.firstOrNull()
            _state.value = SessionState.Ready(Session(me, rel))
        } catch (c: CancellationException) {
            throw c
        } catch (t: Throwable) {
            _state.value = SessionState.Error(t.userMessage())
        }
    }

    suspend fun select(relationshipId: String) {
        settings.setSelectedRelationshipId(relationshipId)
        _state.update { s ->
            if (s is SessionState.Ready) {
                val rel = s.session.me.relationships.firstOrNull { it.id == relationshipId }
                SessionState.Ready(s.session.copy(relationship = rel))
            } else s
        }
        // The widgets follow the dynamic that's open.
        app.obey.widget.Widgets.refresh(context)
    }

    /** Called after creating/joining/updating a relationship. */
    suspend fun onRelationshipChanged(rel: Relationship) {
        settings.setSelectedRelationshipId(rel.id)
        refresh()
    }

    /** On sign-out: forget the session and everything kept for offline use. */
    suspend fun clear() {
        _state.value = SessionState.Loading
        offline.clear()
        app.obey.widget.Widgets.update(context)
    }
}
