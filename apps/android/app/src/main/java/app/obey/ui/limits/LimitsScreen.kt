package app.obey.ui.limits

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.automirrored.outlined.ArrowForward
import androidx.compose.material.icons.outlined.EditNote
import androidx.compose.material.icons.filled.Block
import androidx.compose.material.icons.filled.DoNotDisturbOn
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.Share
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
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
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import app.obey.api.LimitAnswer
import app.obey.api.LimitAnswerInput
import app.obey.api.LimitItem
import app.obey.api.LimitItemInput
import app.obey.api.LimitList
import app.obey.api.LimitPerson
import app.obey.api.Member
import app.obey.api.ObeyApi
import app.obey.data.Session
import app.obey.data.SessionRepository
import app.obey.ui.common.BaseViewModel
import app.obey.ui.common.EmptyBox
import app.obey.ui.common.ErrorBox
import app.obey.ui.common.Load
import app.obey.ui.common.LoadingBox
import app.obey.ui.common.MenuButton
import app.obey.ui.common.MessageEffect
import app.obey.ui.common.SafeWordAction
import app.obey.ui.common.loadCatching
import app.obey.ui.common.parseInstant
import app.obey.ui.onboarding.label
import dagger.hilt.android.lifecycle.HiltViewModel
import java.io.File
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import javax.inject.Inject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** The five answers, best to worst. The colours mean the same thing in light and dark themes. */
enum class Rating(val key: String, val label: String, val color: Color) {
    Love("love", "Love it", Color(0xFF2E7D5B)),
    Like("like", "Like it", Color(0xFF8DB255)),
    Curious("curious", "Curious", Color(0xFFE8B83A)),
    Soft("soft", "Soft limit", Color(0xFFE07B3C)),
    Hard("hard", "Hard limit", Color(0xFFB3261E));

    companion object {
        fun of(key: String?) = entries.firstOrNull { it.key == key }
    }
}

/** The categories someone can file their own item under, as on the web. */
val LIMIT_CATEGORIES = listOf("Service & protocol", "Restraint", "Impact & sensation", "Words & mind", "Body & care", "Out in the world", "Your own")

fun byCategory(items: List<LimitItem>): List<Pair<String, List<LimitItem>>> = items.groupBy { it.category }.toList()

private fun keen(r: String?) = r == "love" || r == "like"

/**
 * The comparison once both have finished: anything either rated a hard limit is off the table; both loving or liking
 * it is something they both want; and where one is curious or wants to go slow, it's worth a talk.
 */
fun together(items: List<LimitItem>, a: Map<String, LimitAnswer>, b: Map<String, LimitAnswer>): Triple<List<LimitItem>, List<LimitItem>, List<LimitItem>> {
    val off = mutableListOf<LimitItem>()
    val want = mutableListOf<LimitItem>()
    val talk = mutableListOf<LimitItem>()
    for (i in items) {
        val x = a[i.key]?.rating
        val y = b[i.key]?.rating
        when {
            x == "hard" || y == "hard" -> off += i
            keen(x) && keen(y) -> want += i
            x != null && y != null && listOf(x, y).any { it == "curious" || it == "soft" } -> talk += i
        }
    }
    return Triple(off, want, talk)
}

@HiltViewModel
class LimitsViewModel @Inject constructor(private val api: ObeyApi, private val sessions: SessionRepository) : BaseViewModel() {
    val session: Session? get() = sessions.session
    private val _state = MutableStateFlow<Load<LimitList>>(Load.Loading)
    val state: StateFlow<Load<LimitList>> = _state.asStateFlow()

    fun load() {
        val rel = sessions.requireRelationshipId()
        viewModelScope.launch { _state.value = loadCatching { api.limitList(rel) } }
    }

    /** Rates (or skips, with a null rating) one item, updating the list in place so tapping through stays quick. */
    fun answer(item: LimitItem, rating: String?, note: String) {
        val me = session?.userId ?: return
        val ready = (_state.value as? Load.Ready)?.value ?: return
        _state.value = Load.Ready(
            ready.copy(
                people = ready.people.map { p ->
                    if (p.userId != me) p
                    else {
                        val answers = p.answers.orEmpty().toMutableMap()
                        if (rating != null || note.isNotEmpty()) answers[item.key] = LimitAnswer(rating, note) else answers.remove(item.key)
                        p.copy(answers = answers, rated = answers.values.count { it.rating != null })
                    }
                },
            ),
        )
        action(onError = { load() }) { api.answerLimit(sessions.requireRelationshipId(), item.key, LimitAnswerInput(rating, note)) }
    }

