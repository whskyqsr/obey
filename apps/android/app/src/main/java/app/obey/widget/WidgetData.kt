package app.obey.widget

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.updateAll
import app.obey.api.ObeyApi
import app.obey.api.Occurrence
import app.obey.api.OccurrenceStatus
import app.obey.api.Reward
import app.obey.api.Role
import app.obey.data.OfflineStore
import app.obey.data.PointsSnapshot
import app.obey.data.Session
import app.obey.data.SettingsStore
import app.obey.data.TodaySnapshot
import app.obey.ui.common.local
import app.obey.ui.common.parseInstant
import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.android.EntryPointAccessors
import dagger.hilt.components.SingletonComponent
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull

@EntryPoint
@InstallIn(SingletonComponent::class)
interface WidgetEntryPoint {
    fun api(): ObeyApi
    fun offline(): OfflineStore
    fun settings(): SettingsStore
}

internal fun Context.widgetDeps(): WidgetEntryPoint = EntryPointAccessors.fromApplication(applicationContext, WidgetEntryPoint::class.java)

/** Everything the three widgets show, read from what the app saved last (and refreshed when it's stale). */
data class WidgetModel(
    val signedIn: Boolean,
    /** Task, reward and partner names; off by default, and always off while the app lock is on. */
    val names: Boolean,
    val tick: Boolean,
    val session: Session?,
    /** Today's tasks for this person, by due time. */
    val mine: List<Occurrence> = emptyList(),
    /** Today's tasks for everyone else, for a Dominant's summary. */
    val theirs: List<Occurrence> = emptyList(),
    val toReview: Int = 0,
    val asksForTime: Int = 0,
    /** The next thing due, and whose it is when it isn't this person's. */
    val next: Occurrence? = null,
    val nextFor: String? = null,
    val points: Boolean = false,
    /** Whose points the Points widget shows: this person's, or a Dominant's partner's. */
    val pointsName: String? = null,
    val balance: Int? = null,
    val goal: Reward? = null,
) {
    val manage: Boolean get() = session?.canManage == true && session.partners.isNotEmpty()
    val partnerName: String? get() = session?.partners?.firstOrNull { it.role != Role.Dominant }?.displayName ?: session?.partners?.firstOrNull()?.displayName
}

/** A task the widget can tick done: nothing to add (photo, note, steps, mood, entry, count or place) and open now. */
fun Occurrence.tickable(now: Instant = Instant.now()): Boolean =
    status == OccurrenceStatus.Pending && !proofRequired && steps.isEmpty() && !askMood && !asksJournal && !isCounted && !isPlaced && !curfew &&
        (opensAt?.let { !parseInstant(it).isAfter(now) } ?: true) &&
        (opensOn?.let { !LocalDate.parse(it).isAfter(LocalDate.now()) } ?: true)

/** "in 48 min" inside the hour, otherwise null (the row shows the clock time). */
fun soon(dueAt: String, now: Instant = Instant.now()): String? {
    val left = Duration.between(now, parseInstant(dueAt))
    return if (!left.isNegative && left.toMinutes() < 60) "in ${maxOf(left.toMinutes(), 1)} min" else null
}

/** "48m", "2h 10m": the countdown in the middle of the ring. */
fun shortLeft(dueAt: String, now: Instant = Instant.now()): String {
    val left = Duration.between(now, parseInstant(dueAt))
    if (left.isNegative) return "Now"
    val h = left.toHours()
    val m = left.toMinutes() % 60
    return when {
        h >= 24 -> "${left.toDays()}d"
        h > 0 -> "${h}h ${m}m"
        else -> "${maxOf(m, 1)}m"
    }
}

object Widgets {
    /** Bumped on every redraw, so a widget that's already showing reloads what's saved. */
    val version = MutableStateFlow(0L)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val stale = Duration.ofMinutes(15)

