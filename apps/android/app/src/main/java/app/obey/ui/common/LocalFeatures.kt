package app.obey.ui.common

import androidx.compose.runtime.Composable
import androidx.compose.runtime.staticCompositionLocalOf
import app.obey.api.Features

/** The current relationship's feature switches, so any screen can hide what the dynamic doesn't use. */
val LocalFeatures = staticCompositionLocalOf { Features() }

/**
 * What leads a main screen's top bar: the dynamic switcher on Today, Week and Us, or a way back to Us on the pages
 * listed there. Null where there's nothing to show (tablets, whose rail has the switcher).
 */
val LocalNavLead = staticCompositionLocalOf<(@Composable () -> Unit)?> { null }

/** Opens the safe-word sheet; set for subs and switches, who get its button on every main page. */
val LocalSafeWord = staticCompositionLocalOf<(() -> Unit)?> { null }
