package app.obey.ui

import kotlinx.serialization.Serializable

// Type-safe Navigation Compose routes.
@Serializable data object TodayRoute
@Serializable data object UpcomingRoute
@Serializable data object RewardsRoute
@Serializable data object ConsequencesRoute
@Serializable data object RulesRoute
@Serializable data object ProtocolsRoute
@Serializable data object RuleLogRoute
@Serializable data object NotesRoute
@Serializable data object JournalRoute
/** [month] ("2026-10") and [who] open a calendar month and a member, e.g. from the monthly review. */
@Serializable data class StatsRoute(val month: String? = null, val who: String? = null)
@Serializable data object MonthReviewRoute
@Serializable data object SettingsRoute
/** Your dynamic; [invite] opens it on the invite sheet (from solo mode's "Invite a partner"). */
@Serializable data class DynamicRoute(val invite: Boolean = false)
@Serializable data object TaskListRoute
@Serializable data object KitsRoute
@Serializable data class KitRoute(val kitId: String)
@Serializable data object NewKitRoute
@Serializable data class SharedKitRoute(val code: String)
@Serializable data object PlacesRoute
@Serializable data object LocationRoute
@Serializable data object CurfewRoute
@Serializable data object ScenesRoute
@Serializable data object AftercareRoute
@Serializable data object ChastityRoute

/** The agreement; [edit] opens the editor on your open proposal, [review] opens a partner's proposal to read (both from Today). */
@Serializable data class AgreementRoute(val edit: Boolean = false, val review: Boolean = false)

/** One scene: its sides, the next-day check-ins and comments. */
@Serializable data class SceneRoute(val sceneId: String)

/** [taskId] null = new task; [date] (YYYY-MM-DD) pre-fills the start date. */
@Serializable data class TaskEditorRoute(val taskId: String? = null, val date: String? = null)

/** [noteId] null = new note; [journal] picks the Journal over Notes for a new one. */
@Serializable data class NoteEditorRoute(val noteId: String? = null, val journal: Boolean = false)

/** A task's page: what's due now, stats and details. */
@Serializable data class TaskDetailRoute(val taskId: String)

@Serializable data class TaskHistoryRoute(val taskId: String)

/** [protocolId] null = new protocol. */
@Serializable data class ProtocolEditorRoute(val protocolId: String? = null)
