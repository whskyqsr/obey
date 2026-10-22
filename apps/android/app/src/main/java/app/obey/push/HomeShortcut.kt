package app.obey.push

import android.content.Context
import android.content.Intent
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.core.content.pm.ShortcutManagerCompat
import androidx.core.graphics.drawable.IconCompat
import app.obey.MainActivity
import app.obey.R

/**
 * The "I'm home" app-icon shortcut, there only while the person has a curfew tonight. It opens Today and does what the
 * curfew's I'm home button does. Launchers drop it when discreet mode switches the icon; the next Today brings it back.
 */
object HomeShortcut {
    private const val ID = "home"

    fun update(context: Context, show: Boolean) {
        runCatching {
            if (!show) return ShortcutManagerCompat.removeDynamicShortcuts(context, listOf(ID))
            val intent = Intent(context, MainActivity::class.java).setAction(Intent.ACTION_VIEW).putExtra(PendingNav.EXTRA, PendingNav.HOME)
            val shortcut = ShortcutInfoCompat.Builder(context, ID)
                .setShortLabel("I'm home")
                .setIcon(IconCompat.createWithResource(context, R.drawable.ic_shortcut_home))
                .setIntent(intent)
                .build()
            ShortcutManagerCompat.pushDynamicShortcut(context, shortcut)
        }
    }
}
