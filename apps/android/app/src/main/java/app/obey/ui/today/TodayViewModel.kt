package app.obey.ui.today

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import androidx.lifecycle.viewModelScope
import app.obey.api.CalendarEvent
import app.obey.api.CompleteOccurrenceInput
import app.obey.api.CurfewClash
import app.obey.api.CurfewNight
import app.obey.api.DismissClashesInput
import app.obey.api.ExcuseCurfewInput
import app.obey.api.DecideInput
import app.obey.api.EditOccurrenceInput
import app.obey.api.ObeyApi
import app.obey.api.Occurrence
import app.obey.api.OccurrenceStatus
import app.obey.api.RescheduleDayInput
import app.obey.api.RescheduleInput
import app.obey.api.RescheduleRequest
import app.obey.api.ReviewOccurrenceInput
import app.obey.api.TaskStreak
import app.obey.api.userMessage
import app.obey.data.OfflineStore
import app.obey.data.PendingCompletion
import app.obey.data.Session
import app.obey.data.SessionRepository
import app.obey.data.TodaySnapshot
import app.obey.ui.common.BaseViewModel
import app.obey.ui.common.Load
import app.obey.ui.common.formatDue
import app.obey.ui.common.local
import app.obey.ui.common.parseInstant
import app.obey.ui.plans.covers
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.IOException
import java.time.Instant
import java.time.LocalDate
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import retrofit2.HttpException

/** A check-in mood at or below this (low, awful) shows a Dominant in Needs you. */
const val LOW_MOOD = 2

/** Tonight's curfew night (if Today shows one), plans that run past curfew, and what a broken night costs. */
/** A decision a note can follow: [text] for the snackbar, kept with [occurrenceId], sent to [to]. */
data class NoteTarget(val text: String, val occurrenceId: String, val to: String, val about: String)

data class TodayCurfew(val night: CurfewNight?, val clashes: List<CurfewClash>, val cost: String?, val requests: List<app.obey.api.CurfewRequest> = emptyList())

data class TodayData(
    /** Before today and still open (not yet marked missed). */
    val overdue: List<Occurrence>,
    /** Everything due today, any status, by due time. */
    val today: List<Occurrence>,
    val awaitingReview: List<Occurrence>,
    /** Misses from today and yesterday, for a Dominant to excuse. */
    val recentMisses: List<Occurrence>,
    /** Someone else's low check-ins (awful or low) from today and yesterday that a Dominant hasn't seen. */
    val lowMoods: List<Occurrence> = emptyList(),
    /** The next few days with something pending. */
    val later: List<Pair<LocalDate, List<Occurrence>>>,
    /** Pending extension requests, one entry per request; a whole-day request's rows share an entry. */
    val requests: List<List<RescheduleRequest>>,
    /** By task id; empty if streaks couldn't load, so the rest of Today still shows. */
    val streaks: Map<String, TaskStreak> = emptyMap(),
    /** Plans today or tomorrow that run into a task, for a heads-up at the top. */
    val clashingPlans: List<CalendarEvent> = emptyList(),
    /** A Dominant with no tasks set yet gets a nudge towards the starter kits. */
    val noTasks: Boolean = false,
)

