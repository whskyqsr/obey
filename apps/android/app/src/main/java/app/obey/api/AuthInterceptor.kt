package app.obey.api

import app.obey.auth.AuthManager
import app.obey.data.SettingsStore
import javax.inject.Inject
import kotlinx.coroutines.runBlocking
import okhttp3.Interceptor
import okhttp3.Request
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
        val devUser = runBlocking { settings.currentDevUserId() }
        if (devUser != null) return chain.proceed(chain.request().newBuilder().header("X-Dev-User", devUser).build())
        val response = chain.proceed(withToken(chain, fresh = false))
        // A token minted before the person clicked the verification link still says unverified for up to an hour.
        if (response.code != 403 || !response.peekBody(4096).string().contains("email_unverified")) return response
        response.close()
        return chain.proceed(withToken(chain, fresh = true))
    }

    private fun withToken(chain: Interceptor.Chain, fresh: Boolean): Request {
        val builder = chain.request().newBuilder()
        val token = runCatching { runBlocking { auth.idToken(forceRefresh = fresh) } }.getOrNull()
        if (token != null) builder.header("Authorization", "Bearer $token")
        return builder.build()
    }
}
