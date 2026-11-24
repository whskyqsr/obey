package app.obey.ui.plans

import androidx.compose.ui.unit.sp
import androidx.compose.foundation.border
import androidx.compose.foundation.background
import androidx.compose.ui.draw.clip
import androidx.compose.material.icons.outlined.Home
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.fillMaxSize
import android.widget.Toast
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.outlined.Bedtime
import androidx.compose.material.icons.outlined.Event
import androidx.compose.material.icons.outlined.EventBusy
import androidx.compose.material.icons.outlined.HourglassTop
import androidx.compose.material.icons.outlined.WarningAmber
import androidx.compose.material3.AlertDialog
import app.obey.ui.common.Button
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import app.obey.ui.common.ChoiceChip
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import app.obey.ui.common.LettersField
import app.obey.ui.common.PillSegment
import app.obey.ui.common.PillRow
import androidx.compose.material3.Surface
import app.obey.ui.common.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import app.obey.api.CalendarEvent
import app.obey.api.CalendarEventInput
import app.obey.api.ObeyApi
import app.obey.api.Occurrence
import app.obey.api.OccurrenceStatus
import app.obey.api.DismissClashesInput
import app.obey.api.PlanRescheduleInput
import app.obey.api.PlanRescheduleItem
import app.obey.api.ReschedulePolicy
import app.obey.api.RescheduleStatus
import app.obey.data.Session
import app.obey.data.SessionRepository
import app.obey.ui.common.BaseViewModel
import app.obey.ui.common.formatDate
import app.obey.ui.common.formatDateTime
import app.obey.ui.common.formatTime
import app.obey.ui.common.local
import app.obey.ui.common.parseInstant
import app.obey.ui.today.DeadlinePicker
import androidx.compose.runtime.mutableStateMapOf
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

private val isoOffset = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ssXXX")

fun ZonedDateTime.iso(): String = format(isoOffset)

fun CalendarEvent.firstDay(): LocalDate = parseInstant(startsAt).local().toLocalDate()

/** The last day it touches; an all-day plan ends at the midnight after it. */
fun CalendarEvent.lastDay(): LocalDate = parseInstant(endsAt).minusMillis(1).local().toLocalDate()

fun CalendarEvent.covers(day: LocalDate) = !firstDay().isAfter(day) && !lastDay().isBefore(day)

/** All-day plans and anything a day or longer go above the timed items, like any calendar. */
val CalendarEvent.isLong: Boolean get() = allDay || Duration.between(parseInstant(startsAt), parseInstant(endsAt)) >= Duration.ofHours(24)

/** "Sat 18 Oct, 19:00 – 23:00", or just the dates for an all-day plan. */
fun CalendarEvent.whenLabel(): String {
    val first = firstDay()
    val last = lastDay()
    if (allDay) return if (first == last) "${formatDate(first)}, all day" else "${formatDate(first)} – ${formatDate(last)}"
    return if (first == parseInstant(endsAt).local().toLocalDate()) "${formatDate(first)}, ${formatTime(startsAt)} – ${formatTime(endsAt)}"
    else "${formatDate(first)} ${formatTime(startsAt)} – ${formatDate(parseInstant(endsAt).local().toLocalDate())} ${formatTime(endsAt)}"
}

/** The label on a day: the time span on its own day, or "All day" / "Continues". */
fun CalendarEvent.dayLabel(day: LocalDate): String = when {
    allDay -> "All day"
    isLong || firstDay() != lastDay() -> if (day == firstDay()) "From ${formatTime(startsAt)}" else if (day == lastDay()) "Until ${formatTime(endsAt)}" else "All day"
    else -> "${formatTime(startsAt)} – ${formatTime(endsAt)}"
}

/** Where "After the plan" lands: half an hour after a timed plan, or the same time of day once an all-day plan is over. */
fun afterPlan(dueAt: String, e: CalendarEvent): ZonedDateTime {
    val end = parseInstant(e.endsAt).local()
    return if (e.allDay) ZonedDateTime.of(end.toLocalDate(), parseInstant(dueAt).local().toLocalTime(), ZoneId.systemDefault())
    else end.plusMinutes(30)
}

/**
 * Saves and removes plans, and keeps the list of tasks one runs into, with their reschedules.
 * Key it per plan dialog.
 */
