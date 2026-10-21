package app.obey.ui.common

import androidx.compose.runtime.staticCompositionLocalOf
import app.obey.api.Features

/** The current relationship's feature switches, so any screen can hide what the dynamic doesn't use. */
val LocalFeatures = staticCompositionLocalOf { Features() }

/** Opens the app's slide-out menu; null where the screen has a rail instead (tablets) and needs no menu button. */
val LocalOpenMenu = staticCompositionLocalOf<(() -> Unit)?> { null }

/** Opens the safe-word sheet; set for subs and switches, who get its button on every main page. */
val LocalSafeWord = staticCompositionLocalOf<(() -> Unit)?> { null }
