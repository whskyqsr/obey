package app.obey.ui

import kotlinx.serialization.Serializable

// Type-safe Navigation Compose routes.
@Serializable data object TodayRoute
@Serializable data object UpcomingRoute
@Serializable data object RewardsRoute
@Serializable data object RulesRoute
@Serializable data object ProtocolsRoute
@Serializable data object NotesRoute
@Serializable data object JournalRoute
@Serializable data object SettingsRoute
@Serializable data object TaskListRoute

/** [taskId] null = new task; [date] (YYYY-MM-DD) pre-fills the start date. */
@Serializable data class TaskEditorRoute(val taskId: String? = null, val date: String? = null)

/** [noteId] null = new note; [journal] picks the Journal over Notes for a new one. */
@Serializable data class NoteEditorRoute(val noteId: String? = null, val journal: Boolean = false)
