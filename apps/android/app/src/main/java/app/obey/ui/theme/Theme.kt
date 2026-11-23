package app.obey.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import app.obey.R

// "Letters": paper and ink with one accent, oxblood. The same values the web app uses for its default accent
// (apps/web/src/theme/tokens.ts). The wallpaper's dynamic colour is no longer used: paper and ink are the look.
internal val LightColors: ColorScheme = lightColorScheme(
    primary = Color(0xFF8F3A2D),
    onPrimary = Color(0xFFFBF8F3),
    primaryContainer = Color(0xFFE8D8D0),
    onPrimaryContainer = Color(0xFF682F26),
    secondary = Color(0xFF58504A),
    onSecondary = Color(0xFFF5F0E8),
    secondaryContainer = Color(0xFFECE5D9),
    onSecondaryContainer = Color(0xFF1F1B18),
    tertiary = Color(0xFF4F6B4A),
    onTertiary = Color(0xFFFBF8F3),
    tertiaryContainer = Color(0xFFDEDDD2),
    onTertiaryContainer = Color(0xFF3C4B36),
    error = Color(0xFFA3322A),
    onError = Color(0xFFFBF8F3),
    errorContainer = Color(0xFFEAD7CF),
    onErrorContainer = Color(0xFF752A24),
    background = Color(0xFFF5F0E8),
    onBackground = Color(0xFF1F1B18),
    surface = Color(0xFFF5F0E8),
    onSurface = Color(0xFF1F1B18),
    surfaceVariant = Color(0xFFECE5D9),
    onSurfaceVariant = Color(0xFF58504A),
    outline = Color(0xFF8A8076),
    outlineVariant = Color(0xFFE0D7CA),
    inverseSurface = Color(0xFF1F1B18),
    inverseOnSurface = Color(0xFFF5F0E8),
    inversePrimary = Color(0xFFD27A66),
    scrim = Color(0xFF000000),
    surfaceTint = Color(0xFFF5F0E8),
    surfaceBright = Color(0xFFFBF8F3),
    surfaceDim = Color(0xFFEFE9E0),
    surfaceContainerLowest = Color(0xFFFBF8F3),
    surfaceContainerLow = Color(0xFFF8F4EE),
    surfaceContainer = Color(0xFFF2ECE3),
    surfaceContainerHigh = Color(0xFFECE5D9),
    surfaceContainerHighest = Color(0xFFE4DDD1),
)

internal val DarkColors: ColorScheme = darkColorScheme(
    primary = Color(0xFFD27A66),
    onPrimary = Color(0xFF17130F),
    primaryContainer = Color(0xFF3C2820),
    onPrimaryContainer = Color(0xFFE0AD9D),
    secondary = Color(0xFFC4B9AC),
    onSecondary = Color(0xFF17130F),
    secondaryContainer = Color(0xFF221D18),
    onSecondaryContainer = Color(0xFFF2EBE1),
    tertiary = Color(0xFF9DB894),
    onTertiary = Color(0xFF17130F),
    tertiaryContainer = Color(0xFF32342A),
    onTertiaryContainer = Color(0xFFC3CFB7),
    error = Color(0xFFEF8E7A),
    onError = Color(0xFF17130F),
    errorContainer = Color(0xFF422C24),
    onErrorContainer = Color(0xFFF0B8A8),
    background = Color(0xFF17130F),
    onBackground = Color(0xFFF2EBE1),
    surface = Color(0xFF17130F),
    onSurface = Color(0xFFF2EBE1),
    surfaceVariant = Color(0xFF221D18),
    onSurfaceVariant = Color(0xFFC4B9AC),
    outline = Color(0xFF8A7F74),
    outlineVariant = Color(0xFF2F2822),
    inverseSurface = Color(0xFFF2EBE1),
    inverseOnSurface = Color(0xFF17130F),
    inversePrimary = Color(0xFF8F3A2D),
    scrim = Color(0xFF000000),
    surfaceTint = Color(0xFF17130F),
    surfaceBright = Color(0xFF2A241E),
    surfaceDim = Color(0xFF110E0B),
    surfaceContainerLowest = Color(0xFF110E0B),
    surfaceContainerLow = Color(0xFF1B1712),
    surfaceContainer = Color(0xFF1E1914),
    surfaceContainerHigh = Color(0xFF221D18),
    surfaceContainerHighest = Color(0xFF2E2924),
)

/** Controls and small text. */
val Geist = FontFamily(
    Font(R.font.geist_regular, FontWeight.Normal),
    Font(R.font.geist_medium, FontWeight.Medium),
    Font(R.font.geist_semibold, FontWeight.SemiBold),
    Font(R.font.geist_semibold, FontWeight.Bold),
)

/** Human words: headings, the partner's words, journal text. */
val InstrumentSerif = FontFamily(
    Font(R.font.instrument_serif, FontWeight.Normal),
    Font(R.font.instrument_serif_italic, FontWeight.Normal, FontStyle.Italic),
)

private val base = Typography()

private fun TextStyle.serif(size: Int, line: Int) =
    copy(fontFamily = InstrumentSerif, fontWeight = FontWeight.Normal, fontSize = size.sp, lineHeight = line.sp, letterSpacing = (-0.01).em)

private fun TextStyle.sans() = copy(fontFamily = Geist)

/** Large type is set in the serif, everything from titleMedium down in Geist. */
val LettersTypography = Typography(
    displayLarge = base.displayLarge.serif(57, 60),
    displayMedium = base.displayMedium.serif(45, 48),
    displaySmall = base.displaySmall.serif(38, 42),
    headlineLarge = base.headlineLarge.serif(34, 38),
    headlineMedium = base.headlineMedium.serif(30, 34),
    headlineSmall = base.headlineSmall.serif(26, 30),
    titleLarge = base.titleLarge.serif(24, 28),
    titleMedium = base.titleMedium.sans(),
    titleSmall = base.titleSmall.sans(),
    bodyLarge = base.bodyLarge.sans(),
    bodyMedium = base.bodyMedium.sans(),
    bodySmall = base.bodySmall.sans(),
    labelLarge = base.labelLarge.sans(),
    labelMedium = base.labelMedium.sans(),
    labelSmall = base.labelSmall.sans(),
)

/** Small, quiet corners. */
val LettersShapes = Shapes(
    extraSmall = RoundedCornerShape(3.dp),
    small = RoundedCornerShape(6.dp),
    medium = RoundedCornerShape(10.dp),
    large = RoundedCornerShape(12.dp),
    extraLarge = RoundedCornerShape(16.dp),
)

@Composable
fun ObeyTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    MaterialTheme(colorScheme = if (darkTheme) DarkColors else LightColors, typography = LettersTypography, shapes = LettersShapes, content = content)
}
