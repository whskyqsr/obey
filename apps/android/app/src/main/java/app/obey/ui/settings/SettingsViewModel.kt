package app.obey.ui.settings

import app.obey.api.DynamicDate
import app.obey.api.Features
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageDecoder
import android.net.Uri
import android.os.Build
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.lifecycle.viewModelScope
import java.io.ByteArrayOutputStream
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import app.obey.BuildConfig
import app.obey.api.CreateRelationshipInput
import app.obey.api.CreateInviteInput
import app.obey.api.Invite
import app.obey.api.parseInviteCode
import app.obey.api.JoinRelationshipInput
import app.obey.api.ObeyApi
import app.obey.api.ReschedulePolicy
import app.obey.api.Role
import app.obey.api.UpdateMeInput
import app.obey.api.WeekStartInput
import app.obey.api.UpdateRelationshipInput
import app.obey.auth.AuthManager
import app.obey.auth.AuthState
import app.obey.data.AppIcon
import app.obey.data.AppIcons
import app.obey.data.SessionRepository
import app.obey.data.SessionState
import app.obey.data.SettingsStore
import app.obey.ui.common.BaseViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn

/** Shared by Settings, sign-in and relationship setup. */
@HiltViewModel
class SettingsViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val api: ObeyApi,
    private val sessions: SessionRepository,
    private val settings: SettingsStore,
    private val auth: AuthManager,
    private val appIcons: AppIcons,
) : BaseViewModel() {
    val session: StateFlow<SessionState> = sessions.state
    val authState: StateFlow<AuthState> = auth.state.stateIn(viewModelScope, SharingStarted.Eagerly, AuthState.SignedOut)
    val devUserId: StateFlow<String?> = settings.devUserId.stateIn(viewModelScope, SharingStarted.Eagerly, null)

    val firebaseAvailable: Boolean get() = auth.firebaseAvailable
    val devAuthAllowed: Boolean = BuildConfig.DEV_AUTH_ALLOWED
    val apiBaseUrl: String = BuildConfig.API_BASE_URL

    private val _invite = MutableStateFlow<Invite?>(null)
    val invite: StateFlow<Invite?> = _invite.asStateFlow()

    fun setDevUser(id: String) = action {
        settings.setDevUserId(id)
        sessions.refresh()
        say(if (id.isBlank()) "Dev user cleared" else "Using dev user")
    }

    private val _appIcon = MutableStateFlow(appIcons.current())
    val appIcon: StateFlow<AppIcon> = _appIcon.asStateFlow()

    fun setAppIcon(icon: AppIcon) {
        if (icon == _appIcon.value) return
        appIcons.set(icon)
        _appIcon.value = icon
        say(if (icon == AppIcon.Default) "Icon restored" else "Icon changed. Your launcher may take a moment to update.")
    }

    fun updateDisplayName(name: String) = action {
        api.updateMe(UpdateMeInput(name.trim()))
        sessions.refresh()
        say("Name updated")
    }

    fun setWeekStart(monday: Boolean) = action {
        api.setWeekStart(WeekStartInput(if (monday) "mon" else "sun"))
        sessions.refresh()
    }

    /** Saved in this phone's time zone; null turns quiet hours off. */
    fun setQuietHours(start: String?, end: String?) = action {
        val q = if (start != null && end != null) app.obey.api.QuietHours(start, end, java.time.ZoneId.systemDefault().id) else null
        api.setQuietHours(app.obey.api.QuietHoursInput(q))
        sessions.refresh()
    }

    fun selectRelationship(id: String) = action { sessions.select(id) }

    /** Ends the dynamic for everyone in it (it stays read-only); the people in [block] can't pair with you again. */
    fun leave(block: List<String>, blockOnly: Boolean) = action {
        api.leaveRelationship(sessions.requireRelationshipId(), app.obey.api.LeaveInput(block))
        sessions.refresh()
        say(if (blockOnly) "Blocked" else "You left the dynamic")
    }

    fun createInvite(role: Role?) = action {
        val rel = sessions.requireRelationshipId()
        _invite.value = api.createInvite(rel, CreateInviteInput(role))
    }

    fun clearInvite() {
        _invite.value = null
    }

    fun createRelationship(name: String, role: Role) = action {
        sessions.onRelationshipChanged(api.createRelationship(CreateRelationshipInput(name.trim().ifEmpty { null }, role)))
    }

    /** A blank name clears it, so the app shows the partner's name instead. */
    fun renameRelationship(name: String) = action {
        val rel = sessions.requireRelationshipId()
        sessions.onRelationshipChanged(api.updateRelationship(rel, UpdateRelationshipInput(name = name.trim())))
    }

    private val avatarCache = mutableMapOf<String, ImageBitmap>()

    suspend fun loadAvatar(userId: String, version: String): ImageBitmap? {
        val key = "$userId@$version"
        avatarCache[key]?.let { return it }
        return runCatching {
            withContext(Dispatchers.IO) {
                val bytes = api.avatar(userId, version).bytes()
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.asImageBitmap()
            }
        }.getOrNull()?.also { avatarCache[key] = it }
    }

    fun setAvatar(uri: Uri) = action {
        val jpeg = withContext(Dispatchers.Default) { squareJpeg(uri) }
        api.setAvatar(jpeg.toRequestBody("image/jpeg".toMediaType()))
        sessions.refresh()
        say("Photo updated")
    }

    fun removeAvatar() = action {
        api.deleteAvatar()
        sessions.refresh()
        say("Photo removed")
    }

    /** Crops the middle square and shrinks it to 256px, honouring the photo's rotation where Android can. */
    private fun squareJpeg(uri: Uri, px: Int = 256): ByteArray {
        val source: Bitmap = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            ImageDecoder.decodeBitmap(ImageDecoder.createSource(context.contentResolver, uri)) { decoder, info, _ ->
                decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
                val scale = (px * 2f / minOf(info.size.width, info.size.height)).coerceAtMost(1f)
                decoder.setTargetSize((info.size.width * scale).toInt().coerceAtLeast(1), (info.size.height * scale).toInt().coerceAtLeast(1))
            }
        } else {
            context.contentResolver.openInputStream(uri).use { BitmapFactory.decodeStream(it) }
                ?: error("Couldn't read that image")
        }
        val side = minOf(source.width, source.height)
        val square = Bitmap.createBitmap(source, (source.width - side) / 2, (source.height - side) / 2, side, side)
        val scaled = Bitmap.createScaledBitmap(square, px, px, true)
        return ByteArrayOutputStream().use { out ->
            scaled.compress(Bitmap.CompressFormat.JPEG, 85, out)
            out.toByteArray()
        }
    }

    fun join(code: String, role: Role) = action {
        sessions.onRelationshipChanged(api.joinRelationship(JoinRelationshipInput(parseInviteCode(code), role)))
        say("Joined")
    }

    fun updatePolicy(policy: ReschedulePolicy? = null, allowance: Int? = null) = action {
        val rel = sessions.requireRelationshipId()
        sessions.onRelationshipChanged(
            api.updateRelationship(rel, UpdateRelationshipInput(reschedulePolicy = policy, weeklyDelayAllowance = allowance)),
        )
    }

    /** Saves [date] (a blank id adds it), or with null removes the date [removeId]. The API takes the whole list. */
    fun saveDate(date: DynamicDate?, removeId: String? = null) = action {
        val rel = sessions.session?.relationship ?: return@action
        val next = when {
            date == null -> rel.dates.filter { it.id != removeId }
            date.id.isEmpty() -> rel.dates + date.copy(id = java.util.UUID.randomUUID().toString())
            else -> rel.dates.map { if (it.id == date.id) date else it }
        }
        sessions.onRelationshipChanged(api.updateRelationship(rel.id, UpdateRelationshipInput(dates = next)))
        say(if (date == null) "Date removed" else "Date saved")
    }

    fun setSubNotes(on: Boolean) = action {
        val rel = sessions.requireRelationshipId()
        sessions.onRelationshipChanged(api.updateRelationship(rel, UpdateRelationshipInput(subNotes = on)))
        say(if (on) "Notes turned on for them" else "Notes turned off for them")
    }

    fun setFeatures(features: Features, confirmation: String) = action {
        val rel = sessions.requireRelationshipId()
        sessions.onRelationshipChanged(api.updateRelationship(rel, UpdateRelationshipInput(features = features)))
        say(confirmation)
    }

    fun signInEmail(email: String, password: String, create: Boolean) = action {
        if (create) auth.createAccount(email, password) else auth.signInWithEmail(email, password)
    }

    fun signInGoogle(idToken: String) = action { auth.signInWithGoogleIdToken(idToken) }

    fun googleClientId(): String? = auth.googleWebClientId()

    fun reportError(text: String) = say(text)

    fun signOut() = action {
        auth.signOut()
        sessions.clear()
    }
}
