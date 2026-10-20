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
)

@Serializable
data class Member(val userId: String, val displayName: String, val role: Role, val avatarVersion: String? = null)

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
)

/** Parts of the app a dynamic can switch off; switched-off parts are hidden for everyone in it. Tasks and notes are always on. */
@Serializable
data class Features(
    val points: Boolean = true,
    val consequences: Boolean = true,
    val rules: Boolean = true,
    val protocols: Boolean = true,
    val journal: Boolean = true,
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
data class Invite(val code: String, val expiresAt: String)

@Serializable
data class JoinRelationshipInput(val code: String, val role: Role)

@Serializable
data class UpdateRelationshipInput(
    /** "" clears the name. */
    @EncodeDefault(EncodeDefault.Mode.NEVER) val name: String? = null,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val reschedulePolicy: ReschedulePolicy? = null,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val weeklyDelayAllowance: Int? = null,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val features: Features? = null,
)

@Serializable
data class TaskInput(
    val title: String,
    val bodyMd: String = "",
    val assigneeId: String,
    val points: Int = 0,
    val missPenalty: Int = 0,
    val rewardId: String? = null,
    val consequenceId: String? = null,
    val proofRequired: Boolean = false,
    val approvalRequired: Boolean = false,
    val schedule: Schedule,
    /** "HH:mm" or null for all-day. */
    val dueTime: String? = null,
    val timezone: String,
    val graceMinutes: Int = 0,
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
    val proofRequired: Boolean = false,
    val approvalRequired: Boolean = false,
    val schedule: Schedule,
    val dueTime: String? = null,
    val timezone: String,
    val graceMinutes: Int = 0,
    val summary: String,
    val active: Boolean,
    val createdBy: String,
    val createdAt: String,
) {
    fun toInput() = TaskInput(
        title = title, bodyMd = bodyMd, assigneeId = assigneeId, points = points, missPenalty = missPenalty,
        rewardId = rewardId, consequenceId = consequenceId, proofRequired = proofRequired,
        approvalRequired = approvalRequired, schedule = schedule, dueTime = dueTime, timezone = timezone,
        graceMinutes = graceMinutes,
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
    val noteMd: String? = null,
)

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

@Serializable
data class HistoryEntry(
    val id: String,
    val originalDate: String,
    val dueAt: String,
    val status: OccurrenceStatus,
    val completedAt: String? = null,
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
data class CompleteOccurrenceInput(@EncodeDefault(EncodeDefault.Mode.NEVER) val noteMd: String? = null)

@Serializable
data class ReviewOccurrenceInput(
    val approve: Boolean,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val noteMd: String? = null,
)

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

@Serializable
data class DecideInput(val approve: Boolean)

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
)

@Serializable
data class Balance(val userId: String, val balance: Int)

@Serializable
data class AdjustPointsInput(val userId: String, val delta: Int, val note: String)

@Serializable
data class RewardInput(
    val title: String,
    val bodyMd: String = "",
    val cost: Int,
    val needsApproval: Boolean = true,
)

@Serializable
data class Reward(
    val id: String,
    val relationshipId: String,
    val title: String,
    val bodyMd: String = "",
    val cost: Int,
    val needsApproval: Boolean = true,
    val createdAt: String,
)

@Serializable
data class ConsequenceInput(val title: String, val bodyMd: String = "", val severity: Int = 1)

@Serializable
data class Consequence(
    val id: String,
    val relationshipId: String,
    val title: String,
    val bodyMd: String = "",
    val severity: Int = 1,
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
    val createdAt: String,
    val updatedAt: String,
) {
    fun toInput() = NoteInput(kind, title, bodyMd, visibility, tags, pinned, mood)
}

@Serializable
data class RegisterDeviceInput(val token: String, val platform: String = "android")

@Serializable
data class ApiError(val error: String, val details: kotlinx.serialization.json.JsonElement? = null)
