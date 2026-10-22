@file:OptIn(ExperimentalSerializationApi::class)

package app.obey.api

import kotlinx.serialization.EncodeDefault
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// Hand-written mirror of packages/contracts/src/index.ts. Keep the two in sync.
//
// Conventions:
// - zod `.nullable()` fields are Kotlin `T? = null` and are sent as explicit JSON null.
// - zod `.optional()` fields are `T? = null` with @EncodeDefault(NEVER) so a null is omitted
//   (zod rejects `null` for optional-but-not-nullable fields).
// - Timestamps are ISO-8601 strings; plain dates are "YYYY-MM-DD" strings. Parse with java.time.


@Serializable
enum class Role {
    @SerialName("dominant") Dominant,
    @SerialName("submissive") Submissive,
    @SerialName("switch") Switch,
}

@Serializable
enum class ReschedulePolicy {
    @SerialName("dominant_only") DominantOnly,
    @SerialName("request") Request,
    @SerialName("allowance") Allowance,
}

@Serializable
enum class Weekday(val short: String) {
    MO("Mon"), TU("Tue"), WE("Wed"), TH("Thu"), FR("Fri"), SA("Sat"), SU("Sun");

    /** ISO day number, Monday = 1. */
    val isoNumber: Int get() = ordinal + 1
}

@Serializable
enum class Frequency {
    @SerialName("daily") Daily,
    @SerialName("weekly") Weekly,
    @SerialName("monthly") Monthly,
    @SerialName("yearly") Yearly,
    @SerialName("cycle") Cycle,
}

@Serializable
enum class Anchor {
    @SerialName("calendar") Calendar,
    @SerialName("completion") Completion,
}

@Serializable
data class RecurrenceRule(
    val freq: Frequency,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val interval: Int? = null,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val byWeekday: List<Weekday>? = null,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val byMonthDay: List<Int>? = null,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val nth: Int? = null,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val cycleLength: Int? = null,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val cycleDays: List<Int>? = null,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val count: Int? = null,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val until: String? = null,
)

@Serializable
data class Schedule(
    val start: String,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val rule: RecurrenceRule? = null,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val anchor: Anchor? = null,
)

@Serializable
data class User(
    val id: String,
    val displayName: String,
    val email: String? = null,
    val avatarVersion: String? = null,
    /** "sun" or "mon": where calendars start the week. */
    val weekStart: String = "sun",
    /** Confirmed 18+ and accepted the rules for proof photos. */
    val proofTermsAccepted: Boolean = false,
    /** Show proof photos without the blur. */
    val revealProofs: Boolean = false,
    val quietHours: QuietHours? = null,
    /** Notification kinds turned off, e.g. "comments". */
    val mutedNotifications: List<String> = emptyList(),
    /** Pushes carry a partner's own words (a reminder, a note); off keeps them discreet. */
    val notifyDetails: Boolean = false,
)

@Serializable
data class NotifyDetailsInput(val notifyDetails: Boolean)

@Serializable
data class MutedNotificationsInput(val mutedNotifications: List<String>)

/** When pushes arrive without sound or vibration, as "HH:mm" in [timezone]; start after end spans midnight. */
@Serializable
data class QuietHours(val start: String, val end: String, val timezone: String)

/** A null [quietHours] turns them off, so it is always sent. */
@Serializable
data class QuietHoursInput(val quietHours: QuietHours?)

@Serializable
data class AcceptProofTermsInput(val adult: Boolean = true, val rules: Boolean = true)

@Serializable
data class VerificationEmailInput(val unused: Boolean? = null)

/** [sent] false: the server can't send its own email, so the app asks Firebase to send its stock one. */
@Serializable
data class VerificationEmailResult(val sent: Boolean)

@Serializable
data class RevealProofsInput(val revealProofs: Boolean)

@Serializable
data class ProofPhoto(val id: String, val occurrenceId: String, val uploaderId: String, val createdAt: String)

@Serializable
enum class ReportReason(val label: String) {
    @SerialName("minor") Minor("Shows someone under 18"),
    @SerialName("non_consensual") NonConsensual("Shared without someone's consent"),
    @SerialName("illegal") Illegal("Something illegal"),
    @SerialName("other") Other("Something else"),
}

@Serializable
data class ReportInput(
    val subjectId: String,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val photoId: String? = null,
    val reason: ReportReason,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val details: String? = null,
)

@Serializable
data class Created(val id: String)

/** A date the dynamic marks; [date] is YYYY-MM-DD. */
@Serializable
data class DynamicDate(val id: String, val label: String, val date: String)

@Serializable
data class Member(
    val userId: String,
    val displayName: String,
    val role: Role,
    val avatarVersion: String? = null,
    /** What their Android app last reported about location; null when it never has. */
    val locationStatus: LocationStatus? = null,
    /** Location watching paused by them; [locationPausedUntil] null means until they turn it back on. */
    val locationPaused: Boolean = false,
    val locationPausedUntil: String? = null,
    /** Their pushes carry a partner's own words; see [User.notifyDetails]. */
    val notifyDetails: Boolean = false,
)

/** Whether this phone can notice arriving at and leaving places while Fealty is closed. */
@Serializable
enum class LocationStatus {
    @SerialName("ready") Ready,
    @SerialName("foreground_only") ForegroundOnly,
    @SerialName("denied") Denied,
    @SerialName("services_off") ServicesOff,
}

@Serializable
data class Relationship(
    val id: String,
    /** Optional; see [title]. */
    val name: String? = null,
    val members: List<Member>,
    val reschedulePolicy: ReschedulePolicy,
    val weeklyDelayAllowance: Int,
    val createdAt: String,
    val features: Features = Features(),
    /** Whether a submissive may write notes of their own. */
    val subNotes: Boolean = true,
    val dates: List<DynamicDate> = emptyList(),
    /** When a partner left or blocked; an ended dynamic is kept read-only for both. */
    val endedAt: String? = null,
    val endedBy: String? = null,
    /** The open role swap, asked for or under way. */
    val roleSwap: RoleSwap? = null,
) {
    val ended: Boolean get() = endedAt != null
}

/** A Dominant and a submissive trading roles. While [active], the members' roles are already swapped. */
@Serializable
data class RoleSwap(
    val id: String,
    val requestedBy: String,
    val partnerId: String,
    /** "pending" or "active". */
    val status: String,
    /** Null: until someone swaps back. */
    val endsAt: String? = null,
    val pauseTasks: Boolean,
    val createdAt: String,
    val startedAt: String? = null,
) {
    val active: Boolean get() = status == "active"
}

