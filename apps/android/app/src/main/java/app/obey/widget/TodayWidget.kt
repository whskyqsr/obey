package app.obey.widget

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.LocalSize
import androidx.glance.action.ActionParameters
import androidx.glance.action.actionParametersOf
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.LinearProgressIndicator
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.ActionCallback
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextDecoration
import androidx.glance.text.TextStyle
import app.obey.R
import app.obey.api.CompleteOccurrenceInput
import app.obey.api.Occurrence
import app.obey.api.OccurrenceStatus
import app.obey.data.PendingCompletion
import app.obey.ui.common.formatTime
import java.io.IOException
import java.time.Instant
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.first

/** Today (4x2): your tasks with a circle to tick the simple ones, or a Dominant's view of their partner's day. */
class TodayWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Exact

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val first = Widgets.load(context)
        provideContent {
            val model = rememberModel(context, first, countdown = true)
            WidgetTheme { TodayContent(model) }
        }
    }
}

class TodayWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = TodayWidget()
}

private val OccurrenceKey = ActionParameters.Key<String>("occurrence")

private val Occurrence.settled: Boolean
    get() = status == OccurrenceStatus.Completed || status == OccurrenceStatus.Submitted || status == OccurrenceStatus.Excused

/** Ticks a simple task done: shown done at once, sent now, or queued for the app to send once there's signal. */
class TickAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        val id = parameters[OccurrenceKey] ?: return
        val deps = context.widgetDeps()
        val relId = deps.settings().selectedRelationshipId.first() ?: deps.offline().me()?.relationships?.firstOrNull()?.id ?: return
        val doneAt = Instant.now().toString()
        deps.offline().addPending(PendingCompletion(id, relId, doneAt))
        Widgets.update(context)
        try {
            deps.api().complete(id, CompleteOccurrenceInput())
            deps.offline().removePending(id)
        } catch (c: CancellationException) {
            throw c
        } catch (_: IOException) {
            // No signal: it stays queued, and the app sends it next time it's online.
            return
        } catch (_: Throwable) {
            // Turned down (already done, or changed since): drop it and show what the server has.
            deps.offline().removePending(id)
        }
        Widgets.refreshNow(context)
    }
}

@Composable
private fun TodayContent(m: WidgetModel) {
    WidgetCard {
        when {
            !m.signedIn -> Note("Open the app to sign in")
            m.session?.relationship == null -> Note("Open the app to get started")
            m.mine.isEmpty() && m.manage -> DomSummary(m)
            m.mine.isEmpty() -> Note("Nothing due today")
            !m.names -> Discreet(m)
            else -> MineList(m)
        }
    }
}

@Composable
private fun Note(text: String) {
    Header(null)
    Spacer(GlanceModifier.height(8.dp))
    Label(text, 16.sp, GlanceTheme.colors.onSurfaceVariant, lines = 2)
}

/** "Today", with the mark only when names show (the mark is a giveaway on a discreet phone). */
@Composable
private fun Header(title: String?, names: Boolean = false, trailing: @Composable () -> Unit = {}) {
    Row(GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        if (names) {
            Glyph(R.drawable.ic_widget_mark, GlanceTheme.colors.primary, 24.dp)
            Spacer(GlanceModifier.width(10.dp))
        }
        Label(title ?: "Today", 18.sp, weight = FontWeight.Medium, modifier = GlanceModifier.defaultWeight())
        trailing()
    }
}

@Composable
private fun DoneRing(done: Int, total: Int) {
    Ring(if (total == 0) 0f else done.toFloat() / total, "$done/$total", 40.dp, 4.dp, 12.sp)
}

/** With names hidden: how many are left and when the next one's due, nothing else. */
@Composable
private fun Discreet(m: WidgetModel) {
    val done = m.mine.count { it.settled }
    val left = m.mine.count { it.status == OccurrenceStatus.Pending }
    Header(null) { DoneRing(done, m.mine.size) }
    Spacer(GlanceModifier.height(4.dp))
    Label(if (left == 0) "All done" else "$left left", 28.sp)
    val next = m.mine.firstOrNull { it.status == OccurrenceStatus.Pending && Instant.now().isBefore(app.obey.ui.common.parseInstant(it.dueAt)) }
    if (next != null) Label("Next " + (soon(next.dueAt) ?: "at ${formatTime(next.dueAt)}"), color = GlanceTheme.colors.onSurfaceVariant)
}

@Composable
private fun MineList(m: WidgetModel) {
    val c = GlanceTheme.colors
    val size = LocalSize.current
    val done = m.mine.count { it.settled }
    Header(null, names = true) { DoneRing(done, m.mine.size) }
    Spacer(GlanceModifier.height(6.dp))
    // Rows that fit under the header and above the footer; when they don't all fit, done ones give way first.
    val fit = ((size.height.value - 32 - 44 - 24) / 36).toInt().coerceAtLeast(1)
    val shown = if (m.mine.size <= fit) m.mine else {
        val keep = (m.mine.filterNot { it.settled } + m.mine.filter { it.settled }).take(fit).toSet()
        m.mine.filter { it in keep }
    }
    shown.forEach { TaskRow(it, m.tick) }
    val tickable = m.tick && m.mine.any { it.tickable() }
    val ptsLeft = if (m.points) m.mine.filter { it.status == OccurrenceStatus.Pending }.sumOf { it.points } else 0
    val more = m.mine.size - shown.size
    val footer = listOfNotNull(
        if (more > 0) "$more more" else null,
        if (tickable) "Tap a circle to mark it done" else null,
        if (ptsLeft > 0) "$ptsLeft pts left today" else null,
    ).joinToString(" · ")
    if (footer.isNotEmpty()) {
        Spacer(GlanceModifier.height(2.dp))
        Label(footer, 12.sp, c.onSurfaceVariant)
    }
}