    suspend fun load(context: Context, fetch: Boolean = true): WidgetModel {
        val deps = context.widgetDeps()
        val settings = deps.settings()
        val offline = deps.offline()
        val names = settings.widgetNames.first() && !settings.appLock.first()
        val tick = settings.widgetTick.first()
        val me = offline.me() ?: return WidgetModel(signedIn = false, names = names, tick = tick, session = null)
        val selected = settings.selectedRelationshipId.first()
        val rel = me.relationships.firstOrNull { it.id == selected } ?: me.relationships.firstOrNull { !it.ended } ?: me.relationships.firstOrNull()
        val session = Session(me, rel)
        if (rel == null) return WidgetModel(signedIn = true, names = names, tick = tick, session = session)

        val saved = offline.today(rel.id)
        var snap = saved
        var points = offline.points(rel.id)
        val old = saved == null || Duration.between(Instant.parse(saved.savedAt), Instant.now()) > stale
        if (fetch && old) {
            // A widget update has a short budget; anything slow keeps what was saved.
            withTimeoutOrNull(10_000) { fetchInto(deps, rel.id, snap) }?.let { snap = it }
        }
        if (rel.features.points && (points == null || (fetch && old))) {
            withTimeoutOrNull(5_000) { fetchPoints(deps, rel.id) }?.let { points = it }
        }
        val pending = offline.pending().map { it.occurrenceId }.toSet()
        val today = LocalDate.now()
        val now = Instant.now()
        val all = snap?.occurrences.orEmpty()
            .filter { it.status != OccurrenceStatus.Cancelled && !it.curfew }
            .map { if (it.id in pending) it.copy(status = OccurrenceStatus.Completed, waitingToSync = true) else it }
            .sortedBy { parseInstant(it.dueAt) }
        val todays = all.filter { parseInstant(it.dueAt).local().toLocalDate() == today }
        val upcoming = all.filter { it.status == OccurrenceStatus.Pending && parseInstant(it.dueAt).isAfter(now) }
        val mineNext = upcoming.firstOrNull { it.assigneeId == me.user.id }
        val manage = session.canManage && session.partners.isNotEmpty()
        val theirNext = if (manage) upcoming.firstOrNull { it.assigneeId != me.user.id } else null
        val next = mineNext ?: theirNext

        // A Dominant watches their partner's points; everyone else, their own.
        val pointsFor = if (manage && session.myRole == Role.Dominant) session.partners.firstOrNull()?.userId else me.user.id
        val balance = points?.balances?.firstOrNull { it.userId == pointsFor }?.balance
        val goal = balance?.let { b -> points?.rewards.orEmpty().filter { it.cost > b }.minByOrNull { it.cost } }
        return WidgetModel(
            signedIn = true,
            names = names,
            tick = tick && !session.readOnly,
            session = session,
            mine = todays.filter { it.assigneeId == me.user.id },
            theirs = todays.filter { it.assigneeId != me.user.id },
            toReview = if (manage) all.count { it.status == OccurrenceStatus.Submitted && it.assigneeId != me.user.id } else 0,
            asksForTime = if (manage) snap?.requests.orEmpty().filter { it.requestedBy != me.user.id }.distinctBy { it.groupId ?: it.id }.size else 0,
            next = next,
            nextFor = if (next != null && next.assigneeId != me.user.id) session.nameOf(next.assigneeId) else null,
            points = rel.features.points,
            pointsName = if (pointsFor != me.user.id) pointsFor?.let(session::nameOf) else null,
            balance = balance,
            goal = goal,
        )
    }

    /** Today's tasks and requests, saved where the app's Today reads them too. */
    private suspend fun fetchInto(deps: WidgetEntryPoint, relId: String, saved: TodaySnapshot?): TodaySnapshot? = try {
        coroutineScope {
            val api = deps.api()
            val today = LocalDate.now()
            val occ = async { api.occurrences(relId, today.minusDays(14).toString(), today.plusDays(7).toString()) }
            val reqs = async { api.reschedules(relId) }
            TodaySnapshot(
                Instant.now().toString(),
                occ.await(),
                reqs.await(),
                saved?.streaks.orEmpty(),
                saved?.events.orEmpty(),
                saved?.noTasks ?: false,
            ).also { deps.offline().saveToday(relId, it) }
        }
    } catch (c: CancellationException) {
        throw c
    } catch (_: Throwable) {
        null
    }