    fun add(category: String, title: String, done: () -> Unit) = action {
        api.addLimitItem(sessions.requireRelationshipId(), LimitItemInput(category, title.trim()))
        done()
        load()
    }

    fun remove(item: LimitItem) = action {
        api.removeLimitItem(sessions.requireRelationshipId(), item.key)
        say("Removed “${item.title}”")
        load()
    }

    fun finish(partner: String?, done: () -> Unit) = action {
        api.finishLimits(sessions.requireRelationshipId())
        say(if (partner != null) "Finished. $partner sees yours once they've finished too." else "Finished")
        load()
        done()
    }

    /** Draws the chart to a PNG in the cache and opens the share sheet. */
    fun share(context: Context, list: LimitList, people: List<Member>, dark: Boolean) = action {
        val file = withContext(Dispatchers.Default) {
            val bitmap = chartBitmap(list, people, dark)
            val dir = File(context.cacheDir, "share").apply { mkdirs() }
            File(dir, "limits.png").also { f -> f.outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) } }
        }
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.files", file)
        val send = Intent(Intent.ACTION_SEND).setType("image/png").putExtra(Intent.EXTRA_STREAM, uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        context.startActivity(Intent.createChooser(send, "Limits"))
    }
}

@Composable
private fun Dot(rating: String?, size: Int = 12) {
    val r = Rating.of(rating)
    val m = Modifier.size(size.dp).clip(CircleShape)
    if (r != null) Box(m.background(r.color).semantics { contentDescription = r.label })
    else Box(m.border(2.dp, MaterialTheme.colorScheme.outline, CircleShape).semantics { contentDescription = "Skipped" })
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Legend() {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Rating.entries.forEach { r ->
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Dot(r.key)
                Text(r.label, style = MaterialTheme.typography.bodyMedium)
            }
        }
    }
}

private enum class Tab { Me, Partner, Together }

