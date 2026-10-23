package app.obey.widget

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.LinearProgressIndicator
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.layout.Alignment
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import app.obey.R

/** Points (2x2): the balance and how far to the next reward; a Dominant sees their partner's. */
class PointsWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Exact

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val first = Widgets.load(context)
        provideContent {
            val model = rememberModel(context, first, countdown = false)
            WidgetTheme { PointsContent(model) }
        }
    }
}

class PointsWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = PointsWidget()
}

@Composable
private fun PointsContent(m: WidgetModel) {
    val c = GlanceTheme.colors
    WidgetCard(c.primaryContainer) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Glyph(R.drawable.ic_widget_reward, c.onPrimaryContainer, 22.dp)
            Spacer(GlanceModifier.width(8.dp))
            Label(if (m.names && m.pointsName != null) "${m.pointsName}'s points" else "Points", 15.sp, c.onPrimaryContainer, FontWeight.Medium)
        }
        Spacer(GlanceModifier.height(6.dp))
        val balance = m.balance
        when {
            !m.signedIn -> Label("Open the app to sign in", 13.sp, c.onPrimaryContainer, lines = 2)
            m.session?.relationship != null && !m.points -> Label("Points are off in this dynamic", 13.sp, c.onPrimaryContainer, lines = 2)
            balance == null -> Label("Open the app to load them", 13.sp, c.onPrimaryContainer, lines = 2)
            else -> {
                Label(balance.toString(), 40.sp, c.onPrimaryContainer)
                val goal = m.goal
                if (goal != null) {
                    Label("${goal.cost - balance} more for ${if (m.names) goal.title else "the next reward"}", 13.sp, c.onPrimaryContainer, lines = 2)
                    Spacer(GlanceModifier.height(8.dp))
                    LinearProgressIndicator(
                        progress = balance.coerceAtLeast(0).toFloat() / goal.cost,
                        modifier = GlanceModifier.fillMaxWidth().height(6.dp).cornerRadius(3.dp),
                        color = c.primary,
                        backgroundColor = c.surface,
                    )
                }
            }
        }
    }
}
