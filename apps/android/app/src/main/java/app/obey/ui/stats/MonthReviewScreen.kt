package app.obey.ui.stats

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.Event
import androidx.compose.material.icons.outlined.Flag
import androidx.compose.material.icons.outlined.HourglassTop
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role as SemanticsRole
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.compose.ui.graphics.ImageBitmap
import android.graphics.BitmapFactory
import androidx.compose.ui.graphics.asImageBitmap
import app.obey.api.MonthFocus
import app.obey.api.MonthFocusInput
import app.obey.api.MonthReview
import app.obey.api.MonthReviewInput
import app.obey.api.MonthSummary
import app.obey.api.ObeyApi
import app.obey.api.PastMonth
import app.obey.api.Role
import app.obey.api.Task
import app.obey.data.Session
import app.obey.data.SessionRepository
import app.obey.ui.common.Avatar
import app.obey.ui.common.BaseViewModel
import app.obey.ui.common.EmptyBox
import app.obey.ui.common.ErrorBox
import app.obey.ui.common.Load
import app.obey.ui.common.LoadingBox
import app.obey.ui.common.MenuButton
import app.obey.ui.common.MessageEffect
import app.obey.ui.common.SafeWordAction
import app.obey.ui.common.SettingsAction
import app.obey.ui.common.loadCatching
import app.obey.ui.common.local
import app.obey.ui.common.moodIcon
import app.obey.ui.common.parseInstant
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.LocalDate
import java.time.YearMonth
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import javax.inject.Inject
import kotlin.math.roundToInt
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private fun zone() = ZoneId.systemDefault().id
private fun currentMonth() = YearMonth.now().toString()
private fun ym(month: String) = YearMonth.parse(month)
private fun monthName(month: String, year: Boolean = false) = ym(month).format(DateTimeFormatter.ofPattern(if (year) "MMMM yyyy" else "MMMM"))
private fun nextMonth(month: String) = ym(month).plusMonths(1).toString()
private fun prevMonth(month: String) = ym(month).minusMonths(1).toString()
private fun shortDate(date: String) = LocalDate.parse(date).format(DateTimeFormatter.ofPattern("MMM d"))
private fun pct(rate: Double?) = rate?.let { "${(it * 100).roundToInt()}%" } ?: "–"

@HiltViewModel
class MonthReviewViewModel @Inject constructor(private val api: ObeyApi, private val sessions: SessionRepository) : BaseViewModel() {
    val session get() = sessions.session
    private val _month = MutableStateFlow(currentMonth())
    val month: StateFlow<String> = _month.asStateFlow()
    private val _state = MutableStateFlow<Load<MonthSummary>>(Load.Loading)
    val state: StateFlow<Load<MonthSummary>> = _state.asStateFlow()
    private val _past = MutableStateFlow<List<PastMonth>>(emptyList())
    val past: StateFlow<List<PastMonth>> = _past.asStateFlow()
    private val _tasks = MutableStateFlow<List<Task>>(emptyList())
    val tasks: StateFlow<List<Task>> = _tasks.asStateFlow()
    /** Next month's focus, which the Dominant sets from here once the review is open. */
    private val _next = MutableStateFlow<Load<MonthSummary>>(Load.Loading)
    val next: StateFlow<Load<MonthSummary>> = _next.asStateFlow()

    fun load(month: String = _month.value) {
        if (month != _month.value) _state.value = Load.Loading
        _month.value = month
        val rel = sessions.requireRelationshipId()
        viewModelScope.launch {
            val result = loadCatching { api.month(rel, month, zone()) }
            if (month == _month.value) _state.value = result
            val open = (result as? Load.Ready)?.value?.reviewOpen == true
            if (open && month == currentMonth()) _next.value = loadCatching { api.month(rel, nextMonth(month), zone()) }
        }
        viewModelScope.launch { runCatching { api.pastMonths(rel, zone()) }.onSuccess { _past.value = it } }
        viewModelScope.launch { runCatching { api.tasks(rel) }.onSuccess { _tasks.value = it } }
    }

