package app.obey.ui.tasks

import androidx.compose.foundation.border
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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.KeyboardArrowDown
import androidx.compose.material.icons.outlined.KeyboardArrowUp
import androidx.compose.material.icons.outlined.Layers
import androidx.compose.material3.AlertDialog
import app.obey.ui.common.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.LinkInteractionListener
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.withLink
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.obey.api.Weekday
import app.obey.recurrence.RepeatKind
import app.obey.recurrence.describe
import app.obey.recurrence.weekday
import app.obey.ui.common.Diamond
import app.obey.ui.common.DiamondState
import app.obey.ui.common.ErrorBox
import app.obey.ui.common.LettersChip
import app.obey.ui.common.LettersField
import app.obey.ui.common.Load
import app.obey.ui.common.LoadingBox
import app.obey.ui.common.LocalFeatures
import app.obey.ui.common.MessageEffect
import app.obey.ui.notes.MarkdownField
import app.obey.ui.notes.MarkdownToolbar
import app.obey.ui.onboarding.label
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import kotlin.math.abs

/** The part of the sentence that's open below it. */
private enum class Panel { Title, Who, Often, Count, Time, Start, Points, Missed }

private val WEEKDAYS_ONLY = setOf(Weekday.MO, Weekday.TU, Weekday.WE, Weekday.TH, Weekday.FR)
private val TIMES = listOf(LocalTime.of(20, 0), LocalTime.of(21, 0), LocalTime.of(22, 0))
private val dayFmt = DateTimeFormatter.ofPattern("EEE MMM d")

/** "Daily" → "every day": the summary as it reads in the middle of a sentence. */
private fun oftenPhrase(summary: String): String {
    val s = summary.replace(Regex("^Daily\\b"), "Every day").replace(Regex("^Weekly\\b"), "Every week").replace(Regex("^Monthly\\b"), "Every month")
    return s.replaceFirstChar { it.lowercase() }
}

private fun dayPhrase(d: LocalDate): String = when (d) {
    LocalDate.now() -> "today"
    LocalDate.now().plusDays(1) -> "tomorrow"
    else -> d.format(dayFmt)
}