@Serializable
data class RoleSwapInput(val endsAt: String?, val pauseTasks: Boolean)

/** Leaving ends the dynamic for both; the people in [block] can never pair with you again. */
@Serializable
data class LeaveInput(val block: List<String> = emptyList())

/** Parts of the app a dynamic can switch off; switched-off parts are hidden for everyone in it. Tasks and notes are always on. */
@Serializable
data class Features(
    val points: Boolean = true,
    val consequences: Boolean = true,
    val rules: Boolean = true,
    val protocols: Boolean = true,
    val journal: Boolean = true,
    val stats: Boolean = true,
    val review: Boolean = true,
    val location: Boolean = true,
    val agreement: Boolean = true,
    val scenes: Boolean = true,
    /** Off until a dynamic switches it on. */
    val chastity: Boolean = false,
)

/** The relationship's name, or the partners' names when it has none. */
fun Relationship.title(myId: String): String {
    name?.let { return it }
    val names = members.filter { it.userId != myId }.map { it.displayName }
    return when (names.size) {
        0 -> "Waiting for your partner"
        1 -> names[0]
        else -> names.dropLast(1).joinToString(", ") + " & " + names.last()
    }
}

@Serializable
data class Me(val user: User, val relationships: List<Relationship>)

@Serializable
data class UpdateMeInput(val displayName: String)

@Serializable
data class WeekStartInput(val weekStart: String)

@Serializable
data class CreateRelationshipInput(val name: String?, val role: Role)

@Serializable
data class Invite(val code: String, val expiresAt: String, val role: Role? = null) {
    /** The link a partner opens to join; the web app handles sign-in and accepting. */
    val link: String get() = "${app.obey.BuildConfig.WEB_URL.trimEnd('/')}/join/$code"
}

/** An invite code from a pasted link or a bare code. */
fun parseInviteCode(text: String): String {
    val t = text.trim()
    return (Regex("/join/([A-Za-z0-9]{4,16})").find(t)?.groupValues?.get(1) ?: t).uppercase()
}

/** [role] is what the person joining becomes; null lets them choose. */
@Serializable
data class CreateInviteInput(val role: Role?)

@Serializable
data class JoinRelationshipInput(val code: String, val role: Role)

@Serializable
data class UpdateRelationshipInput(
    /** "" clears the name. */
    @EncodeDefault(EncodeDefault.Mode.NEVER) val name: String? = null,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val reschedulePolicy: ReschedulePolicy? = null,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val weeklyDelayAllowance: Int? = null,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val features: Features? = null,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val subNotes: Boolean? = null,
    /** The whole list, replacing what's stored. */
    @EncodeDefault(EncodeDefault.Mode.NEVER) val dates: List<DynamicDate>? = null,
)

/** One step of a ritual; ids are made by the app and only need to be unique within the task. */
@Serializable
data class TaskStep(val id: String, val title: String)

enum class CountState { Short, Ok, Over }

/** A tap adds one ([by] = 1); a correction sets the count outright ([to]). */
@Serializable
data class CountChange(val by: Int? = null, val to: Int? = null)

@Serializable
data class TickStepInput(val stepId: String, val done: Boolean)

@Serializable
data class TaskInput(
    val title: String,
    val bodyMd: String = "",
    val assigneeId: String,
    val points: Int = 0,
    val missPenalty: Int = 0,
    val rewardId: String? = null,
    val consequenceId: String? = null,
    /** A consequence handed out for a miss is due this many days later (0 = that day), by consequenceDueTime or all day. */
    val consequenceDueDays: Int = 1,
    val consequenceDueTime: String? = null,
    val proofRequired: Boolean = false,
    val approvalRequired: Boolean = false,
    val schedule: Schedule,
    /** "HH:mm" or null for all-day. */
    val dueTime: String? = null,
    val timezone: String,
    val graceMinutes: Int = 0,
    /** A ritual's steps, done in order from the run sheet; empty for an ordinary task. */
    val steps: List<TaskStep> = emptyList(),
    /** Only doable in the last this-many minutes before it's due; null for any time. */
    val windowMinutes: Int? = null,
    /** A check-in: marking it done asks the assignee how they feel. */
    val askMood: Boolean = false,
    /** A journal task: marking it done means writing a journal entry; bodyMd is the prompt. */
    val asksJournal: Boolean = false,
    /** A count task is marked once each time and done when the count is between these; both null is an ordinary task. */
    val countMin: Int? = null,
    val countMax: Int? = null,
    /** "task" books points and penalties once; "count" for each one counted, short or over. */
    val countPer: String = "task",
    /** A location task: done by getting to this place by the due time. */
    val placeId: String? = null,
    /** With a place: how long to stay once there; leaving sooner is a miss. */
    val stayMinutes: Int? = null,
    /** "default" (Fealty's reminder), "custom" ([reminderText], in the Dominant's words) or "none". */
    val reminder: String = "default",
    val reminderText: String? = null,
)

@Serializable
data class Task(
    val id: String,
    val relationshipId: String,
    val title: String,
    val bodyMd: String = "",
    val assigneeId: String,
    val points: Int = 0,
    val missPenalty: Int = 0,
    val rewardId: String? = null,
    val consequenceId: String? = null,
    val consequenceDueDays: Int = 1,
    val consequenceDueTime: String? = null,
    val proofRequired: Boolean = false,
    val approvalRequired: Boolean = false,
    val schedule: Schedule,
    val dueTime: String? = null,
    val timezone: String,
    val graceMinutes: Int = 0,
    val steps: List<TaskStep> = emptyList(),
    val windowMinutes: Int? = null,
    val askMood: Boolean = false,
    val asksJournal: Boolean = false,
    val summary: String,
    val countMin: Int? = null,
    val countMax: Int? = null,
    val countPer: String = "task",
    val placeId: String? = null,
    val stayMinutes: Int? = null,
    val reminder: String = "default",
    val reminderText: String? = null,
    /** Set when this one-off task is a consequence handed out on its own. */
    val assignedConsequenceId: String? = null,
    val active: Boolean,
    val createdBy: String,
    val createdAt: String,
) {
    fun toInput() = TaskInput(
        title = title, bodyMd = bodyMd, assigneeId = assigneeId, points = points, missPenalty = missPenalty,
        rewardId = rewardId, consequenceId = consequenceId, consequenceDueDays = consequenceDueDays,
        consequenceDueTime = consequenceDueTime, proofRequired = proofRequired,
        approvalRequired = approvalRequired, schedule = schedule, dueTime = dueTime, timezone = timezone,
        graceMinutes = graceMinutes, steps = steps, windowMinutes = windowMinutes, askMood = askMood, asksJournal = asksJournal,
        countMin = countMin, countMax = countMax, countPer = countPer, placeId = placeId, stayMinutes = stayMinutes,
        reminder = reminder, reminderText = reminderText,
    )
}

