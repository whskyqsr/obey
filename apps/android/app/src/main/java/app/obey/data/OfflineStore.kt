package app.obey.data

import android.content.Context
import app.obey.api.CalendarEvent
import app.obey.api.JournalEntryInput
import app.obey.api.Me
import app.obey.api.Occurrence
import app.obey.api.RescheduleRequest
import app.obey.api.TaskStreak
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/** What Today showed last time it loaded, so it opens with no signal. */
@Serializable
data class TodaySnapshot(
    val savedAt: String,
    val occurrences: List<Occurrence>,
    val requests: List<RescheduleRequest>,
    val streaks: List<TaskStreak> = emptyList(),
    val events: List<CalendarEvent> = emptyList(),
    val noTasks: Boolean = false,
)

/** A completion made with no signal, sent once the phone is back online with the time it was done. */
@Serializable
data class PendingCompletion(
    val occurrenceId: String,
    val relationshipId: String,
    val doneAt: String,
    val noteMd: String? = null,
    val mood: Int? = null,
    val journal: JournalEntryInput? = null,
)

/**
 * Keeps the signed-in person's profile, each dynamic's Today and completions waiting to sync in the app's private
 * storage. Everything here is wiped on sign-out.
 */
@Singleton
class OfflineStore @Inject constructor(
    @ApplicationContext context: Context,
    private val json: Json,
) {
    private val dir = File(context.filesDir, "offline")
    private val lock = Mutex()

    private suspend inline fun <reified T> read(name: String): T? = withContext(Dispatchers.IO) {
        lock.withLock { runCatching { json.decodeFromString<T>(File(dir, name).readText()) }.getOrNull() }
    }

    private suspend inline fun <reified T> write(name: String, value: T) = withContext(Dispatchers.IO) {
        lock.withLock {
            dir.mkdirs()
            // Write then rename, so a crash mid-write never leaves half a file.
            val tmp = File(dir, "$name.tmp")
            tmp.writeText(json.encodeToString(value))
            tmp.renameTo(File(dir, name))
        }
    }

    suspend fun me(): Me? = read("me.json")
    suspend fun saveMe(me: Me) = write("me.json", me)

    suspend fun today(relationshipId: String): TodaySnapshot? = read("today-$relationshipId.json")
    suspend fun saveToday(relationshipId: String, snapshot: TodaySnapshot) = write("today-$relationshipId.json", snapshot)

    suspend fun pending(): List<PendingCompletion> = read("pending.json") ?: emptyList()
    suspend fun addPending(p: PendingCompletion) = write("pending.json", pending().filter { it.occurrenceId != p.occurrenceId } + p)
    suspend fun removePending(occurrenceId: String) = write("pending.json", pending().filter { it.occurrenceId != occurrenceId })

    suspend fun clear() = withContext(Dispatchers.IO) { lock.withLock { dir.deleteRecursively() } }
}
