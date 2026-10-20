package app.obey.ui.proof

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageDecoder
import android.net.Uri
import android.os.Build
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.lifecycle.viewModelScope
import app.obey.api.ObeyApi
import app.obey.api.ProofPhoto
import app.obey.api.ReportInput
import app.obey.api.ReportReason
import app.obey.api.RevealProofsInput
import app.obey.data.SessionRepository
import app.obey.data.SessionState
import app.obey.ui.common.BaseViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.ByteArrayOutputStream
import javax.inject.Inject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody

/** What the proof views need from the signed-in person. */
data class ProofViewer(val userId: String, val termsAccepted: Boolean, val revealProofs: Boolean)

/**
 * Proof photos for one occurrence: listing, adding (shrunk and re-encoded on the device, which drops the camera's
 * metadata, location included), deleting your own, and reporting someone else's. Key it by occurrence id.
 */
@HiltViewModel
class ProofViewModel @Inject constructor(
    private val api: ObeyApi,
    private val sessions: SessionRepository,
    @ApplicationContext private val context: Context,
) : BaseViewModel() {
    val viewer: StateFlow<ProofViewer?> = sessions.state
        .map { (it as? SessionState.Ready)?.session?.me?.user?.let { u -> ProofViewer(u.id, u.proofTermsAccepted, u.revealProofs) } }
        .stateIn(viewModelScope, SharingStarted.Eagerly, null)

    private val _photos = MutableStateFlow<List<ProofPhoto>>(emptyList())
    val photos: StateFlow<List<ProofPhoto>> = _photos.asStateFlow()

    private val _uploading = MutableStateFlow(false)
    val uploading: StateFlow<Boolean> = _uploading.asStateFlow()

    private var occurrenceId: String? = null

    fun load(occurrenceId: String) {
        if (this.occurrenceId == occurrenceId) return
        this.occurrenceId = occurrenceId
        viewModelScope.launch { runCatching { api.proofPhotos(occurrenceId) }.onSuccess { _photos.value = it } }
    }

    fun acceptTerms(then: () -> Unit) = action {
        api.acceptProofTerms()
        sessions.refresh()
        then()
    }

    fun add(uri: Uri, onAdded: () -> Unit = {}) {
        val id = occurrenceId ?: return
        _uploading.value = true
        action(onError = { _uploading.value = false }) {
            val jpeg = withContext(Dispatchers.Default) { shrink(uri) }
            val photo = api.addProofPhoto(id, jpeg.toRequestBody("image/jpeg".toMediaType()))
            _photos.value = _photos.value + photo
            _uploading.value = false
            onAdded()
        }
    }

    fun delete(photo: ProofPhoto, onDeleted: () -> Unit = {}) = action {
        api.deleteProofPhoto(photo.id)
        _photos.value = _photos.value.filter { it.id != photo.id }
        cache.remove(photo.id)
        say("Photo deleted")
        onDeleted()
    }

    fun report(subjectId: String, photoId: String?, reason: ReportReason, details: String) = action {
        api.report(ReportInput(subjectId, photoId, reason, details.trim().ifEmpty { null }))
        say("Reported. Thanks for telling us.")
    }

    fun setReveal(on: Boolean) = action {
        api.setRevealProofs(RevealProofsInput(on))
        sessions.refresh()
    }

    private val cache = mutableMapOf<String, ImageBitmap>()

    suspend fun image(photoId: String): ImageBitmap? {
        cache[photoId]?.let { return it }
        return runCatching {
            withContext(Dispatchers.IO) {
                val bytes = api.proofPhoto(photoId).bytes()
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.asImageBitmap()
            }
        }.getOrNull()?.also { cache[photoId] = it }
    }

    /** At most [max] px on the long side, as JPEG, upright where Android can tell. */
    private fun shrink(uri: Uri, max: Int = 2000): ByteArray {
        val bitmap: Bitmap = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            ImageDecoder.decodeBitmap(ImageDecoder.createSource(context.contentResolver, uri)) { decoder, info, _ ->
                decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
                val scale = (max.toFloat() / maxOf(info.size.width, info.size.height)).coerceAtMost(1f)
                decoder.setTargetSize((info.size.width * scale).toInt().coerceAtLeast(1), (info.size.height * scale).toInt().coerceAtLeast(1))
            }
        } else {
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            context.contentResolver.openInputStream(uri).use { BitmapFactory.decodeStream(it, null, bounds) }
            var sample = 1
            while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= max) sample *= 2
            val decoded = context.contentResolver.openInputStream(uri).use { BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample }) }
                ?: error("Couldn't read that photo")
            val scale = (max.toFloat() / maxOf(decoded.width, decoded.height)).coerceAtMost(1f)
            if (scale < 1f) Bitmap.createScaledBitmap(decoded, (decoded.width * scale).toInt(), (decoded.height * scale).toInt(), true) else decoded
        }
        return ByteArrayOutputStream().use { out ->
            bitmap.compress(Bitmap.CompressFormat.JPEG, 85, out)
            out.toByteArray()
        }
    }
}
