package app.obey.ui.location

import android.Manifest
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material.icons.outlined.AddLocationAlt
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.LocationOff
import androidx.compose.material.icons.outlined.LocationOn
import androidx.compose.material.icons.outlined.PauseCircle
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.material.icons.outlined.RadioButtonUnchecked
import androidx.compose.material.icons.automirrored.outlined.Send
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedCard
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.obey.api.LocationStatus
import app.obey.api.Member
import app.obey.api.Place
import app.obey.api.Role
import app.obey.ui.common.EmptyBox
import app.obey.ui.common.MessageEffect
import app.obey.ui.common.SectionHeader
import app.obey.ui.common.formatDateTime
import app.obey.ui.common.formatTime
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId

@Composable
private fun StatusCard(icon: ImageVector, ok: Boolean, title: String, body: String, content: @Composable () -> Unit = {}) {
    Surface(color = MaterialTheme.colorScheme.surfaceContainerLow, shape = MaterialTheme.shapes.large, modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Icon(icon, null, tint = if (ok) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
                Column(Modifier.weight(1f)) {
                    Text(title, style = MaterialTheme.typography.bodyLarge)
                    Text(body, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            content()
        }
    }
}

/** For a Dominant: whether this person's phone can check location tasks, with a nudge to set it up if not. */
@Composable
fun LocationReadiness(member: Member, onAsk: () -> Unit) {
    val name = member.displayName
    when {
        member.locationPaused -> StatusCard(
            Icons.Outlined.PauseCircle, false, "$name paused location",
            (member.locationPausedUntil?.let { "Until ${formatDateTime(it)}." } ?: "Until they turn it back on.") + " Location tasks due meanwhile are excused.",
        )
        member.locationStatus == LocationStatus.Ready -> StatusCard(
            Icons.Outlined.CheckCircle, true, "Location is set up on $name's phone",
            "Fealty only learns when $name arrives at or leaves a place a task names.",
        )
        else -> StatusCard(
            Icons.Outlined.LocationOff, false,
            when (member.locationStatus) {
                LocationStatus.ForegroundOnly -> "$name's phone only lets Fealty see location while it's open."
                LocationStatus.Denied, LocationStatus.ServicesOff -> "Location is turned off for Fealty on $name's phone."
                else -> "$name hasn't set up location yet."
            },
            "Location tasks need the Fealty Android app, with location allowed all the time.",
        ) {
            FilledTonalButton(onClick = onAsk) {
                Icon(Icons.AutoMirrored.Outlined.Send, null, Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
                Text("Ask $name to set it up")
            }
        }
    }
}

/** On Today, for someone with location tasks whose phone can't notice them arriving. */
@Composable
fun LocationSetupPrompt(onOpen: () -> Unit) {
    OutlinedCard(Modifier.padding(horizontal = 16.dp, vertical = 8.dp).fillMaxWidth()) {
        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Outlined.LocationOff, null, tint = MaterialTheme.colorScheme.primary)
            Spacer(Modifier.width(16.dp))
            Column(Modifier.weight(1f)) {
                Text("Set up location", style = MaterialTheme.typography.titleMedium)
                Text("So your location tasks check in on their own when you get there.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Spacer(Modifier.width(8.dp))
            FilledTonalButton(onClick = onOpen) { Text("Set up") }
        }
    }
}

/** One setup step: a ticked circle once done, else the button that does it. */
@Composable
private fun Step(done: Boolean, title: String, body: String, action: String?, onAction: () -> Unit) {
    ListItem(
        colors = ListItemDefaults.colors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
        leadingContent = {
            Icon(
                if (done) Icons.Outlined.CheckCircle else Icons.Outlined.RadioButtonUnchecked,
                if (done) "Done" else "To do",
                tint = if (done) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outline,
            )
        },
        headlineContent = { Text(title) },
        supportingContent = { Text(body) },
        trailingContent = if (!done && action != null) ({ FilledTonalButton(onClick = onAction) { Text(action) } }) else null,
    )
}

/** For the person being watched: setting it up, what's watched today, and pausing. */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun LocationScreen(onBack: () -> Unit, vm: LocationViewModel = hiltViewModel()) {
    val context = LocalContext.current
    val setup by vm.setup.collectAsStateWithLifecycle()
    val watching by vm.watching.collectAsStateWithLifecycle()
    val places by vm.places.collectAsStateWithLifecycle()
    val busy by vm.busy.collectAsStateWithLifecycle()
    val message by vm.message.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    MessageEffect(message, snackbar, vm::messageShown)
    // Coming back from a prompt or the phone's settings is when things change.
    LifecycleResumeEffect(Unit) {
        vm.recheck()
        onPauseOrDispose { }
    }
    val openAppSettings = {
        context.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", context.packageName, null)))
    }
    val foreground = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { vm.recheck() }
    val background = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { ok -> if (!ok) openAppSettings() else vm.recheck() }
    val session = vm.session
    val me = session?.myMember
    val who = session?.partners?.joinToString(" and ") { it.displayName }?.ifEmpty { null } ?: "Your partner"

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Location") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Back") } },
            )
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        Box(Modifier.padding(padding).fillMaxSize(), contentAlignment = Alignment.TopCenter) {
            Column(
                Modifier.widthIn(max = 640.dp).fillMaxWidth().verticalScroll(rememberScrollState()).padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                if (setup.ready) {
                    StatusCard(Icons.Outlined.CheckCircle, true, "On, allowed all the time", "$who sees when you arrive at or leave a place a task names, and nothing else.")
                } else {
                    // Google asks apps to say plainly why they want location in the background before asking for it.
                    StatusCard(
                        Icons.Outlined.LocationOff, false, "Set up location",
                        "Location tasks check in on their own when you get there. Fealty watches only the places your tasks name, " +
                            "including while it's closed, and sends only when you arrive or leave. Never where you are otherwise.",
                    )
                    Surface(color = MaterialTheme.colorScheme.surfaceContainerLow, shape = MaterialTheme.shapes.large) {
                        Column {
                            Step(
                                setup.precise,
                                "Allow precise location",
                                if (setup.any && !setup.precise) "Approximate isn't enough to tell you're at the gym. Turn on Precise in Fealty's permissions." else "So Fealty can tell when you're at a place.",
                                if (setup.any) "Settings" else "Allow",
                            ) {
                                vm.markAsked()
                                if (setup.any) openAppSettings() else foreground.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION))
                            }
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                                Step(
                                    setup.background,
                                    "Allow all the time",
                                    "So arriving counts while Fealty is closed. Pick \"Allow all the time\" on the next screen.",
                                    if (setup.precise) "Allow" else null,
                                ) {
                                    vm.markAsked()
                                    background.launch(Manifest.permission.ACCESS_BACKGROUND_LOCATION)
                                }
                            }
                            Step(setup.servicesOn, "Turn on location", "Location is off for the whole phone.", "Turn on") {
                                context.startActivity(Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS))
                            }
                        }
                    }
                }

                SectionHeader("Watching today", horizontalPadding = 4.dp)
                if (watching.isEmpty()) {
                    Text("No location tasks left today.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                } else {
                    Surface(color = MaterialTheme.colorScheme.surfaceContainerLow, shape = MaterialTheme.shapes.large) {
                        Column {
                            watching.forEach { o ->
                                val place = places?.firstOrNull { it.id == o.placeId }
                                ListItem(
                                    colors = ListItemDefaults.colors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
                                    leadingContent = { Icon(Icons.Outlined.LocationOn, null, tint = MaterialTheme.colorScheme.primary) },
                                    headlineContent = { Text(place?.name ?: "A place") },
                                    supportingContent = { Text("${o.title} · by ${formatTime(o.dueAt)}" + (o.stayMinutes?.let { ", stay ${stayLabel(it)}" } ?: "")) },
                                )
                            }
                        }
                    }
                }

                SectionHeader("Pause", horizontalPadding = 4.dp)
                if (me?.locationPaused == true) {
                    Text(
                        "Paused " + (me?.locationPausedUntil?.let { "until ${formatDateTime(it)}" } ?: "until you turn it back on") + ". Location tasks due meanwhile are excused.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Button(onClick = vm::resume, enabled = !busy) {
                        Icon(Icons.Outlined.PlayArrow, null)
                        Text("  Turn back on")
                    }
                } else {
                    Text(
                        "Stops watching every place. Location tasks due while paused are excused, and $who is told you paused.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        AssistChip(onClick = { vm.pause(Instant.now().plusSeconds(3600), "Paused for an hour") }, enabled = !busy, label = { Text("1 hour") })
                        AssistChip(
                            onClick = { vm.pause(LocalDate.now().atTime(LocalTime.of(23, 59)).atZone(ZoneId.systemDefault()).toInstant(), "Paused for the rest of today") },
                            enabled = !busy,
                            label = { Text("Rest of today") },
                        )
                        AssistChip(onClick = { vm.pause(null, "Paused until you turn it back on") }, enabled = !busy, label = { Text("Until I turn it back on") })
                    }
                }
                Spacer(Modifier.height(24.dp))
            }
        }
    }
}