@HiltViewModel
class PlanViewModel @Inject constructor(
    private val api: ObeyApi,
    private val sessions: SessionRepository,
) : BaseViewModel() {
    val session: Session? get() = sessions.session

    private val _clashes = MutableStateFlow<List<Occurrence>>(emptyList())
    val clashes: StateFlow<List<Occurrence>> = _clashes.asStateFlow()

    fun loadClashes(e: CalendarEvent?) {
        if (e == null || e.conflictIds.isEmpty()) {
            _clashes.value = emptyList()
            return
        }
        viewModelScope.launch {
            runCatching { api.occurrences(e.relationshipId, e.firstDay().toString(), e.lastDay().toString()) }
                .onSuccess { all -> _clashes.value = all.filter { it.id in e.conflictIds && it.status == OccurrenceStatus.Pending }.sortedBy { it.dueAt } }
        }
    }

    private val _curfew = MutableStateFlow<app.obey.api.Curfew?>(null)
    /** The dynamic's curfew and my pending asks, for warning about plans that run past it. */
    val curfew: StateFlow<app.obey.api.Curfew?> = _curfew.asStateFlow()

    private val _night = MutableStateFlow<app.obey.api.CurfewCheckNight?>(null)
    /** The curfew night the plan being edited runs into, if any. */
    val night: StateFlow<app.obey.api.CurfewCheckNight?> = _night.asStateFlow()

    fun loadCurfew() {
        val rel = sessions.session?.relationship ?: return
        if (!rel.features.location) return
        viewModelScope.launch { _curfew.value = runCatching { api.curfew(rel.id) }.getOrNull() }
    }

    fun checkCurfew(startsAt: String?, endsAt: String?) {
        if (startsAt == null || endsAt == null) {
            _night.value = null
            return
        }
        viewModelScope.launch {
            _night.value = runCatching { api.curfewCheck(sessions.requireRelationshipId(), app.obey.api.CurfewCheckInput(startsAt, endsAt)).night }.getOrNull()
        }
    }

    /** [ask] asks for that night's curfew to move to the plan's end once the plan is saved. */
    fun save(
        id: String?,
        input: CalendarEventInput,
        ask: Pair<app.obey.api.CurfewCheckNight, String?>? = null,
        who: String = "",
        asksPause: Boolean = false,
        onSaved: (CalendarEvent) -> Unit,
    ) = action {
        val e = if (id == null) api.createEvent(sessions.requireRelationshipId(), input) else api.updateEvent(id, input)
        val done = if (id == null) "Plan added" else "Plan updated"
        if (ask != null) {
            api.askCurfew(sessions.requireRelationshipId(), app.obey.api.CurfewRequestInput(ask.first.occurrenceId, e.endsAt, ask.second, e.id))
            say("$done. Asked $who.")
        } else if (asksPause && e.pauseStatus == "asked") say("$done. Asked $who.")
        else if (e.conflictIds.isEmpty()) say(done)
        loadClashes(e)
        onSaved(e)
    }

    fun delete(e: CalendarEvent, following: Boolean = false, onDone: () -> Unit) = action {
        api.deleteEvent(e.id, if (following) "1" else null)
        say(if (following) "Plans removed" else "Plan removed")
        onDone()
    }

    /** A Dominant pausing the tasks during someone's plan, or not. */
    fun answerPause(e: CalendarEvent, approve: Boolean, onDone: (CalendarEvent) -> Unit) = action {
        val updated = api.answerPause(e.id, app.obey.api.PauseAnswerInput(approve))
        say(if (approve) "Tasks paused" else "Tasks stay on")
        onDone(updated)
    }

    /** Each clashing task its own way: kept as it is (the clash is dismissed), moved or called off, in one go. */
    fun sortOut(eventId: String, keep: List<String>, items: List<PlanRescheduleItem>, reason: String?, onDone: () -> Unit) = action {
        if (keep.isNotEmpty()) api.dismissClashes(eventId, DismissClashesInput(keep))
        if (items.isEmpty()) {
            say(if (keep.size == 1) "Kept as it is" else "Kept ${keep.size} tasks as they are")
        } else {
            val r = api.reschedulePlan(sessions.requireRelationshipId(), PlanRescheduleInput(items, reason?.takeIf { it.isNotBlank() }))
            say(
                when {
                    r.applied -> "Done"
                    r.requests.any { it.status == RescheduleStatus.Applied } -> "Moved what you could; the rest is waiting for approval"
                    else -> "Sent for approval"
                },
            )
        }
        // Kept, moved, or asked about: either way it's dealt with here.
        val sent = (items.map { it.occurrenceId } + keep).toSet()
        _clashes.value = _clashes.value.filter { it.id !in sent }
        onDone()
    }
}

/** A plan in a day's list: a rule down its side in its person's colour, its title, and when. */
@Composable
fun PlanRow(e: CalendarEvent, day: LocalDate, tone: PlanTone, onOpen: () -> Unit) {
    PlanLine(e.title, e.dayLabel(day), tone.dot, onOpen)
}

/** An all-day or multi-day plan above a day's tasks, ruled the same way as [PlanRow]. */
@Composable
fun PlanChip(e: CalendarEvent, day: LocalDate, tone: PlanTone, onOpen: () -> Unit, modifier: Modifier = Modifier) {
    val span = if (e.allDay && e.firstDay() == e.lastDay()) "All day" else "${formatDate(e.firstDay())} – ${formatDate(e.lastDay())}"
    Box(modifier) {
        PlanLine(e.title, span, tone.dot, onOpen)
    }
}

@Composable
private fun PlanLine(title: String, sub: String, rule: androidx.compose.ui.graphics.Color, onOpen: () -> Unit) {
    val c = MaterialTheme.colorScheme
    Column(
        Modifier
            .fillMaxWidth()
            .clickable(onClick = onOpen)
            .padding(horizontal = 16.dp, vertical = 10.dp)
            .drawBehind { drawRect(rule, size = androidx.compose.ui.geometry.Size(2.dp.toPx(), size.height)) }
            .padding(start = 16.dp),
    ) {
        Text(title, style = MaterialTheme.typography.bodyLarge, maxLines = 2, overflow = TextOverflow.Ellipsis)
        Text(sub, style = MaterialTheme.typography.bodyMedium, color = c.onSurfaceVariant)
    }
}

/** Today's heads-up for a plan that runs into tasks: the plan's accent rule, and a way into the plan to move them. */
@Composable
fun PlanHeadsUp(e: CalendarEvent, tone: PlanTone, onOpen: () -> Unit) {
    val c = MaterialTheme.colorScheme
    Row(
        Modifier
            .fillMaxWidth()
            .drawBehind { drawRect(tone.dot, size = androidx.compose.ui.geometry.Size(2.dp.toPx(), size.height)) }
            .padding(start = 16.dp, top = 4.dp, bottom = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(e.title, style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                "${e.whenLabel()} · overlaps ${if (e.conflictIds.size == 1) "a task" else "${e.conflictIds.size} tasks"}",
                style = MaterialTheme.typography.bodyMedium,
                color = c.onSurfaceVariant,
            )
        }
        TextButton(onClick = onOpen) { Text("Sort it out", color = c.primary) }
    }
}

