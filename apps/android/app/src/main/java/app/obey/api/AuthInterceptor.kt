package app.obey.api

import app.obey.auth.AuthManager
import app.obey.data.SettingsStore
import javax.inject.Inject
import kotlinx.coroutines.runBlocking
import okhttp3.Interceptor
import okhttp3.Response

/**
 * Adds `X-Dev-User` (debug builds, when set in Settings) or `Authorization: Bearer <Firebase ID token>`.
 * Runs on OkHttp's worker threads, so blocking for the token lookup is acceptable here.
 */
class AuthInterceptor @Inject constructor(
    private val auth: AuthManager,
    private val settings: SettingsStore,
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val builder = chain.request().newBuilder()
        val devUser = runBlocking { settings.currentDevUserId() }
        if (devUser != null) {
            builder.header("X-Dev-User", devUser)
        } else {
            val token = runCatching { runBlocking { auth.idToken() } }.getOrNull()
            if (token != null) builder.header("Authorization", "Bearer $token")
        }
        return chain.proceed(builder.build())
    }
}
