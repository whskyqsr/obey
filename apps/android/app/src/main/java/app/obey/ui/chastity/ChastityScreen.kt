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
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Block
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.LockOpen
import androidx.compose.material.icons.outlined.MoreTime
import androidx.compose.material.icons.outlined.PhotoCamera
import androidx.compose.material.icons.outlined.Shower
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import app.obey.ui.common.Eyebrow
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.LargeTopAppBar
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
import app.obey.ui.common.formatDateTime
import app.obey.ui.common.parseInstant

/** Hairline rows under a small heading, as in the mockups' HISTORY. */
@Composable
private fun Rows(title: String, rows: List<Pair<String, String>>) {
    val c = MaterialTheme.colorScheme
    Column {
        SectionHeader(title, horizontalPadding = 0.dp)
        rows.forEachIndexed { i, (head, sub) ->
            Column(Modifier.fillMaxWidth().padding(vertical = 12.dp)) {
                Text(head, style = MaterialTheme.typography.bodyLarge)
                Text(sub, style = MaterialTheme.typography.bodyMedium, color = c.onSurfaceVariant)
            }
            if (i < rows.size - 1) HorizontalDivider(color = c.outlineVariant)
        }
    }
}

private fun pastLine(l: ChastityLock, session: Session): Pair<String, String> {
    val length = if (l.startedAt != null && l.endedAt != null) fmtSpan((parseInstant(l.endedAt).toEpochMilli() - parseInstant(l.startedAt).toEpochMilli()) / 60_000) else null
    return (session.nameOf(l.wearerId) + (length?.let { ", $it" } ?: if (l.status == "declined") ", declined" else ", not started")) to
        ((if (l.startedAt != null) "${fmtLockTime(l.startedAt)} to ${l.endedAt?.let(::fmtLockTime) ?: "?"}" else formatDateTime(l.createdAt)) +
            when (l.endReason) { "released" -> " · released early"; "time" -> " · time's up"; else -> "" })
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

    val c = MaterialTheme.colorScheme
    Scaffold(
        topBar = { TopAppBar(navigationIcon = { MenuButton() }, title = {}, actions = { SafeWordAction() }) },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        when (val s = state) {
            Load.Loading -> LoadingBox(Modifier.padding(padding))
            is Load.Failed -> ErrorBox(s.message, vm::load, Modifier.padding(padding))
            is Load.Ready -> {
                val v = s.value
                // One lock: the header says whose it is. A wearer asked to lock gets the ask's own heading instead.
                val only = v.open.singleOrNull()?.takeUnless { it.status == "pending" && it.wearerId == session.userId }
                val (eyebrow, subtitle) = only?.let { lockHeading(it, session.userId, session::nameOf) } ?: (null to if (v.open.isEmpty()) "Nobody is locked." else null)
                LazyColumn(
                    Modifier.padding(padding).fillMaxSize(),
                    contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 96.dp),
                    verticalArrangement = Arrangement.spacedBy(24.dp),
                ) {
                    item(key = "head") {
                        Column {
                            eyebrow?.let { Eyebrow(it, Modifier.padding(bottom = 4.dp)) }
                            Text("Chastity", style = MaterialTheme.typography.displaySmall)
                            subtitle?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = c.onSurfaceVariant, modifier = Modifier.padding(top = 4.dp)) }
                        }
                    }
                    if (wearers.isNotEmpty()) {
                        item(key = "lock") {
                            val label = if (wearers.size == 1) "Lock ${wearers.first().displayName}" else "Lock someone"
                            if (v.open.isEmpty()) app.obey.ui.common.Button(onClick = { starting = true }) { Text(label) }
                            else InkOutlinedButton(onClick = { starting = true }) { Text(label) }
                        }
                    }
                    items(v.open, key = { it.id }) { l ->
                        Column(verticalArrangement = Arrangement.spacedBy(24.dp)) {
                            if (only == null && v.open.size > 1) lockHeading(l, session.userId, session::nameOf).second?.let { Text(it, color = c.onSurfaceVariant) }
                            LockCard(l, v.events, session, busy, vm)
                            val log = v.events.filter { it.lockId == l.id }
                            if (log.isNotEmpty()) {
                                Rows("History", log.map { e -> eventText(e, session.nameOf(l.wearerId)).let { (t, note) -> t to ((note?.let { "$it · " } ?: "") + fmtWhen(e.createdAt)) } })
                            }
                        }
                    }
                    if (v.past.isNotEmpty()) item(key = "past") { Rows("Past locks", v.past.map { pastLine(it, session) }) }
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
fun ChastityTodayCard(session: Session, onOpen: () -> Unit = {}, vm: ChastityViewModel = hiltViewModel(key = "chastity-today-${session.relationship?.id}")) {
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
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        mine.forEach { l ->
            if (l.status == "pending") LockCard(l, v.events, session, busy, vm, page = false)
            else LockLine(l, session, onOpen)
        }
    }
}
