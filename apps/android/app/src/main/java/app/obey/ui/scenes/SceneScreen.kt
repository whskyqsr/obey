package app.obey.ui.scenes

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.WbSunny
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.navigation.toRoute
import app.obey.api.ObeyApi
import app.obey.api.Scene
import app.obey.api.SceneCheckInput
import app.obey.api.SceneInput
import app.obey.api.SceneSide
import app.obey.api.SceneSideInput
import app.obey.data.Session
import app.obey.data.SessionRepository
import app.obey.ui.SceneRoute
import app.obey.ui.comments.SceneCommentsSection
import app.obey.ui.common.BaseViewModel
import app.obey.ui.common.ErrorBox
import app.obey.ui.common.Load
import app.obey.ui.common.LoadingBox
import app.obey.ui.common.MessageEffect
import app.obey.ui.common.MoodPicker
import app.obey.ui.common.loadCatching
import app.obey.ui.common.parseInstant
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.Instant
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

@HiltViewModel
class SceneViewModel @Inject constructor(private val api: ObeyApi, private val sessions: SessionRepository, savedState: SavedStateHandle) : BaseViewModel() {
    val session get() = sessions.session
    internal val avatars = AvatarLoader(api)
    val sceneId = savedState.toRoute<SceneRoute>().sceneId

    private val _state = MutableStateFlow<Load<Scene>>(Load.Loading)
    val state: StateFlow<Load<Scene>> = _state.asStateFlow()

    fun load() {
        viewModelScope.launch { _state.value = loadCatching { api.scene(sceneId) } }
    }

    fun save(input: SceneInput, done: () -> Unit) = action {
        _state.value = Load.Ready(api.updateScene(sceneId, input))
        done()
    }

    fun delete(done: () -> Unit) = action {
        api.deleteScene(sceneId)
        done()
    }

    fun share(input: SceneSideInput) = action {
        _state.value = Load.Ready(api.shareSceneSide(sceneId, input))
    }

    fun check(mood: Int, note: String) = action {
        _state.value = Load.Ready(api.checkInOnScene(sceneId, SceneCheckInput(mood, note)))
        say("Saved with the scene")
    }
}

