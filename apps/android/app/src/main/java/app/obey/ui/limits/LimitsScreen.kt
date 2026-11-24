package app.obey.ui.limits

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.material.icons.outlined.IosShare
import androidx.compose.material.icons.outlined.MoreHoriz
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.sp
import app.obey.ui.common.inkButtonColors
import app.obey.ui.common.Eyebrow
import app.obey.ui.common.BackLink
import app.obey.ui.common.Diamond
import app.obey.ui.common.DiamondState
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
import app.obey.ui.common.Button
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import app.obey.ui.common.TonalButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.OutlinedButton
import app.obey.ui.common.LettersField
import androidx.compose.material3.Scaffold
import app.obey.ui.common.PillSegment
import app.obey.ui.common.PillRow
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
import app.obey.api.LimitSides
import app.obey.api.Role as MemberRole
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

/** The five answers, best to worst. Each shows as a diamond: filled, half, open, accent outline, filled accent. */
enum class Rating(val key: String, val label: String) {
    Love("love", "Love it"),
    Like("like", "Like it"),
    Curious("curious", "Curious"),
    Soft("soft", "Soft limit"),
    Hard("hard", "Hard limit");

    companion object {
        fun of(key: String?) = entries.firstOrNull { it.key == key }
    }
}

/** The categories someone can file their own item under, as on the web. */
val LIMIT_CATEGORIES = listOf("Service & protocol", "Restraint", "Impact & sensation", "Words & mind", "Body & care", "Out in the world", "Your own")

fun byCategory(items: List<LimitItem>): List<Pair<String, List<LimitItem>>> = items.groupBy { it.category }.toList()

private fun keen(r: String?) = r == "love" || r == "like"

fun otherSide(side: String) = if (side == "dom") "sub" else "dom"

/** The side someone usually answers on: their role's, or for a switch the side opposite their partner's role. */
fun usualSide(role: MemberRole, partner: MemberRole?): String = when (role) {
    MemberRole.Dominant -> "dom"
    MemberRole.Submissive -> "sub"
    MemberRole.Switch -> if (partner == MemberRole.Dominant) "sub" else "dom"
}

/** A side's sentence with the partner's name in it, capitalised ("your partner" when there isn't one yet). */
fun limitSentence(template: String, partner: String?) = template.replace("{name}", partner ?: "your partner").replaceFirstChar { it.uppercase() }

/** One way round for one item, said to you: your answer for your side beside your partner's for theirs. */
data class LimitRow(val item: LimitItem, val side: String, val text: String, val mine: LimitAnswer?, val theirs: LimitAnswer?)

/** Every item both ways round, in category order, your usual side first. Items people added keep their title in front. */
fun limitRows(list: LimitList, me: String, partnerId: String?, partnerName: String?, usual: String): List<LimitRow> {
    val mine = list.people.firstOrNull { it.userId == me }?.sides
    val theirs = partnerId?.let { id -> list.people.firstOrNull { it.userId == id }?.sides }
    return byCategory(list.items).flatMap { (_, items) ->
        items.flatMap { item ->
            listOf(usual, otherSide(usual)).map { side ->
                val said = limitSentence(if (side == "dom") item.sentences.dom else item.sentences.sub, partnerName)
                val text = if (item.custom) "${item.title}, ${said.replaceFirstChar { it.lowercase() }}" else said
                LimitRow(item, side, text, mine?.get(side)?.get(item.key), theirs?.get(otherSide(side))?.get(item.key))
            }
        }
    }
}

enum class Verdict(val label: String) { Yes("Yes"), Maybe("Maybe"), No("No") }

/**
 * Where a row lands once both have finished: a hard limit from either of you is off the table; both loving or liking it
 * is something you both want; and where one of you is curious or wants to go slow, it's worth a talk.
 */
