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
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.VolunteerActivism
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import app.obey.api.AftercarePlan
import app.obey.api.AftercarePlanInput
import app.obey.api.ObeyApi
import app.obey.data.SessionRepository
import app.obey.ui.common.BaseViewModel
import app.obey.ui.common.ErrorBox
import app.obey.ui.common.Load
import app.obey.ui.common.LoadingBox
import app.obey.ui.common.MessageEffect
import app.obey.ui.common.formatDateTime
import app.obey.ui.common.loadCatching
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

@HiltViewModel
class AftercareViewModel @Inject constructor(private val api: ObeyApi, private val sessions: SessionRepository) : BaseViewModel() {
    val session get() = sessions.session
    internal val avatars = AvatarLoader(api)

    private val _state = MutableStateFlow<Load<List<AftercarePlan>>>(Load.Loading)
    val state: StateFlow<Load<List<AftercarePlan>>> = _state.asStateFlow()

    fun load() {
        val rel = sessions.requireRelationshipId()
        viewModelScope.launch { _state.value = loadCatching { api.aftercarePlans(rel) } }
    }

    fun save(input: AftercarePlanInput, done: () -> Unit) = action {
        val saved = api.saveAftercarePlan(sessions.requireRelationshipId(), input)
        (_state.value as? Load.Ready)?.let { s -> _state.value = Load.Ready(s.value.map { if (it.userId == saved.userId) saved else it }) }
        done()
    }
}

/** What each person needs afterwards; everyone edits only their own. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AftercareScreen(onBack: () -> Unit, vm: AftercareViewModel = hiltViewModel()) {
    LaunchedEffect(Unit) { vm.load() }
    val state by vm.state.collectAsStateWithLifecycle()
    val busy by vm.busy.collectAsStateWithLifecycle()
    val message by vm.message.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    MessageEffect(message, snackbar, vm::messageShown)
    val session = vm.session ?: return
    val me = session.userId
    var editing by remember { mutableStateOf<AftercarePlan?>(null) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Aftercare") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Back") } },
            )
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        when (val s = state) {
            Load.Loading -> LoadingBox(Modifier.padding(padding))
            is Load.Failed -> ErrorBox(s.message, vm::load, Modifier.padding(padding))
            is Load.Ready -> Column(
                Modifier.padding(padding).fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp).padding(bottom = 24.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text(
                    "What each of you needs afterwards. It's shown to the others when a scene is logged.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                // The others' first, then mine.
                s.value.sortedBy { it.userId == me }.forEach { p ->
                    val isMe = p.userId == me
                    SceneSurface {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Person(p.userId, session, vm.avatars, size = 28.dp)
                            Spacer(Modifier.width(8.dp))
                            Text(if (isMe) "${session.me.user.displayName} (you)" else session.nameOf(p.userId), style = MaterialTheme.typography.titleMedium)
                        }
                        Tags(p.needs)
                        if (p.note.isNotBlank()) Text(p.note, style = MaterialTheme.typography.bodyLarge)
                        if (p.needs.isEmpty() && p.note.isBlank()) {
                            Text(if (isMe) "You haven't written yours yet." else "Not written yet.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        p.updatedAt?.let { at ->
                            Text(
                                "Updated ${formatDateTime(at)}" + if (isMe) "" else " · only ${session.nameOf(p.userId)} edits this",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        if (isMe && !session.readOnly) {
                            OutlinedButton(onClick = { editing = p }) {
                                Icon(Icons.Outlined.Edit, null, Modifier.size(18.dp))
                                Spacer(Modifier.width(8.dp))
                                Text(if (p.updatedAt != null) "Edit yours" else "Write yours")
                            }
                        }
                    }
                }
            }
        }
    }

    editing?.let { p -> PlanSheet(p, busy, onDismiss = { editing = null }) { vm.save(it) { editing = null } } }
}

/** Writing my aftercare plan: the same chips as logging a scene, and a note. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PlanSheet(plan: AftercarePlan, busy: Boolean, onDismiss: () -> Unit, onSave: (AftercarePlanInput) -> Unit) {
    var needs by remember { mutableStateOf(plan.needs) }
    var note by remember { mutableStateOf(plan.note) }
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(
            Modifier.imePadding().verticalScroll(rememberScrollState()).padding(start = 24.dp, end = 24.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Icon(Icons.Outlined.VolunteerActivism, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
            Text("Your aftercare", style = MaterialTheme.typography.headlineSmall)
            AftercarePicker(needs) { needs = it }
            OutlinedTextField(note, { note = it.take(1000) }, label = { Text("Anything else (optional)") }, minLines = 3, modifier = Modifier.fillMaxWidth())
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End)) {
                TextButton(onClick = onDismiss) { Text("Cancel") }
                Button(onClick = { onSave(AftercarePlanInput(needs, note.trim())) }, enabled = !busy) { Text("Save") }
            }
        }
    }
}