@Serializable
enum class OccurrenceStatus {
    @SerialName("pending") Pending,
    @SerialName("submitted") Submitted,
    @SerialName("completed") Completed,
    @SerialName("missed") Missed,
    @SerialName("excused") Excused,
    @SerialName("cancelled") Cancelled,
}

@Serializable
data class Occurrence(
    val id: String,
    val seriesId: String,
    val title: String,
    val assigneeId: String,
    val points: Int,
    val originalDate: String,
    val dueAt: String,
    val rescheduled: Boolean,
    val status: OccurrenceStatus,
    val completedAt: String? = null,
    /** Set when it was marked done offline and reached the server later. */
    val syncedAt: String? = null,
    val noteMd: String? = null,
    /** "YYYY-MM-DD": the first day the assignee may complete it; null when any time is fine. */
    val opensOn: String? = null,
    val photoCount: Int = 0,
    /** Needs a photo or a note before it can be marked done. */
    val proofRequired: Boolean = false,
    val commentCount: Int = 0,
    /** The ritual's steps (empty for an ordinary task) and the ids ticked off so far. */
    val steps: List<TaskStep> = emptyList(),
    val stepsDone: List<String> = emptyList(),
    /** When the task's window opens, if it has one. */
    val opensAt: String? = null,
    /** A check-in asks for a mood when it's marked done; mood is the answer, 1 (awful) to 5 (great). */
    val askMood: Boolean = false,
    val mood: Int? = null,
    /** A Dominant has seen this check-in's mood (said "seen" or replied). */
    val moodSeen: Boolean = false,
    /** A consequence (handed out on its own or for a miss), which a "lets off" reward can excuse. */
    val consequence: Boolean = false,
    /** A journal task: its prompt, and the entry written for it once done. */
    val asksJournal: Boolean = false,
    val journalPrompt: String? = null,
    val journalNoteId: String? = null,
    /** A Dominant saw this miss and left it missed, so it no longer needs them. */
    val missConfirmed: Boolean = false,
    /** In occurrence lists, a miss's consequence still to be done (its title), which a Dominant can drop while keeping the miss. */
    val missConsequence: String? = null,
    /** A count task's bounds (both null for an ordinary task) and how many have been marked. */
    val countMin: Int? = null,
    val countMax: Int? = null,
    val countPer: String = "task",
    val count: Int = 0,
    /** A location task's place and stay, when they got there, and when they left before the stay was up. */
    val placeId: String? = null,
    val stayMinutes: Int? = null,
    val arrivedAt: String? = null,
    val leftAt: String? = null,
    /** When they may leave: the end of the stay once there, or a curfew's end. */
    val stayUntil: String? = null,
    /** One night of a curfew; never shown as a task. */
    val curfew: Boolean = false,
    /** Done on this phone with no signal and not sent yet; never from the server. */
    @kotlinx.serialization.Transient val waitingToSync: Boolean = false,
) {
    /** Done by getting to a place (and staying, if it says so) rather than by tapping done. */
    val isPlaced: Boolean get() = placeId != null

    /** At the place now, waiting out the stay. */
    val isStaying: Boolean get() = status == OccurrenceStatus.Pending && arrivedAt != null && stayMinutes != null

    /** Marked once each time it's done (cups of water, edges) instead of once. */
    val isCounted: Boolean get() = countMin != null || countMax != null

    /** "exactly 3", "at least 8", "no more than 2", "3–5". */
    val countBounds: String get() = when {
        countMin != null && countMax != null -> if (countMin == countMax) "exactly $countMin" else "$countMin–$countMax"
        countMin != null -> "at least $countMin"
        else -> "no more than $countMax"
    }

    fun countState(n: Int = count): CountState = when {
        countMax != null && n > countMax -> CountState.Over
        countMin != null && n < countMin -> CountState.Short
        else -> CountState.Ok
    }

    /** "5 of at least 8", "3 of 3–5 · done, up to 2 more", "4 of exactly 3 · over by 1". */
    val countLine: String get() {
        val base = "$count of $countBounds"
        return when {
            countState() == CountState.Over -> "$base · over by ${count - countMax!!}"
            status != OccurrenceStatus.Completed -> base
            countMax != null && countMin != countMax && count == countMax -> "$base · at the limit"
            countMax != null && countMin != countMax -> "$base · done, up to ${countMax - count} more"
            else -> "$base · done"
        }
    }

    /** Whether the count can still change: the assignee's while it's open and not past due; a Dominant's any time. */
    fun canCount(mine: Boolean, manager: Boolean): Boolean {
        val live = status == OccurrenceStatus.Pending || status == OccurrenceStatus.Completed || (status == OccurrenceStatus.Missed && !missConfirmed)
        return live && (manager || (mine && isOpen() && java.time.Instant.parse(dueAt).isAfter(java.time.Instant.now())))
    }

    /**
     * Tomorrow's daily task waits for its day, and a task with a window waits for it to open; the API refuses
     * either before then.
     */
    fun isOpen(today: java.time.LocalDate = java.time.LocalDate.now(), now: java.time.Instant = java.time.Instant.now()) =
        (opensOn == null || !java.time.LocalDate.parse(opensOn).isAfter(today)) &&
            (opensAt == null || !java.time.Instant.parse(opensAt).isAfter(now))

    val isRitual: Boolean get() = steps.isNotEmpty()

    /** "2 of 4 steps" */
    val stepProgress: String get() = "${stepsDone.size} of ${steps.size} steps"
}

/** A past occurrence in a task's history, with the points it earned or cost. */
@Serializable
data class TaskStats(
    val done: Int,
    val missed: Int,
    val excused: Int,
    /** done / (done + missed); null before anything was due. */
    val rate: Double? = null,
    val streak: Int,
    val bestStreak: Int,
    val lastDoneAt: String? = null,
)