    fun setFocus(month: String, goal: String, taskIds: List<String>, done: () -> Unit) = action {
        api.setMonthFocus(sessions.requireRelationshipId(), month, MonthFocusInput(goal.trim(), taskIds))
        if (month != _month.value) say("${monthName(month)}'s focus is set")
        done()
        load()
    }

    fun saveReview(month: String, input: MonthReviewInput, done: () -> Unit) = action {
        api.saveMonthReview(sessions.requireRelationshipId(), month, input, zone())
        done()
        load()
    }

    private val avatarCache = mutableMapOf<String, ImageBitmap>()

    suspend fun loadAvatar(userId: String, version: String): ImageBitmap? {
        val key = "$userId@$version"
        avatarCache[key]?.let { return it }
        return runCatching {
            withContext(Dispatchers.IO) {
                val bytes = api.avatar(userId, version).bytes()
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.asImageBitmap()
            }
        }.getOrNull()?.also { avatarCache[key] = it }
    }
}

/** "You" for yourself, otherwise their name. */
private fun Session.who(userId: String) = if (userId == this.userId) "You" else nameOf(userId)

/** The sub's own regular tasks; the month's numbers are about them. */
private fun pickable(session: Session, tasks: List<Task>): List<Task> {
    val members = session.relationship?.members.orEmpty()
    val sub = members.firstOrNull { it.role == Role.Submissive }?.userId ?: members.firstOrNull { it.role == Role.Switch && it.userId != session.userId }?.userId
    return tasks.filter { it.active && it.assignedConsequenceId == null && it.assigneeId == sub }
}