private data class Draft(
    val title: String,
    val allDay: Boolean,
    val withPartner: Boolean,
    val start: LocalDateTime,
    val end: LocalDateTime,
    val startDay: LocalDate,
    val endDay: LocalDate,
    val note: String,
    /** "day", "week", "2weeks" or "month" until a date; set only on a new plan. */
    val every: String? = null,
    val until: LocalDate? = null,
    val pause: Boolean = false,
    /** Editing one plan of a repeating plan: just it, or it and the later ones. */
    val following: Boolean = false,
) {
    val valid get() = title.isNotBlank() && if (allDay) !endDay.isBefore(startDay) else end.isAfter(start)
    val firstDay: LocalDate get() = if (allDay) startDay else start.toLocalDate()

    fun times(): Pair<String, String> {
        val zone = ZoneId.systemDefault()
        return if (allDay) startDay.atStartOfDay(zone).iso() to endDay.plusDays(1).atStartOfDay(zone).iso()
        else start.atZone(zone).iso() to end.atZone(zone).iso()
    }

    fun toInput(isNew: Boolean, repeating: Boolean): CalendarEventInput {
        val zone = ZoneId.systemDefault()
        val (s, e) = times()
        return CalendarEventInput(
            title.trim(), s, e, allDay, withPartner, note.trim().ifEmpty { null },
            pauseTasks = pause,
            repeat = if (isNew && every != null && until != null) app.obey.api.PlanRepeat(every, until.toString(), zone.id) else null,
            applyTo = if (repeating) (if (following) "following" else "one") else null,
        )
    }

    companion object {
        fun of(e: CalendarEvent?, day: LocalDate): Draft {
            if (e != null) {
                val s = parseInstant(e.startsAt).local().toLocalDateTime()
                val en = parseInstant(e.endsAt).local().toLocalDateTime()
                return Draft(
                    e.title, e.allDay, e.withPartner, s, en, e.firstDay(), e.lastDay(), e.noteMd.orEmpty(),
                    every = e.repeat?.every, until = e.repeat?.until?.let(LocalDate::parse), pause = e.pauseTasks,
                )
            }
            // Evening by default; later today if the evening has started.
            val hour = if (day == LocalDate.now()) maxOf(18, LocalTime.now().hour + 1) else 18
            val start = day.atStartOfDay().plusHours(hour.toLong())
            return Draft("", false, false, start, start.plusHours(2), day, day, "")
        }
    }
}

