package app.obey.push

import kotlinx.coroutines.flow.MutableStateFlow

/** Where a tapped notification asks the app to go, picked up once the main screen is showing. */
object PendingNav {
    const val EXTRA = "app.obey.open"
    const val LOCATION = "location"
    const val AGREEMENT = "agreement"

    val target = MutableStateFlow<String?>(null)
}
