package app.obey.ui

import androidx.lifecycle.viewModelScope
import app.obey.api.NoteKind
import app.obey.api.ObeyApi
import app.obey.api.OccurrenceStatus
import app.obey.api.Role
import app.obey.data.SessionRepository
import app.obey.ui.common.BaseViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** The small word or number beside each Us section, keyed by its label. Anything that fails to load just shows nothing. */
@HiltViewModel
class UsViewModel @Inject constructor(
    private val api: ObeyApi,
    private val sessions: SessionRepository,
) : BaseViewModel() {
    private val _counts = MutableStateFlow<Map<String, String>>(emptyMap())
    val counts: StateFlow<Map<String, String>> = _counts.asStateFlow()

    fun refresh(labels: Set<String>) {
        viewModelScope.launch {
            val session = sessions.session ?: return@launch
            val rel = session.relationship ?: return@launch
            val me = session.userId
            // Whose points and consequences: your own, or for a Dominant, the submissive's.
            val whose = if (session.myRole == Role.Dominant) {
                rel.members.firstOrNull { it.role == Role.Submissive && it.userId != me }?.userId ?: me
            } else me
            fun has(label: String) = label in labels
            _counts.value = coroutineScope {
                val rules = async { if (has("Rules")) runCatching { api.rules(rel.id).size.toString() }.getOrNull() else null }
                val notes = async { if (has("Notes")) runCatching { api.notes(rel.id).count { it.kind == NoteKind.Note }.toString() }.getOrNull() else null }
                val points = async {
                    if (has("Rewards")) runCatching { api.balances(rel.id).firstOrNull { it.userId == whose }?.let { "${it.balance} pts" } }.getOrNull() else null
                }
                val owed = async {
                    if (!has("Consequences")) null else runCatching {
                        val today = java.time.LocalDate.now()
                        api.occurrences(rel.id, today.minusDays(30).toString(), today.plusDays(7).toString())
                            .count { it.consequence && it.assigneeId == whose && (it.status == OccurrenceStatus.Pending || it.status == OccurrenceStatus.Missed) }
                            .takeIf { it > 0 }?.let { "$it owed" }
                    }.getOrNull()
                }
                val agreement = async {
                    if (!has("Agreement")) null else runCatching {
                        val a = api.agreement(rel.id)
                        a.current?.let { "v${it.number}" } ?: a.proposal?.let { "proposed" }
                    }.getOrNull()
                }
                val chastity = async {
                    if (!has("Chastity")) null else runCatching {
                        when (api.chastity(rel.id).open.firstOrNull()?.status) {
                            "active" -> "locked"
                            "break" -> "on a break"
                            "pending" -> "starting"
                            else -> null
                        }
                    }.getOrNull()
                }
                buildMap {
                    rules.await()?.let { put("Rules", it) }
                    notes.await()?.let { put("Notes", it) }
                    points.await()?.let { put("Rewards", it) }
                    owed.await()?.let { put("Consequences", it) }
                    agreement.await()?.let { put("Agreement", it) }
                    chastity.await()?.let { put("Chastity", it) }
                }
            }
        }
    }
}