/** The editor (mockups 04, 52 and 53): the task as one sentence with tappable parts, then what else it asks. */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun TaskEditorScreen(onDone: () -> Unit, onKits: (() -> Unit)? = null, vm: TaskEditorViewModel = hiltViewModel()) {
    val data by vm.data.collectAsStateWithLifecycle()
    val form by vm.form.collectAsStateWithLifecycle()
    val busy by vm.busy.collectAsStateWithLifecycle()
    val message by vm.message.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    MessageEffect(message, snackbar, vm::messageShown)
    LaunchedEffect(Unit) { vm.done.collect { onDone() } }

    var panel by rememberSaveable { mutableStateOf(if (vm.isNew) Panel.Title else null) }
    var howOften by remember { mutableStateOf(false) }
    var pickDate by remember { mutableStateOf(false) }
    var pickTime by remember { mutableStateOf(false) }
    var pickConsequenceTime by remember { mutableStateOf(false) }
    var pickZone by remember { mutableStateOf(false) }
    var showSteps by rememberSaveable { mutableStateOf<Boolean?>(null) }
    var showPlace by rememberSaveable { mutableStateOf<Boolean?>(null) }
    // The details field keeps its own selection; it's seeded once the task has loaded.
    var details by remember { mutableStateOf(TextFieldValue("")) }
    var detailsFocused by remember { mutableStateOf(false) }
    LaunchedEffect(data is Load.Ready) {
        if (data is Load.Ready) details = TextFieldValue(form.bodyMd, TextRange(form.bodyMd.length))
    }
    val timeFmt = DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT)
    val toggle = { p: Panel -> panel = if (panel == p) null else p }

    Scaffold(
        topBar = {
            Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.weight(1f)) {
                    TextButton(onClick = onDone) { Text("Cancel", style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                }
                Text(if (vm.isNew) "New task" else "Edit task", style = MaterialTheme.typography.titleMedium)
                Box(Modifier.weight(1f), contentAlignment = Alignment.CenterEnd) {
                    if (vm.isNew && onKits != null) IconButton(onClick = onKits) { Icon(Icons.Outlined.Layers, "Start from a kit") }
                }
            }
        },
        bottomBar = {
            val d = data
            if (d is Load.Ready) {
                val mine = form.assigneeId == vm.myId
                val who = d.value.members.firstOrNull { it.userId == form.assigneeId }?.displayName ?: "them"
                Button(
                    onClick = vm::save,
                    enabled = !busy,
                    shape = MaterialTheme.shapes.small,
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.onSurface, contentColor = MaterialTheme.colorScheme.surface),
                    modifier = Modifier.fillMaxWidth().navigationBarsPadding().imePadding().padding(16.dp).height(52.dp),
                ) {
                    Text(if (!vm.isNew) "Save" else if (mine || d.value.members.size == 1) "Add it" else "Give to $who")
                }
            }
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        when (val d = data) {
            Load.Loading -> LoadingBox(Modifier.padding(padding))
            is Load.Failed -> ErrorBox(d.message, vm::load, Modifier.padding(padding))
            is Load.Ready -> Box(Modifier.padding(padding).fillMaxSize(), contentAlignment = Alignment.TopCenter) {
                val features = LocalFeatures.current
                val members = d.value.members
                val solo = members.size == 1
                val mine = form.assigneeId == vm.myId
                val assignee = members.firstOrNull { it.userId == form.assigneeId }
                val who = if (mine) "You" else assignee?.displayName ?: "Someone"
                val steps = showSteps ?: form.steps.isNotEmpty()
                val place = showPlace ?: (form.placeId != null)
                val schedule = form.recurrence.toSchedule(form.start)
                val once = form.recurrence.kind == RepeatKind.Once && form.recurrence.passthrough == null
                val consequence = d.value.consequences.firstOrNull { it.id == form.consequenceId }
                val pts = form.points.toIntOrNull() ?: 0
                val penalty = form.missPenalty.toIntOrNull() ?: 0
                val (cMin, cMax) = form.countBounds
                val bounds = when {
                    cMin != null && cMax != null -> if (cMin == cMax) "$cMin times" else "$cMin to $cMax times"
                    cMin != null -> "at least $cMin times"
                    else -> "no more than $cMax times"
                }
                val missed = listOfNotNull(
                    if (features.points && penalty != 0) "−$penalty points" else null,
                    if (features.consequences) consequence?.title else null,
                ).joinToString(" and ").ifEmpty { "nothing happens" }

                Column(
                    Modifier
                        .widthIn(max = 640.dp)
                        .fillMaxWidth()
                        .verticalScroll(rememberScrollState())
                        .imePadding()
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                ) {
                    val parts = buildList<Any> {
                        if (!solo && members.size > 1) add(Panel.Who to who) else add(who)
                        add(" will ")
                        add(Panel.Title to form.title.ifBlank { "do what" })
                        if (form.counted) { add(" "); add(Panel.Count to bounds) }
                        val quick = form.quick
                        if (quick != null) {
                            add(" "); add(Panel.Time to "in ${quickLabel(quick)}"); add(".")
                        } else {
                            add(" "); add(Panel.Often to if (once) "once" else oftenPhrase(describe(schedule)))
                            add(" by "); add(Panel.Time to if (form.allDay) "the end of the day" else form.dueTime.format(timeFmt))
                            add(if (once) (if (form.start == LocalDate.now() || form.start == LocalDate.now().plusDays(1)) ", " else ", on ") else ", starting ")
                            add(Panel.Start to dayPhrase(form.start)); add(".")
                        }
                        if (features.points) { add(" It's worth "); add(Panel.Points to "$pts point${if (abs(pts) == 1) "" else "s"}"); add(".") }
                        if (features.points || features.consequences) { add(" If it's missed, "); add(Panel.Missed to missed); add(".") }
                    }
                    Sentence(parts, panel, muted = form.title.isBlank(), onSlot = toggle)

                    panel?.let { open ->
                        Column(
                            Modifier
                                .padding(top = 16.dp)
                                .fillMaxWidth()
                                .border(1.dp, MaterialTheme.colorScheme.outlineVariant, MaterialTheme.shapes.medium)
                                .padding(horizontal = 16.dp, vertical = 4.dp),
                        ) {
                            val close = { panel = null }
                            when (open) {
                                Panel.Title -> {
                                    val focus = remember { FocusRequester() }
                                    LaunchedEffect(Unit) { focus.requestFocus() }
                                    LettersField(
                                        value = form.title,
                                        onValueChange = { v -> vm.update { it.copy(title = v.take(200)) } },
                                        label = { Text("What they'll do") },
                                        placeholder = { Text("Write lines") },
                                        singleLine = true,
                                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                                        keyboardActions = KeyboardActions(onDone = { close() }),
                                        modifier = Modifier.fillMaxWidth().padding(vertical = 12.dp).focusRequester(focus),
                                    )
                                }
                                Panel.Who -> members.forEach { m ->
                                    PanelRow(if (m.userId == vm.myId) "You" else m.displayName, form.assigneeId == m.userId, m.role.label.lowercase()) {
                                        vm.update { it.copy(assigneeId = m.userId) }; close()
                                    }
                                }
                                Panel.Often -> {
                                    val r = form.recurrence
                                    fun pick(kind: RepeatKind, weekdays: Set<Weekday> = emptySet()) {
                                        vm.update { it.copy(recurrence = r.copy(kind = kind, interval = 1, weekdays = weekdays, afterCompletion = false, passthrough = null), counted = false) }
                                        close()
                                    }
                                    val plain = r.passthrough == null && !r.afterCompletion && r.interval == 1
                                    val daily = plain && r.kind == RepeatKind.Daily
                                    val weekdays = plain && r.kind == RepeatKind.Weekly && r.weekdays == WEEKDAYS_ONLY
                                    val startDay = form.start.weekday()
                                    val weekly = plain && r.kind == RepeatKind.Weekly && (r.weekdays.isEmpty() || r.weekdays == setOf(startDay))
                                    val preset = once || daily || weekdays || weekly
                                    PanelRow("Once", once) { pick(RepeatKind.Once) }
                                    PanelRow("Every day", daily) { pick(RepeatKind.Daily) }
                                    PanelRow("Weekdays", weekdays) { pick(RepeatKind.Weekly, WEEKDAYS_ONLY) }
                                    PanelRow("Every ${form.start.dayOfWeek.getDisplayName(java.time.format.TextStyle.FULL, java.util.Locale.getDefault())}", weekly) {
                                        pick(RepeatKind.Weekly, setOf(startDay))
                                    }
                                    PanelRow(if (preset) "Something else…" else describe(schedule), !preset) { close(); howOften = true }
                                    if (form.placeId == null) {
                                        PanelRow(if (form.counted) "Stop counting" else "Count it instead…", false, last = true) {
                                            if (form.counted) {
                                                vm.update { it.copy(counted = false) }; close()
                                            } else {
                                                vm.update { it.copy(counted = true, steps = emptyList()) }; showSteps = false; panel = Panel.Count
                                            }
                                        }
                                    }
                                }
                                Panel.Count -> Column(Modifier.padding(vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                        CountKind.entries.forEach { k -> LettersChip(k.label, form.countKind == k, { vm.update { it.copy(countKind = k) } }) }
                                    }
                                    Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                                        LettersField(
                                            value = form.countN,
                                            onValueChange = { v -> vm.update { it.copy(countN = v.filter(Char::isDigit).take(4)) } },
                                            label = { Text(if (form.countKind == CountKind.Range) "At least" else "Count") },
                                            singleLine = true,
                                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                            modifier = Modifier.weight(1f),
                                        )
                                        if (form.countKind == CountKind.Range) {
                                            LettersField(
                                                value = form.countTo,
                                                onValueChange = { v -> vm.update { it.copy(countTo = v.filter(Char::isDigit).take(4)) } },
                                                label = { Text("At most") },
                                                singleLine = true,
                                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                                modifier = Modifier.weight(1f),
                                            )
                                        } else {
                                            Spacer(Modifier.weight(1f))
                                        }
                                    }
                                    if (features.points) {
                                        ChoiceRow("Points", if (form.countPer == "count") "Per count" else "Per task", listOf(
                                            "Per task" to { vm.update { it.copy(countPer = "task") } },
                                            "Per count" to { vm.update { it.copy(countPer = "count") } },
                                        ))
                                    }
                                    if (form.atMost) Note("\"At most\" is checked at the deadline, so it can't ask for a photo, a mood or an entry.")
                                    PanelDone(close)
                                }
                                Panel.Time -> Column(Modifier.padding(vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                                    if (vm.isNew) {
                                        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                            QUICK.forEach { m -> LettersChip("In ${quickLabel(m)}", form.quick == m, { vm.update { it.quickDeadline(m) }; close() }) }
                                        }
                                    }
                                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                        TIMES.forEach { t ->
                                            LettersChip(t.format(timeFmt), form.quick == null && !form.allDay && form.dueTime == t, {
                                                vm.update { it.copy(quick = null, allDay = false, dueTime = t) }; close()
                                            })
                                        }
                                        LettersChip("All day", form.quick == null && form.allDay, { vm.update { it.copy(quick = null, allDay = true) }; close() })
                                        LettersChip(
                                            if (form.quick == null && !form.allDay && form.dueTime !in TIMES) form.dueTime.format(timeFmt) else "Other…",
                                            form.quick == null && !form.allDay && form.dueTime !in TIMES,
                                            { vm.update { it.copy(quick = null, allDay = false) }; pickTime = true },
                                        )
                                    }
                                    if (form.quick != null && !mine) Note("$who gets a push right away and a countdown on Today.")
                                }
                                Panel.Start -> Column(Modifier.padding(vertical = 12.dp)) {
                                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                        val today = LocalDate.now()
                                        LettersChip("Today", form.start == today, { vm.update { it.copy(start = today) }; close() })
                                        LettersChip("Tomorrow", form.start == today.plusDays(1), { vm.update { it.copy(start = today.plusDays(1)) }; close() })
                                        val other = form.start != today && form.start != today.plusDays(1)
                                        LettersChip(if (other) form.start.format(dayFmt) else "Pick a day…", other, { pickDate = true })
                                    }
                                }
                                Panel.Points -> Column(Modifier.padding(vertical = 12.dp)) {
                                    Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                                        NumberField("Points if done", form.points, Modifier.weight(1f)) { v -> vm.update { it.copy(points = v) } }
                                        NumberField("Lost if missed", form.missPenalty, Modifier.weight(1f)) { v -> vm.update { it.copy(missPenalty = v) } }
                                    }
                                    PanelDone(close)
                                }
                                Panel.Missed -> {
                                    if (features.points) {
                                        NumberField("Points lost", form.missPenalty, Modifier.padding(vertical = 12.dp).widthIn(max = 180.dp)) { v -> vm.update { it.copy(missPenalty = v) } }
                                        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                                    }
                                    if (features.consequences) {
                                        PanelRow("No consequence", form.consequenceId == null) { vm.update { it.copy(consequenceId = null) } }
                                        d.value.consequences.forEach { c -> PanelRow(c.title, form.consequenceId == c.id) { vm.update { it.copy(consequenceId = c.id) } } }
                                        if (form.consequenceId != null) {
                                            Row(Modifier.padding(vertical = 12.dp), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                                                ChoiceRow(
                                                    "Due",
                                                    dueDaysLabel(form.consequenceDueDays),
                                                    (listOf(0, 1, 2, 3, 7) + form.consequenceDueDays).distinct().sorted().map { n -> dueDaysLabel(n) to { vm.update { it.copy(consequenceDueDays = n) } } },
                                                    Modifier.weight(1f),
                                                )
                                                ChoiceRow(
                                                    "By",
                                                    form.consequenceDueTime?.format(timeFmt) ?: "Any time that day",
                                                    listOf(
                                                        "Any time that day" to { vm.update { it.copy(consequenceDueTime = null) } },
                                                        "Pick a time…" to { pickConsequenceTime = true },
                                                    ),
                                                    Modifier.weight(1f),
                                                )
                                            }
                                        }
                                    }
                                    PanelDone(close)
                                }
                            }
                        }
                    }

                    Eyebrow("Also")
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        if (!solo) LettersChip("I approve it", form.approvalRequired, { vm.update { it.copy(approvalRequired = !it.approvalRequired) } }, check = true)
                        if (!form.atMost && form.placeId == null) {
                            LettersChip("Ask for a photo", form.proofRequired, { vm.update { it.copy(proofRequired = !it.proofRequired) } }, check = true)
                        }
                        if (!form.counted && form.placeId == null) {
                            LettersChip("Steps", steps, {
                                if (steps) { showSteps = false; vm.update { it.copy(steps = emptyList()) } } else showSteps = true
                            }, check = true)
                        }
                        if (!form.atMost && form.placeId == null) {
                            LettersChip("Mood check-in", form.askMood, { vm.update { it.copy(askMood = !it.askMood) } }, check = true)
                            if (features.journal || form.asksJournal) LettersChip("Journal task", form.asksJournal, { vm.update { it.copy(asksJournal = !it.asksJournal) } }, check = true)
                        }
                        if (!form.allDay && form.quick == null) {
                            LettersChip("Can be done early", form.windowMinutes != null, { vm.update { it.copy(windowMinutes = if (it.windowMinutes != null) null else 120) } }, check = true)
                        }
                        if ((features.location || form.placeId != null) && !form.counted && form.steps.isEmpty()) {
                            LettersChip("Be somewhere", place, {
                                if (place) { showPlace = false; vm.update { it.copy(placeId = null, stayMinutes = null) } } else showPlace = true
                            }, check = true)
                        }
                        LettersChip("Remind in my words", form.reminder == "custom", {
                            vm.update { it.copy(reminder = if (it.reminder == "custom") "default" else "custom") }
                        }, check = true)
                    }

                    Eyebrow(if (mine) "Details" else "Details $who reads")
                    Column(Modifier.onFocusChanged { detailsFocused = it.hasFocus }) {
                        // The formatting bar shows only while writing, so the details read as plain text otherwise.
                        if (detailsFocused) MarkdownToolbar(details, { v -> details = v; vm.update { it.copy(bodyMd = v.text) } })
                        MarkdownField(
                            details,
                            { v -> details = v; vm.update { it.copy(bodyMd = v.text) } },
                            Modifier.fillMaxWidth().heightIn(min = 56.dp).padding(vertical = 12.dp),
                            placeholder = "What to do, and why it matters",
                        )
                        HorizontalDivider(color = if (detailsFocused) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.outlineVariant)
                    }

                    if (steps && !form.counted && form.placeId == null) StepsSection(form.steps) { s -> vm.update { it.copy(steps = s) } }
                    if (place && !form.counted) PlaceSection(form, members) { change -> vm.update(change) }

                    Eyebrow("Timing")
                    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                        if (!form.allDay && form.quick == null) {
                            ChoiceRow(
                                "Can be done",
                                windowLabel(form.windowMinutes),
                                (WINDOWS + form.windowMinutes).distinct().map { m -> windowLabel(m) to { vm.update { it.copy(windowMinutes = m) } } },
                            )
                        }
                        ValueRow("Time zone", zoneName(form.timezone) + if (form.timezone == ZoneId.systemDefault().id) " (this phone)" else "") { pickZone = true }
                        if (form.quick == null) {
                            val grace = form.effectiveGrace
                            val dueMinutes = if (form.allDay) 24 * 60 else form.dueTime.hour * 60 + form.dueTime.minute
                            ChoiceRow(
                                "Missed after",
                                graceLabel(form.grace, form.allDay),
                                Grace.entries.filter { !(form.allDay && it == Grace.Midnight) }.map { g ->
                                    graceLabel(g, form.allDay) to {
                                        vm.update { it.copy(grace = g, graceMinutes = if (g == Grace.Custom && it.grace != Grace.Custom) (it.effectiveGrace.takeIf { m -> m > 0 } ?: 30).toString() else it.graceMinutes) }
                                    }
                                },
                            )
                            if (form.grace == Grace.Custom) {
                                NumberField("Minutes late", form.graceMinutes, Modifier.widthIn(max = 180.dp)) { v -> vm.update { it.copy(graceMinutes = v) } }
                            }
                            if (grace > 0) Note("Missed at ${clockAfter(dueMinutes + grace, timeFmt)}")
                        }
                    }

                    Reminders(form, members) { change -> vm.update(change) }
                    Spacer(Modifier.height(24.dp))
                }
            }
        }
    }

    if (howOften) {
        ModalBottomSheet(onDismissRequest = { howOften = false }, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
            Column(Modifier.padding(horizontal = 24.dp).padding(bottom = 24.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Text("How often", style = MaterialTheme.typography.headlineLarge)
                RecurrencePicker(form.recurrence, form.start, onChange = { r -> vm.update { it.copy(recurrence = r, quick = null) } }, weekStart = vm.weekStart)
                Button(
                    onClick = { howOften = false },
                    shape = MaterialTheme.shapes.small,
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.onSurface, contentColor = MaterialTheme.colorScheme.surface),
                    modifier = Modifier.fillMaxWidth().height(52.dp),
                ) { Text("Done") }
            }
        }
    }

    if (pickZone) {
        var query by remember { mutableStateOf("") }
        val zones = remember { ZoneId.getAvailableZoneIds().filter { "/" in it && !it.startsWith("Etc/") }.sorted() }
        AlertDialog(
            onDismissRequest = { pickZone = false },
            title = { Text("Time zone") },
            text = {
                Column {
                    LettersField(query, { query = it }, label = { Text("Search") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    LazyColumn(Modifier.heightIn(max = 360.dp)) {
                        items(zones.filter { it.replace('_', ' ').contains(query.trim(), ignoreCase = true) }) { z ->
                            Column(
                                Modifier.fillMaxWidth().clickable {
                                    vm.update { it.copy(timezone = z) }
                                    pickZone = false
                                }.padding(vertical = 12.dp),
                            ) {
                                Text(zoneName(z), style = MaterialTheme.typography.bodyLarge)
                                Text(z.substringBefore('/'), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                        }
                    }
                }
            },
            confirmButton = { TextButton(onClick = { pickZone = false }) { Text("Cancel") } },
        )
    }

    if (pickDate) {
        val state = rememberDatePickerState(
            initialSelectedDateMillis = form.start.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli(),
        )
        DatePickerDialog(
            onDismissRequest = { pickDate = false },
            confirmButton = {
                TextButton(onClick = {
                    state.selectedDateMillis?.let { ms ->
                        val date = Instant.ofEpochMilli(ms).atZone(ZoneOffset.UTC).toLocalDate()
                        vm.update { it.copy(start = date) }
                    }
                    pickDate = false
                    panel = null
                }) { Text("OK") }
            },
            dismissButton = { TextButton(onClick = { pickDate = false }) { Text("Cancel") } },
        ) { DatePicker(state = state) }
    }

    if (pickTime) {
        val state = rememberTimePickerState(initialHour = form.dueTime.hour, initialMinute = form.dueTime.minute)
        AlertDialog(
            onDismissRequest = { pickTime = false },
            title = { Text("Due time") },
            text = { TimePicker(state = state) },
            confirmButton = {
                Button(onClick = {
                    vm.update { it.copy(dueTime = LocalTime.of(state.hour, state.minute)) }
                    pickTime = false
                    panel = null
                }) { Text("OK") }
            },
            dismissButton = { TextButton(onClick = { pickTime = false }) { Text("Cancel") } },
        )
    }

    if (pickConsequenceTime) {
        val state = rememberTimePickerState(initialHour = form.consequenceDueTime?.hour ?: 21, initialMinute = form.consequenceDueTime?.minute ?: 0)
        AlertDialog(
            onDismissRequest = { pickConsequenceTime = false },
            title = { Text("Consequence due by") },
            text = { TimePicker(state = state) },
            confirmButton = {
                Button(onClick = {
                    vm.update { it.copy(consequenceDueTime = LocalTime.of(state.hour, state.minute)) }
                    pickConsequenceTime = false
                }) { Text("OK") }
            },
            dismissButton = { TextButton(onClick = { pickConsequenceTime = false }) { Text("Cancel") } },
        )
    }
}

/**
 * The serif sentence. [parts] are plain strings and `Panel to text` pairs; each pair is a tappable part with an accent
 * underline, tinted while its panel is open.
 */
@Composable
private fun Sentence(parts: List<Any>, open: Panel?, muted: Boolean, onSlot: (Panel) -> Unit) {
    val c = MaterialTheme.colorScheme
    val ranges = mutableListOf<Pair<Int, Int>>()
    val text = buildAnnotatedString {
        parts.forEach { p ->
            if (p is Pair<*, *>) {
                val key = p.first as Panel
                val start = length
                val tint = if (open == key) c.primaryContainer else Color.Unspecified
                val color = if (key == Panel.Title && muted) c.onSurfaceVariant else Color.Unspecified
                withLink(LinkAnnotation.Clickable(key.name, TextLinkStyles(SpanStyle(background = tint, color = color)), LinkInteractionListener { onSlot(key) })) {
                    append(p.second as String)
                }
                ranges += start to length
            } else {
                append(p as String)
            }
        }
    }
    var layout by remember { mutableStateOf<TextLayoutResult?>(null) }
    val line = c.primary
    Text(
        text,
        style = MaterialTheme.typography.headlineLarge.copy(fontSize = 34.sp, lineHeight = 44.sp),
        onTextLayout = { layout = it },
        modifier = Modifier.fillMaxWidth().drawBehind {
            val l = layout ?: return@drawBehind
            val stroke = 1.5.dp.toPx()
            val gap = 4.dp.toPx()
            ranges.forEach { (s, e) ->
                if (e <= s) return@forEach
                val first = l.getLineForOffset(s)
                val last = l.getLineForOffset(e - 1)
                for (i in first..last) {
                    val x0 = if (i == first) l.getHorizontalPosition(s, true) else l.getLineLeft(i)
                    val x1 = if (i == last) l.getHorizontalPosition(e, true) else l.getLineRight(i)
                    val y = l.getLineBottom(i) - gap
                    drawLine(line, Offset(x0, y), Offset(x1, y), stroke)
                }
            }
        },
    )
}

@Composable
private fun PanelRow(label: String, on: Boolean, sub: String? = null, last: Boolean = false, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(label, style = MaterialTheme.typography.bodyLarge, color = if (on) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant)
            if (sub != null) Text(sub, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (on) Diamond(DiamondState.Owed, size = 12.dp, modifier = Modifier.padding(end = 4.dp))
    }
    if (!last) HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
}

@Composable
private fun PanelDone(onClick: () -> Unit) {
    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.CenterEnd) { TextButton(onClick = onClick) { Text("Done") } }
}

@Composable
private fun Eyebrow(text: String) = app.obey.ui.common.Eyebrow(text, Modifier.padding(top = 32.dp, bottom = 12.dp))

@Composable
private fun Note(text: String) {
    Text(text, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
}

/** A Letters value: small label above, the value, a hairline under it; tapping does [onClick]. */
@Composable
private fun ValueRow(label: String, value: String, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Column(modifier.fillMaxWidth().clickable(onClick = onClick)) {
        Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Row(Modifier.padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(value, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
            Icon(Icons.Outlined.KeyboardArrowDown, null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(20.dp))
        }
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
    }
}

/** A [ValueRow] that opens a menu of [options]. */
@Composable
private fun ChoiceRow(label: String, value: String, options: List<Pair<String, () -> Unit>>, modifier: Modifier = Modifier) {
    var open by remember { mutableStateOf(false) }
    Box(modifier) {
        ValueRow(label, value) { open = true }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            options.forEach { (text, run) -> DropdownMenuItem(text = { Text(text) }, onClick = { open = false; run() }) }
        }
    }
}

private fun dueDaysLabel(n: Int) = when (n) {
    0 -> "Same day"
    1 -> "Next day"
    else -> "$n days later"
}

private fun graceLabel(g: Grace, allDay: Boolean) = when (g) {
    Grace.None -> if (allDay) "Right at midnight" else "Right at the due time"
    Grace.Quarter -> "15 min late"
    Grace.Hour -> "1 hour late"
    Grace.Midnight -> "Midnight"
    Grace.Custom -> "Other"
}

@Composable
fun LabeledSwitch(title: String, subtitle: String?, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyLarge)
            if (subtitle != null) {
                Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        Switch(checked = checked, onCheckedChange = onChange)
    }
}

@Composable
fun NumberField(label: String, value: String, modifier: Modifier = Modifier, onChange: (String) -> Unit) {
    LettersField(
        value = value,
        onValueChange = { v -> if (v.isEmpty() || v == "-" || v.matches(Regex("-?\\d{0,6}"))) onChange(v) },
        label = { Text(label) },
        isError = value.toIntOrNull() == null,
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
        modifier = modifier,
    )
}

private val WINDOWS = listOf<Int?>(null, 15, 30, 60, 120, 240)

private fun windowLabel(m: Int?) = when {
    m == null -> "Any time that day"
    m < 60 -> "Up to $m min early"
    m == 60 -> "Up to 1 hour early"
    else -> "Up to ${m / 60} hours early"
}

/** A ritual's steps: done in order, one at a time, from the run sheet. A task with none is an ordinary task. */
@Composable
private fun StepsSection(steps: List<app.obey.api.TaskStep>, onChange: (List<app.obey.api.TaskStep>) -> Unit) {
    var draft by rememberSaveable { mutableStateOf("") }
    fun add() {
        val title = draft.trim()
        if (title.isEmpty() || steps.size >= 30) return
        onChange(steps + app.obey.api.TaskStep(java.util.UUID.randomUUID().toString().take(8), title))
        draft = ""
    }
    Eyebrow("Steps")
    steps.forEachIndexed { i, s ->
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("${i + 1}.", style = MaterialTheme.typography.bodyLarge, modifier = Modifier.padding(end = 8.dp))
            androidx.compose.foundation.text.BasicTextField(
                value = s.title,
                onValueChange = { v -> onChange(steps.map { if (it.id == s.id) it.copy(title = v.take(200)) else it }) },
                singleLine = true,
                textStyle = MaterialTheme.typography.bodyLarge.copy(color = MaterialTheme.colorScheme.onSurface),
                cursorBrush = androidx.compose.ui.graphics.SolidColor(MaterialTheme.colorScheme.onSurface),
                modifier = Modifier.weight(1f).padding(vertical = 14.dp),
            )
            IconButton(onClick = { onChange(steps.toMutableList().apply { add(i - 1, removeAt(i)) }) }, enabled = i > 0) {
                Icon(Icons.Outlined.KeyboardArrowUp, "Move step ${i + 1} up")
            }
            IconButton(onClick = { onChange(steps.toMutableList().apply { add(i + 1, removeAt(i)) }) }, enabled = i < steps.lastIndex) {
                Icon(Icons.Outlined.KeyboardArrowDown, "Move step ${i + 1} down")
            }
            IconButton(onClick = { onChange(steps.filter { it.id != s.id }) }) { Icon(Icons.Outlined.Close, "Remove step ${i + 1}") }
        }
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
    }
    if (steps.size < 30) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("+ ", style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.primary)
            Box(Modifier.weight(1f).padding(vertical = 14.dp)) {
                if (draft.isEmpty()) Text("Add a step", style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.primary)
                androidx.compose.foundation.text.BasicTextField(
                    value = draft,
                    onValueChange = { draft = it.take(200) },
                    singleLine = true,
                    textStyle = MaterialTheme.typography.bodyLarge.copy(color = MaterialTheme.colorScheme.onSurface),
                    cursorBrush = androidx.compose.ui.graphics.SolidColor(MaterialTheme.colorScheme.onSurface),
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                    keyboardActions = KeyboardActions(onDone = { add() }),
                    modifier = Modifier.fillMaxWidth().onFocusChanged { if (!it.isFocused) add() },
                )
            }
        }
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
    }
}

