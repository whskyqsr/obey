package app.obey.ui.rewards

import androidx.lifecycle.viewModelScope
import app.obey.api.AdjustPointsInput
import app.obey.api.AssignConsequenceInput
import app.obey.api.Balance
import app.obey.api.Consequence
import app.obey.api.ConsequenceInput
import app.obey.api.LedgerEntry
import app.obey.api.ObeyApi
import app.obey.api.Reward
import app.obey.api.RewardInput
import app.obey.data.Session
import app.obey.data.SessionRepository
import app.obey.ui.common.BaseViewModel
import app.obey.ui.common.Load
import app.obey.ui.common.loadCatching
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class RewardsData(
    val balances: List<Balance>,
    val rewards: List<Reward>,
    val consequences: List<Consequence>,
    val ledger: List<LedgerEntry>,
    /** The viewer's own consequences still to do or missed, which a "lets off" reward can excuse. */
    val myConsequences: List<app.obey.api.Occurrence> = emptyList(),
)

@HiltViewModel
class RewardsViewModel @Inject constructor(
    private val api: ObeyApi,
    private val sessions: SessionRepository,
) : BaseViewModel() {
    private val _state = MutableStateFlow<Load<RewardsData>>(Load.Loading)
    val state: StateFlow<Load<RewardsData>> = _state.asStateFlow()
    val session: Session? get() = sessions.session

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            if (_state.value !is Load.Ready) _state.value = Load.Loading
            _state.value = loadCatching {
                coroutineScope {
                    val rel = sessions.requireRelationshipId()
                    val b = async { api.balances(rel) }
                    val r = async { api.rewards(rel) }
                    val c = async { api.consequences(rel) }
                    val l = async { api.ledger(rel) }
                    val today = java.time.LocalDate.now()
                    val me = sessions.session?.userId
                    val mine = async {
                        if (sessions.session?.canManage == true) emptyList()
                        else runCatching { api.occurrences(rel, today.minusDays(14).toString(), today.plusDays(7).toString()) }.getOrDefault(emptyList()).filter {
                            it.consequence && it.assigneeId == me &&
                                (it.status == app.obey.api.OccurrenceStatus.Pending || it.status == app.obey.api.OccurrenceStatus.Missed)
                        }
                    }
                    RewardsData(
                        b.await(),
                        r.await().sortedBy { it.cost },
                        c.await().sortedByDescending { it.severity },
                        l.await().sortedByDescending { it.createdAt }.take(100),
                        mine.await(),
                    )
                }
            }
        }
    }

    fun balanceOf(userId: String): Int =
        (_state.value as? Load.Ready)?.value?.balances?.firstOrNull { it.userId == userId }?.balance ?: 0

    fun saveReward(existing: Reward?, input: RewardInput) = action {
        if (existing == null) api.createReward(sessions.requireRelationshipId(), input) else api.updateReward(existing.id, input)
        refresh()
    }

    fun deleteReward(r: Reward) = action { api.deleteReward(r.id); refresh() }

    /** Points are spent straight away; [who] marks it redeemed once it's given. */
    fun redeem(r: Reward, who: String, consequenceOccurrenceId: String? = null) = action {
        api.redeemReward(r.id, app.obey.api.RedeemInput(consequenceOccurrenceId))
        say("Spent ${r.cost} points. $who has been told.")
        refresh()
    }

    fun markRedeemed(e: LedgerEntry, note: String?, onDone: () -> Unit) = action {
        api.markRedeemed(e.id, app.obey.api.MarkRedeemedInput(note))
        say("Redeemed")
        onDone()
        refresh()
    }

    fun saveConsequence(existing: Consequence?, input: ConsequenceInput) = action {
        if (existing == null) api.createConsequence(sessions.requireRelationshipId(), input)
        else api.updateConsequence(existing.id, input)
        refresh()
    }

    fun assignConsequence(c: Consequence, input: AssignConsequenceInput, lockTime: Boolean) = action {
        api.assignConsequence(c.id, input)
        say(if (lockTime && c.lockMinutes != null) "Added ${app.obey.ui.chastity.fmtMinutes(c.lockMinutes)} to their lock" else "Consequence assigned")
    }

    fun deleteConsequence(c: Consequence) = action { api.deleteConsequence(c.id); refresh() }

    fun adjust(userId: String, delta: Int, note: String) = action {
        api.adjustPoints(sessions.requireRelationshipId(), AdjustPointsInput(userId, delta, note))
        refresh()
    }
}
