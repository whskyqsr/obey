package app.obey.ui.today

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.obey.api.Occurrence
import app.obey.api.RescheduleScope
import app.obey.ui.common.EmptyBox
import app.obey.ui.common.ErrorBox
import app.obey.ui.common.Load
import app.obey.ui.common.LoadingBox
import app.obey.ui.common.MessageEffect
import app.obey.ui.common.SectionHeader
import app.obey.ui.common.SettingsAction
import app.obey.ui.common.formatDateTime
import app.obey.ui.common.formatDue
import java.time.LocalDate
import java.time.format.DateTimeFormatter

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TodayScreen(
    onNewTask: () -> Unit,
    onEditTask: (String) -> Unit,
    onOpenSettings: () -> Unit,
    vm: TodayViewModel = hiltViewModel(),
) {
    val state by vm.state.collectAsStateWithLifecycle()
    val refreshing by vm.refreshing.collectAsStateWithLifecycle()
    val message by vm.message.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    MessageEffect(message, snackbar, vm::messageShown)
    // Load on first show and whenever we come back (e.g. from the task editor).
    LifecycleResumeEffect(Unit) {
        vm.refresh()
        onPauseOrDispose { }
    }

    var rescheduling by remember { mutableStateOf<Occurrence?>(null) }
    var noting by remember { mutableStateOf<Occurrence?>(null) }
    val session = vm.session

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(LocalDate.now().format(DateTimeFormatter.ofPattern("EEEE d MMMM")))
                },
                actions = { SettingsAction(onOpenSettings) },
            )
        },
        floatingActionButton = {
            if (session?.canManage == true) {
                ExtendedFloatingActionButton(
                    onClick = onNewTask,
                    icon = { Icon(Icons.Outlined.Add, null) },
                    text = { Text("Task") },
                )
            }
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        when (val s = state) {
            Load.Loading -> LoadingBox(Modifier.padding(padding))
            is Load.Failed -> ErrorBox(s.message, vm::refresh, Modifier.padding(padding))
            is Load.Ready -> PullToRefreshBox(
                isRefreshing = refreshing,
                onRefresh = vm::refresh,
                modifier = Modifier.padding(padding).fillMaxSize(),
            ) {
                val d = s.value
                val me = session?.userId
                fun nameFor(o: Occurrence) = if (o.assigneeId == me) null else session?.nameOf(o.assigneeId)
                fun actionsFor(o: Occurrence) = OccurrenceActions(
                    onComplete = if (o.assigneeId == me) ({ vm.complete(o) }) else null,
                    onCompleteWithNote = if (o.assigneeId == me) ({ noting = o }) else null,
                    onReschedule = { rescheduling = o },
                    onEditTask = if (session?.canManage == true) ({ onEditTask(o.seriesId) }) else null,
                )

                LazyColumn(Modifier.fillMaxSize()) {
                    if (d.requests.isNotEmpty()) {
                        item(key = "h-req") { SectionHeader("Extension requests") }
                        items(d.requests, key = { "r-" + it.id }) { r ->
                            ListItem(
                                headlineContent = { Text(d.titles[r.occurrenceId] ?: "A task") },
                                supportingContent = {
                                    Text(
                                        buildString {
                                            append("${session?.nameOf(r.requestedBy) ?: "Someone"} asks to move it to ${formatDateTime(r.toDueAt)}")
                                            if (r.scope == RescheduleScope.Following) append(" (and following)")
                                            r.reason?.let { append("\n“$it”") }
                                        },
                                    )
                                },
                                trailingContent = {
                                    androidx.compose.foundation.layout.Row {
                                        TextButton(onClick = { vm.decide(r, false) }) { Text("Decline") }
                                        Button(onClick = { vm.decide(r, true) }) { Text("Approve") }
                                    }
                                },
                            )
                        }
                    }
                    if (session?.canManage == true && d.awaitingReview.isNotEmpty()) {
                        item(key = "h-rev") { SectionHeader("Needs your approval") }
                        items(d.awaitingReview, key = { "v-" + it.id }) { o ->
                            OccurrenceRow(
                                o, nameFor(o),
                                OccurrenceActions(onApprove = { vm.review(o, true) }, onReject = { vm.review(o, false) }),
                            )
                        }
                    }
                    if (d.overdue.isNotEmpty()) {
                        item(key = "h-over") { SectionHeader("Overdue") }
                        items(d.overdue, key = { "o-" + it.id }) { o -> OccurrenceRow(o, nameFor(o), actionsFor(o)) }
                    }
                    item(key = "h-today") { SectionHeader("Today") }
                    if (d.today.isEmpty()) {
                        item(key = "e-today") {
                            EmptyBox("Nothing else due today", if (d.overdue.isEmpty()) "Enjoy it, or ask for more." else null)
                        }
                    } else {
                        items(d.today, key = { "t-" + it.id }) { o -> OccurrenceRow(o, nameFor(o), actionsFor(o)) }
                    }
                    val waiting = if (session?.canManage == true) emptyList() else d.awaitingReview
                    if (waiting.isNotEmpty()) {
                        item(key = "h-wait") { SectionHeader("Waiting for approval") }
                        items(waiting, key = { "w-" + it.id }) { o -> OccurrenceRow(o, nameFor(o), OccurrenceActions()) }
                    }
                    if (d.done.isNotEmpty()) {
                        item(key = "h-done") { SectionHeader("Done today") }
                        items(d.done, key = { "d-" + it.id }) { o -> OccurrenceRow(o, nameFor(o), OccurrenceActions()) }
                    }
                    item(key = "spacer") { androidx.compose.foundation.layout.Spacer(Modifier.padding(48.dp)) }
                }
            }
        }
    }

    rescheduling?.let { o ->
        RescheduleSheet(o, onDismiss = { rescheduling = null }, onSubmit = { vm.reschedule(o, it) })
    }

    noting?.let { o ->
        var note by remember(o.id) { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { noting = null },
            title = { Text("Mark done") },
            text = {
                androidx.compose.foundation.layout.Column {
                    Text("${o.title} · ${formatDue(o.dueAt)}", style = MaterialTheme.typography.bodyMedium)
                    OutlinedTextField(
                        value = note,
                        onValueChange = { note = it.take(5000) },
                        label = { Text("Note for your partner") },
                        minLines = 3,
                        modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
                    )
                }
            },
            confirmButton = { Button(onClick = { vm.complete(o, note); noting = null }) { Text("Done") } },
            dismissButton = { TextButton(onClick = { noting = null }) { Text("Cancel") } },
        )
    }
}
