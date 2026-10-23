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
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.provideContent
import androidx.glance.layout.Alignment
import androidx.glance.layout.Column
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.height
import androidx.glance.text.FontWeight
import app.obey.ui.common.formatTime
import app.obey.ui.common.parseInstant
import java.time.Duration
import java.time.Instant

/** The next deadline (2x2): a ring that empties over the last hour, the task, and when it's due. */
class DeadlineWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Exact

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val first = Widgets.load(context)
        provideContent {
            val model = rememberModel(context, first, countdown = true)
            WidgetTheme { DeadlineContent(model) }
        }
    }
}

class DeadlineWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = DeadlineWidget()
}

@Composable
private fun DeadlineContent(m: WidgetModel) {
    val c = GlanceTheme.colors
    val next = m.next
    WidgetCard {
        Column(GlanceModifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalAlignment = Alignment.CenterVertically) {
            when {
                !m.signedIn -> Label("Open the app to sign in", color = c.onSurfaceVariant, lines = 2)
                next == null -> {
                    Ring(0f, "–", 72.dp, 6.dp, 20.sp)
                    Spacer(GlanceModifier.height(8.dp))
                    Label("Nothing due", 15.sp, weight = FontWeight.Medium)
                }
                else -> {
                    val left = Duration.between(Instant.now(), parseInstant(next.dueAt))
                    val urgent = left.toMinutes() < 15
                    // Full until the last hour, then it empties as the time runs out.
                    val fraction = if (left.toMinutes() >= 60) 1f else left.seconds.coerceAtLeast(0) / 3600f
                    Ring(fraction, shortLeft(next.dueAt), 72.dp, 6.dp, if (left.toHours() > 0) 16.sp else 20.sp, fill = if (urgent) c.error else c.primary, track = if (urgent) c.errorContainer else c.primaryContainer)
                    Spacer(GlanceModifier.height(8.dp))
                    Label(if (m.names) next.title else "Next task", 15.sp, weight = FontWeight.Medium)
                    val due = "Due ${formatTime(next.dueAt)}"
                    Label(if (m.names && m.nextFor != null) "For ${m.nextFor} · $due" else due, 13.sp, c.onSurfaceVariant)
                }
            }
        }
    }
}