fun verdict(r: LimitRow): Verdict? {
    val x = r.mine?.rating
    val y = r.theirs?.rating
    return when {
        x == "hard" || y == "hard" -> Verdict.No
        keen(x) && keen(y) -> Verdict.Yes
        x != null && y != null && listOf(x, y).any { it == "curious" || it == "soft" } -> Verdict.Maybe
        else -> null
    }
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

    /** Rates (or skips, with a null rating) one side of an item, updating the list in place so tapping through stays quick. */
    fun answer(item: LimitItem, side: String, rating: String?, note: String) {
        val me = session?.userId ?: return
        val ready = (_state.value as? Load.Ready)?.value ?: return
        _state.value = Load.Ready(
            ready.copy(
                people = ready.people.map { p ->
                    if (p.userId != me) p
                    else {
                        val sides = p.sides ?: LimitSides()
                        val answers = sides[side].toMutableMap()
                        if (rating != null || note.isNotEmpty()) answers[item.key] = LimitAnswer(rating, note) else answers.remove(item.key)
                        val next = if (side == "dom") sides.copy(dom = answers) else sides.copy(sub = answers)
                        p.copy(sides = next, rated = (next.dom.filterValues { it.rating != null }.keys + next.sub.filterValues { it.rating != null }.keys).size)
                    }
                },
            ),
        )
        action(onError = { load() }) { api.answerLimit(sessions.requireRelationshipId(), item.key, LimitAnswerInput(rating, note, side)) }
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

    /** Draws the rows to a PNG in the cache and opens the share sheet. */
    fun share(context: Context, rows: List<LimitRow>, names: List<String>, colors: ChartColors) = action {
        val file = withContext(Dispatchers.Default) {
            val bitmap = chartBitmap(rows, names, colors)
            val dir = File(context.cacheDir, "share").apply { mkdirs() }
            File(dir, "limits.png").also { f -> f.outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) } }
        }
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.files", file)
        val send = Intent(Intent.ACTION_SEND).setType("image/png").putExtra(Intent.EXTRA_STREAM, uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        context.startActivity(Intent.createChooser(send, "Limits"))
    }
}

/** The theme's colours, read in the composable and handed to the picture drawn off the main thread. */
data class ChartColors(val ink: Int, val muted: Int, val line: Int, val accent: Int, val paper: Int)

@Composable
private fun chartColors(): ChartColors {
    val c = MaterialTheme.colorScheme
    return ChartColors(c.onSurface.toArgb(), c.onSurfaceVariant.toArgb(), c.outlineVariant.toArgb(), c.primary.toArgb(), c.surface.toArgb())
}

/** The item the fill-in screen opens on, when the list sends someone to change one answer. */
private var openAt: String? = null