/**
 * Adds, edits or shows a plan on the shared calendar. Either partner adds plans and each changes only their own.
 * Tasks due during the plan are listed with a one-tap reschedule, as on the web.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun PlanDialog(event: CalendarEvent?, day: LocalDate, onDismiss: () -> Unit, onChanged: () -> Unit) {
    val vm: PlanViewModel = hiltViewModel(key = "plan-${event?.id ?: "new"}")
    val context = LocalContext.current
    val message by vm.message.collectAsStateWithLifecycle()
    val busy by vm.busy.collectAsStateWithLifecycle()
    LaunchedEffect(message) {
        message?.let { Toast.makeText(context, it, Toast.LENGTH_SHORT).show(); vm.messageShown() }
    }
    val session = vm.session
    var saved by remember { mutableStateOf(event) }
    var editing by remember { mutableStateOf(event == null) }
    var draft by remember { mutableStateOf(Draft.of(event, day)) }
    LaunchedEffect(event?.id) {
        vm.loadClashes(event)
        vm.loadCurfew()
    }
    val curfew by vm.curfew.collectAsStateWithLifecycle()
    val night by vm.night.collectAsStateWithLifecycle()
    val onCurfew = curfew?.settings?.let { it.enabled && it.assigneeId == session?.userId } == true
    val askWho = session?.partners.orEmpty().filter { it.role != app.obey.api.Role.Submissive }.let { if (it.size == 1) it[0].displayName else "your Dominant" }
    // Asked from this plan and still waiting.
    val pending = curfew?.requests?.firstOrNull { it.eventId != null && it.eventId == saved?.id }
    var askReason by remember { mutableStateOf("") }
    var endedAt by remember { mutableStateOf<String?>(null) }
    val clashItems by vm.clashes.collectAsStateWithLifecycle()
    val form = remember { ClashForm() }

    val current = saved
    if (!editing && current != null) {
        val mine = current.authorId == session?.userId
        val plan = session?.let { ClashPlan(clashItems, it, current, form) }
        if (session != null && plan != null && clashItems.isNotEmpty()) {
            // A plan that runs into tasks opens on them first (mockup 58).
            ClashSheet(current, clashItems, plan, form, session, busy, vm, onDismiss, onChanged, onChange = if (mine) ({ draft = Draft.of(current, day); editing = true }) else null)
            return
        }
        val c = MaterialTheme.colorScheme
        var removing by remember { mutableStateOf(false) }
        AlertDialog(
            onDismissRequest = onDismiss,
            containerColor = c.surface,
            title = { Text(current.title, style = MaterialTheme.typography.headlineMedium) },
            text = {
                Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(current.whenLabel() + if (current.withPartner) " · both of you" else "", style = MaterialTheme.typography.bodyLarge, color = c.onSurfaceVariant)
                    current.repeat?.let { Text(repeatLine(it.every, LocalDate.parse(it.until)), style = MaterialTheme.typography.bodyMedium, color = c.onSurfaceVariant) }
                    current.noteMd?.let { Text(it, Modifier.fillMaxWidth().drawBehind { drawRect(c.outlineVariant, size = androidx.compose.ui.geometry.Size(2.dp.toPx(), size.height)) }.padding(start = 12.dp)) }
                    if (current.pauseTasks) {
                        val line = when (current.pauseStatus) {
                            "approved" -> "Tasks during it are paused."
                            "asked" -> if (mine) "Waiting for $askWho to pause tasks during it." else "${session?.nameOf(current.authorId) ?: "They"} asks to pause tasks during it."
                            else -> if (mine) "$askWho said no to pausing tasks during it." else "You said no to pausing tasks during it."
                        }
                        Text(line, style = MaterialTheme.typography.bodyMedium, color = c.onSurfaceVariant)
                    }
                    if (!mine && session?.canManage == true && current.pauseStatus == "asked") {
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            app.obey.ui.common.Button(onClick = { vm.answerPause(current, true) { saved = it; onChanged() } }, enabled = !busy) { Text("Pause them") }
                            OutlinedButton(
                                onClick = { vm.answerPause(current, false) { saved = it; onChanged() } },
                                enabled = !busy,
                                shape = MaterialTheme.shapes.small,
                                border = androidx.compose.foundation.BorderStroke(1.dp, c.onSurface),
                                colors = androidx.compose.material3.ButtonDefaults.outlinedButtonColors(contentColor = c.onSurface),
                            ) { Text("Not now") }
                        }
                    }
                    pending?.let { WaitingOn(askWho, it) }
                    if (removing) {
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            app.obey.ui.common.Eyebrow("Remove")
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                app.obey.ui.common.LettersChip("This one", false, { vm.delete(current) { onChanged(); onDismiss() } })
                                app.obey.ui.common.LettersChip("This and later ones", false, { vm.delete(current, following = true) { onChanged(); onDismiss() } })
                            }
                        }
                    }
                }
            },
            confirmButton = { Button(onClick = onDismiss) { Text("Done") } },
            dismissButton = {
                if (mine) Row {
                    TextButton(onClick = { if (current.seriesId != null) removing = !removing else vm.delete(current) { onChanged(); onDismiss() } }, enabled = !busy) {
                        Text("Remove", color = c.error)
                    }
                    TextButton(onClick = { draft = Draft.of(current, day); editing = true }) { Text("Edit", color = c.onSurface) }
                }
            },
        )
        return
    }

    var picking by remember { mutableStateOf<String?>(null) }
    val partner = session?.partners?.firstOrNull()?.let { session.nameOf(it.userId) }
    val zone = ZoneId.systemDefault()
    if (onCurfew && !draft.allDay) {
        LaunchedEffect(draft.start, draft.end) {
            kotlinx.coroutines.delay(300)
            vm.checkCurfew(draft.start.atZone(zone).iso(), draft.end.atZone(zone).iso())
        }
    }
    val n = night?.takeIf { onCurfew && !draft.allDay && pending == null }
    val canAsk = n != null && draft.end.atZone(zone).toInstant().isBefore(parseInstant(n.endsAt))
    // Running past curfew asks by default (mockup 14); "End at" pulls the plan back to curfew instead.
    val willAsk = canAsk
    // A submissive's pause waits on a Dominant, again whenever the plan moves or takes in the partner.
    val (newStart, newEnd) = draft.times()
    val moved = current != null && (parseInstant(current.startsAt) != parseInstant(newStart) || parseInstant(current.endsAt) != parseInstant(newEnd))
    val asksPause = draft.pause && session?.canManage != true &&
        (current == null || !current.pauseTasks || current.pauseStatus == "declined" || moved || current.withPartner != draft.withPartner)
    var choosingRepeat by remember { mutableStateOf(false) }
    val c = MaterialTheme.colorScheme
    androidx.compose.ui.window.Dialog(
        onDismissRequest = { if (current == null) onDismiss() else editing = false },
        properties = androidx.compose.ui.window.DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false),
    ) {
        androidx.compose.material3.Scaffold(
            containerColor = c.surface,
            topBar = {
                androidx.compose.material3.CenterAlignedTopAppBar(
                    title = { Text(if (current == null) "New plan" else "Edit plan", style = MaterialTheme.typography.titleMedium) },
                    navigationIcon = { TextButton(onClick = { if (current == null) onDismiss() else editing = false }) { Text("Cancel", color = c.onSurfaceVariant) } },
                    colors = androidx.compose.material3.TopAppBarDefaults.centerAlignedTopAppBarColors(containerColor = c.surface),
                )
            },
            bottomBar = {
                Row(Modifier.fillMaxWidth().navigationBarsPadding().imePadding().padding(horizontal = 24.dp, vertical = 16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    if (n != null) {
                        OutlinedButton(
                            onClick = { endedAt = n.dueAt; draft = draft.copy(end = parseInstant(n.dueAt).local().toLocalDateTime()) },
                            modifier = Modifier.weight(1f).height(48.dp),
                            shape = MaterialTheme.shapes.small,
                            border = androidx.compose.foundation.BorderStroke(1.dp, c.onSurface),
                            colors = androidx.compose.material3.ButtonDefaults.outlinedButtonColors(contentColor = c.onSurface),
                        ) { Text("End at ${shortTime(n.dueAt)}", maxLines = 1) }
                    }
                    Button(
                        enabled = draft.valid && !busy,
                        modifier = Modifier.weight(1.3f).height(48.dp),
                        onClick = {
                            val ask = if (willAsk && n != null) n to askReason.trim().ifEmpty { null } else null
                            vm.save(current?.id, draft.toInput(current == null, current?.seriesId != null), ask, askWho, asksPause) { e ->
                                onChanged()
                                if (e.conflictIds.isEmpty()) onDismiss()
                                else {
                                    // Stay open on the clashes, so they can be moved right away.
                                    saved = e
                                    editing = false
                                }
                            }
                        },
                    ) { Text(if (willAsk || asksPause) "Save and ask $askWho" else "Save", maxLines = 1) }
                }
            },
        ) { padding ->
            Column(
                Modifier.padding(padding).fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 24.dp).padding(top = 16.dp, bottom = 24.dp),
                verticalArrangement = Arrangement.spacedBy(24.dp),
            ) {
                PlanSentence(draft, onTitle = { draft = draft.copy(title = it.take(80)) }, onPick = { picking = it })
                when {
                    !onCurfew || draft.allDay -> {}
                    pending != null -> WaitingOn(askWho, pending)
                    n != null -> {
                        CurfewNotice(n, draft.end.atZone(zone).toInstant(), canAsk, askWho)
                        if (canAsk) LettersField(askReason, { askReason = it.take(280) }, label = { Text("Why, for $askWho (optional)") }, modifier = Modifier.fillMaxWidth())
                    }
                    endedAt?.let { parseInstant(it).local().toLocalDateTime() == draft.end } == true -> EndsAtCurfew(endedAt!!)
                }
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    app.obey.ui.common.Eyebrow("Also")
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        if (partner != null) app.obey.ui.common.LettersChip("With $partner", draft.withPartner, { draft = draft.copy(withPartner = !draft.withPartner) }, check = true)
                        app.obey.ui.common.LettersChip(
                            "All day",
                            draft.allDay,
                            {
                                val d = draft.start.toLocalDate()
                                draft = if (draft.allDay) draft.copy(allDay = false) else draft.copy(allDay = true, startDay = d, endDay = if (draft.endDay.isBefore(d)) d else draft.endDay)
                            },
                            check = true,
                        )
                        if (current == null) app.obey.ui.common.LettersChip(
                            if (draft.every != null && draft.until != null) repeatLine(draft.every!!, draft.until!!) else "Repeats",
                            draft.every != null,
                            { choosingRepeat = true },
                            check = true,
                        )
                        app.obey.ui.common.LettersChip("Pause tasks during it", draft.pause, { draft = draft.copy(pause = !draft.pause) }, check = true)
                    }
                }
                if (current?.seriesId != null) {
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        app.obey.ui.common.Eyebrow("Change")
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            app.obey.ui.common.LettersChip("This one", !draft.following, { draft = draft.copy(following = false) })
                            app.obey.ui.common.LettersChip("This and later ones", draft.following, { draft = draft.copy(following = true) })
                        }
                    }
                }
                LettersField(
                    value = draft.note,
                    onValueChange = { draft = draft.copy(note = it.take(2000)) },
                    label = { Text("Note (optional)") },
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }

    if (choosingRepeat) {
        AlertDialog(
            onDismissRequest = { choosingRepeat = false },
            containerColor = c.surface,
            title = { Text("Repeats", style = MaterialTheme.typography.headlineSmall) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        EVERY.forEach { (k, label) ->
                            app.obey.ui.common.LettersChip(label, draft.every == k, {
                                val keep = draft.until?.takeIf { !it.isBefore(draft.firstDay) }
                                draft = draft.copy(every = k, until = keep ?: draft.firstDay.plusDays(DEFAULT_RUN.getValue(k)))
                            })
                        }
                    }
                    draft.until?.let { u ->
                        if (draft.every != null) TextButton(onClick = { picking = "until" }) { Text("Until ${formatDate(u)}", color = c.primary) }
                    }
                }
            },
            confirmButton = { TextButton(onClick = { choosingRepeat = false }) { Text("Done", color = c.primary) } },
            dismissButton = { TextButton(onClick = { draft = draft.copy(every = null, until = null); choosingRepeat = false }) { Text("Doesn't repeat", color = c.onSurface) } },
        )
    }

    when (val p = picking) {
        "startDay", "endDay", "startDate", "endDate", "until" -> {
            val initial = when (p) {
                "startDay" -> draft.startDay
                "endDay" -> draft.endDay
                "startDate" -> draft.start.toLocalDate()
                "until" -> draft.until ?: draft.firstDay
                else -> draft.end.toLocalDate()
            }
            val state = rememberDatePickerState(initialSelectedDateMillis = initial.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli())
            DatePickerDialog(
                onDismissRequest = { picking = null },
                confirmButton = {
                    TextButton(onClick = {
                        // DatePicker reports midnight UTC of the chosen day.
                        state.selectedDateMillis?.let { Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate() }?.let { d ->
                            draft = when (p) {
                                "startDay" -> draft.copy(startDay = d, endDay = if (d.isAfter(draft.endDay)) d else draft.endDay)
                                "endDay" -> draft.copy(endDay = d)
                                "startDate" -> draft.moveStart(d.atTime(draft.start.toLocalTime()))
                                "until" -> if (d.isBefore(draft.firstDay)) draft else draft.copy(until = d)
                                else -> draft.copy(end = d.atTime(draft.end.toLocalTime()))
                            }
                        }
                        picking = null
                    }) { Text("OK") }
                },
                dismissButton = { TextButton(onClick = { picking = null }) { Text("Cancel") } },
            ) { DatePicker(state = state) }
        }
        "startTime", "endTime" -> {
            val at = if (p == "startTime") draft.start else draft.end
            val state = rememberTimePickerState(initialHour = at.hour, initialMinute = at.minute)
            AlertDialog(
                onDismissRequest = { picking = null },
                text = { TimePicker(state = state) },
                confirmButton = {
                    TextButton(onClick = {
                        val t = LocalTime.of(state.hour, state.minute)
                        draft = if (p == "startTime") draft.moveStart(draft.start.toLocalDate().atTime(t)) else draft.copy(end = draft.end.toLocalDate().atTime(t))
                        picking = null
                    }) { Text("OK") }
                },
                dismissButton = { TextButton(onClick = { picking = null }) { Text("Cancel") } },
            )
        }
    }
}

/** Keep the length when the start moves, like any calendar. */
private fun Draft.moveStart(start: LocalDateTime): Draft {
    val length = Duration.between(this.start, end).coerceAtLeast(Duration.ofHours(1))
    return copy(start = start, end = start.plus(length))
}

