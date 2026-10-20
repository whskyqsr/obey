package app.obey.data

import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager
import androidx.annotation.ColorRes
import androidx.annotation.DrawableRes
import androidx.annotation.StringRes
import app.obey.R
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/** Launcher icons for discreet mode. Each maps to an <activity-alias> in the manifest. */
enum class AppIcon(
    val alias: String,
    @StringRes val label: Int,
    @DrawableRes val foreground: Int,
    @ColorRes val background: Int,
) {
    Default("LauncherDefault", R.string.app_name, R.drawable.ic_launcher_foreground, R.color.launcher_background),
    Notes("LauncherNotes", R.string.disguise_notes, R.drawable.ic_disguise_notes_foreground, R.color.disguise_notes_background),
    Calendar("LauncherCalendar", R.string.disguise_calendar, R.drawable.ic_disguise_calendar_foreground, R.color.disguise_calendar_background),
    Weather("LauncherWeather", R.string.disguise_weather, R.drawable.ic_disguise_weather_foreground, R.color.disguise_weather_background),
    Calculator("LauncherCalculator", R.string.disguise_calculator, R.drawable.ic_disguise_calculator_foreground, R.color.disguise_calculator_background),
}

@Singleton
class AppIcons @Inject constructor(@ApplicationContext private val context: Context) {
    private val pm = context.packageManager

    private fun component(icon: AppIcon) = ComponentName(context, "${context.packageName}.${icon.alias}")

    /** The alias the launcher shows now. The manifest default counts when nothing was changed. */
    fun current(): AppIcon = AppIcon.entries.firstOrNull { icon ->
        when (pm.getComponentEnabledSetting(component(icon))) {
            PackageManager.COMPONENT_ENABLED_STATE_ENABLED -> true
            PackageManager.COMPONENT_ENABLED_STATE_DEFAULT -> icon == AppIcon.Default
            else -> false
        }
    } ?: AppIcon.Default

    /** The name shown under the current icon, used where the app would otherwise say "Obey". */
    fun currentLabel(): String = context.getString(current().label)

    /**
     * Enables the chosen alias before disabling the rest, so there is never a moment with no
     * launcher entry. Launchers can take a few seconds to redraw, and some close the app.
     */
    fun set(icon: AppIcon) {
        pm.setComponentEnabledSetting(component(icon), PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP)
        AppIcon.entries.filter { it != icon }.forEach {
            pm.setComponentEnabledSetting(component(it), PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP)
        }
    }
}