/** A focus for each month, how it's going, and a look back on it together at the end. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MonthReviewScreen(onOpenSettings: () -> Unit, vm: MonthReviewViewModel = hiltViewModel()) {
    LaunchedEffect(Unit) { vm.load() }
    val state by vm.state.collectAsStateWithLifecycle()
    val month by vm.month.collectAsStateWithLifecycle()
    val past by vm.past.collectAsStateWithLifecycle()
    val tasks by vm.tasks.collectAsStateWithLifecycle()
    val next by vm.next.collectAsStateWithLifecycle()
    val busy by vm.busy.collectAsStateWithLifecycle()
    val message by vm.message.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    MessageEffect(message, snackbar, vm::messageShown)
    val session = vm.session ?: return
    val current = currentMonth()
    val viewingPast = month != current
    val scroll = rememberScrollState()
    val summary = (state as? Load.Ready)?.value
    val pick = remember(tasks, session) { pickable(session, tasks) }
    val titles = remember(tasks) { tasks.associate { it.id to it.title } }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("Monthly review")
                        Text(
                            monthName(month, true) + if (summary?.reviewOpen == true && !viewingPast) " · review open" else "",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                },
                navigationIcon = {
                    if (viewingPast) IconButton(onClick = { vm.load(current) }) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "This month") } else MenuButton()
                },
                actions = { SafeWordAction(); SettingsAction(onOpenSettings) },
            )
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        Column(
            Modifier.padding(padding).fillMaxSize().verticalScroll(scroll).padding(horizontal = 16.dp).padding(bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            when (val s = state) {
                Load.Loading -> LoadingBox()
                is Load.Failed -> ErrorBox(s.message, { vm.load() })
                is Load.Ready -> {
                    val m = s.value
                    FocusCard(m, session, titles, pick, busy) { goal, ids, done -> vm.setFocus(m.month, goal, ids, done) }
                    ProgressCard(m, session)
                    if (m.reviewOpen) {
                        LookBack(m, session, busy, vm::loadAvatar) { input, done -> vm.saveReview(m.month, input, done) }
                        if (!viewingPast && session.canManage) {
                            (next as? Load.Ready)?.let { n ->
                                NextFocus(n.value.month, n.value.focus, pick, busy) { goal, ids, done -> vm.setFocus(n.value.month, goal, ids, done) }
                            }
                        }
                    } else {
                        ReviewSoon(m, session)
                    }
                }
            }
            if (past.isNotEmpty()) {
                PastMonths(past, month, current) { picked ->
                    vm.load(picked)
                }
            }
        }
    }
    LaunchedEffect(month) { scroll.scrollTo(0) }
}

@Composable
private fun Card(color: Color = MaterialTheme.colorScheme.surfaceContainerLow, content: @Composable () -> Unit) {
    Surface(color = color, shape = MaterialTheme.shapes.large, modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) { content() }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun FocusCard(s: MonthSummary, session: Session, titles: Map<String, String>, pick: List<Task>, busy: Boolean, save: (String, List<String>, () -> Unit) -> Unit) {
    var editing by rememberSaveable { mutableStateOf(false) }
    val canEdit = session.canManage
    val f = s.focus
    if (editing) FocusDialog(s.month, f, pick, busy, onDismiss = { editing = false }) { goal, ids -> save(goal, ids) { editing = false } }
    if (f == null) {
        Card {
            Text("Focus for ${monthName(s.month)}", style = MaterialTheme.typography.titleMedium)
            Text(
                if (canEdit) "Pick one thing to work on this month, and the tasks that count towards it." else "No focus has been set for this month yet.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (canEdit) {
                Button(onClick = { editing = true }) {
                    Icon(Icons.Outlined.Flag, null, Modifier.size(18.dp))
                    Text("  Set a focus")
                }
            }
        }
        return
    }
    val colors = MaterialTheme.colorScheme
    val isCurrent = s.month == currentMonth()
    val setBy = f.setBy?.let { if (it == session.userId) "you" else session.nameOf(it) } ?: "a former member"
    val end = ym(s.month).atEndOfMonth()
    val left = ChronoUnit.DAYS.between(LocalDate.now(), end).toInt() + 1
    Card(colors.primaryContainer) {
        Row(verticalAlignment = Alignment.Top) {
            Column(Modifier.weight(1f)) {
                Text("FOCUS FOR ${monthName(s.month).uppercase()}", style = MaterialTheme.typography.labelMedium, color = colors.onPrimaryContainer.copy(alpha = 0.8f))
                Text(f.goal, style = MaterialTheme.typography.headlineSmall, color = colors.onPrimaryContainer, modifier = Modifier.padding(top = 8.dp))
                Text(
                    "Set by $setBy" + when {
                        !isCurrent -> ""
                        s.reviewOpen -> " · ends ${end.format(DateTimeFormatter.ofPattern("MMM d"))}"
                        else -> " · $left days left"
                    },
                    style = MaterialTheme.typography.bodyMedium,
                    color = colors.onPrimaryContainer.copy(alpha = 0.8f),
                    modifier = Modifier.padding(top = 8.dp),
                )
            }
            if (canEdit) IconButton(onClick = { editing = true }) { Icon(Icons.Outlined.Edit, "Change the focus", tint = colors.onPrimaryContainer) }
        }
        if (f.taskIds.isNotEmpty()) {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                f.taskIds.forEach { id ->
                    Row(
                        Modifier.height(32.dp).border(BorderStroke(1.dp, colors.onPrimaryContainer), MaterialTheme.shapes.small).padding(horizontal = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(Icons.Outlined.CheckCircle, null, Modifier.size(18.dp), tint = colors.onPrimaryContainer)
                        Text(
                            "  " + (titles[id] ?: s.focusTasks.firstOrNull { it.taskId == id }?.title ?: "A task"),
                            style = MaterialTheme.typography.labelLarge,
                            color = colors.onPrimaryContainer,
                        )
                    }
                }
            }
        }
    }
}

/** The goal and up to ten of the sub's tasks that count towards it. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun FocusFields(goal: String, onGoal: (String) -> Unit, picked: List<String>, onPicked: (List<String>) -> Unit, tasks: List<Task>) {
    OutlinedTextField(
        value = goal,
        onValueChange = { onGoal(it.take(200)) },
        label = { Text("Focus") },
        placeholder = { Text("Be on time without being reminded") },
        modifier = Modifier.fillMaxWidth(),
    )
    if (tasks.isNotEmpty()) {
        Text("Tasks that count towards it", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            tasks.forEach { t ->
                val on = t.id in picked
                FilterChip(
                    selected = on,
                    onClick = { onPicked(if (on) picked - t.id else (picked + t.id).take(10)) },
                    label = { Text(t.title, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                    leadingIcon = if (on) ({ Icon(Icons.Outlined.Check, null, Modifier.size(18.dp)) }) else null,
                )
            }
        }
    }
}

@Composable
private fun FocusDialog(month: String, focus: MonthFocus?, tasks: List<Task>, busy: Boolean, onDismiss: () -> Unit, onSave: (String, List<String>) -> Unit) {
    var goal by rememberSaveable { mutableStateOf(focus?.goal ?: "") }
    var picked by remember { mutableStateOf(focus?.taskIds ?: emptyList()) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Focus for ${monthName(month)}") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                FocusFields(goal, { goal = it }, picked, { picked = it }, tasks)
            }
        },
        confirmButton = { TextButton(onClick = { onSave(goal, picked) }, enabled = goal.isNotBlank() && !busy) { Text("Save") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

@Composable
private fun ProgressCard(s: MonthSummary, session: Session) {
    val colors = MaterialTheme.colorScheme
    val subject = s.subjectId ?: return
    val t = s.totals
    val isCurrent = s.month == currentMonth()
    if (t.done + t.missed + t.excused == 0) {
        Card {
            EmptyBox(
                if (isCurrent) "Nothing finished yet this month" else "No tasks were due in ${monthName(s.month)}",
                if (isCurrent) "This fills in as tasks are done or missed." else null,
            )
        }
        return
    }
    Card {
        Row {
            Text(if (isCurrent) "How ${monthName(s.month)} is going" else "How ${monthName(s.month)} went", style = MaterialTheme.typography.titleMedium)
            if (subject != session.userId) Text(" for ${session.nameOf(subject)}", style = MaterialTheme.typography.titleMedium, color = colors.onSurfaceVariant)
        }
        Row(verticalAlignment = Alignment.Bottom) {
            Column(Modifier.weight(1f)) {
                Text(pct(t.rate), style = MaterialTheme.typography.displayMedium)
                Text(
                    "done" + (if (isCurrent) " so far" else "") + (s.previous.rate?.let { " · ${pct(it)} in ${monthName(prevMonth(s.month))}" } ?: ""),
                    style = MaterialTheme.typography.bodyMedium,
                    color = colors.onSurfaceVariant,
                )
            }
            Column(horizontalAlignment = Alignment.End) {
                Text("${t.done} done", style = MaterialTheme.typography.titleMedium)
                Text("${t.missed} missed · ${t.excused} excused", style = MaterialTheme.typography.bodyMedium, color = colors.onSurfaceVariant)
            }
        }
        if (s.focusTasks.isNotEmpty()) {
            Text("Tasks for the focus", style = MaterialTheme.typography.bodySmall, color = colors.onSurfaceVariant)
            s.focusTasks.forEach { f ->
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(f.title, style = MaterialTheme.typography.bodyMedium, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.width(128.dp))
                    Box(Modifier.weight(1f).height(8.dp).clip(CircleShape).background(colors.surfaceContainerHighest)) {
                        Box(Modifier.fillMaxWidth((f.rate ?: 0.0).toFloat()).fillMaxHeight().clip(CircleShape).background(colors.primary))
                    }
                    Text(pct(f.rate), style = MaterialTheme.typography.bodyMedium, modifier = Modifier.width(40.dp), textAlign = androidx.compose.ui.text.style.TextAlign.End)
                }
            }
        }
        if (s.moods.isNotEmpty()) MonthMoodLine(s.month, s.moods)
    }
}

/** The sub's check-in moods across the month, low ones picked out; no average and no comparison with last month. */
@Composable
private fun MonthMoodLine(month: String, moods: List<app.obey.api.MoodPoint>) {
    val colors = MaterialTheme.colorScheme
    val ym = java.time.YearMonth.parse(month)
    val days = ym.lengthOfMonth()
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text("Mood this month", style = MaterialTheme.typography.bodySmall, color = colors.onSurfaceVariant)
        Row(Modifier.height(56.dp)) {
            Column(Modifier.fillMaxHeight(), verticalArrangement = Arrangement.SpaceBetween) {
                Icon(moodIcon(5), null, Modifier.size(16.dp), tint = colors.onSurfaceVariant)
                Icon(moodIcon(1), null, Modifier.size(16.dp), tint = colors.onSurfaceVariant)
            }
            androidx.compose.foundation.Canvas(
                Modifier.weight(1f).fillMaxHeight().padding(start = 8.dp)
                    .semantics { contentDescription = "${moods.size} moods this month" },
            ) {
                val w = size.width
                val h = size.height
                val pad = 4.dp.toPx()
                val pts = moods.map { e ->
                    val at = parseInstant(e.at).local()
                    val dayFrac = (at.dayOfMonth - 1 + (at.hour * 60 + at.minute) / 1440f) / days
                    androidx.compose.ui.geometry.Offset(dayFrac * w, h - pad - (e.mood - 1) / 4f * (h - 2 * pad)) to e.mood
                }
                drawLine(
                    colors.outlineVariant,
                    androidx.compose.ui.geometry.Offset(0f, h / 2),
                    androidx.compose.ui.geometry.Offset(w, h / 2),
                    strokeWidth = 1.dp.toPx(),
                    pathEffect = androidx.compose.ui.graphics.PathEffect.dashPathEffect(floatArrayOf(2.dp.toPx(), 4.dp.toPx())),
                )
                if (pts.size > 1) {
                    val path = androidx.compose.ui.graphics.Path().apply {
                        moveTo(pts[0].first.x, pts[0].first.y)
                        pts.drop(1).forEach { lineTo(it.first.x, it.first.y) }
                    }
                    drawPath(path, colors.primary, style = androidx.compose.ui.graphics.drawscope.Stroke(width = 2.dp.toPx()))
                }
                pts.forEach { (o, mood) -> drawCircle(if (mood <= 2) colors.tertiary else colors.primary, 3.dp.toPx(), o) }
            }
        }
    }
}