@Composable
private fun TaskRow(o: Occurrence, tick: Boolean) {
    val c = GlanceTheme.colors
    val canTick = tick && o.tickable()
    val needsApp = o.status == OccurrenceStatus.Pending && !o.tickable()
    val missed = o.status == OccurrenceStatus.Missed
    Row(GlanceModifier.fillMaxWidth().height(36.dp), verticalAlignment = Alignment.CenterVertically) {
        val circle = GlanceModifier.let { if (canTick) it.clickable(actionRunCallback<TickAction>(actionParametersOf(OccurrenceKey to o.id))) else it }
        when {
            o.settled -> Glyph(R.drawable.ic_widget_done, if (o.status == OccurrenceStatus.Submitted) c.onSurfaceVariant else c.primary, 24.dp, circle)
            else -> Glyph(R.drawable.ic_widget_todo, if (canTick) c.onSurfaceVariant else c.outline, 24.dp, circle)
        }
        Spacer(GlanceModifier.width(12.dp))
        Text(
            o.title,
            GlanceModifier.defaultWeight(),
            style = TextStyle(
                color = if (o.settled || missed) c.onSurfaceVariant else c.onSurface,
                fontSize = 15.sp,
                textDecoration = if (o.status == OccurrenceStatus.Completed) TextDecoration.LineThrough else TextDecoration.None,
            ),
            maxLines = 1,
        )
        val due = soon(o.dueAt)
        val right = when {
            missed -> "Missed"
            o.status == OccurrenceStatus.Submitted -> "Sent"
            o.status == OccurrenceStatus.Pending && due != null -> due
            else -> formatTime(o.dueAt)
        }
        Spacer(GlanceModifier.width(8.dp))
        Label(right, 13.sp, if (missed) c.error else if (due != null && o.status == OccurrenceStatus.Pending) c.primary else c.onSurfaceVariant)
        if (o.status == OccurrenceStatus.Pending && (due != null || needsApp)) {
            Spacer(GlanceModifier.width(6.dp))
            Glyph(if (due != null) R.drawable.ic_widget_timer else R.drawable.ic_widget_open, c.primary, 18.dp)
        }
    }
}

/** A Dominant's view: their partner's progress, what's waiting on them, and what's next. */
@Composable
private fun DomSummary(m: WidgetModel) {
    val c = GlanceTheme.colors
    val total = m.theirs.size
    val done = m.theirs.count { it.settled }
    Header(if (m.names) m.partnerName?.let { "$it today" } else null, names = m.names) {
        Label(if (total == 0) "Nothing today" else "$done of $total done", 13.sp, c.onSurfaceVariant)
    }
    Spacer(GlanceModifier.height(10.dp))
    LinearProgressIndicator(
        progress = if (total == 0) 0f else done.toFloat() / total,
        modifier = GlanceModifier.fillMaxWidth().height(8.dp).cornerRadius(4.dp),
        color = c.primary,
        backgroundColor = c.primaryContainer,
    )
    if (m.toReview > 0 || m.asksForTime > 0) {
        Spacer(GlanceModifier.height(10.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (m.toReview > 0) Chip(R.drawable.ic_widget_review, "${m.toReview} to review", strong = true)
            if (m.toReview > 0 && m.asksForTime > 0) Spacer(GlanceModifier.width(8.dp))
            if (m.asksForTime > 0) Chip(R.drawable.ic_widget_more_time, "${m.asksForTime} ${if (m.asksForTime == 1) "asks" else "ask"} for time", strong = false)
        }
    }
    val next = m.theirs.firstOrNull { it.status == OccurrenceStatus.Pending && Instant.now().isBefore(app.obey.ui.common.parseInstant(it.dueAt)) }
    if (next != null) {
        Spacer(GlanceModifier.height(10.dp))
        Label(if (m.names) "Next: ${next.title}, ${formatTime(next.dueAt)}" else "Next at ${formatTime(next.dueAt)}", 13.sp, c.onSurfaceVariant)
    }
}

@Composable
private fun Chip(icon: Int, text: String, strong: Boolean) {
    val c = GlanceTheme.colors
    Row(
        GlanceModifier.cornerRadius(10.dp).background(if (strong) c.secondaryContainer else c.surfaceVariant).padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Glyph(icon, if (strong) c.onSecondaryContainer else c.onSurfaceVariant, 18.dp)
        Spacer(GlanceModifier.width(6.dp))
        Label(text, 13.sp, if (strong) c.onSecondaryContainer else c.onSurfaceVariant, FontWeight.Medium)
    }
}
