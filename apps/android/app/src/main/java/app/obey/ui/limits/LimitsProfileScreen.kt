package app.obey.ui.limits

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import app.obey.api.LimitAnswer
import app.obey.api.LimitAnswerInput
import app.obey.api.LimitChange
import app.obey.api.LimitChanges
import app.obey.api.LimitItem
import app.obey.api.LimitProfile
import app.obey.api.LimitProfileApply
import app.obey.api.LimitProfileMatch
import app.obey.api.ObeyApi
import app.obey.api.Role as MemberRole
import app.obey.data.Session
import app.obey.data.SessionRepository
import app.obey.ui.common.BackLink
import app.obey.ui.common.BaseViewModel
import app.obey.ui.common.Diamond
import app.obey.ui.common.DiamondState
import app.obey.ui.common.ErrorBox
import app.obey.ui.common.Eyebrow
import app.obey.ui.common.LettersField
import app.obey.ui.common.Load
import app.obey.ui.common.LoadingBox
import app.obey.ui.common.MessageEffect
import app.obey.ui.common.inkButtonColors
import app.obey.ui.common.loadCatching
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

@HiltViewModel
class LimitsProfileViewModel @Inject constructor(private val api: ObeyApi, private val sessions: SessionRepository) : BaseViewModel() {
    val session: Session? get() = sessions.session
    private val _state = MutableStateFlow<Load<LimitProfile>>(Load.Loading)
    val state: StateFlow<Load<LimitProfile>> = _state.asStateFlow()

    /** Answers changed on this visit, item and side, so leaving can ask which dynamics to bring them to. */
    private val changed = linkedSetOf<LimitChange>()
    val changes: List<LimitChange> get() = changed.toList()

    private val _asking = MutableStateFlow<List<LimitProfileMatch>?>(null)
    val asking: StateFlow<List<LimitProfileMatch>?> = _asking.asStateFlow()

    fun load() {
        viewModelScope.launch { _state.value = loadCatching { api.limitProfile() } }
    }

    fun answer(item: LimitItem, side: String, rating: String?, note: String) {
        val ready = (_state.value as? Load.Ready)?.value ?: return
        val answers = ready.sides[side].toMutableMap()
        if (rating != null || note.isNotEmpty()) answers[item.key] = LimitAnswer(rating, note) else answers.remove(item.key)
        val next = if (side == "dom") ready.sides.copy(dom = answers) else ready.sides.copy(sub = answers)
        _state.value = Load.Ready(ready.copy(sides = next, rated = (next.dom.filterValues { it.rating != null }.keys + next.sub.filterValues { it.rating != null }.keys).size))
        changed += LimitChange(item.key, side)
        action(onError = { load() }) { api.answerLimitProfile(item.key, LimitAnswerInput(rating, note, side)) }
    }

    /** Leaving: if anything changed, finds the dynamics where it reads differently and asks; otherwise just goes. */
    fun leave(close: () -> Unit) {
        if (changed.isEmpty()) return close()
        action {
            val found = api.limitProfileMatches(LimitChanges(changes))
            if (found.isEmpty()) {
                changed.clear()
                close()
            } else {
                _asking.value = found.sortedBy { it.finished }
            }
        }
    }

    fun apply(relationshipIds: List<String>, close: () -> Unit) = action {
        api.applyLimitProfile(LimitProfileApply(changes, relationshipIds))
        say(if (relationshipIds.size == 1) "Updated" else "Updated ${relationshipIds.size}")
        dismiss(close)
    }

    fun dismiss(close: () -> Unit) {
        _asking.value = null
        changed.clear()
        close()
    }
}

