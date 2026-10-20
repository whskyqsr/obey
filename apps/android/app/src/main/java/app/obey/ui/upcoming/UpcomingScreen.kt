package app.obey.ui.upcoming

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.automirrored.outlined.ArrowForward
import androidx.compose.material.icons.automirrored.outlined.List
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.obey.api.Occurrence
import app.obey.ui.common.ErrorBox
import app.obey.ui.common.Load
import app.obey.ui.common.LoadingBox
import app.obey.ui.common.MessageEffect
import app.obey.ui.common.SettingsAction
import app.obey.ui.common.formatDate
import app.obey.ui.today.OccurrenceActions
import app.obey.ui.today.OccurrenceRow
import app.obey.ui.today.RescheduleSheet
import java.time.LocalDate
import java.time.format.DateTimeFormatter

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun UpcomingScreen(
    onNewTask: (LocalDate?) -> Unit,
    onEditTask: (String) -> Unit,
    onOpenTask: (String) -> Unit,
    onAllTasks: () -> Unit,
    onOpenSettings: () -> Unit,
    vm: UpcomingViewModel = hiltViewModel(),
) {
    val state by vm.state.collectAsStateWithLifecycle()
    val weekStart by vm.weekStart.collectAsStateWithLifecycle()
    val message by vm.message.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    MessageEffect(message, snackbar, vm::messageShown)
    // Load on first show and whenever we come back (e.g. from the task editor).
    LifecycleResumeEffect(Unit) {
        vm.refresh()
        onPauseOrDispose { }
    }
    var rescheduling by remember { mutableStateOf<Occurrence?>(null) }
    val session = vm.session
    val today = LocalDate.now()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Upcoming") },
                actions = {
                    IconButton(onClick = onAllTasks) { Icon(Icons.AutoMirrored.Outlined.List, "All tasks") }
                    SettingsAction(onOpenSettings)
                },
            )
        },
        floatingActionButton = {
            if (session?.canManage == true) {
                FloatingActionButton(onClick = { onNewTask(null) }) { Icon(Icons.Outlined.Add, "New task") }
            }
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        androidx.compose.foundation.layout.Column(Modifier.padding(padding).fillMaxSize()) {
            Row(
                Modifier.padding(horizontal = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(onClick = { vm.shiftWeek(-1) }) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Previous week") }
                Text(
                    "${weekStart.format(DateTimeFormatter.ofPattern("d MMM"))} – ${weekStart.plusDays(6).format(DateTimeFormatter.ofPattern("d MMM"))}",
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.weight(1f),
                )
                TextButton(onClick = vm::thisWeek) { Text("This week") }
                IconButton(onClick = { vm.shiftWeek(1) }) { Icon(Icons.AutoMirrored.Outlined.ArrowForward, "Next week") }
            }
            when (val s = state) {
                Load.Loading -> LoadingBox()
                is Load.Failed -> ErrorBox(s.message, vm::refresh)
                is Load.Ready -> LazyColumn(Modifier.fillMaxSize()) {
                    s.value.days.forEach { (day, occs) ->
                        item(key = "h-$day") {
                            Row(
                                Modifier.padding(start = 16.dp, end = 8.dp, top = 16.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text(
                                    if (day == today) "Today · ${formatDate(day)}" else formatDate(day),
                                    style = MaterialTheme.typography.titleSmall,
                                    fontWeight = if (day == today) FontWeight.Bold else null,
                                    color = if (day == today) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
                                    modifier = Modifier.weight(1f),
                                )
                                if (session?.canManage == true && !day.isBefore(today)) {
                                    IconButton(onClick = { onNewTask(day) }) { Icon(Icons.Outlined.Add, "New task on ${formatDate(day)}") }
                                }
                            }
                        }
                        if (occs.isEmpty()) {
                            item(key = "e-$day") {
                                Text(
                                    "Nothing scheduled",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
                                )
                            }
                        }
                        items(occs, key = { it.id }) { o ->
                            val mine = o.assigneeId == session?.userId
                            OccurrenceRow(
                                o,
                                if (mine) null else session?.nameOf(o.assigneeId),
                                OccurrenceActions(
                                    onComplete = if (mine) ({ vm.complete(o) }) else null,
                                    onReschedule = { rescheduling = o },
                                    onEditTask = if (session?.canManage == true) ({ onEditTask(o.seriesId) }) else null,
                                ),
                                onOpen = { onOpenTask(o.seriesId) },
                            )
                        }
                    }
                }
            }
        }
    }

    rescheduling?.let { o ->
        RescheduleSheet(o, onDismiss = { rescheduling = null }, onSubmit = { vm.reschedule(o, it) })
    }
}
