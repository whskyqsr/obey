package app.obey.ui.plans

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.unit.dp
import androidx.core.graphics.ColorUtils
import app.obey.api.CalendarEvent
import app.obey.api.Member
import app.obey.api.Relationship
import app.obey.api.Role

/** A plan's colours: its container, the text on it, and a solid dot or bar. */
data class PlanTone(val container: Color, val onContainer: Color, val dot: Color)

/** Hue turns from the theme's primary for each person, clear of primary (tasks) and tertiary (plans for both). Same turns as the web. */
private val HUE_TURNS = listOf(150f, 270f, 210f, 330f)

private val ROLE_ORDER = mapOf(Role.Dominant to 0, Role.Switch to 1, Role.Submissive to 2)

/** Members in a fixed order (Dominant first), so each person's plans are the same colour for everyone. */
fun planPeople(rel: Relationship?): List<Member> = rel?.members.orEmpty().sortedBy { ROLE_ORDER[it.role] ?: 3 }

@Composable
private fun personTone(index: Int): PlanTone {
    val colors = MaterialTheme.colorScheme
    val dark = colors.surface.luminance() < 0.5f
    val hsl = FloatArray(3).also { ColorUtils.colorToHSL(colors.primary.toArgb(), it) }
    val hue = (hsl[0] + HUE_TURNS[index % HUE_TURNS.size]) % 360f
    fun hsl(s: Float, l: Float) = Color(ColorUtils.HSLToColor(floatArrayOf(hue, s, l)))
    return if (dark) PlanTone(hsl(0.40f, 0.26f), hsl(0.60f, 0.90f), hsl(0.55f, 0.72f))
    else PlanTone(hsl(0.60f, 0.88f), hsl(0.60f, 0.12f), hsl(0.50f, 0.40f))
}

/** Plans for both share the tertiary colour; a "Just me" plan takes its author's colour. */
@Composable
fun planTone(e: CalendarEvent, rel: Relationship?): PlanTone {
    val i = if (e.withPartner) -1 else planPeople(rel).indexOfFirst { it.userId == e.authorId }
    if (i < 0) {
        val colors = MaterialTheme.colorScheme
        return PlanTone(colors.tertiaryContainer, colors.onTertiaryContainer, colors.tertiary)
    }
    return personTone(i)
}

/** The key under the calendar: each person, then "Both". */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun PlanLegend(rel: Relationship?, myId: String?, modifier: Modifier = Modifier) {
    val people = planPeople(rel)
    if (people.size < 2) return
    val colors = MaterialTheme.colorScheme
    val entries = people.mapIndexed { i, m -> (if (m.userId == myId) "You" else m.displayName) to personTone(i).dot } + ("Both" to colors.tertiary)
    FlowRow(modifier, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
        entries.forEach { (label, dot) ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(10.dp).background(dot, CircleShape))
                Spacer(Modifier.width(6.dp))
                Text(label, style = MaterialTheme.typography.labelMedium, color = colors.onSurfaceVariant)
            }
        }
    }
}
