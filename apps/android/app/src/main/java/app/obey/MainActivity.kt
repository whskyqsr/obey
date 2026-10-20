package app.obey

import android.os.Build
import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.lifecycleScope
import app.obey.data.AppIcons
import app.obey.data.SettingsStore
import app.obey.lock.AppLock
import app.obey.lock.LockScreen
import app.obey.ui.ObeyRoot
import app.obey.ui.theme.ObeyTheme
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking

// A FragmentActivity so the system unlock prompt can attach to it.
@AndroidEntryPoint
class MainActivity : FragmentActivity() {
    @Inject lateinit var appLock: AppLock
    @Inject lateinit var settings: SettingsStore
    @Inject lateinit var appIcons: AppIcons

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        // A small blocking read on launch: drawing first and locking a frame later would flash the content.
        appLock.launch(runBlocking { settings.appLock.first() })
        setContent {
            ObeyTheme {
                val locked by appLock.locked.collectAsStateWithLifecycle()
                val name = remember { appIcons.currentLabel() }
                Box {
                    // Kept composed underneath so screens keep their place; the lock screen is opaque.
                    ObeyRoot()
                    if (locked) LockScreen(name) { unlock(name) }
                }
            }
        }
    }

    private var prompting = false

    private fun unlock(name: String) {
        if (prompting) return
        prompting = true
        AppLock.prompt(this, "Unlock $name") { ok ->
            prompting = false
            if (ok) appLock.unlocked()
        }
    }

    override fun onStart() {
        super.onStart()
        lifecycleScope.launch {
            appLock.onForeground()
            // Keep the recent-apps thumbnail blank while the lock is on.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) setRecentsScreenshotEnabled(!settings.appLock.first())
        }
    }

    override fun onStop() {
        super.onStop()
        if (!isChangingConfigurations) appLock.onBackground()
    }
}
