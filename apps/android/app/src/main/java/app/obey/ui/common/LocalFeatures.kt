package app.obey.ui.common

import androidx.compose.runtime.staticCompositionLocalOf
import app.obey.api.Features

/** The current relationship's feature switches, so any screen can hide what the dynamic doesn't use. */
val LocalFeatures = staticCompositionLocalOf { Features() }
