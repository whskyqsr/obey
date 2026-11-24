package app.obey.ui.scenes

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material3.HorizontalDivider
import androidx.compose.ui.draw.clip
import app.obey.api.AftercarePlan
import app.obey.api.AftercarePlanInput
import app.obey.ui.common.Eyebrow
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material.icons.outlined.VolunteerActivism
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.LargeTopAppBar
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import app.obey.api.ObeyApi
import app.obey.api.Scene
import app.obey.api.SceneInput
import app.obey.data.Session
import app.obey.data.SessionRepository
import app.obey.ui.common.BaseViewModel
import app.obey.ui.common.EmptyBox
import app.obey.ui.common.ErrorBox
import app.obey.ui.common.Load
import app.obey.ui.common.LoadingBox
import app.obey.ui.common.MenuButton
import app.obey.ui.common.MessageEffect
import app.obey.ui.common.SafeWordAction
import app.obey.ui.common.loadCatching
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

@HiltViewModel
class ScenesViewModel @Inject constructor(private val api: ObeyApi, private val sessions: SessionRepository) : BaseViewModel() {
    val session get() = sessions.session
    internal val avatars = AvatarLoader(api)

    private val _state = MutableStateFlow<Load<List<Scene>>>(Load.Loading)
    val state: StateFlow<Load<List<Scene>>> = _state.asStateFlow()

    private val _plans = MutableStateFlow<List<AftercarePlan>>(emptyList())
    val plans: StateFlow<List<AftercarePlan>> = _plans.asStateFlow()

    fun load() {
        val rel = sessions.requireRelationshipId()
        viewModelScope.launch { runCatching { api.aftercarePlans(rel) }.onSuccess { _plans.value = it } }
        viewModelScope.launch {
            val result = loadCatching { api.scenes(rel) }
            // A reload that fails keeps the list on screen.
            if (result is Load.Ready || _state.value !is Load.Ready) _state.value = result
        }
    }

    fun savePlan(input: AftercarePlanInput, done: () -> Unit) = action {
        val saved = api.saveAftercarePlan(sessions.requireRelationshipId(), input)
        _plans.value = _plans.value.map { if (it.userId == saved.userId) saved else it }
        done()
    }

    fun log(input: SceneInput, done: (Scene) -> Unit) = action {
        val s = api.logScene(sessions.requireRelationshipId(), input)
        done(s)
        load()
    }
}

/** Mockup 77: your aftercare plan at the top, then each scene on a hairline, newest first. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ScenesScreen(onOpenSettings: () -> Unit, onOpen: (String) -> Unit, onAftercare: () -> Unit, vm: ScenesViewModel = hiltViewModel()) {
    // Reload on coming back from a scene, which may have changed.
    LifecycleResumeEffect(Unit) {
        vm.load()
        onPauseOrDispose { }
    }
    val state by vm.state.collectAsStateWithLifecycle()
    val plans by vm.plans.collectAsStateWithLifecycle()
    val busy by vm.busy.collectAsStateWithLifecycle()
    val message by vm.message.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    MessageEffect(message, snackbar, vm::messageShown)
    val session = vm.session ?: return
    val c = MaterialTheme.colorScheme
    var logging by remember { mutableStateOf(false) }
    var editingPlan by remember { mutableStateOf<AftercarePlan?>(null) }
    val mine = plans.firstOrNull { it.userId == session.userId }
    val others = plans.filter { it.userId != session.userId && (it.needs.isNotEmpty() || it.note.isNotBlank()) }
    val names = andList(session.partners.map { it.displayName })

    Scaffold(
        topBar = {
            app.obey.ui.common.PageHeader("Scenes") {
                if (!session.readOnly) IconButton(onClick = { logging = true }) { Icon(Icons.Outlined.Add, "Log a scene") }
            }
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        LazyColumn(Modifier.padding(padding).fillMaxSize(), contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 96.dp)) {
            item { Text("Only your dynamic sees these.", style = MaterialTheme.typography.bodyLarge, color = c.onSurfaceVariant) }
            if (mine != null) item {
                Column(
                    Modifier.padding(top = 20.dp).fillMaxWidth().clip(MaterialTheme.shapes.medium).background(c.surfaceContainerLowest)
                        .border(1.dp, c.outlineVariant, MaterialTheme.shapes.medium).padding(20.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Eyebrow("Your aftercare")
                    PlanText(mine, "Not written yet.")
                    if (!session.readOnly) {
                        Text(
                            (if (mine.updatedAt != null) "Edit" else "Write yours") + if (names.isNotEmpty()) " · $names ${if (session.partners.size == 1) "sees" else "see"} this after each scene" else "",
                            style = MaterialTheme.typography.bodyLarge,
                            color = c.primary,
                            modifier = Modifier.clickable { editingPlan = mine },
                        )
                    }
                }
            }
            if (others.isNotEmpty()) item {
                Text(
                    others.joinToString(" · ") { "${session.nameOf(it.userId)}'s aftercare" } + " ›",
                    style = MaterialTheme.typography.bodyLarge,
                    color = c.onSurfaceVariant,
                    modifier = Modifier.padding(top = 16.dp).clickable(onClick = onAftercare),
                )
            }
            when (val s = state) {
                Load.Loading -> item { LoadingBox(Modifier.padding(top = 32.dp)) }
                is Load.Failed -> item { ErrorBox(s.message, vm::load) }
                is Load.Ready -> if (s.value.isEmpty()) {
                    item { Text("No scenes yet.", style = MaterialTheme.typography.bodyLarge, color = c.onSurfaceVariant, modifier = Modifier.padding(top = 24.dp)) }
                } else {
                    item { Spacer(Modifier.height(12.dp)) }
                    itemsIndexed(s.value, key = { _, it -> it.id }) { i, scene ->
                        if (i > 0) HorizontalDivider(color = c.outlineVariant)
                        SceneRow(scene, session) { onOpen(scene.id) }
                    }
                }
            }
        }
    }

    if (logging) {
        SceneSheet(null, session.partners.map { it.displayName }, busy, onDismiss = { logging = false }) { input ->
            vm.log(input) {
                logging = false
                onOpen(it.id)
            }
        }
    }
    editingPlan?.let { p -> PlanSheet(p, busy, onDismiss = { editingPlan = null }) { vm.savePlan(it) { editingPlan = null } } }
}

/** A plan's needs joined by middots, then its note. */
@Composable
internal fun PlanText(plan: AftercarePlan, empty: String) {
    val c = MaterialTheme.colorScheme
    if (plan.needs.isEmpty() && plan.note.isBlank()) {
        Text(empty, style = MaterialTheme.typography.bodyLarge, color = c.onSurfaceVariant)
        return
    }
    if (plan.needs.isNotEmpty()) Text(plan.needs.joinToString(" · ") { cap(it) }, style = MaterialTheme.typography.bodyLarge)
    if (plan.note.isNotBlank()) Text(plan.note, style = MaterialTheme.typography.bodyLarge)
}

/** A scene on a hairline: its name in the serif, then when, the safeword and where the sides are. */
@Composable
private fun SceneRow(s: Scene, session: Session, onClick: () -> Unit) {
    val mineShared = session.userId in s.shared
    val line = listOfNotNull(
        shortDay(s),
        if (s.safeword != "none") safewordLine(s.safeword) else null,
        if (mineShared && s.shared.size >= 2) "both sides shared" else if (mineShared) "waiting on theirs" else "your side missing",
    ).joinToString(" · ")
    Column(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(vertical = 18.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(sceneName(s), style = MaterialTheme.typography.headlineSmall)
        Text(line, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