/** A task's current streak and its last few results, oldest first: "completed", "missed" or "excused". */
@Serializable
data class TaskStreak(
    val taskId: String,
    val streak: Int,
    val recent: List<String> = emptyList(),
)

@Serializable
data class AssignConsequenceInput(
    val assigneeId: String,
    val date: String,
    val dueTime: String?,
    val timezone: String,
    val reason: String,
    val approvalRequired: Boolean,
)

@Serializable
data class HistoryEntry(
    val id: String,
    val originalDate: String,
    val dueAt: String,
    val status: OccurrenceStatus,
    val completedAt: String? = null,
    val syncedAt: String? = null,
    val noteMd: String? = null,
    val pointsDelta: Int = 0,
    val editedBy: String? = null,
)

/** A Dominant's correction from the history. Only completed, missed and excused are accepted. */
@Serializable
data class EditOccurrenceInput(
    val status: OccurrenceStatus,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val completedAt: String? = null,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val noteMd: String? = null,
)

@Serializable
data class CompleteOccurrenceInput(
    @EncodeDefault(EncodeDefault.Mode.NEVER) val noteMd: String? = null,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val mood: Int? = null,
    /** A journal task's entry, saved to the journal and shared. */
    @EncodeDefault(EncodeDefault.Mode.NEVER) val journal: JournalEntryInput? = null,
    /** When it was done, for a completion made offline. */
    @EncodeDefault(EncodeDefault.Mode.NEVER) val doneAt: String? = null,
)

@Serializable
data class JournalEntryInput(val title: String = "", val bodyMd: String)

/** Done, missed and excused counts; [rate] is done / (done + missed), null when nothing was due. */
@Serializable
data class Tally(val done: Int = 0, val missed: Int = 0, val excused: Int = 0, val rate: Double? = null)

@Serializable
data class StatsTotals(val done: Int, val missed: Int, val excused: Int, val rate: Double? = null, val onTime: Int = 0, val moved: Int = 0)

@Serializable
data class StatsBucket(val start: String, val done: Int, val missed: Int, val excused: Int, val rate: Double? = null)

@Serializable
data class TaskTally(val taskId: String, val title: String, val active: Boolean, val streak: Int, val done: Int, val missed: Int, val excused: Int, val rate: Double? = null)

/**
 * How one person's tasks went over the last [days] days, or over the calendar [month] when set. [bucket] is "day", "week"
 * or "month"; [weekdays] starts on Sunday.
 */
@Serializable
data class DynamicStats(
    val days: Int,
    val month: String? = null,
    val totals: StatsTotals,
    val previous: Tally,
    val bucket: String,
    val buckets: List<StatsBucket>,
    val weekdays: List<Tally>,
    val tasks: List<TaskTally>,
)

@Serializable
data class MonthFocusInput(val goal: String, val taskIds: List<String> = emptyList())

@Serializable
data class MonthReviewInput(val rating: Int, val wentWell: String = "", val workOn: String = "")

/** The month's one goal, and the tasks that count towards it. [setBy] is null once that person has left. */
@Serializable
data class MonthFocus(val goal: String, val taskIds: List<String>, val setBy: String? = null, val updatedAt: String)

/** One person's look back on a month: how well the focus was kept (1 to 5), and two answers. */
@Serializable
data class MonthReview(val userId: String, val rating: Int, val wentWell: String = "", val workOn: String = "", val updatedAt: String)

@Serializable
data class FocusTaskTally(val taskId: String, val title: String, val done: Int, val missed: Int, val excused: Int, val rate: Double? = null)

/**
 * A month in the dynamic: its focus, how the sub's ([subjectId]) tasks went against the month before, and the reviews.
 * [reviews] holds your own answers, and everyone else's once you've given yours.
 */
@Serializable
data class MonthSummary(
    val month: String,
    val subjectId: String? = null,
    val focus: MonthFocus? = null,
    val reviewOpensOn: String,
    val reviewOpen: Boolean,
    val reviews: List<MonthReview> = emptyList(),
    val waitingOn: List<String> = emptyList(),
    val totals: Tally,
    val previous: Tally,
    val focusTasks: List<FocusTaskTally> = emptyList(),
    /** The month's average mood, kept for older apps; [moods] is what the review shows. */
    val mood: Double? = null,
    /** The sub's check-in moods this month, oldest first. */
    val moods: List<MoodPoint> = emptyList(),
)

@Serializable
data class MoodPoint(val at: String, val mood: Int)

@Serializable
data class PastMonth(val month: String, val goal: String? = null, val myRating: Int? = null, val rate: Double? = null)

/** One point on the mood graph: a check-in answer, or a journal entry with a mood. */
@Serializable
data class MoodEntry(
    val at: String,
    val userId: String,
    val mood: Int,
    /** "checkin" or "journal". */
    val source: String,
    val title: String = "",
    val note: String? = null,
    val occurrenceId: String? = null,
    val noteId: String? = null,
)

@Serializable
data class ReviewOccurrenceInput(
    val approve: Boolean,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val noteMd: String? = null,
    /** Posted as a comment on the task, e.g. what to fix when sending it back. */
    @EncodeDefault(EncodeDefault.Mode.NEVER) val comment: String? = null,
)

@Serializable
data class CommentInput(val body: String)

/** What the comment list shows, from a due date's comments or a journal entry's. */
interface Comment {
    val id: String
    val authorId: String
    val body: String
    val createdAt: String
}

/** One message in the conversation on a due date. */
@Serializable
data class OccurrenceComment(
    override val id: String,
    val occurrenceId: String,
    override val authorId: String,
    override val body: String,
    override val createdAt: String,
) : Comment

/** A reply under a journal entry. */
@Serializable
data class NoteComment(
    override val id: String,
    val noteId: String,
    override val authorId: String,
    override val body: String,
    override val createdAt: String,
) : Comment

@Serializable
enum class RescheduleScope {
    @SerialName("this") This,
    @SerialName("following") Following,
}

/** Give exactly one of [delayHours] or [dueAt] (ISO-8601 with offset). */
@Serializable
data class RescheduleInput(
    val scope: RescheduleScope = RescheduleScope.This,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val delayHours: Int? = null,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val dueAt: String? = null,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val reason: String? = null,
)