/** A rating as a diamond, as on the web: love filled, like half, curious open, soft an accent outline, hard filled accent. */
@Composable
private fun RatingMark(rating: String?, size: Dp = 16.dp) {
    val r = Rating.of(rating)
    val m = Modifier.semantics { contentDescription = r?.label ?: "Skipped" }
    when (r) {
        null -> Diamond(DiamondState.Off, m, size)
        Rating.Love -> Diamond(DiamondState.Done, m, size)
        Rating.Like -> Diamond(DiamondState.Waiting, m, size)
        Rating.Curious -> Diamond(DiamondState.Open, m, size)
        Rating.Soft, Rating.Hard -> {
            val a = MaterialTheme.colorScheme.primary
            Box(m.size(size).rotate(45f).background(if (r == Rating.Hard) a else Color.Transparent).border(1.5.dp, a))
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Key() {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Rating.entries.forEach { r ->
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                RatingMark(r.key, 10.dp)
                Text(r.label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

/**
 * Mockup 24, with each item said both ways round (limits-sides/4-tabs): once you've both finished, tabs for what you
 * both want, what's worth a talk, what's off the table and every answer; each row is a sentence with your diamond and
 * your partner's.
 */
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
    val partner = if (session.solo) null else session.partners.firstOrNull()
    val usual = usualSide(self.role, partner?.role)
    val context = LocalContext.current
    val colors = chartColors()
    var picked by rememberSaveable { mutableStateOf<String?>(null) }
    val list = (state as? Load.Ready)?.value
    val mine = list?.people?.firstOrNull { it.userId == self.userId }
    val theirs = partner?.let { p -> list?.people?.firstOrNull { it.userId == p.userId } }
    val both = partner != null && mine?.sides != null && theirs?.sides != null
    val rows = list?.let { limitRows(it, self.userId, if (both) partner!!.userId else null, partner?.displayName, usual) }.orEmpty()
    val counts = Verdict.entries.associateWith { v -> rows.count { verdict(it) == v } }
    val answered = rows.filter { r -> r.mine?.rating != null || r.mine?.note?.isNotEmpty() == true || (both && (r.theirs?.rating != null || r.theirs?.note?.isNotEmpty() == true)) }
    val tab = picked ?: Verdict.entries.firstOrNull { counts[it]!! > 0 }?.name ?: "All"
    val shown = if (!both || tab == "All") answered else rows.filter { verdict(it)?.name == tab }
    val names = if (both) listOf(self.displayName, partner!!.displayName) else listOf(self.displayName)
    val total = list?.items?.size ?: 0
    val edit = { key: String? -> openAt = key; onEdit() }
    val status = when {
        mine == null -> null
        both -> "You've both finished. Answers you didn't share stay private."
        partner == null -> if (mine.finishedAt != null) "You've rated ${mine.rated} of $total." else "You've rated ${mine.rated} of $total so far."
        mine.finishedAt != null -> "You've finished. ${partner.displayName} has rated ${theirs?.rated ?: 0} of $total; you'll see each other's once they finish."
        theirs?.finishedAt != null -> "${partner.displayName} has finished. You'll see each other's once you do."
        else -> "You've rated ${mine.rated} of $total. ${partner.displayName} sees yours only once you've both finished."
    }

    Scaffold(
        topBar = {
            LargeTopAppBar(
                title = { Text("Limits") },
                navigationIcon = { MenuButton() },
                actions = {
                    if (list != null) IconButton(onClick = { vm.share(context, rows, names, colors) }) { Icon(Icons.Outlined.IosShare, "Save as an image") }
                    SafeWordAction()
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        Column(
            Modifier.padding(padding).fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp).padding(bottom = 32.dp),
            verticalArrangement = Arrangement.spacedBy(24.dp),
        ) {
            when (val s = state) {
                Load.Loading -> LoadingBox()
                is Load.Failed -> ErrorBox(s.message, { vm.load() })
                is Load.Ready -> {
                    if (mine == null) return@Column
                    status?.let { Text(it, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    if (mine.finishedAt == null) Button(onClick = { edit(null) }, colors = inkButtonColors()) { Text(if (mine.rated > 0) "Carry on" else "Start") }
                    if (both) {
                        PillRow {
                            Verdict.entries.forEach { v ->
                                PillSegment(selected = tab == v.name, onClick = { picked = v.name }) { Text("${v.label} ${counts[v]}", maxLines = 1) }
                            }
                            PillSegment(selected = tab == "All", onClick = { picked = "All" }) { Text("All ${answered.size}", maxLines = 1) }
                        }
                    }
                    Rows(shown, if (both) listOf("You", partner!!.displayName) else listOf("You")) { edit(it.key) }
                    if (mine.finishedAt != null) OutlinedButton(onClick = { edit(null) }) { Text("Change your answers") }
                }
            }
        }
    }
}

/** Rows by category, a diamond per person; notes sit under their row, and tapping a row changes your answer. */
@Composable
private fun Rows(rows: List<LimitRow>, names: List<String>, onOpen: (LimitItem) -> Unit) {
    if (rows.isEmpty()) return
    val c = MaterialTheme.colorScheme
    Column(verticalArrangement = Arrangement.spacedBy(24.dp)) {
        rows.groupBy { it.item.category }.forEach { (category, items) ->
            Column {
                Row {
                    Text(category, style = MaterialTheme.typography.bodyMedium, color = c.onSurfaceVariant, modifier = Modifier.weight(1f))
                    Text(names.joinToString(" · "), style = MaterialTheme.typography.bodyMedium, color = c.onSurfaceVariant)
                }
                items.forEach { r ->
                    Row(Modifier.fillMaxWidth().heightIn(min = 56.dp).clickable { onOpen(r.item) }.padding(vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(r.text, style = MaterialTheme.typography.bodyLarge)
                            listOfNotNull(
                                r.mine?.note?.takeIf { it.isNotEmpty() }?.let { "You" to it },
                                r.theirs?.note?.takeIf { it.isNotEmpty() && names.size > 1 }?.let { names[1] to it },
                            ).forEach { (who, note) ->
                                Text(
                                    "“$note” · $who",
                                    style = MaterialTheme.typography.titleLarge.copy(fontSize = 18.sp, lineHeight = 24.sp, fontStyle = FontStyle.Italic),
                                    color = c.onSurfaceVariant,
                                    modifier = Modifier.padding(top = 4.dp),
                                )
                            }
                        }
                        listOf(r.mine, r.theirs).take(names.size).forEach { a -> Box(Modifier.width(40.dp), contentAlignment = Alignment.Center) { RatingMark(a?.rating, 18.dp) } }
                    }
                    HorizontalDivider(color = c.outlineVariant)
                }
            }
        }
        Key()
    }
}

/** Mockup 73, both ways round: one item at a time, a sentence for each side with the five answers under it. */
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
    val partner = if (session.solo) null else session.partners.firstOrNull()
    var at by rememberSaveable { mutableStateOf<Int?>(null) }
    var noting by remember { mutableStateOf<Pair<LimitItem, String>?>(null) }
    var adding by remember { mutableStateOf(false) }
    var menu by remember { mutableStateOf(false) }
    val list = (state as? Load.Ready)?.value
    val mine = list?.people?.firstOrNull { it.userId == self.userId }
    val answers = mine?.sides ?: LimitSides()
    val usual = usualSide(self.role, partner?.role)
    fun rated(key: String) = answers.dom[key]?.rating != null || answers.sub[key]?.rating != null
    // In category order, so "4 of 12" counts within a category.
    val items = list?.let { byCategory(it.items).flatMap { (_, xs) -> xs } }.orEmpty()
    val index = at ?: run {
        val asked = openAt?.let { k -> items.indexOfFirst { it.key == k } } ?: -1
        if (asked >= 0) asked else items.indexOfFirst { !rated(it.key) }.let { if (it >= 0) it else items.size }
    }
    val item = items.getOrNull(index)
    fun go(n: Int) { at = n.coerceIn(0, items.size) }
    val finish = { if (mine?.finishedAt != null) onClose() else vm.finish(partner?.displayName, onClose) }
    val c = MaterialTheme.colorScheme

    Scaffold(
        topBar = {
            TopAppBar(
                title = {},
                navigationIcon = { BackLink("Limits", onClose) },
                actions = {
                    if (item != null && item.custom && item.createdBy == self.userId) {
                        Box {
                            IconButton(onClick = { menu = true }) { Icon(Icons.Outlined.MoreHoriz, "More options") }
                            DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                                DropdownMenuItem(text = { Text("Remove from the list") }, leadingIcon = { Icon(Icons.Outlined.Delete, null) }, onClick = { menu = false; vm.remove(item) })
                            }
                        }
                    }
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        Column(Modifier.padding(padding).fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp).padding(bottom = 24.dp)) {
            when (val s = state) {
                Load.Loading -> LoadingBox()
                is Load.Failed -> ErrorBox(s.message, { vm.load() })
                is Load.Ready -> {
                    if (mine == null) return@Column
                    val inCategory = item?.let { i -> items.filter { it.category == i.category } }.orEmpty()
                    Eyebrow(if (item != null) "${item.category} · ${inCategory.indexOf(item) + 1} of ${inCategory.size}" else "${mine.rated} of ${items.size} rated")
                    Box(Modifier.padding(top = 12.dp).fillMaxWidth().height(3.dp).background(c.outlineVariant)) {
                        Box(Modifier.fillMaxWidth(index.coerceAtMost(items.size).toFloat() / items.size.coerceAtLeast(1)).height(3.dp).background(c.onSurface))
                    }
                    if (item != null) {
                        Text(item.title, style = MaterialTheme.typography.displayMedium, modifier = Modifier.padding(top = 40.dp))
                        listOf(usual, otherSide(usual)).forEach { side ->
                            val a = answers[side][item.key]
                            val said = limitSentence(if (side == "dom") item.sentences.dom else item.sentences.sub, partner?.displayName)
                            Row(Modifier.padding(top = 28.dp).fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                                Text(said, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
                                Text(
                                    if (a?.note.isNullOrEmpty()) "Add a note" else "Change the note",
                                    style = MaterialTheme.typography.labelLarge,
                                    color = c.primary,
                                    modifier = Modifier.clickable { noting = item to side }.padding(vertical = 4.dp),
                                )
                            }
                            Row(Modifier.padding(top = 12.dp).fillMaxWidth().selectableGroup(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                Rating.entries.forEach { r ->
                                    val on = a?.rating == r.key
                                    Column(
                                        Modifier.weight(1f).height(64.dp).clip(RoundedCornerShape(12.dp))
                                            .background(if (on) c.surfaceContainer else c.surfaceContainerLowest)
                                            .border(1.dp, if (on) c.onSurface else c.outlineVariant, RoundedCornerShape(12.dp))
                                            .selectable(selected = on, role = Role.RadioButton) {
                                                vm.answer(item, side, if (on) null else r.key, a?.note.orEmpty())
                                                if (!on && answers[otherSide(side)][item.key]?.rating != null) go(index + 1)
                                            },
                                        horizontalAlignment = Alignment.CenterHorizontally,
                                        verticalArrangement = Arrangement.Center,
                                    ) {
                                        RatingMark(r.key, 13.dp)
                                        Text(r.label, style = MaterialTheme.typography.bodySmall, maxLines = 1, softWrap = false, modifier = Modifier.padding(top = 8.dp))
                                    }
                                }
                            }
                            a?.note?.takeIf { it.isNotEmpty() }?.let {
                                Text("“$it”", style = MaterialTheme.typography.titleLarge.copy(fontSize = 20.sp, lineHeight = 28.sp, fontStyle = FontStyle.Italic), color = c.onSurfaceVariant, modifier = Modifier.padding(top = 12.dp))
                            }
                        }
                        Row(Modifier.padding(top = 20.dp).fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                            Spacer(Modifier.weight(1f))
                            if (index > 0) TextButton(onClick = { go(index - 1) }) { Text("Previous", color = c.onSurfaceVariant) }
                            TextButton(onClick = { go(index + 1) }) { Text(if (rated(item.key)) "Next" else "Skip", color = c.onSurfaceVariant) }
                        }
                    } else {
                        Text(if (mine.finishedAt != null) "All saved" else "That's all of them", style = MaterialTheme.typography.displayMedium, modifier = Modifier.padding(top = 40.dp))
                        Text("You've rated ${mine.rated} of ${items.size}.", style = MaterialTheme.typography.bodyLarge, color = c.onSurfaceVariant, modifier = Modifier.padding(top = 8.dp))
                        Row(Modifier.padding(top = 24.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            Button(onClick = finish, enabled = !busy, colors = inkButtonColors()) { Text(if (mine.finishedAt != null) "Done" else "Finish") }
                            OutlinedButton(onClick = { adding = true }) { Text("Add your own") }
                        }
                        if (items.isNotEmpty()) TextButton(onClick = { go(0) }, modifier = Modifier.padding(top = 8.dp)) { Text("Start again from the top") }
                    }
                    if (partner != null) {
                        Text(
                            "${partner.displayName} sees your answers only once you've both finished.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = c.onSurfaceVariant,
                            textAlign = TextAlign.Center,
                            modifier = Modifier.fillMaxWidth().padding(top = 48.dp),
                        )
                    }
                }
            }
        }
    }

    noting?.let { (noted, side) ->
        var note by remember(noted.key, side) { mutableStateOf(answers[side][noted.key]?.note.orEmpty()) }
        AlertDialog(
            onDismissRequest = { noting = null },
            title = { Text(limitSentence(if (side == "dom") noted.sentences.dom else noted.sentences.sub, partner?.displayName)) },
            text = { LettersField(note, { note = it.take(500) }, label = { Text("Note") }, placeholder = { Text("Only soft ones, and not for long") }, modifier = Modifier.fillMaxWidth()) },
            confirmButton = { Button(onClick = { vm.answer(noted, side, answers[side][noted.key]?.rating, note.trim()); noting = null }, colors = inkButtonColors()) { Text("Save") } },
            dismissButton = { TextButton(onClick = { noting = null }) { Text("Cancel") } },
        )
    }
    if (adding) {
        var title by remember { mutableStateOf("") }
        var category by remember { mutableStateOf(LIMIT_CATEGORIES.last()) }
        var open by remember { mutableStateOf(false) }
        AlertDialog(
            onDismissRequest = { adding = false },
            title = { Text("Add your own") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    LettersField(title, { title = it.take(80) }, label = { Text("What") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    ExposedDropdownMenuBox(expanded = open, onExpandedChange = { open = it }) {
                        LettersField(
                            category,
                            {},
                            readOnly = true,
                            label = { Text("Category") },
                            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(open) },
                            modifier = Modifier.menuAnchor(MenuAnchorType.PrimaryNotEditable).fillMaxWidth(),
                        )
                        ExposedDropdownMenu(expanded = open, onDismissRequest = { open = false }) {
                            LIMIT_CATEGORIES.forEach { cat -> DropdownMenuItem(text = { Text(cat) }, onClick = { category = cat; open = false }) }
                        }
                    }
                }
            },
            confirmButton = {
                Button(onClick = {
                    val t = title.trim()
                    vm.add(category, t) {
                        adding = false
                        openAt = null
                        at = null
                    }
                }, enabled = title.isNotBlank() && !busy, colors = inkButtonColors()) { Text("Add") }
            },
            dismissButton = { TextButton(onClick = { adding = false }) { Text("Cancel") } },
        )
    }
}

/** The rows as a picture, for sharing, in the theme's colours: one column for a phone. */
private fun chartBitmap(rows: List<LimitRow>, names: List<String>, colors: ChartColors): Bitmap {
    val both = names.size > 1
    val groups = rows.filter { it.mine?.rating != null || (both && it.theirs?.rating != null) }.groupBy { it.item.category }.toList()
    val s = 2f
    val w = 520f
    val pad = 32f
    val row = 40f
    val colW = w - pad * 2
    val top = 150f
    val height = top + groups.sumOf { (40 + it.second.size * row + 28).toDouble() }.toFloat() + pad
    val bmp = Bitmap.createBitmap((w * s).toInt(), (height * s).toInt(), Bitmap.Config.ARGB_8888)
    val c = android.graphics.Canvas(bmp)
    c.scale(s, s)
    c.drawColor(colors.paper)
    val text = Paint(Paint.ANTI_ALIAS_FLAG)
    fun font(size: Float, serif: Boolean = false, color: Int = colors.ink) = text.apply {
        textSize = size; typeface = if (serif) Typeface.SERIF else Typeface.DEFAULT; this.color = color; textAlign = Paint.Align.LEFT
    }
    val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    fun diamond(x: Float, y: Float, r: Float, rating: Rating) {
        val color = if (rating == Rating.Soft || rating == Rating.Hard) colors.accent else colors.ink
        val path = android.graphics.Path().apply { moveTo(x, y - r); lineTo(x + r, y); lineTo(x, y + r); lineTo(x - r, y); close() }
        paint.color = color
        when (rating) {
            Rating.Love, Rating.Hard -> { paint.style = Paint.Style.FILL; c.drawPath(path, paint) }
            Rating.Like -> { c.save(); c.clipPath(path); paint.style = Paint.Style.FILL; c.drawRect(x - r, y - r, x + r, y, paint); c.restore() }
            else -> {}
        }
        paint.style = Paint.Style.STROKE; paint.strokeWidth = 1.5f
        c.drawPath(path, paint)
    }
    c.drawText("Limits", pad, 80f, font(52f, serif = true))
    c.drawText(names.joinToString(" and "), pad, 110f, font(15f, color = colors.muted))
    var kx = pad
    Rating.entries.forEach { r ->
        diamond(kx + 5, 130f, 5f, r)
        font(12f, color = colors.muted)
        c.drawText(r.label, kx + 16, 134f, text)
        kx += 16 + text.measureText(r.label) + 16
    }
    var y = top
    for ((category, items) in groups) {
        c.drawText(category, pad, y + 20, font(14f, color = colors.muted))
        names.forEachIndexed { i, p ->
            val cx = pad + colW - 20 - (names.size - 1 - i) * 52
            font(14f, color = colors.muted).textAlign = Paint.Align.CENTER
            c.drawText(if (p.length > 6) p.take(1).uppercase() else p, cx, y + 20, text)
        }
        items.forEachIndexed { n, r ->
            val ry = y + 40 + n * row
            font(17f)
            var t = r.text
            val max = colW - 30 - names.size * 52
            while (text.measureText(t) > max && t.length > 1) t = t.dropLast(1)
            c.drawText(if (t == r.text) t else "$t…", pad, ry + 26, text)
            listOf(r.mine, r.theirs).take(names.size).forEachIndexed { i, a ->
                val cx = pad + colW - 20 - (names.size - 1 - i) * 52
                Rating.of(a?.rating)?.let { diamond(cx, ry + 20, 8f, it) }
            }
            paint.color = colors.line; paint.style = Paint.Style.STROKE; paint.strokeWidth = 1f
            c.drawLine(pad, ry + row, pad + colW, ry + row, paint)
        }
        y += 40 + items.size * row + 28
    }
    return bmp
}