private fun timeOf(t: LocalDateTime): String = formatTime(t.atZone(ZoneId.systemDefault()).iso())

@Composable
private fun WhenRow(label: String, date: String, time: String?, onDate: () -> Unit, onTime: () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(label, Modifier.width(56.dp), style = MaterialTheme.typography.bodyMedium)
        OutlinedButton(onClick = onDate, modifier = Modifier.weight(1f)) { Text(date, maxLines = 1) }
        if (time != null) OutlinedButton(onClick = onTime) { Text(time, maxLines = 1) }
    }
}

private enum class ClashChoice { Keep, Move, Cancel }

/** What's been picked for each clashing task; held by the dialog so its button row can apply it. */
private class ClashForm {
    val choices = mutableStateMapOf<String, ClashChoice>()
    val times = mutableStateMapOf<String, ZonedDateTime>()
    var reason by mutableStateOf("")
}

/** Who may do what with each clash, and what's picked so far. */
private class ClashPlan(items: List<Occurrence>, session: Session, private val e: CalendarEvent, private val form: ClashForm) {
    val isDom = session.canManage
    val policy = session.relationship?.reschedulePolicy
    val subBlocked = !isDom && policy == ReschedulePolicy.DominantOnly
    private val involved = e.withPartner || e.authorId == session.userId
    private val me = session.userId
    fun canMove(o: Occurrence) = !subBlocked && (isDom || o.assigneeId == me)
    fun canAct(o: Occurrence) = involved || canMove(o)
    fun choiceOf(o: Occurrence) = form.choices[o.id]
    fun timeOf(o: Occurrence) = form.times[o.id] ?: afterPlan(o.dueAt, e)
    val picked = items.filter { canAct(it) && choiceOf(it) != null }
    val changed = picked.filter { choiceOf(it) != ClashChoice.Keep }
    val asks = !isDom && changed.any { choiceOf(it) == ClashChoice.Cancel || policy != ReschedulePolicy.Allowance }
    // One tap for the lot: a long plan can run into dozens of tasks.
    val actionable = items.filter { canAct(it) }
    val allMovable = actionable.all { canMove(it) }

