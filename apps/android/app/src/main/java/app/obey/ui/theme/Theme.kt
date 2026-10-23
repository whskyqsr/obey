package app.obey.ui.theme

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext

// Fallback scheme (Android 8-11): Material 3 tonal-spot roles for the brand oxblood seed (#8C3A2B),
// the same scheme the web app builds by default. Android 12+ uses the wallpaper's dynamic colour instead.
internal val LightColors: ColorScheme = lightColorScheme(
    primary = Color(0xFF904B3E),
    onPrimary = Color(0xFFFFFFFF),
    primaryContainer = Color(0xFFFFDAD3),
    onPrimaryContainer = Color(0xFF733428),
    secondary = Color(0xFF775750),
    onSecondary = Color(0xFFFFFFFF),
    secondaryContainer = Color(0xFFFFDAD3),
    onSecondaryContainer = Color(0xFF5D3F3A),
    tertiary = Color(0xFF6F5C2E),
    onTertiary = Color(0xFFFFFFFF),
    tertiaryContainer = Color(0xFFFAE0A6),
    onTertiaryContainer = Color(0xFF554519),
    error = Color(0xFFBA1A1A),
    onError = Color(0xFFFFFFFF),
    errorContainer = Color(0xFFFFDAD6),
    onErrorContainer = Color(0xFF93000A),
    background = Color(0xFFFFF8F6),
    onBackground = Color(0xFF231918),
    surface = Color(0xFFFFF8F6),
    onSurface = Color(0xFF231918),
    surfaceVariant = Color(0xFFF5DDD9),
    onSurfaceVariant = Color(0xFF534340),
    outline = Color(0xFF85736F),
    outlineVariant = Color(0xFFD8C2BD),
    inverseSurface = Color(0xFF392E2C),
    inverseOnSurface = Color(0xFFFFEDE9),
    inversePrimary = Color(0xFFFFB4A6),
    surfaceContainerLowest = Color(0xFFFFFFFF),
    surfaceContainerLow = Color(0xFFFFF0EE),
    surfaceContainer = Color(0xFFFCEAE6),
    surfaceContainerHigh = Color(0xFFF7E4E1),
    surfaceContainerHighest = Color(0xFFF1DFDB),
)

internal val DarkColors: ColorScheme = darkColorScheme(
    primary = Color(0xFFFFB4A6),
    onPrimary = Color(0xFF561E14),
    primaryContainer = Color(0xFF733428),
    onPrimaryContainer = Color(0xFFFFDAD3),
    secondary = Color(0xFFE7BDB5),
    onSecondary = Color(0xFF442A24),
    secondaryContainer = Color(0xFF5D3F3A),
    onSecondaryContainer = Color(0xFFFFDAD3),
    tertiary = Color(0xFFDCC48C),
    onTertiary = Color(0xFF3D2E04),
    tertiaryContainer = Color(0xFF554519),
    onTertiaryContainer = Color(0xFFFAE0A6),
    error = Color(0xFFFFB4AB),
    onError = Color(0xFF690005),
    errorContainer = Color(0xFF93000A),
    onErrorContainer = Color(0xFFFFDAD6),
    background = Color(0xFF1A1110),
    onBackground = Color(0xFFF1DFDB),
    surface = Color(0xFF1A1110),
    onSurface = Color(0xFFF1DFDB),
    surfaceVariant = Color(0xFF534340),
    onSurfaceVariant = Color(0xFFD8C2BD),
    outline = Color(0xFFA08C89),
    outlineVariant = Color(0xFF534340),
    inverseSurface = Color(0xFFF1DFDB),
    inverseOnSurface = Color(0xFF392E2C),
    inversePrimary = Color(0xFF904B3E),
    surfaceContainerLowest = Color(0xFF140C0B),
    surfaceContainerLow = Color(0xFF231918),
    surfaceContainer = Color(0xFF271D1C),
    surfaceContainerHigh = Color(0xFF322826),
    surfaceContainerHighest = Color(0xFF3D3230),
)

@Composable
fun ObeyTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    dynamicColor: Boolean = true,
    content: @Composable () -> Unit,
) {
    val colors = when {
        dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
            val context = LocalContext.current
            if (darkTheme) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
        }
        darkTheme -> DarkColors
        else -> LightColors
    }
    MaterialTheme(colorScheme = colors, typography = Typography(), content = content)
}