/**
 * Your own limits (limits-sides/5-your-limits), from Settings: the same steps as in a dynamic, said about "your partner",
 * with your current role's side first and neither marked optional. They fill in each new dynamic's list as a draft; when
 * you change them, Fealty asks which dynamics to update too and never copies on its own.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LimitsProfileScreen(onClose: () -> Unit, vm: LimitsProfileViewModel = hiltViewModel()) {
    LaunchedEffect(Unit) { vm.load() }
    val state by vm.state.collectAsStateWithLifecycle()
    val asking by vm.asking.collectAsStateWithLifecycle()
    val busy by vm.busy.collectAsStateWithLifecycle()
    val message by vm.message.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    MessageEffect(message, snackbar, vm::messageShown)
    val session = vm.session
    val self = session?.myMember
    val partner = if (session == null || session.solo) null else session.partners.firstOrNull()
    val usual = usualSide(self?.role ?: MemberRole.Dominant, partner?.role)
    var at by rememberSaveable { mutableStateOf<Int?>(null) }
    var noting by remember { mutableStateOf<Pair<LimitItem, String>?>(null) }
    val profile = (state as? Load.Ready)?.value
    val answers = profile?.sides ?: app.obey.api.LimitSides()
    val items = profile?.let { byCategory(it.items).flatMap { (_, xs) -> xs } }.orEmpty()
    fun rated(key: String) = answers.dom[key]?.rating != null || answers.sub[key]?.rating != null
    val index = at ?: items.indexOfFirst { !rated(it.key) }.let { if (it >= 0) it else items.size }
    val item = items.getOrNull(index)
    fun go(n: Int) { at = n.coerceIn(0, items.size) }
    val leave = { vm.leave(onClose) }
    BackHandler(asking == null) { leave() }
    val c = MaterialTheme.colorScheme

    Scaffold(
        topBar = { TopAppBar(title = {}, navigationIcon = { BackLink("Settings", leave) }) },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        Column(Modifier.padding(padding).fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp).padding(bottom = 24.dp)) {
            when (val s = state) {
                Load.Loading -> LoadingBox()
                is Load.Failed -> ErrorBox(s.message, { vm.load() })
                is Load.Ready -> {
                    val inCategory = item?.let { i -> items.filter { it.category == i.category } }.orEmpty()
                    Eyebrow(
                        if (item != null) "Your limits · ${item.category} · ${inCategory.indexOf(item) + 1} of ${inCategory.size}"
                        else "Your limits · ${s.value.rated} of ${items.size} rated",
                    )
                    Box(Modifier.padding(top = 12.dp).fillMaxWidth().height(3.dp).background(c.outlineVariant)) {
                        Box(Modifier.fillMaxWidth(index.coerceAtMost(items.size).toFloat() / items.size.coerceAtLeast(1)).height(3.dp).background(c.onSurface))
                    }
                    if (item != null) {
                        ItemStep(
                            item = item,
                            answers = answers,
                            sides = listOf(usual, otherSide(usual)),
                            optional = null,
                            partnerName = null,
                            onRate = { side, rating ->
                                vm.answer(item, side, rating, answers[side][item.key]?.note.orEmpty())
                                if (rating != null && answers[otherSide(side)][item.key]?.rating != null) go(index + 1)
                            },
                            onNote = { side -> noting = item to side },
                            onPrevious = if (index > 0) ({ go(index - 1) }) else null,
                            onNext = { go(index + 1) },
                        )
                    } else {
                        Text("All saved", style = MaterialTheme.typography.displayMedium, modifier = Modifier.padding(top = 40.dp))
                        Text("You've rated ${s.value.rated} of ${items.size}.", style = MaterialTheme.typography.bodyLarge, color = c.onSurfaceVariant, modifier = Modifier.padding(top = 8.dp))
                        Row(Modifier.padding(top = 24.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            Button(onClick = leave, enabled = !busy, colors = inkButtonColors()) { Text("Done") }
                            TextButton(onClick = { go(0) }) { Text("Start again from the top") }
                        }
                    }
                }
            }
        }
    }

    noting?.let { (noted, side) ->
        var note by remember(noted.key, side) { mutableStateOf(answers[side][noted.key]?.note.orEmpty()) }
        AlertDialog(
            onDismissRequest = { noting = null },
            title = { Text(limitSentence(if (side == "dom") noted.sentences.dom else noted.sentences.sub, null)) },
            text = { LettersField(note, { note = it.take(500) }, label = { Text("Note") }, placeholder = { Text("Only soft ones, and not for long") }, modifier = Modifier.fillMaxWidth()) },
            confirmButton = { Button(onClick = { vm.answer(noted, side, answers[side][noted.key]?.rating, note.trim()); noting = null }, colors = inkButtonColors()) { Text("Save") } },
            dismissButton = { TextButton(onClick = { noting = null }) { Text("Cancel") } },
        )
    }

    asking?.let { matches ->
        // Ones you've finished start unticked, since your partner would see the change.
        var picked by remember(matches) { mutableStateOf(matches.filter { !it.finished }.map { it.relationshipId }.toSet()) }
        val count = vm.changes.size
        ModalBottomSheet(
            onDismissRequest = { vm.dismiss(onClose) },
            containerColor = c.surface,
            sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        ) {
            Column(Modifier.padding(horizontal = 24.dp).padding(bottom = 24.dp)) {
                Text("Update your limits with them too?", style = MaterialTheme.typography.headlineLarge)
                Text(
                    "You changed $count ${if (count == 1) "answer" else "answers"}.",
                    style = MaterialTheme.typography.bodyLarge,
                    color = c.onSurfaceVariant,
                    modifier = Modifier.padding(top = 8.dp, bottom = 12.dp),
                )
                matches.forEach { m ->
                    val on = m.relationshipId in picked
                    Row(
                        Modifier.fillMaxWidth().heightIn(min = 56.dp)
                            .clickable { picked = if (on) picked - m.relationshipId else picked + m.relationshipId }
                            .semantics { role = Role.Checkbox; stateDescription = if (on) "Ticked" else "Not ticked" },
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(14.dp),
                    ) {
                        Diamond(if (on) DiamondState.Done else DiamondState.Open, size = 16.dp)
                        Text(m.name, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
                        Text("${m.differ} differ${if (m.finished) " · finished" else ""}", style = MaterialTheme.typography.bodySmall, color = c.onSurfaceVariant)
                    }
                    HorizontalDivider(color = c.outlineVariant)
                }
                Row(Modifier.padding(top = 20.dp).fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End)) {
                    OutlinedButton(onClick = { vm.dismiss(onClose) }) { Text("Not now") }
                    Button(onClick = { vm.apply(picked.toList(), onClose) }, enabled = picked.isNotEmpty() && !busy, colors = inkButtonColors()) { Text("Update") }
                }
            }
        }
    }
}