    fun moveAll(vm: PlanViewModel, onChanged: () -> Unit) =
        vm.sortOut(e.id, emptyList(), actionable.map { PlanRescheduleItem(it.id, "move", afterPlan(it.dueAt, e).iso()) }, null) { onChanged() }

    fun keepAll(vm: PlanViewModel, onChanged: () -> Unit) = vm.sortOut(e.id, actionable.map { it.id }, emptyList(), null) { onChanged() }

    fun apply(vm: PlanViewModel, onChanged: () -> Unit) {
        val sent = changed.map { o ->
            if (choiceOf(o) == ClashChoice.Cancel) PlanRescheduleItem(o.id, "cancel") else PlanRescheduleItem(o.id, "move", timeOf(o).iso())
        }
        val keep = picked.filter { choiceOf(it) == ClashChoice.Keep }.map { it.id }
        vm.sortOut(e.id, keep, sent, form.reason) { form.choices.clear(); form.reason = ""; onChanged() }
    }
}

/** "11:00" from "11:00 PM": a time whose half of the day is already plain. */
private val EVERY = linkedMapOf("day" to "Every day", "week" to "Every week", "2weeks" to "Every 2 weeks", "month" to "Every month")
/** How far a new repeat runs before they pick an end. */
private val DEFAULT_RUN = mapOf("day" to 13L, "week" to 49L, "2weeks" to 98L, "month" to 151L)

/** "Every week until Tue, Jan 12". */
fun repeatLine(every: String, until: LocalDate) = "${EVERY[every] ?: "Repeats"} until ${formatDate(until)}"

private fun shortTime(iso: String) = formatTime(iso).replace(Regex("[\\s\\u202f\\u00a0]?[AaPp]\\.?[Mm]\\.?$"), "")

/** "today", "tomorrow", "Friday" within the week, else "Fri 4 Dec". */
private fun dayWord(d: LocalDate): String {
    val today = LocalDate.now()
    return when {
        d == today -> "today"
        d == today.plusDays(1) -> "tomorrow"
        d.isAfter(today) && d.isBefore(today.plusDays(7)) -> d.format(java.time.format.DateTimeFormatter.ofPattern("EEEE"))
        else -> formatDate(d)
    }
}