@Composable
private fun ReviewSoon(s: MonthSummary, session: Session) {
    val dom = session.partners.firstOrNull { it.role != Role.Submissive }?.displayName
    val who = if (session.canManage) "you set" else "${dom ?: "your Dominant"} sets"
    Card {
        Row(verticalAlignment = Alignment.Top) {
            Icon(Icons.Outlined.Event, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
            Column(Modifier.padding(start = 12.dp)) {
                Text("Review opens ${shortDate(s.reviewOpensOn)}", style = MaterialTheme.typography.titleMedium)
                Text(
                    "You'll both look back on ${monthName(s.month)} and $who ${monthName(nextMonth(s.month))}'s focus.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

/** Each person's answers. Your own form until you've sent it; the others' only once you have. */
@Composable
private fun LookBack(s: MonthSummary, session: Session, busy: Boolean, loadAvatar: suspend (String, String) -> ImageBitmap?, save: (MonthReviewInput, () -> Unit) -> Unit) {
    val mine = s.reviews.firstOrNull { it.userId == session.userId }
    var editing by rememberSaveable(s.month, mine == null) { mutableStateOf(mine == null) }
    if (editing && !session.readOnly) {
        ReviewForm(s, session, mine, busy, onCancel = { editing = false }) { input -> save(input) { editing = false } }
        return
    }
    val colors = MaterialTheme.colorScheme
    val waiting = s.waitingOn.filter { it != session.userId }.map { session.nameOf(it) }
    Card {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("${monthName(s.month)}, looking back", style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
            if (mine != null && !session.readOnly) IconButton(onClick = { editing = true }) { Icon(Icons.Outlined.Edit, "Change your answers") }
        }
        s.reviews.sortedBy { it.userId == session.userId }.forEachIndexed { i, r ->
            if (i > 0) HorizontalDivider(color = colors.surfaceContainerHighest)
            Answers(r, session, loadAvatar)
        }
        if (mine == null) {
            Text("You see the others' answers once you've given yours.", style = MaterialTheme.typography.bodyMedium, color = colors.onSurfaceVariant)
        } else if (waiting.isNotEmpty()) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Outlined.HourglassTop, null, Modifier.size(20.dp), tint = colors.onSurfaceVariant)
                Text(
                    "  Waiting on ${waiting.joinToString(" and ")}. You'll see their answers once they've written them.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = colors.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun Answers(r: MonthReview, session: Session, loadAvatar: suspend (String, String) -> ImageBitmap?) {
    val member = session.relationship?.members?.firstOrNull { it.userId == r.userId }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Avatar(r.userId, member?.displayName ?: "?", member?.avatarVersion, loadAvatar, size = 32.dp)
            Column(Modifier.padding(start = 12.dp)) {
                Text(session.who(r.userId), style = MaterialTheme.typography.titleSmall)
                Text("Kept the focus ${r.rating} of 5", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        if (r.wentWell.isNotBlank()) Answer("What went well", r.wentWell)
        if (r.workOn.isNotBlank()) Answer("What to work on", r.workOn)
    }
}

@Composable
private fun Answer(q: String, a: String) {
    Column {
        Text(q, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(a, style = MaterialTheme.typography.bodyLarge)
    }
}

@Composable
private fun ReviewForm(s: MonthSummary, session: Session, mine: MonthReview?, busy: Boolean, onCancel: () -> Unit, onSave: (MonthReviewInput) -> Unit) {
    val colors = MaterialTheme.colorScheme
    var rating by rememberSaveable { mutableIntStateOf(mine?.rating ?: 0) }
    var wentWell by rememberSaveable { mutableStateOf(mine?.wentWell ?: "") }
    var workOn by rememberSaveable { mutableStateOf(mine?.workOn ?: "") }
    val others = session.partners.filter { it.userId in s.waitingOn }.map { it.displayName }
    Card {
        Text("Look back on ${monthName(s.month)}", style = MaterialTheme.typography.titleMedium)
        if (others.isNotEmpty()) {
            Text(
                "${others.joinToString(" and ")} ${if (others.size > 1) "see" else "sees"} your answers once they've written theirs, and you see theirs.",
                style = MaterialTheme.typography.bodyMedium,
                color = colors.onSurfaceVariant,
            )
        }
        Text("How well was the focus kept?", style = MaterialTheme.typography.bodyLarge)
        Column {
            Row(Modifier.selectableGroup(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                (1..5).forEach { n ->
                    val on = rating == n
                    Box(
                        Modifier.size(48.dp).clip(CircleShape)
                            .then(if (on) Modifier.background(colors.primary) else Modifier.border(1.dp, colors.outlineVariant, CircleShape))
                            .selectable(selected = on, role = SemanticsRole.RadioButton, onClick = { rating = n }),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text("$n", style = MaterialTheme.typography.titleMedium, color = if (on) colors.onPrimary else colors.onSurface)
                    }
                }
            }
            Row(Modifier.width(272.dp).padding(top = 4.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("Not at all", style = MaterialTheme.typography.bodySmall, color = colors.onSurfaceVariant)
                Text("Every day", style = MaterialTheme.typography.bodySmall, color = colors.onSurfaceVariant)
            }
        }
        OutlinedTextField(wentWell, { wentWell = it.take(2000) }, label = { Text("What went well") }, minLines = 3, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(workOn, { workOn = it.take(2000) }, label = { Text("What to work on") }, minLines = 3, modifier = Modifier.fillMaxWidth())
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
            if (mine != null) TextButton(onClick = onCancel) { Text("Cancel") }
            Button(onClick = { onSave(MonthReviewInput(rating, wentWell.trim(), workOn.trim())) }, enabled = rating > 0 && !busy) { Text(if (mine != null) "Save" else "Send") }
        }
    }
}

/** Once the review is open, the Dominant sets next month's focus from here. */
@Composable
private fun NextFocus(month: String, focus: MonthFocus?, tasks: List<Task>, busy: Boolean, save: (String, List<String>, () -> Unit) -> Unit) {
    var editing by rememberSaveable(month) { mutableStateOf(false) }
    var goal by rememberSaveable(focus) { mutableStateOf(focus?.goal ?: "") }
    var picked by remember(focus) { mutableStateOf(focus?.taskIds ?: emptyList()) }
    if (focus != null && !editing) {
        Card {
            Row(verticalAlignment = Alignment.Top) {
                Icon(Icons.Outlined.Flag, null, tint = MaterialTheme.colorScheme.primary)
                Column(Modifier.weight(1f).padding(start = 12.dp)) {
                    Text("Focus for ${monthName(month)}", style = MaterialTheme.typography.titleMedium)
                    Text(focus.goal, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                IconButton(onClick = { editing = true }) { Icon(Icons.Outlined.Edit, "Change ${monthName(month)}'s focus") }
            }
        }
        return
    }
    Card {
        Text("Focus for ${monthName(month)}", style = MaterialTheme.typography.titleMedium)
        FocusFields(goal, { goal = it }, picked, { picked = it }, tasks)
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
            if (focus != null) TextButton(onClick = { editing = false }) { Text("Cancel") }
            Button(onClick = { save(goal, picked) { editing = false } }, enabled = goal.isNotBlank() && !busy) { Text("Start ${monthName(month)}") }
        }
    }
}

@Composable
private fun PastMonths(past: List<PastMonth>, selected: String, current: String, onOpen: (String) -> Unit) {
    val colors = MaterialTheme.colorScheme
    Text("Past months", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 4.dp))
    Surface(color = colors.surfaceContainerLow, shape = MaterialTheme.shapes.large, modifier = Modifier.fillMaxWidth()) {
        Column {
            past.forEachIndexed { i, p ->
                if (i > 0) HorizontalDivider(color = colors.surfaceContainerHighest)
                Row(
                    Modifier.fillMaxWidth()
                        .background(if (p.month == selected) colors.secondaryContainer else Color.Transparent)
                        .clickable { onOpen(p.month) }
                        .padding(horizontal = 16.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Column(Modifier.weight(1f)) {
                        Text(monthName(p.month, p.month.take(4) < current.take(4)), style = MaterialTheme.typography.bodyLarge)
                        Text(p.goal ?: "No focus set", style = MaterialTheme.typography.bodyMedium, color = colors.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    p.myRating?.let {
                        Surface(color = colors.secondaryContainer, shape = MaterialTheme.shapes.extraSmall) {
                            Text("$it of 5", style = MaterialTheme.typography.labelMedium, color = colors.onSecondaryContainer, modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp))
                        }
                    }
                    Text(pct(p.rate), style = MaterialTheme.typography.bodyMedium, color = colors.onSurfaceVariant)
                    Icon(Icons.AutoMirrored.Outlined.KeyboardArrowRight, null, tint = colors.onSurfaceVariant)
                }
            }
        }
    }
}