/** Each person's limits, and the two side by side once both have finished. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LimitsScreen(onEdit: () -> Unit, vm: LimitsViewModel = hiltViewModel()) {
    LaunchedEffect(Unit) { vm.load() }
    val state by vm.state.collectAsStateWithLifecycle()
    val message by vm.message.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    MessageEffect(message, snackbar, vm::messageShown)
    val session = vm.session ?: return
    val self = session.myMember ?: return
    val partner = session.partners.firstOrNull()
    var tab by rememberSaveable { mutableStateOf(Tab.Me) }
    var chart by rememberSaveable { mutableStateOf(false) }
    val context = LocalContext.current
    val dark = androidx.compose.foundation.isSystemInDarkTheme()
    val list = (state as? Load.Ready)?.value
    val mine = list?.people?.firstOrNull { it.userId == self.userId }
    val theirs = partner?.let { p -> list?.people?.firstOrNull { it.userId == p.userId } }
    val bothShown = mine?.answers != null && theirs?.answers != null
    val shown = when {
        tab == Tab.Together || chart -> if (bothShown && partner != null) listOf(self, partner) else listOf(self)
        tab == Tab.Partner && partner != null -> listOf(partner)
        else -> listOf(self)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("Limits")
                        Text(
                            if (session.solo) "For you, in your own role" else "${self.displayName} and ${partner?.displayName ?: "your partner"}",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                },
                navigationIcon = { if (chart) IconButton(onClick = { chart = false }) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Back") } else MenuButton() },
                actions = {
                    SafeWordAction()
                    if (list != null) IconButton(onClick = { vm.share(context, list, shown, dark) }) { Icon(Icons.Outlined.Share, "Share as an image") }
                    IconButton(onClick = onEdit) { Icon(Icons.Outlined.Edit, "Change your answers") }
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        Column(
            Modifier.padding(padding).fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp).padding(bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            when (val s = state) {
                Load.Loading -> LoadingBox()
                is Load.Failed -> ErrorBox(s.message, { vm.load() })
                is Load.Ready -> {
                    val l = s.value
                    if (mine == null) return@Column
                    if (mine.finishedAt == null) {
                        Surface(color = MaterialTheme.colorScheme.secondaryContainer, shape = RoundedCornerShape(24.dp)) {
                            Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text(if (mine.rated > 0) "You've rated ${mine.rated} of ${l.items.size}" else "Fill in your limits", style = MaterialTheme.typography.titleMedium)
                                Text(
                                    "Rate each item for yourself, as the ${self.role.label}: love it, like it, curious, a soft limit or a hard limit. Skip anything you'd rather not say." +
                                        (partner?.let { " ${it.displayName} sees your answers once you've both finished." } ?: ""),
                                    style = MaterialTheme.typography.bodyMedium,
                                )
                                Button(onClick = onEdit) { Text(if (mine.rated > 0) "Carry on" else "Start") }
                            }
                        }
                    }
                    if (partner != null && !session.solo && !chart) {
                        SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                            listOf(Tab.Me to self.displayName, Tab.Partner to partner.displayName, Tab.Together to "Together").forEachIndexed { i, (t, label) ->
                                SegmentedButton(selected = tab == t, onClick = { tab = t }, shape = SegmentedButtonDefaults.itemShape(i, 3)) { Text(label, maxLines = 1, overflow = TextOverflow.Ellipsis) }
                            }
                        }
                    }
                    when {
                        chart -> Chart(l, shown) { vm.share(context, l, shown, dark) }
                        tab == Tab.Together && partner != null ->
                            if (bothShown) Together(l, self, partner, mine.answers.orEmpty(), theirs?.answers.orEmpty()) { chart = true } else Waiting(mine, theirs, partner, onEdit)
                        tab == Tab.Partner && partner != null ->
                            if (theirs?.answers != null) Person(l, partner, theirs) { chart = true } else Waiting(mine, theirs, partner, onEdit)
                        else -> Person(l, self, mine) { chart = true }
                    }
                }
            }
        }
    }
}

@Composable
private fun Waiting(mine: LimitPerson, theirs: LimitPerson?, partner: Member, onEdit: () -> Unit) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
        EmptyBox(
            "Shown once you've both finished",
            when {
                theirs?.finishedAt != null -> "${partner.displayName} has finished. Yours are next."
                mine.finishedAt != null -> "You've finished. ${partner.displayName} has rated ${theirs?.rated ?: 0} so far."
                else -> "Neither of you sees the other's answers until you've both finished, so nobody answers to match."
            },
        )
        if (mine.finishedAt == null) Button(onClick = onEdit) { Text("Finish yours") }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Pills(icon: androidx.compose.ui.graphics.vector.ImageVector, rating: Rating, title: String, items: List<LimitItem>) {
    if (items.isEmpty()) return
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Icon(icon, null, tint = rating.color, modifier = Modifier.size(20.dp))
            Text(title, style = MaterialTheme.typography.titleSmall)
        }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items.forEach { i ->
                Surface(shape = CircleShape, color = rating.color.copy(alpha = 0.13f), border = BorderStroke(1.dp, rating.color)) {
                    Text(i.title, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp))
                }
            }
        }
    }
}

private val dayFmt = DateTimeFormatter.ofPattern("MMM d")

@Composable
private fun Person(list: LimitList, member: Member, person: LimitPerson, onChart: () -> Unit) {
    val answers = person.answers.orEmpty()
    fun pick(r: Rating) = list.items.filter { answers[it.key]?.rating == r.key }
    Surface(color = MaterialTheme.colorScheme.surfaceContainerLow, shape = RoundedCornerShape(24.dp)) {
        Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Box(Modifier.size(48.dp).clip(CircleShape).background(MaterialTheme.colorScheme.secondaryContainer), contentAlignment = Alignment.Center) {
                    Text(member.displayName.take(1).uppercase(), style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.onSecondaryContainer)
                }
                Column {
                    Text(member.displayName, style = MaterialTheme.typography.titleLarge)
                    Text(
                        listOf(member.role.label, person.updatedAt?.let { "updated " + parseInstant(it).atZone(ZoneId.systemDefault()).format(dayFmt) } ?: "nothing rated yet").joinToString(" · "),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            Pills(Icons.Filled.Block, Rating.Hard, "Hard limits", pick(Rating.Hard))
            Pills(Icons.Filled.DoNotDisturbOn, Rating.Soft, "Soft limits, go slow", pick(Rating.Soft))
            Pills(Icons.Filled.Favorite, Rating.Love, "Loves", pick(Rating.Love))
        }
    }
    Surface(color = MaterialTheme.colorScheme.surfaceContainerLow, shape = RoundedCornerShape(24.dp)) {
        Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Everything", style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                TextButton(onClick = onChart) { Text("Chart view") }
            }
            Legend()
            byCategory(list.items).forEach { (category, items) ->
                val rated = items.filter { answers[it.key]?.rating != null }
                if (rated.isNotEmpty()) {
                    Text(category.uppercase(), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 8.dp))
                    rated.forEach { i ->
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Dot(answers[i.key]?.rating)
                            Text(i.title, style = MaterialTheme.typography.bodyMedium)
                        }
                    }
                }
            }
            val notes = list.items.filter { !answers[it.key]?.note.isNullOrEmpty() }
            if (notes.isNotEmpty()) Notes(notes.map { Triple(it, null, answers[it.key]!!.note) })
        }
    }
}

@Composable
private fun Notes(rows: List<Triple<LimitItem, String?, String>>) {
    Column(Modifier.padding(top = 8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text("NOTES", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
        rows.forEach { (item, who, note) ->
            Text(
                androidx.compose.ui.text.buildAnnotatedString {
                    pushStyle(androidx.compose.ui.text.SpanStyle(fontWeight = FontWeight.Medium))
                    append(item.title)
                    pop()
                    append((who?.let { " · $it" } ?: "") + ": “$note”")
                },
                style = MaterialTheme.typography.bodyMedium,
            )
        }
    }
}

@Composable
private fun Together(list: LimitList, a: Member, b: Member, answersA: Map<String, LimitAnswer>, answersB: Map<String, LimitAnswer>, onChart: () -> Unit) {
    val (off, want, talk) = remember(list, answersA, answersB) { together(list.items, answersA, answersB) }
    fun hardBy(i: LimitItem) = listOfNotNull(a.displayName.takeIf { answersA[i.key]?.rating == "hard" }, b.displayName.takeIf { answersB[i.key]?.rating == "hard" }).joinToString(" and ")
    fun why(i: LimitItem): String {
        val ra = answersA[i.key]?.rating
        val rb = answersB[i.key]?.rating
        return when {
            ra == "soft" || rb == "soft" -> "Go slow"
            ra == "curious" && rb != "curious" -> "${a.displayName}'s curious"
            rb == "curious" && ra != "curious" -> "${b.displayName}'s curious"
            else -> "Both curious"
        }
    }
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text("Left dot ${a.displayName}, right dot ${b.displayName}.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
        TextButton(onClick = onChart) { Text("Chart view") }
    }
    @Composable
    fun group(title: String, color: Color, items: List<LimitItem>, side: (LimitItem) -> String?, empty: String) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(title, style = MaterialTheme.typography.titleSmall, color = color)
            if (items.isEmpty()) Text(empty, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            else Column(Modifier.clip(RoundedCornerShape(16.dp)), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                items.forEach { i ->
                    Row(
                        Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surfaceContainerLow).padding(horizontal = 16.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) { Dot(answersA[i.key]?.rating, 14); Dot(answersB[i.key]?.rating, 14) }
                        Text(i.title, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
                        side(i)?.takeIf { it.isNotEmpty() }?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    }
                }
            }
        }
    }
    group("Off the table", MaterialTheme.colorScheme.error, off, ::hardBy, "Neither of you marked a hard limit.")
    group("You both want", Rating.Love.color, want, { null }, "Nothing you both love or like yet.")
    group("Worth talking about", Color(0xFFA77A00), talk, ::why, "Nothing in between.")
}

/** The KinkList-style chart: a column of dots for each person, by category. */
@Composable
private fun Chart(list: LimitList, people: List<Member>, onShare: () -> Unit) {
    fun answersOf(m: Member) = list.people.firstOrNull { it.userId == m.userId }?.answers.orEmpty()
    Legend()
    FilledTonalButton(onClick = onShare) {
        Icon(Icons.Outlined.Share, null, Modifier.size(18.dp))
        Text("  Save as image")
    }
    byCategory(list.items).forEach { (category, items) ->
        val shown = items.filter { i -> people.any { answersOf(it)[i.key]?.rating != null } }
        if (shown.isNotEmpty()) {
            Surface(color = MaterialTheme.colorScheme.surfaceContainerLow, shape = RoundedCornerShape(24.dp)) {
                Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(category, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                        people.forEach { Text(it.displayName.take(1).uppercase(), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.width(24.dp)) }
                    }
                    shown.forEach { i ->
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(i.title, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                            people.forEach { m -> Box(Modifier.width(24.dp), contentAlignment = Alignment.CenterStart) { Dot(answersOf(m)[i.key]?.rating, 14) } }
                        }
                    }
                }
            }
        }
    }
    val notes = people.flatMap { m -> list.items.filter { !answersOf(m)[it.key]?.note.isNullOrEmpty() }.map { Triple(it, m.displayName.takeIf { people.size > 1 }, answersOf(m)[it.key]!!.note) } }
    if (notes.isNotEmpty()) Surface(color = MaterialTheme.colorScheme.surfaceContainer, shape = RoundedCornerShape(24.dp)) { Box(Modifier.fillMaxWidth().padding(16.dp)) { Notes(notes) } }
}