@Serializable
enum class RescheduleStatus {
    @SerialName("requested") Requested,
    @SerialName("approved") Approved,
    @SerialName("declined") Declined,
    @SerialName("applied") Applied,
}

@Serializable
data class RescheduleRequest(
    val id: String,
    /** Shared by the rows of one whole-day request, which are decided together. */
    val groupId: String? = null,
    val occurrenceId: String,
    /** The task's title, so a request card can name it. */
    val title: String = "",
    val requestedBy: String,
    val scope: RescheduleScope,
    /** "move", or "cancel" when asking to call the task off. */
    val kind: String = "move",
    val fromDueAt: String,
    val toDueAt: String,
    val reason: String? = null,
    val status: RescheduleStatus,
    val createdAt: String,
)

@Serializable
data class RescheduleResult(
    val applied: Boolean,
    val request: RescheduleRequest? = null,
    val occurrence: Occurrence,
)

/** One task a plan runs into, sorted out: moved to [dueAt], or called off ("cancel"). */
@Serializable
data class PlanRescheduleItem(val occurrenceId: String, val action: String, @EncodeDefault(EncodeDefault.Mode.NEVER) val dueAt: String? = null)

@Serializable
data class PlanRescheduleInput(val items: List<PlanRescheduleItem>, @EncodeDefault(EncodeDefault.Mode.NEVER) val reason: String? = null)

@Serializable
data class PlanRescheduleResult(val applied: Boolean, val groupId: String, val requests: List<RescheduleRequest>, val occurrences: List<Occurrence>)

/** "More time for today": delay several occurrences together, decided as one request. */
@Serializable
data class RescheduleDayInput(
    val occurrenceIds: List<String>,
    val delayHours: Int,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val reason: String? = null,
)

@Serializable
data class RescheduleDayResult(
    val applied: Boolean,
    val groupId: String,
    val requests: List<RescheduleRequest>,
    val occurrences: List<Occurrence>,
)

/** A delay a sub took from their weekly allowance, which their Dominant hears about. */
@Serializable
data class DelayUsed(
    val id: String,
    val requestedBy: String,
    val items: List<DelayItem>,
    val reason: String? = null,
    val createdAt: String,
    /** Delays left this week, of [allowance]. */
    val left: Int,
    val allowance: Int,
)

@Serializable
data class DelayItem(val occurrenceId: String, val title: String, val fromDueAt: String, val toDueAt: String)

@Serializable
data class DecideInput(
    val approve: Boolean,
    /** "Reschedule instead": this one task moves here, whatever was asked. */
    @EncodeDefault(EncodeDefault.Mode.NEVER) val dueAt: String? = null,
    /** Decide only this task, not its whole group. */
    @EncodeDefault(EncodeDefault.Mode.NEVER) val item: Boolean? = null,
)

@Serializable
enum class LedgerKind {
    @SerialName("completion") Completion,
    @SerialName("miss") Miss,
    @SerialName("redemption") Redemption,
    @SerialName("adjustment") Adjustment,
    @SerialName("delay") Delay,
}

@Serializable
data class LedgerEntry(
    val id: String,
    val userId: String,
    val delta: Int,
    val kind: LedgerKind,
    val note: String,
    val createdBy: String? = null,
    val createdAt: String,
    /** A redemption: the reward, and the consequence it lets them off, if it's that kind. */
    val rewardId: String? = null,
    val occurrenceId: String? = null,
    val consequenceTitle: String? = null,
    /** When a Dominant marked it redeemed (gave it), who did, and what they said. Null is waiting on them. */
    val redeemedAt: String? = null,
    val redeemedBy: String? = null,
    val redeemNote: String? = null,
)

@Serializable
data class RedeemInput(@EncodeDefault(EncodeDefault.Mode.NEVER) val consequenceOccurrenceId: String? = null)

@Serializable
data class MarkRedeemedInput(@EncodeDefault(EncodeDefault.Mode.NEVER) val note: String? = null)

@Serializable
data class Balance(val userId: String, val balance: Int)

@Serializable
data class AdjustPointsInput(val userId: String, val delta: Int, val note: String)

@Serializable
data class RewardInput(
    val title: String,
    val bodyMd: String = "",
    val cost: Int,
    /** Lets the sub off one of their consequences, excused once a Dominant marks it redeemed. */
    val letsOff: Boolean = false,
    /** Takes this much off their running lock once marked redeemed. */
    val lockMinutes: Int? = null,
)

@Serializable
data class Reward(
    val id: String,
    val relationshipId: String,
    val title: String,
    val bodyMd: String = "",
    val cost: Int,
    val letsOff: Boolean = false,
    val lockMinutes: Int? = null,
    val createdAt: String,
)

@Serializable
data class ConsequenceInput(
    val title: String,
    val bodyMd: String = "",
    val severity: Int = 1,
    /** Adds this much to their running lock instead of making a task. */
    val lockMinutes: Int? = null,
)

@Serializable
data class Consequence(
    val id: String,
    val relationshipId: String,
    val title: String,
    val bodyMd: String = "",
    val severity: Int = 1,
    val lockMinutes: Int? = null,
    val createdAt: String,
)

@Serializable
data class RuleInput(
    val title: String,
    val bodyMd: String = "",
    val category: String? = null,
)

@Serializable
data class Protocol(
    val id: String,
    val relationshipId: String,
    val title: String,
    val bodyMd: String = "",
    /** The rule this protocol spells out, if any. */
    val ruleId: String? = null,
    val position: Int = 0,
    val createdAt: String,
)

@Serializable
data class ProtocolInput(
    val title: String,
    val bodyMd: String = "",
    val ruleId: String? = null,
)

/** A full ordering of rules or protocols, top first. */
@Serializable
data class ReorderInput(val ids: List<String>)

@Serializable
data class Rule(
    val id: String,
    val relationshipId: String,
    val title: String,
    val bodyMd: String = "",
    val category: String? = null,
    val position: Int = 0,
    val createdAt: String,
)

@Serializable
enum class NoteKind {
    @SerialName("note") Note,
    @SerialName("journal") Journal,
}

@Serializable
enum class NoteVisibility {
    @SerialName("private") Private,
    @SerialName("shared") Shared,
}

