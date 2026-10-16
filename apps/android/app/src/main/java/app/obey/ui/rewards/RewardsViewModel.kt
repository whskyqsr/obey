package app.obey.ui.rewards

import androidx.lifecycle.viewModelScope
import app.obey.api.AdjustPointsInput
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
                    RewardsData(
                        b.await(),
                        r.await().sortedBy { it.cost },
                        c.await().sortedByDescending { it.severity },
                        l.await().sortedByDescending { it.createdAt }.take(100),
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

    fun redeem(r: Reward) = action {
        api.redeemReward(r.id)
        say(if (r.needsApproval) "Requested “${r.title}”" else "Redeemed “${r.title}”")
        refresh()
    }

    fun saveConsequence(existing: Consequence?, input: ConsequenceInput) = action {
        if (existing == null) api.createConsequence(sessions.requireRelationshipId(), input)
        else api.updateConsequence(existing.id, input)
        refresh()
    }

    fun deleteConsequence(c: Consequence) = action { api.deleteConsequence(c.id); refresh() }

    fun adjust(userId: String, delta: Int, note: String) = action {
        api.adjustPoints(sessions.requireRelationshipId(), AdjustPointsInput(userId, delta, note))
        refresh()
    }
}