/**
 * The plan as one sentence with tappable parts (mockup 14): "I'll be at ___ on ___ from ___ to ___." The title is typed
 * in place; the day and times open the pickers.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun PlanSentence(draft: Draft, onTitle: (String) -> Unit, onPick: (String) -> Unit) {
    val c = MaterialTheme.colorScheme
    val style = MaterialTheme.typography.displaySmall.copy(fontSize = 34.sp, lineHeight = 44.sp, color = c.onSurface)
    val underline = Modifier.drawBehind {
        val y = size.height - 2.dp.toPx()
        drawRect(c.primary, topLeft = androidx.compose.ui.geometry.Offset(0f, y), size = androidx.compose.ui.geometry.Size(size.width, 1.5.dp.toPx()))
    }
    @Composable
    fun word(t: String) = Text(t, style = style)
    @Composable
    fun slot(t: String, key: String) = Text(t, style = style, modifier = underline.clickable { onPick(key) })
    val zone = ZoneId.systemDefault()
    FlowRow(horizontalArrangement = Arrangement.spacedBy(9.dp), verticalArrangement = Arrangement.spacedBy(0.dp)) {
        word(if (draft.withPartner) "We'll" else "I'll")
        word("be")
        word("at")
        Box(underline) {
            // The field is as wide as what's typed, like the web's.
            Text(draft.title.ifEmpty { "what" }, style = style.copy(color = androidx.compose.ui.graphics.Color.Transparent), modifier = Modifier.padding(end = 4.dp))
            androidx.compose.foundation.text.BasicTextField(
                value = draft.title,
                onValueChange = onTitle,
                textStyle = style,
                singleLine = true,
                cursorBrush = androidx.compose.ui.graphics.SolidColor(c.primary),
                modifier = Modifier.matchParentSize(),
                decorationBox = { inner ->
                    Box {
                        if (draft.title.isEmpty()) Text("what", style = style.copy(color = c.onSurfaceVariant.copy(alpha = 0.5f)))
                        inner()
                    }
                },
            )
        }
        if (draft.allDay) {
            if (draft.startDay == draft.endDay) {
                if (draft.startDay.isAfter(LocalDate.now().plusDays(1))) word("on")
                slot(dayWord(draft.startDay) + ",", "startDay")
                word("all")
                word("day.")
            } else {
                word("from")
                slot(dayWord(draft.startDay), "startDay")
                word("to")
                slot(dayWord(draft.endDay) + ".", "endDay")
            }
        } else {
            val d = draft.start.toLocalDate()
            if (d.isAfter(LocalDate.now().plusDays(1))) word("on")
            slot(dayWord(d), "startDate")
            word("from")
            val a = formatTime(draft.start.atZone(zone).iso())
            val b = formatTime(draft.end.atZone(zone).iso())
            slot(if (a.takeLast(2) == b.takeLast(2)) shortTime(draft.start.atZone(zone).iso()) else a, "startTime")
            word("to")
            slot(b + if (draft.end.toLocalDate().isAfter(d)) "" else ".", "endTime")
            if (draft.end.toLocalDate().isAfter(d)) word("the next day.")
        }
    }
}

/** The curfew notice in the plan editor: how far past curfew it runs, and that the Dominant will be asked. */
@Composable
private fun CurfewNotice(night: app.obey.api.CurfewCheckNight, end: Instant, canAsk: Boolean, who: String) {
    val c = MaterialTheme.colorScheme
    val past = java.time.Duration.between(parseInstant(night.dueAt), end).toMinutes()
    val howLong = when {
        past < 60 -> "$past minutes"
        past == 60L -> "an hour"
        past % 60 == 0L -> "${past / 60} hours"
        else -> "${past / 60} h ${past % 60} min"
    }
    val shape = RoundedCornerShape(8.dp)
    Row(
        Modifier.fillMaxWidth().clip(shape).border(1.dp, c.primary, shape).background(c.surfaceContainerLowest).padding(horizontal = 20.dp, vertical = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Icon(Icons.Outlined.Home, null, tint = c.primary)
        Text(
            "This runs $howLong past your ${shortTime(night.dueAt)} curfew. " +
                if (canAsk) "$who will be asked, and can approve it or pick another end time." else "It runs past the stay-in time (${formatTime(night.endsAt)}), so end it earlier.",
            style = MaterialTheme.typography.bodyLarge,
        )
    }
}

private val NUMBER_WORDS = mapOf(2 to "Two", 3 to "Three", 4 to "Four", 5 to "Five", 6 to "Six", 7 to "Seven", 8 to "Eight", 9 to "Nine", 10 to "Ten")

/**
 * The tasks a plan runs into (mockup 58): move them all to after the plan, pick new times one by one, or keep them as
 * they are. A Dominant's choices apply at once; a sub's go out as one request.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
private fun ClashSheet(
    e: CalendarEvent,
    items: List<Occurrence>,
    plan: ClashPlan,
    form: ClashForm,
    session: Session,
    busy: Boolean,
    vm: PlanViewModel,
    onDismiss: () -> Unit,
    onChanged: () -> Unit,
    onChange: (() -> Unit)?,
) {
    val c = MaterialTheme.colorScheme
    var pickingTimes by remember { mutableStateOf(false) }
    var picking by remember { mutableStateOf<Occurrence?>(null) }
    val n = items.size
    val dom = session.partners.firstOrNull { it.role == app.obey.api.Role.Dominant }?.displayName
    androidx.compose.material3.ModalBottomSheet(onDismissRequest = onDismiss, containerColor = c.surface, sheetState = androidx.compose.material3.rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(Modifier.verticalScroll(rememberScrollState()).padding(horizontal = 24.dp).padding(bottom = 24.dp)) {
            Text(if (n == 1) "A task falls during this plan" else "${NUMBER_WORDS[n] ?: n} tasks fall during this plan", style = MaterialTheme.typography.headlineLarge)
            Text("${e.title} · ${e.whenLabel()}", style = MaterialTheme.typography.bodyLarge, color = c.onSurfaceVariant, modifier = Modifier.padding(top = 8.dp, bottom = 8.dp))
            items.forEach { o ->
                val mine = o.assigneeId == session.userId
                Column(Modifier.fillMaxWidth().padding(vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                        app.obey.ui.common.Diamond(app.obey.ui.common.DiamondState.Open, size = 16.dp)
                        Column(Modifier.weight(1f)) {
                            Text(o.title, style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(formatTime(o.dueAt) + if (mine) "" else " · ${session.nameOf(o.assigneeId)}", style = MaterialTheme.typography.bodyMedium, color = c.onSurfaceVariant)
                        }
                    }
                    if (pickingTimes && plan.canAct(o)) {
                        FlowRow(Modifier.padding(start = 32.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            app.obey.ui.common.LettersChip("Keep", plan.choiceOf(o) == ClashChoice.Keep, { form.choices[o.id] = ClashChoice.Keep })
                            if (plan.canMove(o)) {
                                app.obey.ui.common.LettersChip("Move", plan.choiceOf(o) == ClashChoice.Move, { form.choices[o.id] = ClashChoice.Move })
                                app.obey.ui.common.LettersChip(if (plan.isDom) "Call off" else "Ask off", plan.choiceOf(o) == ClashChoice.Cancel, { form.choices[o.id] = ClashChoice.Cancel })
                            }
                        }
                        if (plan.choiceOf(o) == ClashChoice.Move) {
                            TextButton(onClick = { picking = o }, modifier = Modifier.padding(start = 20.dp)) {
                                Text("New time: ${formatDateTime(plan.timeOf(o).iso())}", color = c.onSurface, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            }
                        }
                    }
                }
                androidx.compose.material3.HorizontalDivider(color = c.outlineVariant)
            }
            Spacer(Modifier.height(20.dp))
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                val full = Modifier.fillMaxWidth().height(48.dp)
                if (!pickingTimes) {
                    if (plan.allMovable && plan.actionable.isNotEmpty()) {
                        Button(onClick = { plan.moveAll(vm) { onChanged(); onDismiss() } }, enabled = !busy, modifier = full) { Text("Move ${if (n == 1) "it" else "them"} to after ${formatTime(e.endsAt)}") }
                        OutlinedButton(
                            onClick = { pickingTimes = true },
                            modifier = full,
                            shape = MaterialTheme.shapes.small,
                            border = androidx.compose.foundation.BorderStroke(1.dp, c.onSurface),
                            colors = androidx.compose.material3.ButtonDefaults.outlinedButtonColors(contentColor = c.onSurface),
                        ) { Text(if (n == 1) "Pick a new time" else "Pick new times one by one") }
                    }
                    if (plan.actionable.isNotEmpty()) {
                        TextButton(onClick = { plan.keepAll(vm) { onChanged(); onDismiss() } }, enabled = !busy, modifier = full) { Text(if (n == 1) "Keep it as it is" else "Keep them as they are", color = c.onSurface) }
                    }
                } else {
                    if (plan.picked.isNotEmpty() && plan.asks) LettersField(form.reason, { form.reason = it.take(1000) }, label = { Text("Reason (optional)") }, modifier = Modifier.fillMaxWidth())
                    Button(onClick = { plan.apply(vm) { onChanged(); onDismiss() } }, enabled = !busy && plan.picked.isNotEmpty(), modifier = full) {
                        Text((if (plan.asks) "Ask" else "Save") + if (plan.picked.isNotEmpty()) " (${plan.picked.size})" else "")
                    }
                    TextButton(onClick = { pickingTimes = false; form.choices.clear() }, modifier = full) { Text("Back", color = c.onSurface) }
                }
            }
            val asksAboutMoves = !plan.isDom && !plan.subBlocked && plan.policy != ReschedulePolicy.Allowance
            if (asksAboutMoves && dom != null) Text("$dom is asked about any move, unless your dynamic lets you.", style = MaterialTheme.typography.bodySmall, color = c.onSurfaceVariant, textAlign = androidx.compose.ui.text.style.TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(top = 12.dp))
            if (plan.subBlocked) Text("Only ${dom ?: "your Dominant"} can move tasks in this dynamic.", style = MaterialTheme.typography.bodySmall, color = c.onSurfaceVariant, textAlign = androidx.compose.ui.text.style.TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(top = 12.dp))
            if (onChange != null) TextButton(onClick = onChange, modifier = Modifier.fillMaxWidth()) { Text("Change the plan", color = c.onSurface) }
        }
    }
    picking?.let { o ->
        DeadlinePicker(plan.timeOf(o), onPicked = { form.times[o.id] = it; picking = null }, onDismiss = { picking = null })
    }
}

/** "Waiting on Sam": an ask for more curfew time sent from this plan. */
@Composable
private fun WaitingOn(who: String, r: app.obey.api.CurfewRequest) {
    val night = parseInstant(r.fromDueAt).minusSeconds(12 * 3600).local().format(java.time.format.DateTimeFormatter.ofPattern("EEEE"))
    Surface(color = androidx.compose.ui.graphics.Color.Transparent, border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant), shape = MaterialTheme.shapes.medium, modifier = Modifier.fillMaxWidth()) {
        Row(Modifier.padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Outlined.HourglassTop, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.width(12.dp))
            Column {
                Text("Waiting on $who", style = MaterialTheme.typography.titleMedium)
                Text(
                    "You asked to move $night's curfew from ${formatTime(r.fromDueAt)} to ${formatTime(r.untilAt)}",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun EndsAtCurfew(dueAt: String) {
    Surface(color = androidx.compose.ui.graphics.Color.Transparent, border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant), shape = MaterialTheme.shapes.medium, modifier = Modifier.fillMaxWidth()) {
        Row(Modifier.padding(horizontal = 16.dp, vertical = 12.dp)) {
            Icon(Icons.Outlined.Bedtime, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.width(12.dp))
            Column {
                Text("Ends at curfew", style = MaterialTheme.typography.titleSmall)
                Text("Curfew that night is ${formatTime(dueAt)}.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}