@Serializable
data class NoteInput(
    val kind: NoteKind = NoteKind.Note,
    val title: String = "",
    val bodyMd: String,
    val visibility: NoteVisibility = NoteVisibility.Shared,
    val tags: List<String> = emptyList(),
    val pinned: Boolean = false,
    /** 1..5 or null. */
    val mood: Int? = null,
    /** On a Dominant's shared note: the submissive may edit its title, text and tags. */
    val subCanEdit: Boolean = false,
)

@Serializable
data class Note(
    val id: String,
    val relationshipId: String,
    val authorId: String,
    val kind: NoteKind = NoteKind.Note,
    val title: String = "",
    val bodyMd: String,
    val visibility: NoteVisibility = NoteVisibility.Shared,
    val tags: List<String> = emptyList(),
    val pinned: Boolean = false,
    val mood: Int? = null,
    val subCanEdit: Boolean = false,
    /** Whether the current user may change it; the server decides. */
    val canEdit: Boolean = false,
    val commentCount: Int = 0,
    /** Earlier versions kept of the title and text; more than 0 means it was edited. */
    val revisionCount: Int = 0,
    val createdAt: String,
    val updatedAt: String,
) {
    fun toInput() = NoteInput(kind, title, bodyMd, visibility, tags, pinned, mood, subCanEdit)
}

/** A note's title and text before an edit; [createdAt] is when [editorId]'s edit replaced it. */
@Serializable
data class NoteRevision(
    val id: String,
    val noteId: String,
    val editorId: String,
    val title: String,
    val bodyMd: String,
    val createdAt: String,
)

/** A device this account gets push on; only the token's end is sent, enough to spot this one. */
@Serializable
data class DeviceStatus(
    val platform: String,
    val tokenTail: String,
    val registeredAt: String,
    val lastSentAt: String? = null,
    val lastError: String? = null,
)

@Serializable
data class RegisterDeviceInput(val token: String, val platform: String = "android")

@Serializable
data class ApiError(val error: String, val details: kotlinx.serialization.json.JsonElement? = null)

/** A plan on the shared calendar. All-day plans run from local midnight to the midnight after their last day. */
@Serializable
data class CalendarEventInput(
    val title: String,
    val startsAt: String,
    val endsAt: String,
    val allDay: Boolean = false,
    /** Whether the partner is in on it; only then do their tasks count as clashing. */
    val withPartner: Boolean = false,
    val noteMd: String? = null,
)

@Serializable
data class CalendarEvent(
    val id: String,
    val relationshipId: String,
    val authorId: String,
    val title: String,
    val startsAt: String,
    val endsAt: String,
    val allDay: Boolean = false,
    val withPartner: Boolean = false,
    val noteMd: String? = null,
    /** Tasks still to do that fall due during the plan, for the people it involves. */
    val conflictIds: List<String> = emptyList(),
    /** Someone else (a Dominant) moved its end; the author is shown it until they close the card. */
    val changedBy: String? = null,
    val previousEndsAt: String? = null,
    val changeNote: String? = null,
)

/** A Dominant moving when someone else's plan ends; nothing else of theirs can be changed. */
@Serializable
data class PlanEndInput(val endsAt: String, val note: String? = null)

/** A broken rule or protocol; [title] is what it was called when logged. */
@Serializable
data class RuleLogEntry(
    val id: String,
    val relationshipId: String,
    val subjectId: String,
    val loggedBy: String,
    val ruleId: String? = null,
    val protocolId: String? = null,
    val title: String,
    val note: String = "",
    val occurredOn: String,
    val consequenceTaskId: String? = null,
    val createdAt: String,
)

@Serializable
data class RuleLogConsequence(val consequenceId: String, val date: String, val dueTime: String?, val timezone: String, val approvalRequired: Boolean)

@Serializable
data class RuleLogInput(
    val subjectId: String,
    val ruleId: String?,
    val protocolId: String?,
    val note: String,
    val occurredOn: String,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val consequence: RuleLogConsequence? = null,
)

/** A ready-made set of tasks, rules and protocols; the catalog lives on the server. */
@Serializable
data class StarterKit(val id: String, val title: String, val description: String, val icon: String, val items: List<KitItem>)

/** One thing a kit adds. Never who a task is for, places, photos or history. */
@Serializable
data class KitItem(
    val key: String,
    /** "task", "rule", "protocol", "reward" or "consequence". */
    val kind: String,
    val title: String,
    val bodyMd: String? = null,
    /** Tasks: absent for a one-off. */
    val repeat: RecurrenceRule? = null,
    val anchor: Anchor? = null,
    val dueTime: String? = null,
    val points: Int? = null,
    val proofRequired: Boolean? = null,
    val steps: List<String>? = null,
    val consequenceKey: String? = null,
    val rewardKey: String? = null,
    val ruleKey: String? = null,
    val cost: Int? = null,
)

@Serializable
data class ApplyKitInput(
    val items: List<String>,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val assigneeId: String? = null,
    val timezone: String,
    val start: String,
)

@Serializable
data class ApplyKitResult(val tasks: Int, val rules: Int, val protocols: Int, val rewards: Int = 0, val consequences: Int = 0)

/** A kit someone saved from a dynamic: theirs alone, shareable by code. */
@Serializable
data class Kit(
    val id: String,
    val title: String,
    val description: String,
    val items: List<KitItem>,
    val shareCode: String? = null,
    val createdAt: String,
)

@Serializable
data class KitInput(
    val title: String,
    val description: String,
    val tasks: List<String>,
    val rules: List<String>,
    val protocols: List<String>,
    val rewards: List<String>,
    val consequences: List<String>,
)

@Serializable
data class KitPatch(val title: String, val description: String, val keep: List<String>)

/** A shared kit as anyone with its code sees it. */
@Serializable
data class SharedKit(val code: String, val title: String, val description: String, val items: List<KitItem>)

/** "That's fine": keep these tasks as they are alongside a plan; they stop counting as clashes. */
@Serializable
data class DismissClashesInput(val occurrenceIds: List<String>)

/** Yellow: slow down and check in. Red: stop; tasks that slip while it's on are excused. */
@Serializable
enum class SafeLevel {
    @SerialName("yellow") Yellow,
    @SerialName("red") Red,
}

@Serializable
data class SafeCall(
    val id: String,
    val relationshipId: String,
    val callerId: String,
    val level: SafeLevel,
    val note: String = "",
    val createdAt: String,
    val clearedAt: String? = null,
    val clearedBy: String? = null,
)

/** The dynamic's open safe call, if any, and the most recent ones. */
@Serializable
data class SafeCalls(val active: SafeCall? = null, val recent: List<SafeCall> = emptyList())

