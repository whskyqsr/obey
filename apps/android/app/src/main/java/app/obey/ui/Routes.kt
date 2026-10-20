package app.obey.ui

import kotlinx.serialization.Serializable

// Type-safe Navigation Compose routes.
@Serializable data object TodayRoute
@Serializable data object UpcomingRoute
@Serializable data object RewardsRoute
@Serializable data object ConsequencesRoute
@Serializable data object RulesRoute
@Serializable data object ProtocolsRoute
@Serializable data object LimitsRoute
@Serializable data object NotesRoute
@Serializable data object JournalRoute
@Serializable data object SettingsRoute
@Serializable data object DynamicRoute
@Serializable data object TaskListRoute

/** [taskId] null = new task; [date] (YYYY-MM-DD) pre-fills the start date. */
@Serializable data class TaskEditorRoute(val taskId: String? = null, val date: String? = null)

/** [noteId] null = new note; [journal] picks the Journal over Notes for a new one. */
@Serializable data class NoteEditorRoute(val noteId: String? = null, val journal: Boolean = false)

/** A task's page: what's due now, stats and details. */
@Serializable data class TaskDetailRoute(val taskId: String)

@Serializable data class TaskHistoryRoute(val taskId: String)

/** [protocolId] null = new protocol. */
@Serializable data class ProtocolEditorRoute(val protocolId: String? = null)
