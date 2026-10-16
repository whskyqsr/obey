package app.obey.ui.tasks

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import app.obey.api.ObeyApi
import app.obey.api.Task
import app.obey.data.Session
import app.obey.data.SessionRepository
import app.obey.ui.common.BaseViewModel
import app.obey.ui.common.EmptyBox
import app.obey.ui.common.ErrorBox
import app.obey.ui.common.Load
import app.obey.ui.common.LoadingBox
import app.obey.ui.common.signed
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import app.obey.ui.common.loadCatching

@HiltViewModel
class TaskListViewModel @Inject constructor(
    private val api: ObeyApi,
    private val sessions: SessionRepository,
) : BaseViewModel() {
    private val _state = MutableStateFlow<Load<List<Task>>>(Load.Loading)
    val state: StateFlow<Load<List<Task>>> = _state.asStateFlow()
    val session: Session? get() = sessions.session

    fun refresh() {
        viewModelScope.launch {
            _state.value = loadCatching { api.tasks(sessions.requireRelationshipId()).sortedBy { it.title.lowercase() } }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TaskListScreen(
    onBack: () -> Unit,
    onEdit: (String) -> Unit,
    onNew: () -> Unit,
    vm: TaskListViewModel = hiltViewModel(),
) {
    val state by vm.state.collectAsStateWithLifecycle()
    // Reload when coming back from the editor.
    LifecycleResumeEffect(Unit) {
        vm.refresh()
        onPauseOrDispose { }
    }
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("All tasks") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Back") } },
            )
        },
        floatingActionButton = {
            if (vm.session?.canManage == true) FloatingActionButton(onClick = onNew) { Icon(Icons.Outlined.Add, "New task") }
        },
    ) { padding ->
        when (val s = state) {
            Load.Loading -> LoadingBox(Modifier.padding(padding))
            is Load.Failed -> ErrorBox(s.message, vm::refresh, Modifier.padding(padding))
            is Load.Ready -> LazyColumn(Modifier.padding(padding).fillMaxSize()) {
                if (s.value.isEmpty()) item { EmptyBox("No tasks yet", "Create one with the + button.") }
                items(s.value, key = { it.id }) { t ->
                    val who = vm.session?.nameOf(t.assigneeId)
                    ListItem(
                        modifier = Modifier.clickable(enabled = vm.session?.canManage == true) { onEdit(t.id) },
                        headlineContent = { Text(t.title) },
                        supportingContent = {
                            Text(
                                listOfNotNull(
                                    t.summary,
                                    t.dueTime?.let { "at $it" },
                                    who,
                                    if (t.points != 0) "${signed(t.points)} pts" else null,
                                    if (!t.active) "paused" else null,
                                ).joinToString(" · "),
                            )
                        },
                    )
                }
            }
        }
    }
}