@Serializable
data class SafeCallInput(val level: SafeLevel, val note: String = "")

/** A spot a Dominant saved for location tasks; arriving anywhere inside the radius counts. */
@Serializable
data class PlaceInput(
    val name: String,
    val address: String? = null,
    val lat: Double,
    val lng: Double,
    val radiusM: Int = 150,
)

@Serializable
data class Place(
    val id: String,
    val relationshipId: String,
    val name: String,
    val address: String? = null,
    val lat: Double,
    val lng: Double,
    val radiusM: Int,
    val createdAt: String,
    /** Active tasks that use it. */
    val taskTitles: List<String> = emptyList(),
) {
    fun toInput() = PlaceInput(name = name, address = address, lat = lat, lng = lng, radiusM = radiusM)
}

/** An address or business from place search, nearest first. */
@Serializable
data class PlaceSearchResult(val name: String, val address: String, val lat: Double, val lng: Double)

/** A signed link to satellite tiles through the api, good for a couple of hours; tiles is null when satellite view is off. */
@Serializable
data class ImageryLink(val tiles: String? = null, val attribution: String? = null)

/** The phone noticed arriving at a task's place ("enter"), or the person tapped I'm here ("checkin"). */
@Serializable
data class ArriveOccurrenceInput(
    val kind: String,
    val lat: Double,
    val lng: Double,
    val accuracyM: Int,
    /** When it happened, if it was held back offline. */
    @EncodeDefault(EncodeDefault.Mode.NEVER) val at: String? = null,
)

@Serializable
data class LeaveOccurrenceInput(@EncodeDefault(EncodeDefault.Mode.NEVER) val at: String? = null)

@Serializable
data class ReportLocationInput(val status: LocationStatus)

/** [until] null pauses until it's turned back on. */
@Serializable
data class PauseLocationInput(val until: String?)

/**
 * A sub's curfew: home by [time] each night at the place, in until [until]. A time before noon is just after midnight.
 * With [weekendTime], [time] is for Sun–Thu nights and [weekendTime] for Fri–Sat nights.
 */
@Serializable
data class CurfewInput(
    val enabled: Boolean,
    val assigneeId: String,
    val placeId: String,
    val time: String,
    val weekendTime: String? = null,
    val until: String,
    val points: Int = 0,
    val missPenalty: Int = 0,
    val consequenceId: String? = null,
    val timezone: String,
    /** Getting home asks the sub to tell the Dominant they're home. */
    val reportHome: Boolean = false,
)

/** The night Today shows: from an hour before curfew until it ends, or a broken one a Dominant hasn't settled. */
@Serializable
data class CurfewNight(
    val occurrenceId: String,
    val assigneeId: String,
    val placeId: String,
    val dueAt: String,
    val endsAt: String,
    val status: OccurrenceStatus,
    val arrivedAt: String? = null,
    val leftAt: String? = null,
    val missConfirmed: Boolean = false,
    /** Their phone can't check location, so they say "I'm home" themselves. */
    val canTap: Boolean = false,
    /** The latest note a Dominant left about this night (say, with a declined ask). */
    val note: String? = null,
    /** The curfew asks them to tell the Dominant they're home; when they did, and the line they sent. */
    val reportHome: Boolean = false,
    val toldAt: String? = null,
    val toldNote: String? = null,
)

@Serializable
data class TellHomeInput(@EncodeDefault(EncodeDefault.Mode.NEVER) val note: String? = null)

/** A plan in the coming week that runs into a curfew night. */
@Serializable
data class CurfewClash(
    val occurrenceId: String,
    val dueAt: String,
    val endsAt: String,
    val eventId: String,
    val eventTitle: String,
    val eventStartsAt: String,
    val eventEndsAt: String,
)

@Serializable
data class Curfew(
    val settings: CurfewInput? = null,
    val night: CurfewNight? = null,
    val clashes: List<CurfewClash> = emptyList(),
    /** Pending asks for more time: a sub sees their own, a Dominant all of them. */
    val requests: List<CurfewRequest> = emptyList(),
)

/** A sub asking for a later curfew one night; it lapses at that night's curfew if nobody answers. */
@Serializable
data class CurfewRequest(
    val id: String,
    val occurrenceId: String,
    /** The plan it was asked from, if any. */
    val eventId: String? = null,
    val eventTitle: String? = null,
    val requestedBy: String,
    val fromDueAt: String,
    val untilAt: String,
    val reason: String? = null,
)

@Serializable
data class CurfewRequestInput(val occurrenceId: String, val until: String, val reason: String? = null, val eventId: String? = null)

@Serializable
data class ApproveCurfewRequestInput(val until: String? = null)

@Serializable
data class CurfewCheckInput(val startsAt: String, val endsAt: String)

/** The curfew night a plan being made runs into. */
@Serializable
data class CurfewCheckNight(val occurrenceId: String, val dueAt: String, val endsAt: String)

@Serializable
data class CurfewCheck(val night: CurfewCheckNight? = null)

@Serializable
data class ExcuseCurfewInput(val occurrenceId: String)

/** A section of the agreement as it's proposed. Text bodies are plain lines ("- " starts a bullet); rules and protocols sections list those pages. */
@Serializable
data class AgreementSectionInput(val id: String, val kind: String = "text", val title: String, val body: String = "", val noteId: String? = null)

/** Proposing a version: the whole page, a review date (YYYY-MM-DD), and a line for the partner about what changed. */
@Serializable
data class AgreementInput(val sections: List<AgreementSectionInput>, val reviewBy: String? = null, val note: String = "")

@Serializable
data class AgreementFeedbackInput(val note: String)

/** A line of a section against the version in force before it: "same", "add" or "del". */
@Serializable
data class AgreementLine(val op: String, val text: String)

@Serializable
data class AgreementSection(
    val id: String,
    /** "text", "rules" or "protocols". */
    val kind: String = "text",
    val title: String,
    val body: String = "",
    val noteId: String? = null,
    val noteTitle: String? = null,
    val items: List<String> = emptyList(),
    /** "new", "changed" or "same", against the version before. */
    val change: String = "same",
    val lines: List<AgreementLine> = emptyList(),
)

@Serializable
data class AgreementSignature(val userId: String, val agreedAt: String)

@Serializable
data class AgreementFeedback(val userId: String? = null, val note: String = "", val at: String)