/** Filling in your own answers, one category at a time. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LimitsEditScreen(onClose: () -> Unit, vm: LimitsViewModel = hiltViewModel()) {
    LaunchedEffect(Unit) { vm.load() }
    val state by vm.state.collectAsStateWithLifecycle()
    val message by vm.message.collectAsStateWithLifecycle()
    val busy by vm.busy.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    MessageEffect(message, snackbar, vm::messageShown)
    val session = vm.session ?: return
    val self = session.myMember ?: return
    val partner = session.partners.firstOrNull()
    var page by rememberSaveable { mutableIntStateOf(0) }
    var noting by remember { mutableStateOf<LimitItem?>(null) }
    var adding by remember { mutableStateOf(false) }
    val scroll = rememberScrollState()
    val scope = rememberCoroutineScope()
    val list = (state as? Load.Ready)?.value
    val mine = list?.people?.firstOrNull { it.userId == self.userId }
    val answers = mine?.answers.orEmpty()
    val groups = list?.let { byCategory(it.items) }.orEmpty()
    val at = page.coerceIn(0, (groups.size - 1).coerceAtLeast(0))
    fun go(n: Int) { page = n; scope.launch { scroll.scrollTo(0) } }
    val finish = { if (mine?.finishedAt != null) onClose() else vm.finish(partner?.displayName, onClose) }

    Scaffold(
        topBar = {
            Column {
                TopAppBar(
                    title = {
                        Column {
                            Text("Your limits")
                            if (list != null && mine != null) {
                                Text("For you as the ${self.role.label} · ${mine.rated} of ${list.items.size}", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    },
                    navigationIcon = { IconButton(onClick = onClose) { Icon(Icons.Outlined.Close, "Close") } },
                    actions = { TextButton(onClick = finish, enabled = !busy && mine != null) { Text(if (mine?.finishedAt != null) "Done" else "Finish") } },
                )
                if (list != null && mine != null) {
                    LinearProgressIndicator(progress = { mine.rated.toFloat() / list.items.size.coerceAtLeast(1) }, modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp), drawStopIndicator = {})
                }
            }
        },
        bottomBar = {
            if (groups.isNotEmpty()) {
                Surface(color = MaterialTheme.colorScheme.surfaceContainer) {
                    Row(Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        OutlinedButton(onClick = { go(at - 1) }, enabled = at > 0, modifier = Modifier.weight(1f)) {
                            Icon(Icons.AutoMirrored.Outlined.ArrowBack, null, Modifier.size(18.dp))
                            Text("  " + (if (at > 0) groups[at - 1].first else "Back"), maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                        if (at < groups.size - 1) {
                            Button(onClick = { go(at + 1) }, modifier = Modifier.weight(1f)) {
                                Text(groups[at + 1].first + "  ", maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Icon(Icons.AutoMirrored.Outlined.ArrowForward, null, Modifier.size(18.dp))
                            }
                        } else {
                            Button(onClick = finish, enabled = !busy, modifier = Modifier.weight(1f)) { Text(if (mine?.finishedAt != null) "Done" else "Finish") }
                        }
                    }
                }
            }
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        Column(
            Modifier.padding(padding).fillMaxSize().verticalScroll(scroll).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            when (val s = state) {
                Load.Loading -> LoadingBox()
                is Load.Failed -> ErrorBox(s.message, { vm.load() })
                is Load.Ready -> {
                    if (groups.isEmpty()) return@Column
                    Surface(color = MaterialTheme.colorScheme.surfaceContainerLow, shape = RoundedCornerShape(24.dp)) {
                        Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Legend()
                            Text(
                                "Tap one for each, and tap it again to clear it. Skip anything you'd rather not say." +
                                    (partner?.let { " ${it.displayName} sees your answers once you've both finished." } ?: ""),
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                    val (category, items) = groups[at]
                    Row(verticalAlignment = Alignment.Bottom) {
                        Text(category, style = MaterialTheme.typography.headlineSmall, modifier = Modifier.weight(1f))
                        Text("${items.count { answers[it.key]?.rating != null }} of ${items.size}", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Column(Modifier.clip(RoundedCornerShape(24.dp)), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        items.forEach { i ->
                            val now = answers[i.key]
                            Column(Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surfaceContainerLow).padding(horizontal = 16.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text(i.title, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
                                    IconButton(onClick = { noting = i }) {
                                        Icon(Icons.Outlined.EditNote, "Note on “${i.title}”", tint = if (now?.note.isNullOrEmpty()) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.primary)
                                    }
                                    if (i.custom && i.createdBy == self.userId) IconButton(onClick = { vm.remove(i) }) { Icon(Icons.Outlined.Delete, "Remove “${i.title}”") }
                                }
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Rating.entries.forEach { r ->
                                        val on = now?.rating == r.key
                                        Box(
                                            Modifier.size(44.dp).clip(CircleShape).clickable { vm.answer(i, if (on) null else r.key, now?.note.orEmpty()) }.semantics { contentDescription = r.label + if (on) ", chosen" else "" },
                                            contentAlignment = Alignment.Center,
                                        ) {
                                            Box(
                                                Modifier.size(if (on) 34.dp else 30.dp)
                                                    .then(if (on) Modifier.border(2.dp, r.color, RoundedCornerShape(12.dp)).padding(3.dp) else Modifier)
                                                    .clip(RoundedCornerShape(10.dp))
                                                    .background(if (on) r.color else Color.Transparent)
                                                    .border(3.dp, r.color.copy(alpha = if (on) 1f else 0.7f), RoundedCornerShape(10.dp)),
                                            )
                                        }
                                    }
                                }
                                now?.note?.takeIf { it.isNotEmpty() }?.let {
                                    Text("“$it”", style = MaterialTheme.typography.bodyMedium, fontStyle = FontStyle.Italic, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                            }
                        }
                    }
                    TextButton(onClick = { adding = true }) {
                        Icon(Icons.Outlined.Add, null, Modifier.size(18.dp))
                        Text("  Add your own")
                    }
                    Spacer(Modifier.height(8.dp))
                }
            }
        }
    }

    noting?.let { item ->
        var note by remember(item.key) { mutableStateOf(answers[item.key]?.note.orEmpty()) }
        AlertDialog(
            onDismissRequest = { noting = null },
            title = { Text(item.title) },
            text = { OutlinedTextField(note, { note = it.take(500) }, label = { Text("Note") }, placeholder = { Text("Only soft ones, and not for long") }, modifier = Modifier.fillMaxWidth()) },
            confirmButton = { Button(onClick = { vm.answer(item, answers[item.key]?.rating, note.trim()); noting = null }) { Text("Save") } },
            dismissButton = { TextButton(onClick = { noting = null }) { Text("Cancel") } },
        )
    }
    if (adding && groups.isNotEmpty()) {
        var title by remember { mutableStateOf("") }
        var category by remember { mutableStateOf(groups[at].first) }
        var open by remember { mutableStateOf(false) }
        AlertDialog(
            onDismissRequest = { adding = false },
            title = { Text("Add your own") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    OutlinedTextField(title, { title = it.take(80) }, label = { Text("What") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    ExposedDropdownMenuBox(expanded = open, onExpandedChange = { open = it }) {
                        OutlinedTextField(
                            category,
                            {},
                            readOnly = true,
                            label = { Text("Category") },
                            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(open) },
                            modifier = Modifier.menuAnchor(MenuAnchorType.PrimaryNotEditable).fillMaxWidth(),
                        )
                        ExposedDropdownMenu(expanded = open, onDismissRequest = { open = false }) {
                            LIMIT_CATEGORIES.forEach { c -> DropdownMenuItem(text = { Text(c) }, onClick = { category = c; open = false }) }
                        }
                    }
                    Text("You both see it on the list and can each rate it.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            },
            confirmButton = {
                Button(onClick = {
                    val c = category
                    vm.add(c, title) {
                        adding = false
                    }
                }, enabled = title.isNotBlank() && !busy) { Text("Add") }
            },
            dismissButton = { TextButton(onClick = { adding = false }) { Text("Cancel") } },
        )
    }
}

/** The chart as a picture, for sharing: the same layout as the web's saved image, in one column for a phone. */
private fun chartBitmap(list: LimitList, people: List<Member>, dark: Boolean): Bitmap {
    fun answersOf(m: Member) = list.people.firstOrNull { it.userId == m.userId }?.answers.orEmpty()
    val groups = byCategory(list.items).map { (c, items) -> c to items.filter { i -> people.any { answersOf(it)[i.key]?.rating != null } } }.filter { it.second.isNotEmpty() }
    val s = 2f
    val w = 460f
    val pad = 24f
    val row = 30f
    val cardW = w - pad * 2
    val height = 110f + groups.sumOf { (56 + it.second.size * row + pad).toDouble() }.toFloat() + pad
    val bmp = Bitmap.createBitmap((w * s).toInt(), (height * s).toInt(), Bitmap.Config.ARGB_8888)
    val c = android.graphics.Canvas(bmp)
    c.scale(s, s)
    val fg = if (dark) 0xFFF1DEDA.toInt() else 0xFF231918.toInt()
    val muted = if (dark) 0xFFD8C2BE.toInt() else 0xFF534341.toInt()
    c.drawColor(if (dark) 0xFF1A1110.toInt() else 0xFFFFF8F6.toInt())
    val text = Paint(Paint.ANTI_ALIAS_FLAG)
    fun font(size: Float, bold: Boolean = false, color: Int = fg) = text.apply { textSize = size; typeface = if (bold) Typeface.DEFAULT_BOLD else Typeface.DEFAULT; this.color = color }
    val fill = Paint(Paint.ANTI_ALIAS_FLAG)
    c.drawText("Limits", pad, 48f, font(28f, true))
    c.drawText(people.joinToString(" and ") { it.displayName }, pad, 74f, font(15f, color = muted))
    var lx = pad
    Rating.entries.forEach { r ->
        fill.color = r.color.toArgb(); fill.style = Paint.Style.FILL
        c.drawCircle(lx + 6, 94f, 6f, fill)
        font(12f)
        c.drawText(r.label, lx + 16, 98f, text)
        lx += 22 + text.measureText(r.label) + 10
    }
    var y = 116f
    for ((category, items) in groups) {
        fill.color = if (dark) 0xFF271D1C.toInt() else 0xFFFDEDEA.toInt()
        c.drawRoundRect(RectF(pad, y, pad + cardW, y + 56 + items.size * row), 16f, 16f, fill)
        c.drawText(category, pad + 18, y + 32, font(17f, true))
        people.forEachIndexed { i, p -> c.drawText(p.displayName.take(1).uppercase(), pad + cardW - 30 - (people.size - 1 - i) * 34 - 4, y + 32, font(12f, color = muted)) }
        items.forEachIndexed { n, item ->
            val cy = y + 62 + n * row
            font(15f)
            var t = item.title
            val max = cardW - 40 - people.size * 34
            while (text.measureText(t) > max && t.length > 1) t = t.dropLast(1)
            c.drawText(if (t == item.title) t else "$t…", pad + 18, cy + 5, text)
            people.forEachIndexed { i, p ->
                val cx = pad + cardW - 26 - (people.size - 1 - i) * 34
                val r = Rating.of(answersOf(p)[item.key]?.rating)
                if (r != null) { fill.color = r.color.toArgb(); fill.style = Paint.Style.FILL; c.drawCircle(cx, cy, 8f, fill) }
                else { fill.color = muted; fill.style = Paint.Style.STROKE; fill.strokeWidth = 2f; c.drawCircle(cx, cy, 7f, fill); fill.style = Paint.Style.FILL }
            }
        }
        y += 56 + items.size * row + pad
    }
    return bmp
}
