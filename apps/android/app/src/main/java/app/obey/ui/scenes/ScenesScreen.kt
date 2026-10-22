package app.obey.ui.scenes

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
import app.obey.ui.common.SettingsAction
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

    fun load() {
        val rel = sessions.requireRelationshipId()
        viewModelScope.launch {
            val result = loadCatching { api.scenes(rel) }
            // A reload that fails keeps the list on screen.
            if (result is Load.Ready || _state.value !is Load.Ready) _state.value = result
        }
    }

    fun log(input: SceneInput, done: (Scene) -> Unit) = action {
        val s = api.logScene(sessions.requireRelationshipId(), input)
        done(s)
        load()
    }
}

/** Scenes, newest first: each one's safeword, aftercare and how far each person has got with their side. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ScenesScreen(onOpenSettings: () -> Unit, onOpen: (String) -> Unit, onAftercare: () -> Unit, vm: ScenesViewModel = hiltViewModel()) {
    // Reload on coming back from a scene, which may have changed.
    LifecycleResumeEffect(Unit) {
        vm.load()
        onPauseOrDispose { }
    }
    val state by vm.state.collectAsStateWithLifecycle()
    val busy by vm.busy.collectAsStateWithLifecycle()
    val message by vm.message.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    MessageEffect(message, snackbar, vm::messageShown)
    val session = vm.session ?: return
    var logging by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("Scenes")
                        Text("Only your dynamic sees these", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                },
                navigationIcon = { MenuButton() },
                actions = {
                    IconButton(onClick = onAftercare) { Icon(Icons.Outlined.VolunteerActivism, "Aftercare") }
                    SafeWordAction()
                    SettingsAction(onOpenSettings)
                },
            )
        },
        floatingActionButton = {
            if (!session.readOnly) {
                ExtendedFloatingActionButton(onClick = { logging = true }, icon = { Icon(Icons.Outlined.Add, null) }, text = { Text("Log a scene") })
            }
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        when (val s = state) {
            Load.Loading -> LoadingBox(Modifier.padding(padding))
            is Load.Failed -> ErrorBox(s.message, vm::load, Modifier.padding(padding))
            is Load.Ready -> if (s.value.isEmpty()) {
                EmptyBox(
                    "No scenes yet",
                    "Log one afterwards: what you did, whether a safeword was called and the aftercare given. Each of you then writes how it went.",
                    Modifier.padding(padding),
                )
            } else {
                LazyColumn(
                    Modifier.padding(padding).fillMaxSize(),
                    contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 96.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    items(s.value, key = { it.id }) { scene -> SceneCard(scene, session, vm.avatars) { onOpen(scene.id) } }
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
}

/** A scene in the list: when, the safeword, its name, the aftercare given, and where each person is with their side. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SceneCard(s: Scene, session: Session, avatars: AvatarLoader, onClick: () -> Unit) {
    val c = MaterialTheme.colorScheme
    SceneSurface(onClick = onClick) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(whenOf(s), style = MaterialTheme.typography.bodyMedium, color = c.onSurfaceVariant, modifier = Modifier.weight(1f))
            SafewordBadge(s.safeword)
        }
        Text(sceneName(s), style = MaterialTheme.typography.titleLarge)
        Tags(s.aftercare)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            session.relationship?.members.orEmpty().forEach { m ->
                val side = s.sides.firstOrNull { it.userId == m.userId }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Person(m.userId, session, avatars)
                    Spacer(Modifier.width(6.dp))
                    when {
                        side != null -> MoodMark(side.mood)
                        m.userId in s.shared -> {
                            Icon(Icons.Filled.CheckCircle, null, Modifier.size(18.dp), tint = c.primary)
                            Spacer(Modifier.width(4.dp))
                            Text("Shared", style = MaterialTheme.typography.bodyMedium, color = c.onSurfaceVariant)
                        }
                        else -> {
                            Icon(Icons.Outlined.Schedule, null, Modifier.size(18.dp), tint = c.onSurfaceVariant)
                            Spacer(Modifier.width(4.dp))
                            Text(
                                if (m.userId == session.userId) "Add your side" else "${m.displayName} hasn't yet",
                                style = MaterialTheme.typography.bodyMedium,
                                color = c.onSurfaceVariant,
                            )
                        }
                    }
                }
            }
        }
    }
}