/** One scene: what happened, each person's side once they've both shared, the next-day check-ins and comments. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SceneScreen(onBack: () -> Unit, vm: SceneViewModel = hiltViewModel()) {
    LaunchedEffect(Unit) { vm.load() }
    val state by vm.state.collectAsStateWithLifecycle()
    val busy by vm.busy.collectAsStateWithLifecycle()
    val message by vm.message.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    MessageEffect(message, snackbar, vm::messageShown)
    val session = vm.session ?: return
    val me = session.userId
    val scene = (state as? Load.Ready)?.value
    var editing by remember { mutableStateOf(false) }
    var deleting by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {},
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Back") } },
                actions = {
                    if (scene != null && !session.readOnly) {
                        if (scene.loggedBy == me) IconButton(onClick = { deleting = true }) { Icon(Icons.Outlined.DeleteOutline, "Delete") }
                        FilledTonalButton(onClick = { editing = true }, modifier = Modifier.padding(end = 8.dp)) {
                            Icon(Icons.Outlined.Edit, null, Modifier.size(18.dp))
                            Spacer(Modifier.width(8.dp))
                            Text("Edit")
                        }
                    }
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        when (val s = state) {
            Load.Loading -> LoadingBox(Modifier.padding(padding))
            is Load.Failed -> ErrorBox(s.message, vm::load, Modifier.padding(padding))
            is Load.Ready -> Column(
                Modifier.padding(padding).fillMaxSize().imePadding().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp).padding(bottom = 24.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                SceneBody(s.value, session, vm, busy)
            }
        }
    }

    if (editing && scene != null) {
        SceneSheet(scene, session.partners.map { it.displayName }, busy, onDismiss = { editing = false }) { input -> vm.save(input) { editing = false } }
    }
    if (deleting && scene != null) {
        AlertDialog(
            onDismissRequest = { deleting = false },
            title = { Text("Delete “${sceneName(scene)}”?") },
            text = { Text("Both sides, the check-ins and comments go with it.") },
            confirmButton = { TextButton(onClick = { deleting = false; vm.delete(onBack) }, enabled = !busy) { Text("Delete") } },
            dismissButton = { TextButton(onClick = { deleting = false }) { Text("Cancel") } },
        )
    }
}

@Composable
private fun SceneBody(s: Scene, session: Session, vm: SceneViewModel, busy: Boolean) {
    val c = MaterialTheme.colorScheme
    val me = session.userId
    val mine = s.sides.firstOrNull { it.userId == me }
    val others = session.partners
    val othersShared = others.filter { it.userId in s.shared }
    val othersWaiting = others.filter { it.userId !in s.shared }
    val checkOpen = !Instant.now().isBefore(parseInstant(s.checkFrom))

    Column {
        Text(sceneName(s), style = MaterialTheme.typography.headlineMedium)
        Text(
            whenOf(s) + (s.loggedBy?.let { " · logged by ${if (it == me) "you" else session.nameOf(it)}" } ?: ""),
            style = MaterialTheme.typography.bodyMedium,
            color = c.onSurfaceVariant,
        )
    }
    if (s.safeword != "none" || s.aftercare.isNotEmpty() || s.what.isNotBlank()) {
        SceneSurface {
            if (s.safeword != "none" || s.aftercare.isNotEmpty()) Tags(s.aftercare, lead = { SafewordBadge(s.safeword) })
            if (s.what.isNotBlank()) Text(s.what, style = MaterialTheme.typography.bodyLarge)
        }
    }
    if (mine == null && !session.readOnly) {
        YourSide(andList(others.map { it.displayName }), busy) { vm.share(it) }
    }
    mine?.let { SideView(it, session, vm.avatars) }
    s.sides.filter { it.userId != me }.forEach { SideView(it, session, vm.avatars) }
    if (mine == null && othersShared.isNotEmpty()) {
        Surface(color = c.surfaceContainer, shape = MaterialTheme.shapes.large, modifier = Modifier.fillMaxWidth()) {
            Row(Modifier.padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Outlined.Lock, null, tint = c.onSurfaceVariant)
                Spacer(Modifier.width(12.dp))
                Text(
                    "${andList(othersShared.map { it.displayName })} ${if (othersShared.size == 1) "has" else "have"} written their side. You'll see it once you share yours.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = c.onSurfaceVariant,
                )
            }
        }
    }
    if (mine != null && othersWaiting.isNotEmpty()) {
        Text("Waiting for ${andList(othersWaiting.map { it.displayName })} to share their side.", style = MaterialTheme.typography.bodyMedium, color = c.onSurfaceVariant)
    }
    if (checkOpen || s.checks.isNotEmpty()) NextDay(s, session, vm.avatars, checkOpen, busy) { mood, note -> vm.check(mood, note) }
    SceneCommentsSection(s.id, Modifier.fillMaxWidth())
}

/** Written alone and shared once; the others' sides open up then. [to] is who it's shared with. */
@Composable
private fun YourSide(to: String, busy: Boolean, onShare: (SceneSideInput) -> Unit) {
    var mood by rememberSaveable { mutableStateOf<Int?>(null) }
    var worked by rememberSaveable { mutableStateOf("") }
    var change by rememberSaveable { mutableStateOf("") }
    var need by rememberSaveable { mutableStateOf("") }
    SceneSurface {
        Column {
            Text("Your side", style = MaterialTheme.typography.titleLarge)
            Text("How do you feel about it now?", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        MoodPicker(mood, { mood = it })
        OutlinedTextField(worked, { worked = it.take(2000) }, label = { Text("What worked") }, minLines = 2, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(change, { change = it.take(2000) }, label = { Text("What to change next time") }, minLines = 2, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(need, { need = it.take(2000) }, label = { Text("Anything you still need (optional)") }, minLines = 2, modifier = Modifier.fillMaxWidth())
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
            Button(
                onClick = { mood?.let { onShare(SceneSideInput(it, worked.trim(), change.trim(), need.trim())) } },
                enabled = mood != null && !busy,
            ) { Text(if (to.isNotEmpty()) "Share with $to" else "Save") }
        }
    }
}

/** A shared side: the mood, and whatever was written. */
@Composable
private fun SideView(side: SceneSide, session: Session, avatars: AvatarLoader) {
    val c = MaterialTheme.colorScheme
    val rows = listOf("What worked" to side.worked, "Next time" to side.change, "Still needs" to side.need).filter { it.second.isNotBlank() }
    SceneSurface {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Person(side.userId, session, avatars, size = 28.dp)
            Spacer(Modifier.width(8.dp))
            Text(if (side.userId == session.userId) "You" else session.nameOf(side.userId), style = MaterialTheme.typography.titleMedium)
            Spacer(Modifier.width(12.dp))
            MoodMark(side.mood, size = 20.dp)
        }
        rows.forEach { (label, text) ->
            Column {
                Text(label, style = MaterialTheme.typography.bodySmall, color = c.onSurfaceVariant)
                Text(text, style = MaterialTheme.typography.bodyLarge)
            }
        }
    }
}

/** The day-after check-ins, and mine to give once it opens. */
@Composable
private fun NextDay(s: Scene, session: Session, avatars: AvatarLoader, open: Boolean, busy: Boolean, onCheck: (Int, String) -> Unit) {
    val c = MaterialTheme.colorScheme
    val mine = s.checks.any { it.userId == session.userId }
    SceneSurface {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Outlined.WbSunny, null, tint = c.tertiary)
            Spacer(Modifier.width(8.dp))
            Text("Next day", style = MaterialTheme.typography.titleMedium)
        }
        s.checks.forEach { check ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                Person(check.userId, session, avatars)
                Spacer(Modifier.width(8.dp))
                MoodMark(check.mood)
                if (check.note.isNotBlank()) {
                    Text(" · “${check.note}”", style = MaterialTheme.typography.bodyMedium, color = c.onSurfaceVariant, modifier = Modifier.weight(1f, fill = false))
                }
            }
        }
        if (!mine && open && !session.readOnly) {
            Text("How are you feeling now?", style = MaterialTheme.typography.bodyMedium, color = c.onSurfaceVariant)
            SceneCheckIn(busy, onCheck)
        }
    }
}
