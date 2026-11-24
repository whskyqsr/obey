package app.obey.ui.location

import android.Manifest
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.FitnessCenter
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Pause
import androidx.compose.material.icons.outlined.Work
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.OutlinedButton
import androidx.compose.ui.draw.clip
import app.obey.ui.common.Eyebrow
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
import androidx.compose.material.icons.outlined.Bedtime
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.LocationOff
import androidx.compose.material.icons.outlined.LocationOn
import androidx.compose.material.icons.outlined.PauseCircle
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.material.icons.outlined.RadioButtonUnchecked
import androidx.compose.material.icons.automirrored.outlined.Send
import androidx.compose.material3.AssistChip
import app.obey.ui.common.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import app.obey.ui.common.TonalButton
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
import androidx.compose.material3.LargeTopAppBar
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
import app.obey.ui.common.BackLink
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

/** For a Dominant: whether this person's phone can check location tasks, with a nudge to set it up if not. Nothing once it's ready. */
@Composable
fun LocationReadiness(member: Member, onAsk: () -> Unit) {
    val name = member.displayName
    val line = when {
        member.locationPaused -> "$name paused location " +
            (member.locationPausedUntil?.let { "until ${formatDateTime(it)}" } ?: "until they turn it back on") + ". Location tasks due meanwhile are excused."
        member.locationStatus == LocationStatus.Ready -> return
        member.locationStatus == LocationStatus.ForegroundOnly -> "$name's phone only lets Fealty see location while it's open."
        member.locationStatus == LocationStatus.Denied || member.locationStatus == LocationStatus.ServicesOff -> "Location is turned off for Fealty on $name's phone."
        else -> "$name hasn't set up location yet. It needs the Fealty Android app, with location allowed all the time."
    }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(line, style = MaterialTheme.typography.bodyLarge)
        if (!member.locationPaused) OutlinedButton(onClick = onAsk, shape = MaterialTheme.shapes.small) { Text("Ask $name to set it up") }
    }
}

/** On Today, for someone with location tasks whose phone can't notice them arriving. */
@Composable
fun LocationSetupPrompt(onOpen: () -> Unit) {
    val c = MaterialTheme.colorScheme
    Row(
        Modifier.padding(horizontal = 16.dp, vertical = 8.dp).fillMaxWidth().clip(MaterialTheme.shapes.medium).background(c.surfaceContainerLowest)
            .border(1.dp, c.outlineVariant, MaterialTheme.shapes.medium).clickable(onClick = onOpen).padding(20.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Outlined.LocationOn, null, tint = c.onSurface)
        Spacer(Modifier.width(16.dp))
        Column(Modifier.weight(1f)) {
            Text("Set up location", style = MaterialTheme.typography.bodyLarge)
            Text("So your location tasks check in on their own when you get there.", style = MaterialTheme.typography.bodyMedium, color = c.onSurfaceVariant)
        }
        Spacer(Modifier.width(8.dp))
        Text("Set up", style = MaterialTheme.typography.labelLarge, color = c.primary)
    }
}

/** One setup step on a hairline: done, or the button that does it. */
@Composable
private fun Step(done: Boolean, title: String, body: String, action: String?, onAction: () -> Unit) {
    val c = MaterialTheme.colorScheme
    Row(Modifier.fillMaxWidth().padding(vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyLarge, color = if (done) c.onSurfaceVariant else c.onSurface)
            Text(if (done) "Done" else body, style = MaterialTheme.typography.bodyMedium, color = c.onSurfaceVariant)
        }
        if (!done && action != null) {
            Spacer(Modifier.width(12.dp))
            OutlinedButton(onClick = onAction, shape = MaterialTheme.shapes.small) { Text(action) }
        }
    }
}

private fun placeIcon(name: String): ImageVector = when {
    Regex("home", RegexOption.IGNORE_CASE).containsMatchIn(name) -> Icons.Outlined.Home
    Regex("gym|fitness", RegexOption.IGNORE_CASE).containsMatchIn(name) -> Icons.Outlined.FitnessCenter
    Regex("work|office", RegexOption.IGNORE_CASE).containsMatchIn(name) -> Icons.Outlined.Work
    else -> Icons.Outlined.LocationOn
}

