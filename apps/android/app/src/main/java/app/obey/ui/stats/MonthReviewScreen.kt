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
import androidx.compose.material.icons.outlined.Insights
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
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import app.obey.ui.common.LettersField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.LargeTopAppBar
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
import app.obey.ui.common.LocalFeatures
import app.obey.ui.common.MenuButton
import app.obey.ui.common.MessageEffect
import app.obey.ui.common.SafeWordAction
import app.obey.ui.common.loadCatching
import app.obey.ui.common.local
import app.obey.ui.common.moodIcon
import app.obey.ui.common.parseInstant
import androidx.compose.foundation.layout.Spacer
import androidx.compose.material.icons.automirrored.outlined.ShowChart
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.unit.sp
import app.obey.ui.common.Diamond
import app.obey.ui.common.DiamondState
import app.obey.ui.common.Eyebrow
import app.obey.ui.common.FormScreen
import app.obey.ui.common.LettersChip
import app.obey.ui.common.inkButtonColors
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
fun MonthReviewScreen(onOpenSettings: () -> Unit, onOpenStats: (month: String, who: String) -> Unit, vm: MonthReviewViewModel = hiltViewModel()) {
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
    var changing by remember(month) { mutableStateOf(false) }
    val mine = summary?.reviews?.firstOrNull { it.userId == session.userId }
    val revealed = summary != null && summary.reviewOpen && mine != null && summary.waitingOn.isEmpty() && summary.reviews.size > 1 && !changing
    val name = monthName(month)
    val title = when {
        revealed -> "$name, together."
        summary?.reviewOpen == true -> "Looking back on $name"
        viewingPast -> monthName(month, true)
        else -> "$name so far"
    }
    val eyebrow = when {
        summary == null -> "Monthly review"
        summary.reviewOpen && viewingPast -> "Monthly review · ${month.take(4)}"
        summary.reviewOpen -> "Monthly review · open now"
        else -> "Monthly review · opens ${shortDate(summary.reviewOpensOn)}"
    }
    val colors = MaterialTheme.colorScheme

    Scaffold(
        topBar = {
            TopAppBar(
                title = {},
                navigationIcon = { MenuButton() },
                actions = {
                    if (viewingPast) TextButton(onClick = { vm.load(current) }) { Text("This month", color = colors.primary) }
                    val subject = summary?.subjectId
                    if (LocalFeatures.current.stats && subject != null) {
                        IconButton(onClick = { onOpenStats(month, subject) }) { Icon(Icons.AutoMirrored.Outlined.ShowChart, "See $name in Stats") }
                    }
                    SafeWordAction()
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        Column(
            Modifier.padding(padding).fillMaxSize().verticalScroll(scroll).padding(horizontal = 16.dp).padding(bottom = 32.dp),
            verticalArrangement = Arrangement.spacedBy(36.dp),
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Eyebrow(eyebrow)
                Text(title, style = MaterialTheme.typography.displayMedium)
                if (revealed) {
                    Text(
                        "${if (summary!!.reviews.size > 2) "You all" else "You both"} finished. Here's what you each said.",
                        style = MaterialTheme.typography.bodyLarge,
                        color = colors.onSurfaceVariant,
                    )
                }
            }
            when (val s = state) {
                Load.Loading -> LoadingBox()
                is Load.Failed -> ErrorBox(s.message, { vm.load() })
                is Load.Ready -> {
                    val m = s.value
                    if (revealed) {
                        Together(m, session) { changing = true }
                    } else {
                        if (m.reviewOpen) Questions(m, session, mine, busy) { input -> vm.saveReview(m.month, input) { changing = false } }
                        Focus(m, session, pick, busy) { goal, ids, done -> vm.setFocus(m.month, goal, ids, done) }
                    }
                    TheMonth(m, session, onOpenStats)
                    if (m.reviewOpen && !viewingPast && session.canManage) {
                        (next as? Load.Ready)?.let { n ->
                            NextFocus(n.value.month, n.value.focus, pick, busy) { goal, ids, done -> vm.setFocus(n.value.month, goal, ids, done) }
                        }
                    }
                }
            }
            if (past.isNotEmpty()) PastMonths(past, month, current) { vm.load(it) }
        }
    }
    LaunchedEffect(month) { scroll.scrollTo(0) }
}

/** The month's focus and how its tasks are going. */
@Composable
private fun Focus(s: MonthSummary, session: Session, pick: List<Task>, busy: Boolean, save: (String, List<String>, () -> Unit) -> Unit) {
    var editing by rememberSaveable { mutableStateOf(false) }
    val canEdit = session.canManage
    val f = s.focus
    val colors = MaterialTheme.colorScheme
    if (editing) FocusSheet(s.month, f, pick, busy, onDismiss = { editing = false }) { goal, ids -> save(goal, ids) { editing = false } }
    Column {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Eyebrow("Focus", Modifier.weight(1f))
            if (f != null && canEdit) IconButton(onClick = { editing = true }) { Icon(Icons.Outlined.Edit, "Change the focus") }
        }
        if (f == null) {
            if (canEdit) {
                Text("Set ${monthName(s.month)}'s focus", style = MaterialTheme.typography.bodyLarge, color = colors.primary, modifier = Modifier.padding(top = 8.dp).clickable { editing = true })
            } else {
                Text("No focus set for ${monthName(s.month)}.", style = MaterialTheme.typography.bodyLarge, color = colors.onSurfaceVariant, modifier = Modifier.padding(top = 8.dp))
            }
            return@Column
        }
        val isCurrent = s.month == currentMonth()
        val setBy = f.setBy?.let { if (it == session.userId) "you" else session.nameOf(it) } ?: "a former member"
        val end = ym(s.month).atEndOfMonth()
        val left = ChronoUnit.DAYS.between(LocalDate.now(), end).toInt() + 1
        Text(f.goal, style = MaterialTheme.typography.headlineSmall, modifier = Modifier.padding(top = 4.dp))
        Text(
            "Set by $setBy" + when {
                !isCurrent -> ""
                s.reviewOpen -> " · ends ${end.format(DateTimeFormatter.ofPattern("MMM d"))}"
                else -> " · $left days left"
            },
            style = MaterialTheme.typography.bodyMedium,
            color = colors.onSurfaceVariant,
            modifier = Modifier.padding(top = 4.dp),
        )
        s.focusTasks.forEach { t ->
            Column(Modifier.padding(top = 12.dp)) {
                Row(verticalAlignment = Alignment.Bottom) {
                    Text(t.title, style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                    Text(pct(t.rate), style = MaterialTheme.typography.bodyMedium, color = colors.onSurfaceVariant)
                }
                Box(Modifier.padding(top = 8.dp).fillMaxWidth().height(3.dp).background(colors.outlineVariant.copy(alpha = 0.6f))) {
                    Box(Modifier.fillMaxWidth((t.rate ?: 0.0).toFloat().coerceIn(0f, 1f)).fillMaxHeight().background(colors.onSurface))
                }
                HorizontalDivider(Modifier.padding(top = 12.dp), color = colors.outlineVariant)
            }
        }
    }
}

/** The goal and up to ten of the sub's tasks that count towards it. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun FocusFields(goal: String, onGoal: (String) -> Unit, picked: List<String>, onPicked: (List<String>) -> Unit, tasks: List<Task>) {
    LettersField(
        value = goal,
        onValueChange = { onGoal(it.take(200)) },
        label = { Text("Focus") },
        placeholder = { Text("Be on time without being reminded") },
        modifier = Modifier.fillMaxWidth(),
    )
    if (tasks.isNotEmpty()) {
        Eyebrow("Tasks that count towards it")
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            tasks.forEach { t ->
                val on = t.id in picked
                LettersChip(t.title, on, { onPicked(if (on) picked - t.id else (picked + t.id).take(10)) })
            }
        }
    }
}

@Composable
private fun FocusSheet(month: String, focus: MonthFocus?, tasks: List<Task>, busy: Boolean, onDismiss: () -> Unit, onSave: (String, List<String>) -> Unit) {
    var goal by rememberSaveable { mutableStateOf(focus?.goal ?: "") }
    var picked by remember { mutableStateOf(focus?.taskIds ?: emptyList()) }
    FormScreen("${monthName(month)}'s focus", onCancel = onDismiss, onSave = { onSave(goal, picked) }, canSave = goal.isNotBlank() && !busy) {
        FocusFields(goal, { goal = it }, picked, { picked = it }, tasks)
    }
}

/** How the sub's month went: the numbers in a line, the mood line, and the way to Stats. */
@Composable
private fun TheMonth(s: MonthSummary, session: Session, onOpenStats: (String, String) -> Unit) {
    val colors = MaterialTheme.colorScheme
    val subject = s.subjectId ?: return
    val t = s.totals
    val isCurrent = s.month == currentMonth()
    val any = t.done + t.missed + t.excused > 0
    Column {
        Eyebrow(if (subject == session.userId) "You" else session.nameOf(subject))
        Text(
            when {
                any -> "${pct(t.rate)} of tasks done" + (if (isCurrent) " so far" else "") + " · ${t.done} done, ${t.missed} missed"
                isCurrent -> "Nothing finished yet this month."
                else -> "No tasks were due in ${monthName(s.month)}."
            },
            style = MaterialTheme.typography.bodyLarge,
            modifier = Modifier.padding(top = 8.dp),
        )
        if (s.moods.isNotEmpty()) MonthMoodLine(s.month, s.moods) else Spacer(Modifier.height(12.dp))
        HorizontalDivider(color = colors.outlineVariant)
        Row(Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(if (s.moods.isNotEmpty()) "Mood" else "", style = MaterialTheme.typography.bodyMedium, color = colors.onSurfaceVariant, modifier = Modifier.weight(1f))
            if (LocalFeatures.current.stats) {
                Text(
                    "See ${monthName(s.month)} in Stats",
                    style = MaterialTheme.typography.bodyMedium,
                    color = colors.primary,
                    modifier = Modifier.clickable { onOpenStats(s.month, subject) },
                )
            }
        }
    }
}

/** The sub's moods across the month as a line; no average and no comparison with last month, so it never reads as a score. */
@Composable
private fun MonthMoodLine(month: String, moods: List<app.obey.api.MoodPoint>) {
    val ink = MaterialTheme.colorScheme.onSurface
    val days = ym(month).lengthOfMonth()
    androidx.compose.foundation.Canvas(
        Modifier.fillMaxWidth().padding(top = 16.dp, bottom = 6.dp).height(72.dp).semantics { contentDescription = "${moods.size} moods this month" },
    ) {
        val w = size.width
        val h = size.height
        val pad = 6.dp.toPx()
        val pts = moods.map { e ->
            val at = parseInstant(e.at).local()
            val dayFrac = (at.dayOfMonth - 1 + (at.hour * 60 + at.minute) / 1440f) / days
            androidx.compose.ui.geometry.Offset(dayFrac * w, h - pad - (e.mood - 1) / 4f * (h - 2 * pad))
        }
        if (pts.size > 1) {
            val path = androidx.compose.ui.graphics.Path().apply {
                moveTo(pts[0].x, pts[0].y)
                pts.drop(1).forEach { lineTo(it.x, it.y) }
            }
            drawPath(path, ink, style = androidx.compose.ui.graphics.drawscope.Stroke(width = 1.5.dp.toPx(), join = androidx.compose.ui.graphics.StrokeJoin.Round))
        } else {
            drawCircle(ink, 3.dp.toPx(), pts[0])
        }
    }
}

private enum class Question(val q: String) { WentWell("What went well?"), WorkOn("What to work on"), Rating("How well was the focus kept?") }

/**
 * The review's questions as rows, a filled diamond for each one answered. A row opens in place to answer it; nothing
 * is sent until Send, and the others' answers show once you've sent yours.
 */
@Composable
private fun Questions(s: MonthSummary, session: Session, mine: MonthReview?, busy: Boolean, onSave: (MonthReviewInput) -> Unit) {
    val colors = MaterialTheme.colorScheme
    var rating by rememberSaveable(s.month, mine) { mutableIntStateOf(mine?.rating ?: 0) }
    var wentWell by rememberSaveable(s.month, mine) { mutableStateOf(mine?.wentWell ?: "") }
    var workOn by rememberSaveable(s.month, mine) { mutableStateOf(mine?.workOn ?: "") }
    var open by rememberSaveable(s.month) { mutableStateOf<Question?>(null) }
    val dirty = rating != (mine?.rating ?: 0) || wentWell.trim() != (mine?.wentWell ?: "") || workOn.trim() != (mine?.workOn ?: "")
    val readOnly = session.readOnly
    fun answered(q: Question) = when (q) {
        Question.WentWell -> wentWell.isNotBlank()
        Question.WorkOn -> workOn.isNotBlank()
        Question.Rating -> rating > 0
    }
    val members = session.relationship?.members.orEmpty()
    val finished = members.filter { it.userId != session.userId && it.userId !in s.waitingOn }.map { session.nameOf(it.userId) }
    val waiting = s.waitingOn.filter { it != session.userId }.map { session.nameOf(it) }
    Column(verticalArrangement = Arrangement.spacedBy(20.dp)) {
        Column {
            Question.entries.forEachIndexed { i, q ->
                if (i > 0) HorizontalDivider(color = colors.outlineVariant)
                Row(
                    Modifier.fillMaxWidth().then(if (readOnly) Modifier else Modifier.clickable { open = if (open == q) null else q }).padding(vertical = 16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Diamond(if (answered(q)) DiamondState.Done else DiamondState.Open, Modifier.padding(horizontal = 4.dp), size = 18.dp)
                    Text(q.q, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f).padding(start = 16.dp))
                    if (answered(q)) Text("answered", style = MaterialTheme.typography.bodyMedium, color = colors.onSurfaceVariant)
                }
                if (open == q) {
                    Column(Modifier.padding(start = 42.dp, bottom = 16.dp)) {
                        when (q) {
                            Question.Rating -> {
                                Row(Modifier.selectableGroup(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    (1..5).forEach { n ->
                                        val on = rating == n
                                        Box(
                                            Modifier.size(44.dp).clip(CircleShape)
                                                .then(if (on) Modifier.background(colors.onSurface) else Modifier.border(1.dp, colors.outlineVariant, CircleShape))
                                                .selectable(selected = on, role = SemanticsRole.RadioButton, onClick = { rating = n }),
                                            contentAlignment = Alignment.Center,
                                        ) {
                                            Text("$n", style = MaterialTheme.typography.titleLarge, color = if (on) colors.surface else colors.onSurface)
                                        }
                                    }
                                }
                                Row(Modifier.width(252.dp).padding(top = 4.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                                    Text("Not at all", style = MaterialTheme.typography.bodySmall, color = colors.onSurfaceVariant)
                                    Text("Every day", style = MaterialTheme.typography.bodySmall, color = colors.onSurfaceVariant)
                                }
                            }
                            Question.WentWell -> LettersField(wentWell, { wentWell = it.take(2000) }, minLines = 3, modifier = Modifier.fillMaxWidth())
                            Question.WorkOn -> LettersField(workOn, { workOn = it.take(2000) }, minLines = 3, modifier = Modifier.fillMaxWidth())
                        }
                    }
                }
            }
        }
        if (!readOnly && (dirty || mine == null)) {
            Button(
                onClick = { onSave(MonthReviewInput(rating, wentWell.trim(), workOn.trim())); open = null },
                enabled = rating > 0 && !busy,
                colors = inkButtonColors(),
                modifier = Modifier.fillMaxWidth(),
            ) { Text(if (mine != null) "Save my answers" else "Send my answers") }
        }
        if (mine == null && finished.isNotEmpty()) {
            HiddenNote("${finished.joinToString(" and ")} ${if (finished.size > 1) "have" else "has"} finished. You'll see each other's answers when you finish yours.")
        }
        if (mine != null && waiting.isNotEmpty()) HiddenNote("Waiting on ${waiting.joinToString(" and ")}. You'll see their answers once they've written them.")
    }
}

@Composable
private fun HiddenNote(text: String) {
    val colors = MaterialTheme.colorScheme
    Row(
        Modifier.fillMaxWidth().clip(MaterialTheme.shapes.medium).background(colors.surfaceContainer).border(1.dp, colors.outlineVariant, MaterialTheme.shapes.medium).padding(horizontal = 20.dp, vertical = 16.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Icon(Icons.Outlined.VisibilityOff, null, tint = colors.onSurfaceVariant)
        Text(text, style = MaterialTheme.typography.bodyLarge, color = colors.onSurfaceVariant, modifier = Modifier.padding(start = 16.dp))
    }
}

/** Everyone has answered: each person's words, then each rating beside how the tasks went. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Together(s: MonthSummary, session: Session, onChange: () -> Unit) {
    val colors = MaterialTheme.colorScheme
    val members = session.relationship?.members.orEmpty()
    fun isSub(id: String) = members.firstOrNull { it.userId == id }?.role == Role.Submissive
    val order = s.reviews.sortedBy { !isSub(it.userId) }
    @Composable
    fun Quotes(title: String, pick: (MonthReview) -> String) {
        val said = order.filter { pick(it).isNotBlank() }
        if (said.isEmpty()) return
        Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Eyebrow(title)
            said.forEach { r ->
                Row(Modifier.height(androidx.compose.foundation.layout.IntrinsicSize.Min)) {
                    Box(Modifier.width(2.dp).fillMaxHeight().background(if (isSub(r.userId)) colors.primary else colors.onSurface))
                    Column(Modifier.padding(start = 18.dp)) {
                        Text("“${pick(r).trim()}”", style = MaterialTheme.typography.headlineSmall.copy(fontStyle = FontStyle.Italic, fontSize = 22.sp, lineHeight = 28.sp))
                        Text(session.who(r.userId), style = MaterialTheme.typography.bodyMedium, color = colors.onSurfaceVariant, modifier = Modifier.padding(top = 4.dp))
                    }
                }
            }
        }
    }
    Quotes("What went well") { it.wentWell }
    Quotes("What to work on") { it.workOn }
    Column {
        Eyebrow(s.focus?.let { "Focus: ${it.goal}" } ?: "How it went")
        FlowRow(Modifier.padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(36.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            order.forEach { r -> Figure("${r.rating}", "/5", if (r.userId == session.userId) "You" else session.nameOf(r.userId)) }
            s.totals.rate?.let { Figure(pct(it), "", "tasks done") }
        }
        if (!session.readOnly) {
            Text("Change my answers", style = MaterialTheme.typography.bodyMedium, color = colors.onSurfaceVariant, modifier = Modifier.padding(top = 20.dp).clickable(onClick = onChange))
        }
    }
}

@Composable
private fun Figure(value: String, of: String, label: String) {
    Column {
        Row(verticalAlignment = Alignment.Bottom) {
            Text(value, style = MaterialTheme.typography.displayMedium)
            if (of.isNotEmpty()) Text(of, style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(bottom = 6.dp))
        }
        Text(label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

/** Once the review is open, the Dominant sets next month's focus from here. */
@Composable
private fun NextFocus(month: String, focus: MonthFocus?, tasks: List<Task>, busy: Boolean, save: (String, List<String>, () -> Unit) -> Unit) {
    var editing by rememberSaveable(month) { mutableStateOf(false) }
    if (editing) FocusSheet(month, focus, tasks, busy, onDismiss = { editing = false }) { goal, ids -> save(goal, ids) { editing = false } }
    if (focus == null) {
        Text("Set ${monthName(month)}'s focus", style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.primary, modifier = Modifier.clickable { editing = true })
        return
    }
    Column {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Eyebrow("Focus", Modifier.weight(1f))
            IconButton(onClick = { editing = true }) { Icon(Icons.Outlined.Edit, "Change ${monthName(month)}'s focus") }
        }
        Text(focus.goal, style = MaterialTheme.typography.headlineSmall)
    }
}

@Composable
private fun PastMonths(past: List<PastMonth>, selected: String, current: String, onOpen: (String) -> Unit) {
    val colors = MaterialTheme.colorScheme
    Column {
        Eyebrow("Past months")
        past.forEach { p ->
            Row(
                Modifier.fillMaxWidth().clickable { onOpen(p.month) }.padding(vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Column(Modifier.weight(1f)) {
                    Text(monthName(p.month, p.month.take(4) < current.take(4)), style = MaterialTheme.typography.bodyLarge, color = if (p.month == selected) colors.primary else colors.onSurface)
                    Text(p.goal ?: "No focus set", style = MaterialTheme.typography.bodyMedium, color = colors.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                p.myRating?.let { Text("$it/5", style = MaterialTheme.typography.bodyMedium, color = colors.onSurfaceVariant) }
                Text(pct(p.rate), style = MaterialTheme.typography.bodyMedium, color = colors.onSurfaceVariant)
                Icon(Icons.AutoMirrored.Outlined.KeyboardArrowRight, null, tint = colors.onSurfaceVariant)
            }
            HorizontalDivider(color = colors.outlineVariant)
        }
    }
}
