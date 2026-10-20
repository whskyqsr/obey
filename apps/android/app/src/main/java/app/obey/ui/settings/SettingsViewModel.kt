package app.obey.ui.settings

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
import app.obey.api.Invite
import app.obey.api.JoinRelationshipInput
import app.obey.api.ObeyApi
import app.obey.api.ReschedulePolicy
import app.obey.api.Role
import app.obey.api.UpdateMeInput
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

    fun selectRelationship(id: String) = action { sessions.select(id) }

    fun createInvite() = action {
        val rel = sessions.requireRelationshipId()
        _invite.value = api.createInvite(rel)
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
        sessions.onRelationshipChanged(api.joinRelationship(JoinRelationshipInput(code.trim(), role)))
        say("Joined")
    }

    fun updatePolicy(policy: ReschedulePolicy? = null, allowance: Int? = null) = action {
        val rel = sessions.requireRelationshipId()
        sessions.onRelationshipChanged(
            api.updateRelationship(rel, UpdateRelationshipInput(reschedulePolicy = policy, weeklyDelayAllowance = allowance)),
        )
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
