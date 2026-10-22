package app.obey.ui.chastity

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Block
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.LockOpen
import androidx.compose.material.icons.outlined.MoreTime
import androidx.compose.material.icons.outlined.PhotoCamera
import androidx.compose.material.icons.outlined.Shower
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
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
import app.obey.api.ChastityEvent
import app.obey.api.ChastityLock
import app.obey.data.Session
import app.obey.ui.common.EmptyBox
import app.obey.ui.common.ErrorBox
import app.obey.ui.common.Load
import app.obey.ui.common.LoadingBox
import app.obey.ui.common.MenuButton
import app.obey.ui.common.MessageEffect
import app.obey.ui.common.SafeWordAction
import app.obey.ui.common.SectionHeader
import app.obey.ui.common.SettingsAction
import app.obey.ui.common.formatDateTime
import app.obey.ui.common.parseInstant

private val eventIcon = mapOf(
    "started" to Icons.Outlined.Lock,
    "time" to Icons.Outlined.MoreTime,
    "release_ask" to Icons.Outlined.LockOpen,
    "break" to Icons.Outlined.Shower,
    "photo_ask" to Icons.Outlined.PhotoCamera,
    "relocked" to Icons.Outlined.Lock,
    "ended" to Icons.Outlined.LockOpen,
)

@Composable
private fun EventRow(e: ChastityEvent, wearer: String) {
    val (title, pill) = eventText(e, wearer)
    val c = MaterialTheme.colorScheme
    ListItem(
        colors = ListItemDefaults.colors(containerColor = c.surfaceContainerLow),
        leadingContent = { Icon(eventIcon[e.kind] ?: Icons.Outlined.Lock, null, tint = c.onSurfaceVariant) },
        headlineContent = { Text(title) },
        supportingContent = { Text(formatDateTime(e.createdAt)) },
        trailingContent = pill?.let { { Text(it, style = MaterialTheme.typography.titleSmall, color = if ((e.minutes ?: 0) > 0) c.error else c.primary) } },
    )
}

@Composable
private fun PastLock(l: ChastityLock, session: Session) {
    val length = if (l.startedAt != null && l.endedAt != null) fmtSpan((parseInstant(l.endedAt).toEpochMilli() - parseInstant(l.startedAt).toEpochMilli()) / 60_000) else null
    ListItem(
        colors = ListItemDefaults.colors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
        leadingContent = { Icon(if (l.status == "ended") Icons.Outlined.LockOpen else Icons.Outlined.Block, null) },
        headlineContent = { Text(session.nameOf(l.wearerId) + (length?.let { ", $it" } ?: if (l.status == "declined") ", declined" else ", not started")) },
        supportingContent = {
            Text(
                (if (l.startedAt != null) "${fmtLockTime(l.startedAt)} to ${l.endedAt?.let(::fmtLockTime) ?: "?"}" else formatDateTime(l.createdAt)) +
                    when (l.endReason) { "released" -> " · released early"; "time" -> " · time's up"; else -> "" },
            )
        },
    )
}

/** Locks, time added and taken off, and asks to be let out. Off unless the dynamic switches it on. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChastityScreen(onOpenSettings: () -> Unit, vm: ChastityViewModel = hiltViewModel()) {
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
    var starting by remember { mutableStateOf(false) }
    val open = (state as? Load.Ready)?.value?.open.orEmpty()
    // Anyone else in the dynamic who isn't already locked or asked.
    val wearers = if (session.canManage) session.partners.filter { m -> open.none { it.wearerId == m.userId } } else emptyList()

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("Chastity")
                        Text("Locks, time, and asks to be let out", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                },
                navigationIcon = { MenuButton() },
                actions = {
                    SafeWordAction()
                    SettingsAction(onOpenSettings)
                },
            )
        },
        floatingActionButton = {
            if (wearers.isNotEmpty()) ExtendedFloatingActionButton(onClick = { starting = true }, icon = { Icon(Icons.Outlined.Lock, null) }, text = { Text("Lock") })
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        when (val s = state) {
            Load.Loading -> LoadingBox(Modifier.padding(padding))
            is Load.Failed -> ErrorBox(s.message, vm::load, Modifier.padding(padding))
            is Load.Ready -> if (s.value.open.isEmpty() && s.value.past.isEmpty()) {
                EmptyBox(
                    "Nobody is locked",
                    if (session.canManage) "Ask to lock someone, for a set time or until you release them." else "When you're asked to lock up, it shows here and on Today.",
                    Modifier.padding(padding),
                )
            } else {
                val v = s.value
                LazyColumn(
                    Modifier.padding(padding).fillMaxSize(),
                    contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 96.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    items(v.open, key = { it.id }) { l ->
                        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            LockCard(l, v.events, session, busy, vm)
                            val log = v.events.filter { it.lockId == l.id }
                            if (log.isNotEmpty()) {
                                Surface(shape = RoundedCornerShape(16.dp), modifier = Modifier.fillMaxWidth()) {
                                    Column { log.forEach { EventRow(it, session.nameOf(l.wearerId)) } }
                                }
                            }
                        }
                    }
                    if (v.past.isNotEmpty()) {
                        item(key = "h-past") { SectionHeader("Past locks", horizontalPadding = 0.dp) }
                        item(key = "past") {
                            Surface(shape = RoundedCornerShape(16.dp), modifier = Modifier.fillMaxWidth()) {
                                Column { v.past.forEach { PastLock(it, session) } }
                            }
                        }
                    }
                }
            }
        }
    }

    if (starting && wearers.isNotEmpty()) {
        StartLockDialog(wearers, busy, onDismiss = { starting = false }) { input, name -> vm.start(input, name) { starting = false } }
    }
}

/** On Today, for the wearer and the keyholder: the lock, asks to answer, and locking up. */
@Composable
fun ChastityTodayCard(session: Session, vm: ChastityViewModel = hiltViewModel(key = "chastity-today-${session.relationship?.id}")) {
    LifecycleResumeEffect(session.relationship?.id) {
        vm.load()
        onPauseOrDispose { }
    }
    val state by vm.state.collectAsStateWithLifecycle()
    val busy by vm.busy.collectAsStateWithLifecycle()
    val message by vm.message.collectAsStateWithLifecycle()
    val context = androidx.compose.ui.platform.LocalContext.current
    androidx.compose.runtime.LaunchedEffect(message) {
        message?.let { android.widget.Toast.makeText(context, it, android.widget.Toast.LENGTH_SHORT).show(); vm.messageShown() }
    }
    val v = (state as? Load.Ready)?.value ?: return
    val mine = v.open.filter { it.wearerId == session.userId || it.keyholderId == session.userId }
    if (mine.isEmpty()) return
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        mine.forEach { LockCard(it, v.events, session, busy, vm) }
    }
}