private fun zoneName(id: String) = id.substringAfterLast('/').replace('_', ' ')

/** "9:15 PM", "midnight", or a time "the next day" once it passes midnight. */
private fun clockAfter(minutes: Int, fmt: DateTimeFormatter): String {
    if (minutes == 24 * 60) return "midnight"
    val t = LocalTime.of((minutes / 60) % 24, minutes % 60).format(fmt)
    return if (minutes > 24 * 60) "$t the next day" else t
}

private val REMINDERS = listOf("default" to "Fealty's", "custom" to "In my words", "none" to "None")

/** The push before it's due: Fealty's discreet one, the Dominant's own words, or none at all. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Reminders(form: TaskForm, members: List<app.obey.api.Member>, update: ((TaskForm) -> TaskForm) -> Unit) {
    val member = members.firstOrNull { it.userId == form.assigneeId }
    val who = member?.displayName ?: "They"
    Eyebrow("Reminders")
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        REMINDERS.forEach { (value, label) -> LettersChip(label, form.reminder == value, { update { it.copy(reminder = value) } }) }
    }
    if (form.reminder == "custom") {
        LettersField(
            form.reminderText,
            { v -> update { it.copy(reminderText = v.take(140)) } },
            placeholder = { Text("“Lines, pet. Neatly.”") },
            modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
        )
        if (member?.notifyDetails != true && members.size > 1) Note("$who keeps notifications discreet, so they'll see \"A task is due soon\".")
    }
}

private val STAYS = listOf<Int?>(null, 30, 45, 60, 90, 120)

/** A location task: done by getting to a place by the due time, and staying a while if it says so. */
@Composable
private fun PlaceSection(form: TaskForm, members: List<app.obey.api.Member>, update: ((TaskForm) -> TaskForm) -> Unit) {
    val location: app.obey.ui.location.LocationViewModel = hiltViewModel()
    val places by location.places.collectAsStateWithLifecycle()
    val busy by location.busy.collectAsStateWithLifecycle()
    val saved by location.saved.collectAsStateWithLifecycle()
    var adding by remember { mutableStateOf(false) }
    LaunchedEffect(saved) {
        saved?.let { p -> update { it.copy(placeId = p.id) }; location.savedSeen() }
    }
    val assignee = members.firstOrNull { it.userId == form.assigneeId }
    val name = assignee?.displayName ?: "They"
    // A place can only be set once the assignee's phone can notice arrivals; one already set stays editable.
    val ready = assignee?.locationStatus == app.obey.api.LocationStatus.Ready || form.placeId != null
    val place = places?.firstOrNull { it.id == form.placeId }
    Eyebrow("Be somewhere")
    if (!ready) {
        Note("$name hasn't allowed location on Android yet.")
        if (assignee != null) OutlinedButton(onClick = { location.ask(name) }, enabled = !busy, modifier = Modifier.padding(top = 12.dp)) { Text("Ask $name to set it up") }
    } else {
        Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
            ChoiceRow(
                "Place",
                place?.name ?: "Choose a place",
                places.orEmpty().map { p -> p.name to { update { it.copy(placeId = p.id) } } } + ("Add a place…" to { adding = true }),
            )
            if (form.placeId != null) {
                ChoiceRow(
                    "Stay at least",
                    form.stayMinutes?.let { app.obey.ui.location.stayLabel(it) } ?: "Done on arrival",
                    (STAYS + form.stayMinutes).distinct().map { m -> (m?.let { app.obey.ui.location.stayLabel(it) } ?: "Done on arrival") to { update { it.copy(stayMinutes = m) } } },
                )
            }
        }
    }
    if (adding) app.obey.ui.location.PlaceEditor(location, null, busy) { adding = false }
}
