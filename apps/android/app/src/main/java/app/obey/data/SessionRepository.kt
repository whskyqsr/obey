package app.obey.data

import app.obey.api.Me
import app.obey.api.Member
import app.obey.api.ObeyApi
import app.obey.api.Relationship
import app.obey.api.Role
import app.obey.api.userMessage
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
    val myMember: Member? get() = relationship?.members?.firstOrNull { it.userId == userId }
    val myRole: Role? get() = myMember?.role
    val partners: List<Member> get() = relationship?.members?.filter { it.userId != userId }.orEmpty()

    /** Dominants and switches may create and approve things; the server enforces the real rules. */
    val canManage: Boolean get() = myRole == Role.Dominant || myRole == Role.Switch

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
            val me = api.me()
            val selectedId = settings.selectedRelationshipId.first()
            val rel = me.relationships.firstOrNull { it.id == selectedId } ?: me.relationships.firstOrNull()
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
    }

    /** Called after creating/joining/updating a relationship. */
    suspend fun onRelationshipChanged(rel: Relationship) {
        settings.setSelectedRelationshipId(rel.id)
        refresh()
    }

    fun clear() {
        _state.value = SessionState.Loading
    }
}
