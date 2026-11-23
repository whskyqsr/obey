package app.obey.ui.plans

import kotlinx.coroutines.flow.MutableStateFlow

/** Set by the + menu's "Plan": the Week page opens a new plan when it sees it, then clears it. */
object NewPlanRequest {
    val pending = MutableStateFlow(false)
}