@HiltViewModel
class TodayViewModel @Inject constructor(
    private val api: ObeyApi,
    private val sessions: SessionRepository,
    private val offline: OfflineStore,
    private val watcher: app.obey.location.LocationWatcher,
    private val placeStore: app.obey.location.PlaceStore,
    @ApplicationContext context: Context,
) : BaseViewModel() {
    private val _state = MutableStateFlow<Load<TodayData>>(Load.Loading)
    val state: StateFlow<Load<TodayData>> = _state.asStateFlow()

    private val _refreshing = MutableStateFlow(false)
    val refreshing: StateFlow<Boolean> = _refreshing.asStateFlow()

    /** When the Today on screen was saved, while the phone can't reach the server; null when it's live. */
    private val _offlineSince = MutableStateFlow<Instant?>(null)
    val offlineSince: StateFlow<Instant?> = _offlineSince.asStateFlow()

    val session: Session? get() = sessions.session

    // Back online: send what was done offline and reload, without waiting for the person to pull.
    private val connectivity = context.getSystemService(ConnectivityManager::class.java)
    private val onNetwork = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
            if (_offlineSince.value != null) refresh()
        }
    }

    init {
        runCatching { connectivity?.registerDefaultNetworkCallback(onNetwork) }
    }

    override fun onCleared() {
        runCatching { connectivity?.unregisterNetworkCallback(onNetwork) }
    }

    fun refresh() {
        viewModelScope.launch {
            val relId = sessions.session?.relationship?.id
            if (relId == null) {
                _state.value = Load.Failed("No dynamic selected")
                return@launch
            }
            if (_state.value !is Load.Ready) {
                // Open straight away with what was saved last time; the live copy replaces it below.
                val saved = offline.today(relId)
                _state.value = if (saved != null) Load.Ready(derive(saved, offline.pending())) else Load.Loading
            } else {
                _refreshing.value = true
            }
            syncPending()
            _locationReady.value = watcher.status() == app.obey.api.LocationStatus.Ready
            if (sessions.session?.relationship?.features?.location == true) launch { runCatching { placeStore.refresh(relId) } }
            launch { loadCurfew(relId) }
            launch { runCatching { api.planChanges(relId) }.onSuccess { _planChanges.value = it } }
            launch { loadForDom(relId) }
            launch { loadAgreement(relId) }
            launch { loadLibraryChanges(relId) }
            try {
                val snap = snapshot(relId)
                offline.saveToday(relId, snap)
                _state.value = Load.Ready(derive(snap, offline.pending()))
                _offlineSince.value = null
            } catch (c: CancellationException) {
                throw c
            } catch (e: IOException) {
                val saved = offline.today(relId)
                if (saved != null) {
                    _state.value = Load.Ready(derive(saved, offline.pending()))
                    _offlineSince.value = Instant.parse(saved.savedAt)
                } else {
                    _state.value = Load.Failed(e.userMessage())
                }
            } catch (t: Throwable) {
                _state.value = Load.Failed(t.userMessage())
            }
            _refreshing.value = false
        }
    }

    /** Sends completions made offline, oldest first. Stops at the first one that still can't get through. */
    private suspend fun syncPending() {
        for (p in offline.pending()) {
            try {
                api.complete(p.occurrenceId, CompleteOccurrenceInput(noteMd = p.noteMd, mood = p.mood, journal = p.journal, doneAt = p.doneAt))
                offline.removePending(p.occurrenceId)
            } catch (c: CancellationException) {
                throw c
            } catch (e: IOException) {
                return
            } catch (t: Throwable) {
                offline.removePending(p.occurrenceId)
                // An earlier try that got through but lost its reply leaves it done already; that's fine.
                val already = t is HttpException && t.code() == 409 && t.userMessage().let { it.endsWith("is completed") || it.endsWith("is submitted") }
                if (!already) say("A task done offline didn't sync: ${t.userMessage()}")
            }
        }
    }

    private suspend fun snapshot(relId: String): TodaySnapshot = coroutineScope {
        val today = LocalDate.now()
        // Overdue items can be up to the grace window old; two weeks back is plenty for a Today view.
        val occ = async { api.occurrences(relId, today.minusDays(14).toString(), today.plusDays(7).toString()) }
        val reqs = async { api.reschedules(relId) }
        val streaks = async { runCatching { api.streaks(relId) }.getOrDefault(emptyList()) }
        val events = async { runCatching { api.events(relId, today.toString(), today.plusDays(1).toString()) }.getOrDefault(emptyList()) }
        val noTasks = async { sessions.session?.canManage == true && runCatching { api.tasks(relId).isEmpty() }.getOrDefault(false) }
        TodaySnapshot(Instant.now().toString(), occ.await(), reqs.await(), streaks.await(), events.await(), noTasks.await())
    }

    private fun derive(snap: TodaySnapshot, pending: List<PendingCompletion>): TodayData {
        val today = LocalDate.now()
        val queued = pending.associateBy { it.occurrenceId }
        // Anything done offline shows as done until the server has it.
        val all = snap.occurrences.map { o ->
            queued[o.id]?.let { o.copy(status = OccurrenceStatus.Completed, completedAt = it.doneAt, waitingToSync = true) } ?: o
        }
        val now = Instant.now()
        fun dueDate(o: Occurrence) = parseInstant(o.dueAt).local().toLocalDate()
        val byDue = compareBy<Occurrence> { parseInstant(it.dueAt) }
        val live = all.filter { it.status != OccurrenceStatus.Cancelled }
        return TodayData(
            overdue = live.filter { it.status == OccurrenceStatus.Pending && parseInstant(it.dueAt).isBefore(now) && dueDate(it) < today }.sortedWith(byDue),
            today = live.filter { dueDate(it) == today }.sortedWith(byDue),
            awaitingReview = live.filter { it.status == OccurrenceStatus.Submitted }.sortedWith(byDue),
            recentMisses = live.filter { it.status == OccurrenceStatus.Missed && !it.missConfirmed && !dueDate(it).isBefore(today.minusDays(1)) }.sortedWith(byDue),
            lowMoods = if (sessions.session?.canManage != true) emptyList() else live.filter { o ->
                val mood = o.mood
                mood != null && mood <= LOW_MOOD && !o.moodSeen && o.assigneeId != sessions.session?.userId &&
                    o.completedAt?.let { !parseInstant(it).local().toLocalDate().isBefore(today.minusDays(1)) } == true
            }.sortedByDescending { it.completedAt },
            later = live.filter { it.status == OccurrenceStatus.Pending && dueDate(it) > today }
                .sortedWith(byDue).groupBy { dueDate(it) }.toList().take(3),
            requests = snap.requests
                // A Dom decides other people's requests; everyone else sees only their own, as "waiting".
                .filter { sessions.session?.canManage == true || it.requestedBy == sessions.session?.userId }
                .groupBy { it.groupId ?: it.id }
                .values.toList(),
            streaks = snap.streaks.associateBy { it.taskId },
            noTasks = snap.noTasks,
            clashingPlans = snap.events.filter {
                // The server pads the range by a day; keep only today's and tomorrow's, and only ones not over yet.
                it.conflictIds.isNotEmpty() && parseInstant(it.endsAt).isAfter(now) && (it.covers(today) || it.covers(today.plusDays(1)))
            },
        )
    }

    private val _completed = MutableStateFlow<Occurrence?>(null)
    /** The occurrence just completed, for the screen's snackbar with Undo. */
    val completed: StateFlow<Occurrence?> = _completed.asStateFlow()
    fun completedShown() { _completed.value = null }

    /** A count task: [by] 1 for a tap, or [to] to set the count outright. */
    fun count(o: Occurrence, by: Int? = null, to: Int? = null) = action {
        val r = api.count(o.id, app.obey.api.CountChange(by = by, to = to))
        say("${o.title}: ${r.copy(title = o.title).countLine}")
        refresh()
    }

    private val _curfew = MutableStateFlow<TodayCurfew?>(null)
    /** Tonight's curfew strip and plans that run into one; null when there's no curfew or it couldn't load. */
    val curfew: StateFlow<TodayCurfew?> = _curfew.asStateFlow()

    private suspend fun loadCurfew(relId: String) {
        val session = sessions.session ?: return
        if (session.relationship?.features?.location != true) {
            _curfew.value = null
            return
        }
        val c = runCatching { api.curfew(relId) }.getOrNull() ?: return
        val s = c.settings
        val features = session.relationship.features
        val consequence = if (session.canManage && features.consequences && s?.consequenceId != null) {
            runCatching { api.consequences(relId).firstOrNull { it.id == s.consequenceId }?.title }.getOrNull()
        } else null
        val cost = listOfNotNull(s?.missPenalty?.takeIf { features.points && it > 0 }?.let { "−$it pts" }, consequence).joinToString(", ").ifEmpty { null }
        _curfew.value = TodayCurfew(c.night, c.clashes, cost, c.requests)
    }

    /** "I'm home" without a phone that checks; with a curfew that asks, it tells the Dominant too, with [note]. */
    fun homeForCurfew(n: CurfewNight, note: String? = null, who: String? = null, onDone: () -> Unit = {}) = action {
        api.homeForCurfew(n.occurrenceId, app.obey.api.TellHomeInput(note))
        say(if (who != null) "Told $who" else "You're home for curfew")
        onDone()
        refresh()
    }

    /** Home already (the phone noticed): tell the Dominant. */
    fun tellHome(n: CurfewNight, note: String?, who: String, onDone: () -> Unit) = action {
        api.tellHome(n.occurrenceId, app.obey.api.TellHomeInput(note))
        say("Told $who")
        onDone()
        refresh()
    }

    private val _delays = MutableStateFlow<List<app.obey.api.DelayUsed>>(emptyList())
    /** Delays a sub took from their allowance, for a Dominant to see. */
    val delays: StateFlow<List<app.obey.api.DelayUsed>> = _delays.asStateFlow()

    private val _redemptions = MutableStateFlow<List<app.obey.api.LedgerEntry>>(emptyList())
    /** Rewards someone else spent points on that a Dominant hasn't marked redeemed yet. */
    val redemptions: StateFlow<List<app.obey.api.LedgerEntry>> = _redemptions.asStateFlow()

    private val _agreement = MutableStateFlow<app.obey.api.AgreementVersion?>(null)
    /** The agreement's open proposal when it waits on this person: a partner's to read, or changes asked of their own. */
    val agreement: StateFlow<app.obey.api.AgreementVersion?> = _agreement.asStateFlow()

    private suspend fun loadAgreement(relId: String) {
        val session = sessions.session ?: return
        if (session.relationship?.features?.agreement != true || session.readOnly) {
            _agreement.value = null
            return
        }
        runCatching { api.agreement(relId).proposal }.onSuccess { p ->
            _agreement.value = p?.takeIf { app.obey.ui.agreement.agreementNeedsMe(it, session) }
        }
    }

    private val _libraryChanges = MutableStateFlow<List<app.obey.api.LibraryChange>>(emptyList())
    /** Rules and protocols someone else added, changed or removed that this person hasn't marked seen, newest first. */
    val libraryChanges: StateFlow<List<app.obey.api.LibraryChange>> = _libraryChanges.asStateFlow()

    private suspend fun loadLibraryChanges(relId: String) {
        val features = sessions.session?.relationship?.features
        if (features == null || (!features.rules && !features.protocols)) {
            _libraryChanges.value = emptyList()
            return
        }
        runCatching { api.libraryChanges(relId) }.onSuccess { list ->
            _libraryChanges.value = list.filter { if (it.kind == "rules") features.rules else features.protocols }
        }
    }

    /** Clears these changes from Today; [message] confirms it when there's one to show. */
    fun seenLibraryChanges(ids: List<String>, message: String? = null) = action {
        val relId = sessions.requireRelationshipId()
        _libraryChanges.value = _libraryChanges.value.filter { it.id !in ids }
        api.seenLibraryChanges(relId, app.obey.api.SeenLibraryChangesInput(ids))
        message?.let { say(it) }
        loadLibraryChanges(relId)
    }

    private suspend fun loadForDom(relId: String) {
        val session = sessions.session ?: return
        val rel = session.relationship
        if (!session.canManage || rel == null) {
            _delays.value = emptyList()
            _redemptions.value = emptyList()
            return
        }
        _delays.value = if (rel.reschedulePolicy == app.obey.api.ReschedulePolicy.Allowance) runCatching { api.delays(relId) }.getOrDefault(_delays.value) else emptyList()
        _redemptions.value = if (rel.features.points) {
            runCatching {
                api.ledger(relId).filter { it.kind == app.obey.api.LedgerKind.Redemption && it.redeemedAt == null && it.userId != session.userId }
            }.getOrDefault(_redemptions.value)
        } else emptyList()
    }

    fun seenDelay(d: app.obey.api.DelayUsed) = action {
        _delays.value = _delays.value.filter { it.id != d.id }
        api.seenDelay(d.id)
    }

    /** "Mark all seen" on Today's delays, one after another. */
    fun seenDelays(list: List<app.obey.api.DelayUsed>) = action {
        val ids = list.map { it.id }.toSet()
        _delays.value = _delays.value.filter { it.id !in ids }
        list.forEach { api.seenDelay(it.id) }
        say("Marked seen")
    }

    fun moodSeen(o: Occurrence) = action {
        api.moodSeen(o.id)
        say("Marked seen")
        refresh()
    }

    fun markRedeemed(e: app.obey.api.LedgerEntry, note: String?, onDone: () -> Unit) = action {
        api.markRedeemed(e.id, app.obey.api.MarkRedeemedInput(note))
        say("Redeemed")
        onDone()
        refresh()
    }

    private val _noteFor = MutableStateFlow<NoteTarget?>(null)
    /** A decision just made, for the screen's snackbar offering "Add a note". */
    val noteFor: StateFlow<NoteTarget?> = _noteFor.asStateFlow()
    fun noteForShown() { _noteFor.value = null }

    private fun nameOf(userId: String) = sessions.session?.nameOf(userId) ?: "them"
    private fun partners() = sessions.session?.partners.orEmpty().joinToString(" and ") { it.displayName }.ifEmpty { "them" }

    /** A note after a decision: a comment on that task or curfew night, and a notification. */
    fun addNote(t: NoteTarget, body: String, onDone: () -> Unit) = action {
        api.addComment(t.occurrenceId, app.obey.api.CommentInput(body))
        say(if (t.text.isEmpty()) "Reply sent to ${t.to}" else "Note sent to ${t.to}")
        onDone()
        refresh()
    }

    fun excuseCurfew(occurrenceId: String, message: String, to: String? = null) = action {
        api.excuseCurfew(sessions.requireRelationshipId(), ExcuseCurfewInput(occurrenceId))
        _noteFor.value = NoteTarget(message, occurrenceId, to ?: partners(), "excusing curfew")
        refresh()
    }

    fun confirmCurfewMiss(n: CurfewNight) = action {
        api.confirmMiss(n.occurrenceId)
        _noteFor.value = NoteTarget("Left as missed", n.occurrenceId, nameOf(n.assigneeId), "leaving curfew missed")
        refresh()
    }

    fun askCurfew(n: CurfewNight, until: String, reason: String?, who: String, onDone: () -> Unit) = action {
        api.askCurfew(sessions.requireRelationshipId(), app.obey.api.CurfewRequestInput(n.occurrenceId, until, reason))
        say("Asked $who")
        onDone()
        refresh()
    }

    /** [until] null approves the time asked for. */
    fun approveCurfew(r: app.obey.api.CurfewRequest, until: String?, note: String? = null, onDone: () -> Unit = {}) = action {
        api.approveCurfew(r.id, app.obey.api.ApproveCurfewRequestInput(until))
        when {
            note != null -> {
                api.addComment(r.occurrenceId, app.obey.api.CommentInput(note))
                say("Curfew moved")
            }
            until != null -> say("Curfew moved")
            else -> _noteFor.value = NoteTarget("Curfew moved", r.occurrenceId, nameOf(r.requestedBy), "moving curfew")
        }
        onDone()
        refresh()
    }

    fun declineCurfew(r: app.obey.api.CurfewRequest) = action {
        api.declineCurfew(r.id)
        _noteFor.value = NoteTarget("Declined", r.occurrenceId, nameOf(r.requestedBy), "saying no to more time")
        refresh()
    }

    private val _planChanges = MutableStateFlow<List<app.obey.api.CalendarEvent>>(emptyList())
    /** My plans someone else changed (a Dominant moving the end), until I close the card. */
    val planChanges: StateFlow<List<app.obey.api.CalendarEvent>> = _planChanges.asStateFlow()

    fun seenPlanChange(e: app.obey.api.CalendarEvent) = action {
        _planChanges.value = _planChanges.value.filter { it.id != e.id }
        api.seenPlanChange(e.id)
    }

    /** "Mark all seen" on Today's changed plans, one after another. */
    fun seenPlanChanges(list: List<app.obey.api.CalendarEvent>) = action {
        val ids = list.map { it.id }.toSet()
        _planChanges.value = _planChanges.value.filter { it.id !in ids }
        list.forEach { api.seenPlanChange(it.id) }
        say("Marked seen")
    }

    /** A Dominant moving when a plan that runs past curfew ends; its author is told. */
    fun changePlanEnd(c: CurfewClash, endsAt: String, note: String?, onDone: () -> Unit = {}) = action {
        api.changePlanEnd(c.eventId, app.obey.api.PlanEndInput(endsAt, note))
        say("Plan changed")
        onDone()
        refresh()
    }

    fun leaveClash(c: CurfewClash) = action {
        api.dismissClashes(c.eventId, DismissClashesInput(listOf(c.occurrenceId)))
        say("Curfew stays that night")
        refresh()
    }

    private val _locationReady = MutableStateFlow(true)
    /** Whether this phone can notice arriving at places while closed; checked on every refresh. */
    val locationReady: StateFlow<Boolean> = _locationReady.asStateFlow()

    private val _askLocation = MutableStateFlow<Occurrence?>(null)
    /** A check-in waiting on the location permission; the screen asks, then calls [checkIn] again. */
    val askLocation: StateFlow<Occurrence?> = _askLocation.asStateFlow()

    /** "I'm here": one fresh fix, which the server checks against the place. */
    fun checkIn(o: Occurrence, afterAsking: Boolean = false) {
        _askLocation.value = null
        if (!watcher.hasAny) {
            if (afterAsking) say("Allow location for Fealty to check in") else _askLocation.value = o
            return
        }
        action {
            say("Finding where you are…")
            val fix = watcher.currentFix() ?: run {
                say(if (watcher.servicesOn) "Couldn't tell where you are; try again" else "Turn on location to check in")
                return@action
            }
            val r = api.arrive(o.id, app.obey.api.ArriveOccurrenceInput("checkin", fix.latitude, fix.longitude, fix.accuracy.toInt()))
            say(
                when (r.status) {
                    OccurrenceStatus.Pending -> "Checked in. Stay for ${r.stayMinutes} min"
                    OccurrenceStatus.Submitted -> "Checked in; sent for approval"
                    else -> "Done: ${o.title}"
                },
            )
            refresh()
            watcher.sync()
        }
    }

    fun complete(o: Occurrence, note: String? = null, mood: Int? = null, entry: String? = null) = action {
        val input = CompleteOccurrenceInput(noteMd = note?.takeIf { it.isNotBlank() }, mood = mood, journal = entry?.let { app.obey.api.JournalEntryInput(o.title, it) })
        val r = try {
            api.complete(o.id, input)
        } catch (e: IOException) {
            // No signal: keep it on the phone with the time it was done, and send it when we're back.
            val doneAt = Instant.now().toString()
            offline.addPending(PendingCompletion(o.id, sessions.requireRelationshipId(), doneAt, input.noteMd, input.mood, input.journal))
            o.copy(status = OccurrenceStatus.Completed, completedAt = doneAt, waitingToSync = true)
        }
        _completed.value = r.copy(title = o.title)
        refresh()
    }

    fun undoComplete(o: Occurrence) = action {
        if (o.waitingToSync) offline.removePending(o.id) else api.undoComplete(o.id)
        refresh()
    }

    fun excuse(o: Occurrence) = action {
        api.editOccurrence(o.id, EditOccurrenceInput(status = OccurrenceStatus.Excused))
        _noteFor.value = NoteTarget("Excused", o.id, nameOf(o.assigneeId), "excusing “${o.title}”")
        refresh()
    }

    fun dropConsequence(o: Occurrence) = action {
        api.dropConsequence(o.id)
        _noteFor.value = NoteTarget("Dropped “${o.missConsequence}”", o.id, nameOf(o.assigneeId), "dropping “${o.missConsequence}” for “${o.title}”")
        refresh()
    }

    fun confirmMiss(o: Occurrence) = action {
        api.confirmMiss(o.id)
        _noteFor.value = NoteTarget("Kept as missed", o.id, nameOf(o.assigneeId), "keeping “${o.title}” as missed")
        refresh()
    }

    fun review(o: Occurrence, approve: Boolean, comment: String? = null) = action {
        api.review(o.id, ReviewOccurrenceInput(approve = approve, comment = comment))
        say(if (approve) "Approved" else "Sent back")
        refresh()
    }

    /** "Approve all" on Today: each one in turn, then one snackbar. */
    fun approveAll(list: List<Occurrence>) = action {
        try {
            list.forEach { api.review(it.id, ReviewOccurrenceInput(approve = true)) }
            say("Approved ${list.size}")
        } finally {
            refresh()
        }
    }

    fun reschedule(o: Occurrence, input: RescheduleInput) = action {
        val result = api.reschedule(o.id, input)
        say(
            if (result.applied) "Moved to ${formatDue(result.occurrence.dueAt)}"
            else "Extension requested; waiting for approval"
        )
        refresh()
    }

    fun rescheduleDay(ids: List<String>, delayHours: Int, reason: String?) = action {
        val relId = sessions.requireRelationshipId()
        val result = api.rescheduleDay(relId, RescheduleDayInput(ids, delayHours, reason?.takeIf { it.isNotBlank() }))
        say(if (result.applied) "Moved ${ids.size} tasks" else "Request sent; waiting for approval")
        refresh()
    }

    /** "Reschedule instead": move just this task to [dueAt], whatever was asked. */
    fun decideInstead(r: RescheduleRequest, dueAt: String) = action {
        api.decideReschedule(r.id, DecideInput(approve = true, dueAt = dueAt, item = true))
        say("Moved “${r.title}”")
        refresh()
    }

    /** Deciding any row of a whole-day request decides all of it. */
    fun decide(rows: List<RescheduleRequest>, approve: Boolean) = action {
        api.decideReschedule(rows.first().id, DecideInput(approve))
        val n = if (rows.size > 1) " for ${rows.size} tasks" else ""
        val r = rows.first()
        _noteFor.value = NoteTarget(
            if (approve) "Extension$n approved" else "Extension$n declined",
            r.occurrenceId,
            nameOf(r.requestedBy),
            "${if (approve) "approving" else "declining"} the request for “${r.title}”",
        )
        refresh()
    }
}