/** The dynamic's saved places. Everyone sees them; a Dominant adds and changes them. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlacesScreen(onBack: () -> Unit, vm: LocationViewModel = hiltViewModel()) {
    val places by vm.places.collectAsStateWithLifecycle()
    val busy by vm.busy.collectAsStateWithLifecycle()
    val message by vm.message.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    MessageEffect(message, snackbar, vm::messageShown)
    val session = vm.session
    val canEdit = session?.canManage == true
    val subs = session?.partners.orEmpty().filter { it.role != Role.Dominant }
    var editing by remember { mutableStateOf<Pair<Boolean, Place?>?>(null) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Places") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Back") } },
            )
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        Box(Modifier.padding(padding).fillMaxSize(), contentAlignment = Alignment.TopCenter) {
            Column(
                Modifier.widthIn(max = 640.dp).fillMaxWidth().verticalScroll(rememberScrollState()).padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                if (canEdit) subs.forEach { m -> LocationReadiness(m) { vm.ask(m.displayName) } }
                val list = places
                if (list != null && list.isEmpty()) {
                    EmptyBox("No places yet", if (canEdit) "Save the places tasks can ask for: the gym, work, home." else "Places a Dominant saves for location tasks show here.")
                } else if (list != null) {
                    Surface(color = MaterialTheme.colorScheme.surfaceContainerLow, shape = MaterialTheme.shapes.large) {
                        Column {
                            list.forEach { p ->
                                ListItem(
                                    modifier = if (canEdit) Modifier.clickable { editing = true to p } else Modifier,
                                    colors = ListItemDefaults.colors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
                                    leadingContent = { Icon(Icons.Outlined.LocationOn, null, tint = MaterialTheme.colorScheme.primary) },
                                    headlineContent = { Text(p.name) },
                                    supportingContent = {
                                        Column {
                                            Text(listOfNotNull(p.address, formatRadius(p.radiusM)).joinToString(" · "), maxLines = 1)
                                            Text(if (p.taskTitles.isEmpty()) "Not used by any task" else "Used by ${p.taskTitles.joinToString(", ")}", maxLines = 1)
                                        }
                                    },
                                    trailingContent = if (canEdit) ({ Icon(Icons.AutoMirrored.Outlined.KeyboardArrowRight, null) }) else null,
                                )
                            }
                        }
                    }
                }
                if (canEdit) {
                    FilledTonalButton(onClick = { editing = true to null }) {
                        Icon(Icons.Outlined.AddLocationAlt, null)
                        Text("  Add a place")
                    }
                }
            }
        }
    }

    editing?.let { (_, place) ->
        PlaceEditor(vm, place, busy) { editing = null }
    }
}

/** The place dialog, wired to saving and deleting. */
@Composable
fun PlaceEditor(vm: LocationViewModel, place: Place?, busy: Boolean, onClose: () -> Unit) {
    PlaceDialog(
        place = place,
        busy = busy,
        search = vm::search,
        locate = { vm.watcher.currentFix() },
        canLocate = { vm.watcher.hasAny },
        onDismiss = onClose,
        onSave = { input -> vm.save(place, input, onClose) },
        onDelete = place?.let { p -> { vm.delete(p, onClose) } },
    )
}