@Serializable
data class AgreementVersion(
    val id: String,
    val relationshipId: String,
    val number: Int,
    /** "proposed", "changes_requested", "agreed" or "superseded". */
    val status: String,
    val sections: List<AgreementSection> = emptyList(),
    val removed: List<String> = emptyList(),
    val changes: Int = 0,
    val reviewBy: String? = null,
    val note: String = "",
    val proposedBy: String? = null,
    val proposedAt: String,
    val agreements: List<AgreementSignature> = emptyList(),
    val agreedAt: String? = null,
    val feedback: AgreementFeedback? = null,
) {
    val open: Boolean get() = status == "proposed" || status == "changes_requested"
}

@Serializable
data class AgreementVersionSummary(
    val id: String,
    val number: Int,
    val status: String,
    val proposedBy: String? = null,
    val proposedAt: String,
    val agreedAt: String? = null,
    val changes: Int = 0,
)

/** The version in force, the open proposal if there is one, and every version newest first. */
@Serializable
data class Agreement(val current: AgreementVersion? = null, val proposal: AgreementVersion? = null, val versions: List<AgreementVersionSummary> = emptyList())

@Serializable
data class AgreementTemplate(val sections: List<AgreementSectionInput>)

/** A rule or protocol someone else added, changed or removed, until this person marks it seen. */
@Serializable
data class LibraryChange(
    val id: String,
    /** "rules" or "protocols". */
    val kind: String,
    /** "added", "changed" or "removed". */
    val verb: String,
    val itemId: String,
    val title: String,
    val changedBy: String? = null,
    val createdAt: String,
)

@Serializable
data class SeenLibraryChangesInput(val ids: List<String>)

/** Aftercare offered when logging a scene or writing a plan; anything else can be typed in. */
val AFTERCARE = listOf("Water", "Blanket", "Cuddles", "Snack", "Quiet time", "Talking it through")

/** A scene as logged: either partner logs it, and anyone in the dynamic can change it. [timezone] is where it happened, for the next-day check-in. */
@Serializable
data class SceneInput(
    val title: String = "",
    val occurredAt: String,
    val timezone: String,
    val what: String = "",
    /** "none", "yellow" or "red". */
    val safeword: String = "none",
    val aftercare: List<String> = emptyList(),
)

/** One person's side, written alone and shared once. */
@Serializable
data class SceneSideInput(val mood: Int, val worked: String = "", val change: String = "", val need: String = "")

@Serializable
data class SceneSide(
    val userId: String,
    val mood: Int,
    val worked: String = "",
    val change: String = "",
    val need: String = "",
    val sharedAt: String,
)

/** "How are you feeling after last night?", the day after. */
@Serializable
data class SceneCheckInput(val mood: Int, val note: String = "")

@Serializable
data class SceneCheck(val userId: String, val mood: Int, val note: String = "", val at: String)

@Serializable
data class Scene(
    val id: String,
    val title: String = "",
    val occurredAt: String,
    val timezone: String,
    val what: String = "",
    /** "none", "yellow" or "red". */
    val safeword: String = "none",
    val aftercare: List<String> = emptyList(),
    val loggedBy: String? = null,
    val createdAt: String,
    /** When the next-day check-in opens (10:00 the day after, where it happened). */
    val checkFrom: String,
    /** Everyone who has shared their side. */
    val shared: List<String> = emptyList(),
    /** My side, and the others' once I've shared mine. */
    val sides: List<SceneSide> = emptyList(),
    val checks: List<SceneCheck> = emptyList(),
    /** Whether I've closed the others' aftercare plans on Today. */
    val aftercareDone: Boolean = false,
    val commentCount: Int = 0,
)

/** What someone needs after a scene; only they edit it. */
@Serializable
data class AftercarePlanInput(val needs: List<String>, val note: String = "")

@Serializable
data class AftercarePlan(val userId: String, val needs: List<String> = emptyList(), val note: String = "", val updatedAt: String? = null)

/** A comment under a scene. */
@Serializable
data class SceneComment(
    override val id: String,
    val sceneId: String,
    override val authorId: String,
    override val body: String,
    override val createdAt: String,
) : Comment

// Chastity

@Serializable
data class ChastityLockInput(
    val wearerId: String? = null,
    /** Null: until the keyholder releases them. */
    val minutes: Int? = null,
    val hideTime: Boolean = false,
    /** "keyholder" or "keybox". */
    val keyMode: String = "keyholder",
)

@Serializable
data class ChastityLock(
    val id: String,
    val relationshipId: String,
    val wearerId: String,
    val keyholderId: String,
    /** pending, active, break, ended, declined or cancelled. */
    val status: String,
    val keyMode: String,
    val minutes: Int? = null,
    val hideTime: Boolean = false,
    val startedAt: String? = null,
    /** Null when open-ended, and for a wearer whose keyholder hides the time. */
    val endsAt: String? = null,
    val timeHidden: Boolean = false,
    val breakEndsAt: String? = null,
    val hasKeybox: Boolean = false,
    val canSeeKeybox: Boolean = false,
    val createdAt: String,
    val endedAt: String? = null,
    /** "time" or "released". */
    val endReason: String? = null,
) {
    val running: Boolean get() = status == "active" || status == "break"
}

@Serializable
data class ChastityEvent(
    val id: String,
    val lockId: String,
    /** started, time, release_ask, break, photo_ask, relocked or ended. */
    val kind: String,
    /** For asks: pending, approved, declined, done or overdue. */
    val status: String? = null,
    val minutes: Int? = null,
    val note: String? = null,
    val byId: String? = null,
    val createdAt: String,
    val decidedAt: String? = null,
    val taskId: String? = null,
)

@Serializable
data class ChastityView(val open: List<ChastityLock> = emptyList(), val events: List<ChastityEvent> = emptyList(), val past: List<ChastityLock> = emptyList())

@Serializable
data class ChastityTimeInput(val minutes: Int, val note: String? = null)

@Serializable
data class ChastityAskInput(
    /** "release" or "break". */
    val kind: String,
    val minutes: Int? = null,
    val note: String? = null,
)

@Serializable
data class ChastityDecideInput(val approve: Boolean, val minutes: Int? = null, val note: String? = null)

@Serializable
data class ChastityPhotoAskInput(val dueAt: String, val timezone: String)

@Serializable
data class ChastityPhotoAsk(val taskId: String)
