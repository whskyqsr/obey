package app.obey.ui.scenes

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.material.icons.outlined.MoreHoriz
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.relocation.BringIntoViewRequester
import androidx.compose.foundation.relocation.bringIntoViewRequester
import androidx.compose.ui.text.style.TextAlign
import app.obey.ui.common.BackLink
import app.obey.ui.common.Eyebrow
import app.obey.ui.common.inkButtonColors
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
import app.obey.ui.common.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import app.obey.ui.common.TonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import app.obey.ui.common.LettersField
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
@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
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
    var menu by remember { mutableStateOf(false) }
    val scroll = rememberScrollState()
    val formAt = remember { BringIntoViewRequester() }
    val scope = rememberCoroutineScope()

    Scaffold(
        topBar = {
            TopAppBar(
                title = {},
                navigationIcon = { BackLink("Scenes", onBack) },
                actions = {
                    if (scene != null && !session.readOnly) {
                        Box {
                            IconButton(onClick = { menu = true }) { Icon(Icons.Outlined.MoreHoriz, "More options") }
                            DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                                DropdownMenuItem(text = { Text("Edit") }, leadingIcon = { Icon(Icons.Outlined.Edit, null) }, onClick = { menu = false; editing = true })
                                if (scene.loggedBy == me) {
                                    DropdownMenuItem(text = { Text("Delete") }, leadingIcon = { Icon(Icons.Outlined.DeleteOutline, null) }, onClick = { menu = false; deleting = true })
                                }
                            }
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
                Modifier.padding(padding).fillMaxSize().imePadding().verticalScroll(scroll).padding(horizontal = 16.dp).padding(bottom = 32.dp),
            ) {
                SceneBody(s.value, session, vm, busy, formAt) { scope.launch { formAt.bringIntoView() } }
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

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun SceneBody(s: Scene, session: Session, vm: SceneViewModel, busy: Boolean, formAt: BringIntoViewRequester, toForm: () -> Unit) {
    val c = MaterialTheme.colorScheme
    val me = session.userId
    val mine = s.sides.firstOrNull { it.userId == me }
    val checkOpen = !Instant.now().isBefore(parseInstant(s.checkFrom))

    Eyebrow("${longDay(s)} · ${safewordLine(s.safeword)}", Modifier.padding(top = 4.dp))
    Text(sceneName(s), style = MaterialTheme.typography.displayMedium, modifier = Modifier.padding(top = 6.dp))
    if (s.aftercare.isNotEmpty()) Box(Modifier.padding(top = 20.dp)) { AftercarePills(s.aftercare) }
    if (s.what.isNotBlank()) Text(s.what, style = MaterialTheme.typography.bodyLarge, color = c.onSurfaceVariant, modifier = Modifier.padding(top = 20.dp))
    Column(Modifier.padding(top = 32.dp), verticalArrangement = Arrangement.spacedBy(32.dp)) {
        if (mine != null) SideView(mine, session)
        else if (!session.readOnly) Box(Modifier.bringIntoViewRequester(formAt)) { YourSide(andList(session.partners.map { it.displayName }), busy) { vm.share(it) } }
        session.partners.forEach { m ->
            val side = s.sides.firstOrNull { it.userId == m.userId }
            when {
                side != null -> SideView(side, session)
                m.userId in s.shared -> Column(
                    Modifier.fillMaxWidth().clip(MaterialTheme.shapes.medium).background(c.surfaceContainer)
                        .border(1.dp, c.outlineVariant, MaterialTheme.shapes.medium).padding(horizontal = 24.dp, vertical = 28.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Icon(Icons.Outlined.VisibilityOff, null, tint = c.onSurfaceVariant)
                    Text("${m.displayName}'s side is hidden", style = MaterialTheme.typography.headlineSmall, textAlign = TextAlign.Center)
                    Text(
                        "${m.displayName} has written it. You'll both see each other's once you share yours.",
                        style = MaterialTheme.typography.bodyLarge,
                        color = c.onSurfaceVariant,
                        textAlign = TextAlign.Center,
                    )
                    if (!session.readOnly) Button(onClick = toForm, colors = inkButtonColors(), shape = MaterialTheme.shapes.small, modifier = Modifier.padding(top = 4.dp)) { Text("Share my side") }
                }
                else -> Text("${m.displayName} hasn't written their side yet.", style = MaterialTheme.typography.bodyLarge, color = c.onSurfaceVariant)
            }
        }
        if (checkOpen || s.checks.isNotEmpty()) NextDay(s, session, checkOpen, busy) { mood, note -> vm.check(mood, note) }
        SceneCommentsSection(s.id, Modifier.fillMaxWidth())
    }
}

/** Written alone and shared once; the others' sides open up then. [to] is who it's shared with. */
@Composable
private fun YourSide(to: String, busy: Boolean, onShare: (SceneSideInput) -> Unit) {
    var mood by rememberSaveable { mutableStateOf<Int?>(null) }
    var worked by rememberSaveable { mutableStateOf("") }
    var change by rememberSaveable { mutableStateOf("") }
    var need by rememberSaveable { mutableStateOf("") }
    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Eyebrow("Your side")
        MoodPicker(mood, { mood = it })
        LettersField(worked, { worked = it.take(2000) }, label = { Text("What worked") }, minLines = 2, modifier = Modifier.fillMaxWidth())
        LettersField(change, { change = it.take(2000) }, label = { Text("What to change next time") }, minLines = 2, modifier = Modifier.fillMaxWidth())
        LettersField(need, { need = it.take(2000) }, label = { Text("Anything you still need (optional)") }, minLines = 2, modifier = Modifier.fillMaxWidth())
        Button(
            onClick = { mood?.let { onShare(SceneSideInput(it, worked.trim(), change.trim(), need.trim())) } },
            enabled = mood != null && !busy,
            colors = inkButtonColors(),
            shape = MaterialTheme.shapes.small,
        ) { Text(if (to.isNotEmpty()) "Share with $to" else "Save") }
    }
}

/** A side as the mockup shows it: an eyebrow with the mood, then the words in the serif. */
@Composable
private fun SideView(side: SceneSide, session: Session) {
    val who = if (side.userId == session.userId) "Your side" else "${session.nameOf(side.userId)}'s side"
    val rows = listOf(null to side.worked, "Next time" to side.change, "Still needs" to side.need).filter { it.second.isNotBlank() }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Eyebrow("$who · ${feeling(side.mood)}")
        rows.forEach { (label, text) ->
            Column {
                label?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                Text(text, style = MaterialTheme.typography.headlineSmall)
            }
        }
    }
}

/** The morning-after check-ins on hairlines, and mine to give once it opens. */
@Composable
private fun NextDay(s: Scene, session: Session, open: Boolean, busy: Boolean, onCheck: (Int, String) -> Unit) {
    val c = MaterialTheme.colorScheme
    val members = session.relationship?.members.orEmpty()
    Column {
        Eyebrow("The morning after")
        members.forEachIndexed { i, m ->
            if (i > 0) HorizontalDivider(color = c.outlineVariant)
            val check = s.checks.firstOrNull { it.userId == m.userId }
            val isMe = m.userId == session.userId
            Column(Modifier.fillMaxWidth().padding(vertical = 12.dp)) {
                when {
                    check != null -> {
                        Text("${if (isMe) "You" else m.displayName} · ${feeling(check.mood)}", style = MaterialTheme.typography.bodyLarge)
                        if (check.note.isNotBlank()) Text("“${check.note}”", style = MaterialTheme.typography.bodyMedium, color = c.onSurfaceVariant)
                    }
                    isMe && open && !session.readOnly -> SceneCheckIn(busy, onCheck)
                    else -> Text(if (isMe) "You haven't answered yet" else "${m.displayName} hasn't answered yet", style = MaterialTheme.typography.bodyLarge, color = c.onSurfaceVariant)
                }
            }
        }
    }
}
