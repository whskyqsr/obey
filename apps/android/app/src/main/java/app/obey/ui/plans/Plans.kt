package app.obey.ui.plans

import android.widget.Toast
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.material.icons.outlined.Event
import androidx.compose.material.icons.outlined.EventBusy
import androidx.compose.material.icons.outlined.WarningAmber
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
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

    fun save(id: String?, input: CalendarEventInput, onSaved: (CalendarEvent) -> Unit) = action {
        val e = if (id == null) api.createEvent(sessions.requireRelationshipId(), input) else api.updateEvent(id, input)
        if (e.conflictIds.isEmpty()) say(if (id == null) "Plan added" else "Plan updated")
        loadClashes(e)
        onSaved(e)
    }

    fun delete(e: CalendarEvent, onDone: () -> Unit) = action {
        api.deleteEvent(e.id)
        say("Plan removed")
        onDone()
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

/** A plan in a day's list: an event icon, its title, and when on that day. */
@Composable
fun PlanRow(e: CalendarEvent, day: LocalDate, who: String?, tone: PlanTone, onOpen: () -> Unit) {
    val colors = MaterialTheme.colorScheme
    ListItem(
        modifier = Modifier.clickable(onClick = onOpen),
        leadingContent = { Icon(Icons.Outlined.Event, null, tint = tone.dot) },
        headlineContent = { Text(e.title, maxLines = 1, overflow = TextOverflow.Ellipsis) },
        supportingContent = { Text(listOfNotNull(e.dayLabel(day), who).joinToString(" · ")) },
        trailingContent = if (e.conflictIds.isNotEmpty()) ({ Icon(Icons.Outlined.WarningAmber, "Overlaps a task", tint = colors.error) }) else null,
        colors = ListItemDefaults.colors(containerColor = colors.surface),
    )
}

/** A short tinted bar for all-day and multi-day plans, shown above a day's tasks. */
@Composable
fun PlanChip(e: CalendarEvent, day: LocalDate, tone: PlanTone, onOpen: () -> Unit, modifier: Modifier = Modifier) {
    val colors = MaterialTheme.colorScheme
    Surface(
        onClick = onOpen,
        color = tone.container,
        contentColor = tone.onContainer,
        shape = RoundedCornerShape(8.dp),
        modifier = modifier.fillMaxWidth(),
    ) {
        Row(Modifier.padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Outlined.Event, null, Modifier.size(18.dp))
            Spacer(Modifier.width(8.dp))
            Text(e.title, style = MaterialTheme.typography.labelLarge, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
            Text(
                if (e.allDay && e.firstDay() == e.lastDay()) "All day" else "${formatDate(e.firstDay())} – ${formatDate(e.lastDay())}",
                style = MaterialTheme.typography.labelSmall,
            )
            if (e.conflictIds.isNotEmpty()) {
                Spacer(Modifier.width(6.dp))
                Icon(Icons.Outlined.WarningAmber, "Overlaps a task", Modifier.size(18.dp), tint = colors.error)
            }
        }
    }
}

/** Today's heads-up for a plan that runs into tasks, with a way into the plan to move them. */
@Composable
fun PlanHeadsUp(e: CalendarEvent, tone: PlanTone, onOpen: () -> Unit) {
    Surface(
        color = tone.container,
        contentColor = tone.onContainer,
        shape = RoundedCornerShape(12.dp),
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
    ) {
        Row(Modifier.padding(start = 16.dp, end = 4.dp, top = 8.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Outlined.EventBusy, null)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(e.title, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(
                    "${e.whenLabel()} · overlaps ${if (e.conflictIds.size == 1) "a task" else "${e.conflictIds.size} tasks"}",
                    style = MaterialTheme.typography.bodySmall,
                )
            }
            TextButton(onClick = onOpen) { Text("Sort it out") }
        }
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
) {
    val valid get() = title.isNotBlank() && if (allDay) !endDay.isBefore(startDay) else end.isAfter(start)

    fun toInput(): CalendarEventInput {
        val zone = ZoneId.systemDefault()
        return if (allDay) CalendarEventInput(
            title.trim(), startDay.atStartOfDay(zone).iso(), endDay.plusDays(1).atStartOfDay(zone).iso(), true, withPartner, note.trim().ifEmpty { null },
        ) else CalendarEventInput(title.trim(), start.atZone(zone).iso(), end.atZone(zone).iso(), false, withPartner, note.trim().ifEmpty { null })
    }

    companion object {
        fun of(e: CalendarEvent?, day: LocalDate): Draft {
            if (e != null) {
                val s = parseInstant(e.startsAt).local().toLocalDateTime()
                val en = parseInstant(e.endsAt).local().toLocalDateTime()
                return Draft(e.title, e.allDay, e.withPartner, s, en, e.firstDay(), e.lastDay(), e.noteMd.orEmpty())
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
@OptIn(ExperimentalMaterial3Api::class)
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
    LaunchedEffect(event?.id) { vm.loadClashes(event) }

    val current = saved
    if (!editing && current != null) {
        val mine = current.authorId == session?.userId
        val author = if (mine) "you" else session?.nameOf(current.authorId) ?: "your partner"
        AlertDialog(
            onDismissRequest = onDismiss,
            title = { Text(current.title) },
            text = {
                Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Outlined.Event, null, tint = MaterialTheme.colorScheme.tertiary)
                        Spacer(Modifier.width(8.dp))
                        Text(current.whenLabel(), style = MaterialTheme.typography.bodyLarge)
                    }
                    Text(
                        "${if (current.withPartner) "For both of you" else "For ${author}"} · added by $author",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    current.noteMd?.let {
                        Surface(color = MaterialTheme.colorScheme.surfaceContainer, shape = RoundedCornerShape(8.dp)) {
                            Text(it, Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp))
                        }
                    }
                    Clashes(vm, current, onChanged)
                }
            },
            confirmButton = { Button(onClick = onDismiss) { Text("Done") } },
            dismissButton = {
                if (mine) Row {
                    TextButton(onClick = { vm.delete(current) { onChanged(); onDismiss() } }, enabled = !busy) {
                        Text("Remove", color = MaterialTheme.colorScheme.error)
                    }
                    TextButton(onClick = { draft = Draft.of(current, day); editing = true }) { Text("Edit") }
                }
            },
        )
        return
    }

    var picking by remember { mutableStateOf<String?>(null) }
    val partner = session?.partners?.firstOrNull()?.let { session.nameOf(it.userId) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (current == null) "New plan" else "Edit plan") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(
                    value = draft.title,
                    onValueChange = { draft = draft.copy(title = it.take(80)) },
                    label = { Text("What's the plan?") },
                    placeholder = { Text("Dinner with family") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                    SegmentedButton(
                        selected = !draft.withPartner,
                        onClick = { draft = draft.copy(withPartner = false) },
                        shape = SegmentedButtonDefaults.itemShape(0, 2),
                    ) { Text("Just me") }
                    SegmentedButton(
                        selected = draft.withPartner,
                        onClick = { draft = draft.copy(withPartner = true) },
                        shape = SegmentedButtonDefaults.itemShape(1, 2),
                    ) { Text(partner?.let { "Me and $it" } ?: "Both of us", maxLines = 1, overflow = TextOverflow.Ellipsis) }
                }
                Text(
                    if (draft.withPartner) "Both of your tasks are checked for clashes." else "Only your tasks are checked for clashes.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("All day", Modifier.weight(1f), style = MaterialTheme.typography.bodyLarge)
                    Switch(checked = draft.allDay, onCheckedChange = { draft = draft.copy(allDay = it) })
                }
                if (draft.allDay) {
                    WhenRow("From", formatDate(draft.startDay), null, onDate = { picking = "startDay" }, onTime = {})
                    WhenRow("Until", formatDate(draft.endDay), null, onDate = { picking = "endDay" }, onTime = {})
                } else {
                    WhenRow("Starts", formatDate(draft.start.toLocalDate()), timeOf(draft.start), onDate = { picking = "startDate" }, onTime = { picking = "startTime" })
                    WhenRow("Ends", formatDate(draft.end.toLocalDate()), timeOf(draft.end), onDate = { picking = "endDate" }, onTime = { picking = "endTime" })
                }
                OutlinedTextField(
                    value = draft.note,
                    onValueChange = { draft = draft.copy(note = it.take(2000)) },
                    label = { Text("Note (optional)") },
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        },
        confirmButton = {
            Button(
                enabled = draft.valid && !busy,
                onClick = {
                    vm.save(current?.id, draft.toInput()) { e ->
                        onChanged()
                        if (e.conflictIds.isEmpty()) onDismiss()
                        else {
                            // Stay open on the clashes, so they can be moved right away.
                            saved = e
                            editing = false
                        }
                    }
                },
            ) { Text("Save") }
        },
        dismissButton = { TextButton(onClick = { if (current == null) onDismiss() else editing = false }) { Text("Cancel") } },
    )

    when (val p = picking) {
        "startDay", "endDay", "startDate", "endDate" -> {
            val initial = when (p) {
                "startDay" -> draft.startDay
                "endDay" -> draft.endDay
                "startDate" -> draft.start.toLocalDate()
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

/**
 * The tasks a plan runs into, each sorted out its own way: kept, moved (after the plan unless changed), or called off.
 * A Dominant's choices apply at once; a sub's go out as one request.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
private fun Clashes(vm: PlanViewModel, e: CalendarEvent, onChanged: () -> Unit) {
    val items by vm.clashes.collectAsStateWithLifecycle()
    val session = vm.session ?: return
    val choices = remember { mutableStateMapOf<String, ClashChoice>() }
    val times = remember { mutableStateMapOf<String, ZonedDateTime>() }
    var reason by remember { mutableStateOf("") }
    var picking by remember { mutableStateOf<Occurrence?>(null) }
    if (items.isEmpty()) return
    val isDom = session.canManage
    val policy = session.relationship?.reschedulePolicy
    val subBlocked = !isDom && policy == ReschedulePolicy.DominantOnly
    val involved = e.withPartner || e.authorId == session.userId
    fun canMove(o: Occurrence) = !subBlocked && (isDom || o.assigneeId == session.userId)
    fun canAct(o: Occurrence) = involved || canMove(o)
    fun choiceOf(o: Occurrence) = choices[o.id]
    fun timeOf(o: Occurrence) = times[o.id] ?: afterPlan(o.dueAt, e)
    val picked = items.filter { canAct(it) && choiceOf(it) != null }
    val changed = picked.filter { choiceOf(it) != ClashChoice.Keep }
    val asks = !isDom && changed.any { choiceOf(it) == ClashChoice.Cancel || policy != ReschedulePolicy.Allowance }
    // One tap for the lot: a long plan can run into dozens of tasks.
    val actionable = items.filter { canAct(it) }
    val allMovable = actionable.all { canMove(it) }
    fun allAre(c: ClashChoice) = actionable.isNotEmpty() && actionable.all { choiceOf(it) == c }
    fun setAll(c: ClashChoice) {
        val clear = allAre(c)
        choices.clear()
        if (!clear) actionable.forEach { choices[it.id] = c }
    }

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Outlined.WarningAmber, null, tint = MaterialTheme.colorScheme.error)
            Spacer(Modifier.width(8.dp))
            Text(
                if (items.size == 1) "Overlaps a task" else "Overlaps ${items.size} tasks",
                style = MaterialTheme.typography.titleSmall,
                color = MaterialTheme.colorScheme.error,
            )
        }
        if (actionable.size > 1) {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                val all = listOf(ClashChoice.Keep to "Keep all") +
                    if (allMovable) listOf(ClashChoice.Move to "Move all after", ClashChoice.Cancel to if (isDom) "Call off all" else "Ask off all") else emptyList()
                all.forEach { (c, label) ->
                    FilterChip(
                        selected = allAre(c),
                        onClick = { setAll(c) },
                        label = { Text(label) },
                        leadingIcon = if (allAre(c)) ({ Icon(Icons.Filled.Check, null, Modifier.size(18.dp)) }) else null,
                    )
                }
            }
        }
        items.forEach { o ->
            val mine = o.assigneeId == session.userId
            Surface(color = MaterialTheme.colorScheme.surfaceContainer, shape = RoundedCornerShape(12.dp)) {
                Column(Modifier.fillMaxWidth().padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Column {
                        Text(o.title, style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(
                            "Due ${formatTime(o.dueAt)}" + if (mine) "" else " · ${session.nameOf(o.assigneeId)}",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    if (canAct(o)) {
                        val labels = listOf(ClashChoice.Keep to "Keep") +
                            if (canMove(o)) listOf(ClashChoice.Move to "Move", ClashChoice.Cancel to if (isDom) "Call off" else "Ask off") else emptyList()
                        SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                            labels.forEachIndexed { i, (c, label) ->
                                SegmentedButton(selected = choiceOf(o) == c, onClick = { choices[o.id] = c }, shape = SegmentedButtonDefaults.itemShape(i, labels.size)) { Text(label, maxLines = 1) }
                            }
                        }
                        if (choiceOf(o) == ClashChoice.Move) {
                            OutlinedButton(onClick = { picking = o }, modifier = Modifier.fillMaxWidth()) {
                                Text("New deadline: ${formatDateTime(timeOf(o).iso())}", maxLines = 1, overflow = TextOverflow.Ellipsis)
                            }
                        }
                    }
                }
            }
        }
        Text("Keep means the task is fine alongside the plan, and it stops counting as a clash.", style = MaterialTheme.typography.bodySmall)
        if (subBlocked) Text("Only your Dominant can move or call off tasks in this dynamic.", style = MaterialTheme.typography.bodySmall)
        if (picked.isNotEmpty()) {
            if (asks) OutlinedTextField(reason, { reason = it.take(1000) }, label = { Text("Reason (optional)") }, modifier = Modifier.fillMaxWidth())
            Button(
                onClick = {
                    val sent = changed.map { o ->
                        if (choiceOf(o) == ClashChoice.Cancel) PlanRescheduleItem(o.id, "cancel") else PlanRescheduleItem(o.id, "move", timeOf(o).iso())
                    }
                    val keep = picked.filter { choiceOf(it) == ClashChoice.Keep }.map { it.id }
                    vm.sortOut(e.id, keep, sent, reason) { choices.clear(); reason = ""; onChanged() }
                },
                modifier = Modifier.align(Alignment.End),
            ) { Text("${if (asks) "Ask" else "Apply"} (${picked.size})") }
        }
    }
    picking?.let { o ->
        DeadlinePicker(timeOf(o), onPicked = { times[o.id] = it; picking = null }, onDismiss = { picking = null })
    }
}
