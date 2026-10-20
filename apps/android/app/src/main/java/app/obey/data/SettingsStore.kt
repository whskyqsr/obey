package app.obey.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import app.obey.BuildConfig
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "settings")

/** Small per-device preferences. Nothing here is a secret; Firebase holds the real session. */
@Singleton
class SettingsStore @Inject constructor(@ApplicationContext private val context: Context) {
    private val devUserKey = stringPreferencesKey("dev_user_id")
    private val relationshipKey = stringPreferencesKey("selected_relationship_id")
    private val calendarViewKey = stringPreferencesKey("calendar_view")
    private val pushTokenKey = stringPreferencesKey("push_token")
    private val pushReceivedKey = stringPreferencesKey("push_received_at")

    /** Dev-auth user id (sent as X-Dev-User). Always null in release builds. */
    val devUserId: Flow<String?> = context.dataStore.data.map { prefs ->
        if (BuildConfig.DEV_AUTH_ALLOWED) prefs[devUserKey]?.takeIf { it.isNotBlank() } else null
    }

    val selectedRelationshipId: Flow<String?> = context.dataStore.data.map { it[relationshipKey] }

    /** "week" or "month": the Calendar remembers the last view, as the web does. */
    suspend fun calendarView(): String? = context.dataStore.data.first()[calendarViewKey]

    suspend fun setCalendarView(view: String) {
        context.dataStore.edit { it[calendarViewKey] = view }
    }

    /** This device's FCM token as last registered, to find it among the account's devices. */
    suspend fun pushToken(): String? = context.dataStore.data.first()[pushTokenKey]

    suspend fun setPushToken(token: String) {
        context.dataStore.edit { it[pushTokenKey] = token }
    }

    /** When a push last reached this device (ISO instant), for the notification check in Settings. */
    val pushReceivedAt: Flow<String?> = context.dataStore.data.map { it[pushReceivedKey] }

    suspend fun markPushReceived() {
        context.dataStore.edit { it[pushReceivedKey] = java.time.Instant.now().toString() }
    }

    suspend fun currentDevUserId(): String? = devUserId.first()

    suspend fun setDevUserId(id: String?) {
        context.dataStore.edit { prefs ->
            if (id.isNullOrBlank()) prefs.remove(devUserKey) else prefs[devUserKey] = id.trim()
        }
    }

    suspend fun setSelectedRelationshipId(id: String?) {
        context.dataStore.edit { prefs ->
            if (id == null) prefs.remove(relationshipKey) else prefs[relationshipKey] = id
        }
    }
}