/**
 * Mockup 22: whether sharing is on, the places on a map, curfew, and the places on hairlines. Pausing sits behind the
 * pause icon. Below, setting up this phone and what's watched today.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LocationScreen(onCurfew: () -> Unit, vm: LocationViewModel = hiltViewModel()) {
    val context = LocalContext.current
    val setup by vm.setup.collectAsStateWithLifecycle()
    val watching by vm.watching.collectAsStateWithLifecycle()
    val underCurfew by vm.onCurfew.collectAsStateWithLifecycle()
    val curfew by vm.curfew.collectAsStateWithLifecycle()
    val othersWatching by vm.othersWatching.collectAsStateWithLifecycle()
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
    val solo = session?.solo == true
    val canEdit = session?.canManage == true
    val c = MaterialTheme.colorScheme
    val on = curfew?.takeIf { it.enabled }
    // A sub (or switch, or someone on their own) carries the phone that checks in; a Dominant only does if a task or curfew names them.
    val watched = session?.readOnly != true && (solo || me?.role != Role.Dominant || watching.isNotEmpty() || underCurfew)
    val watchedOthers = session?.partners.orEmpty().filter { it.role != Role.Dominant }
    val placeName = { o: app.obey.api.Occurrence -> places?.firstOrNull { it.id == o.placeId }?.name ?: "A place" }
    val paused = me?.locationPaused == true
    var pauseMenu by remember { mutableStateOf(false) }
    var editing by remember { mutableStateOf<Pair<Boolean, Place?>?>(null) }
    val status = when {
        !watched -> if (watchedOthers.isEmpty()) null else if (watchedOthers.size == 1) "You see arrivals and curfew, never where ${watchedOthers[0].displayName} is." else "You see arrivals and curfew, never where they are."
        paused -> "Paused " + (me?.locationPausedUntil?.let { "until ${formatDateTime(it)}" } ?: "until you turn it back on") + ". Location tasks due meanwhile are excused." +
            if (underCurfew) " Curfew still counts: tap I'm home on Today instead." else ""
        setup.ready -> "Sharing is on." + if (solo) "" else " $who never sees where you are, only arrivals and curfew."
        else -> "Not set up yet. Fealty watches only the places your tasks name, including while it's closed, and sends only when you arrive or leave."
    }

    Scaffold(
        topBar = {
            LargeTopAppBar(
                title = { Text("Location") },
                navigationIcon = { app.obey.ui.common.MenuButton() },
                actions = {
                    if (watched) {
                        if (paused) {
                            IconButton(onClick = vm::resume, enabled = !busy) { Icon(Icons.Outlined.PlayArrow, "Turn location back on") }
                        } else {
                            Box {
                                IconButton(onClick = { pauseMenu = true }) { Icon(Icons.Outlined.Pause, "Pause location") }
                                DropdownMenu(expanded = pauseMenu, onDismissRequest = { pauseMenu = false }) {
                                    DropdownMenuItem(text = { Text("Pause for an hour") }, onClick = { pauseMenu = false; vm.pause(Instant.now().plusSeconds(3600), "Paused for an hour") })
                                    DropdownMenuItem(
                                        text = { Text("Pause for the rest of today") },
                                        onClick = {
                                            pauseMenu = false
                                            vm.pause(LocalDate.now().atTime(LocalTime.of(23, 59)).atZone(ZoneId.systemDefault()).toInstant(), "Paused for the rest of today")
                                        },
                                    )
                                    DropdownMenuItem(text = { Text("Pause until I turn it back on") }, onClick = { pauseMenu = false; vm.pause(null, "Paused until you turn it back on") })
                                }
                            }
                        }
                    }
                    app.obey.ui.common.SafeWordAction()
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        Box(Modifier.padding(padding).fillMaxSize(), contentAlignment = Alignment.TopCenter) {
            Column(
                Modifier.widthIn(max = 640.dp).fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp).padding(bottom = 40.dp),
                verticalArrangement = Arrangement.spacedBy(32.dp),
            ) {
                status?.let { Text(it, style = MaterialTheme.typography.bodyLarge, color = c.onSurfaceVariant) }
                if (!watched) watchedOthers.forEach { m -> LocationReadiness(m) { vm.ask(m.displayName) } }

                if (watched && !setup.ready) {
                    Column {
                        Eyebrow("Set up this phone")
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
                            HorizontalDivider(color = c.outlineVariant)
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
                        HorizontalDivider(color = c.outlineVariant)
                        Step(setup.servicesOn, "Turn on location", "Location is off for the whole phone.", "Turn on") {
                            context.startActivity(Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS))
                        }
                        HorizontalDivider(color = c.outlineVariant)
                    }
                }

                val list = places.orEmpty()
                if (list.isNotEmpty()) {
                    PlacesMap(
                        list,
                        Modifier.fillMaxWidth().height(240.dp).clip(MaterialTheme.shapes.medium).border(1.dp, c.outlineVariant, MaterialTheme.shapes.medium),
                    )
                }

                if (on != null || canEdit) {
                    Column {
                        Eyebrow("Curfew")
                        Row(Modifier.fillMaxWidth().clickable(onClick = onCurfew).padding(vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                if (on != null) {
                                    Text("${clockLabel(on.time)} until ${clockLabel(on.until)}", style = MaterialTheme.typography.bodyLarge)
                                    Text(
                                        listOfNotNull(
                                            if (on.weekendTime != null) "Sun–Thu" else "Every night",
                                            on.weekendTime?.let { "Fri–Sat ${clockLabel(it)}" },
                                            "at ${list.firstOrNull { it.id == on.placeId }?.name ?: "Home"}",
                                            if (canEdit) session?.nameOf(on.assigneeId) else null,
                                        ).joinToString(" · "),
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = c.onSurfaceVariant,
                                    )
                                } else {
                                    Text("Off", style = MaterialTheme.typography.bodyLarge, color = c.onSurfaceVariant)
                                }
                            }
                            Icon(Icons.AutoMirrored.Outlined.KeyboardArrowRight, null, tint = c.onSurfaceVariant)
                        }
                        HorizontalDivider(color = c.outlineVariant)
                    }
                }

                Column {
                    Eyebrow("Places")
                    list.forEachIndexed { i, p ->
                        if (i > 0) HorizontalDivider(color = c.outlineVariant)
                        Row(
                            Modifier.fillMaxWidth().then(if (canEdit) Modifier.clickable { editing = true to p } else Modifier).padding(vertical = 14.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Icon(placeIcon(p.name), null, tint = c.onSurface)
                            Spacer(Modifier.width(20.dp))
                            Column(Modifier.weight(1f)) {
                                Text(p.name, style = MaterialTheme.typography.bodyLarge)
                                Text(
                                    if (p.taskTitles.isEmpty()) "${formatRadius(p.radiusM)} around" else "Used by ${p.taskTitles.joinToString(", ")}",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = c.onSurfaceVariant,
                                    maxLines = 1,
                                )
                            }
                        }
                    }
                    if (list.isEmpty() && !canEdit) Text("No places yet.", style = MaterialTheme.typography.bodyLarge, color = c.onSurfaceVariant, modifier = Modifier.padding(vertical = 14.dp))
                    if (canEdit) {
                        if (list.isNotEmpty()) HorizontalDivider(color = c.outlineVariant)
                        Row(Modifier.fillMaxWidth().clickable { editing = true to null }.padding(vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Outlined.Add, null, tint = c.primary)
                            Spacer(Modifier.width(20.dp))
                            Text("Add a place", style = MaterialTheme.typography.bodyLarge, color = c.primary)
                        }
                    }
                    HorizontalDivider(color = c.outlineVariant)
                }

                if (watched || watchedOthers.isNotEmpty()) {
                    Column {
                        Eyebrow("Watching today")
                        WatchList(if (watched) watching else othersWatching, placeName) { o ->
                            if (!watched && watchedOthers.size > 1) session?.relationship?.members?.firstOrNull { it.userId == o.assigneeId }?.displayName else null
                        }
                    }
                }
            }
        }
    }

    editing?.let { (_, place) -> PlaceEditor(vm, place, busy) { editing = null } }
}

/** Today's location tasks still to come, on hairlines, with whose they are when [who] says. */
@Composable
private fun WatchList(items: List<app.obey.api.Occurrence>, placeName: (app.obey.api.Occurrence) -> String, who: (app.obey.api.Occurrence) -> String?) {
    val c = MaterialTheme.colorScheme
    if (items.isEmpty()) {
        Text("No location tasks left today.", style = MaterialTheme.typography.bodyLarge, color = c.onSurfaceVariant, modifier = Modifier.padding(vertical = 14.dp))
    }
    items.forEachIndexed { i, o ->
        if (i > 0) HorizontalDivider(color = c.outlineVariant)
        Column(Modifier.fillMaxWidth().padding(vertical = 14.dp)) {
            Text(placeName(o), style = MaterialTheme.typography.bodyLarge)
            Text(
                "${o.title} · by ${formatTime(o.dueAt)}" + (o.stayMinutes?.let { ", stay ${stayLabel(it)}" } ?: "") + (who(o)?.let { " · $it" } ?: ""),
                style = MaterialTheme.typography.bodyMedium,
                color = c.onSurfaceVariant,
            )
        }
    }
    HorizontalDivider(color = c.outlineVariant)
}

/** The place dialog, wired to saving and deleting. */
@Composable
fun PlaceEditor(vm: LocationViewModel, place: Place?, busy: Boolean, onClose: () -> Unit) {
    PlaceDialog(
        place = place,
        busy = busy,
        search = vm::search,
        imagery = vm::imagery,
        locate = { vm.watcher.currentFix() },
        canLocate = { vm.watcher.hasAny },
        onDismiss = onClose,
        onSave = { input -> vm.save(place, input, onClose) },
        onDelete = place?.let { p -> { vm.delete(p, onClose) } },
    )
}
