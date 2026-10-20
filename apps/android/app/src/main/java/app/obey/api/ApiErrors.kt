package app.obey.api

import java.io.IOException
import kotlinx.serialization.json.Json
import retrofit2.HttpException

private val errorJson = Json { ignoreUnknownKeys = true }

/** A short, human message for a failed API call. */
fun Throwable.userMessage(): String = when (this) {
    is HttpException -> {
        val body = runCatching { response()?.errorBody()?.string() }.getOrNull()
        val parsed = body?.let { runCatching { errorJson.decodeFromString(ApiError.serializer(), it) }.getOrNull() }
        when {
            parsed != null -> parsed.error
            code() == 401 -> "Not signed in (401). Sign in, or set a dev user id in Settings."
            code() == 403 -> "You don't have permission to do that."
            else -> "Server error ${code()}"
        }
    }
    is IOException -> "Can't reach the server. Check your connection and the API URL."
    else -> message ?: this::class.java.simpleName
}