    private suspend fun fetchPoints(deps: WidgetEntryPoint, relId: String): PointsSnapshot? = try {
        coroutineScope {
            val balances = async { deps.api().balances(relId) }
            val rewards = async { deps.api().rewards(relId) }
            PointsSnapshot(balances.await(), rewards.await()).also { deps.offline().savePoints(relId, it) }
        }
    } catch (c: CancellationException) {
        throw c
    } catch (_: Throwable) {
        null
    }

    /** Redraws every widget from what's saved, without going to the server: the app calls this after Today loads. */
    fun update(context: Context) {
        val app = context.applicationContext
        scope.launch { updateAll(app) }
    }

    /** Fetches fresh, then redraws: after a push, or a tick from the widget. */
    fun refresh(context: Context) {
        val app = context.applicationContext
        scope.launch { refreshNow(app) }
    }

    suspend fun refreshNow(context: Context) {
        if (!hasAny(context)) return
        val deps = context.widgetDeps()
        val me = deps.offline().me() ?: return updateAll(context)
        val selected = deps.settings().selectedRelationshipId.first()
        val rel = me.relationships.firstOrNull { it.id == selected } ?: me.relationships.firstOrNull { !it.ended } ?: me.relationships.firstOrNull()
        if (rel != null) {
            withTimeoutOrNull(10_000) { fetchInto(deps, rel.id, deps.offline().today(rel.id)) }
            if (rel.features.points) withTimeoutOrNull(5_000) { fetchPoints(deps, rel.id) }
        }
        updateAll(context)
    }

    private suspend fun updateAll(context: Context) {
        version.value++
        runCatching {
            TodayWidget().updateAll(context)
            DeadlineWidget().updateAll(context)
            PointsWidget().updateAll(context)
        }
    }

    private suspend fun hasAny(context: Context): Boolean = runCatching {
        val m = GlanceAppWidgetManager(context)
        m.getGlanceIds(TodayWidget::class.java).isNotEmpty() || m.getGlanceIds(DeadlineWidget::class.java).isNotEmpty() || m.getGlanceIds(PointsWidget::class.java).isNotEmpty()
    }.getOrDefault(false)

    /**
     * Keeps "in 48 min" and the countdown ring current: every minute inside the last hour, then at the next quarter hour.
     * Inexact, so it costs nothing while the phone sleeps; the system's half-hourly update covers the rest.
     */
    fun scheduleTick(context: Context, next: Occurrence?) {
        val alarms = context.getSystemService(AlarmManager::class.java) ?: return
        val intent = PendingIntent.getBroadcast(context, 0, Intent(context, WidgetTickReceiver::class.java), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        if (next == null) return alarms.cancel(intent)
        val left = Duration.between(Instant.now(), parseInstant(next.dueAt))
        if (left.isNegative) return alarms.cancel(intent)
        val wait = if (left.toMinutes() < 60) 60_000L else minOf(15 * 60_000L, left.toMillis() - 59 * 60_000L).coerceAtLeast(60_000L)
        alarms.set(AlarmManager.RTC, System.currentTimeMillis() + wait, intent)
    }
}

/** The model for a widget that's showing: [first] straight away, reloaded from what's saved on each redraw. */
@Composable
fun rememberModel(context: Context, first: WidgetModel, countdown: Boolean): WidgetModel {
    val v by Widgets.version.collectAsState()
    val model by produceState(first, v) { value = Widgets.load(context, fetch = false) }
    if (countdown) LaunchedEffect(model.next?.id, model.next?.dueAt, v) { Widgets.scheduleTick(context, model.next) }
    return model
}

/** The countdown alarm: redraws from what's saved. */
class WidgetTickReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        val done = goAsync()
        CoroutineScope(Dispatchers.Default).launch {
            try {
                Widgets.version.value++
                TodayWidget().updateAll(context)
                DeadlineWidget().updateAll(context)
            } finally {
                done.finish()
            }
        }
    }
}
