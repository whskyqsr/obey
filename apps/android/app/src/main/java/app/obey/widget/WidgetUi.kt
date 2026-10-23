package app.obey.widget

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.os.Build
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.ColorFilter
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.LocalContext
import androidx.glance.action.actionStartActivity
import androidx.glance.action.clickable
import androidx.glance.appwidget.appWidgetBackground
import androidx.glance.appwidget.cornerRadius
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.material3.ColorProviders
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import app.obey.MainActivity
import app.obey.ui.theme.DarkColors
import app.obey.ui.theme.LightColors

private val FealtyColors = ColorProviders(light = LightColors, dark = DarkColors)

/** The app's colours: the wallpaper's on Android 12 and later, as in the app, and oxblood before that. */
@Composable
fun WidgetTheme(content: @Composable () -> Unit) {
    GlanceTheme(colors = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) GlanceTheme.colors else FealtyColors, content = content)
}

/** The rounded card every widget sits in; tapping anywhere not otherwise tappable opens the app on Today. */
@Composable
fun WidgetCard(color: ColorProvider = GlanceTheme.colors.widgetBackground, content: @Composable () -> Unit) {
    Column(
        GlanceModifier.fillMaxSize().appWidgetBackground().cornerRadius(24.dp).background(color)
            .clickable(actionStartActivity<MainActivity>()).padding(16.dp),
    ) { content() }
}

@Composable
fun Label(text: String, size: TextUnit = 14.sp, color: ColorProvider = GlanceTheme.colors.onSurface, weight: FontWeight = FontWeight.Normal, modifier: GlanceModifier = GlanceModifier, lines: Int = 1) {
    Text(text, modifier, style = TextStyle(color = color, fontSize = size, fontWeight = weight), maxLines = lines)
}

@Composable
fun Glyph(res: Int, tint: ColorProvider, size: Dp = 20.dp, modifier: GlanceModifier = GlanceModifier) {
    Image(ImageProvider(res), contentDescription = null, modifier = modifier.size(size), colorFilter = ColorFilter.tint(tint))
}

/** A progress ring with [label] in the middle; Glance has no determinate circle, so it's drawn. */
@Composable
fun Ring(fraction: Float, label: String, size: Dp, stroke: Dp, labelSize: TextUnit, fill: ColorProvider = GlanceTheme.colors.primary, track: ColorProvider = GlanceTheme.colors.primaryContainer) {
    val context = LocalContext.current
    Box(GlanceModifier.size(size), contentAlignment = Alignment.Center) {
        Image(ImageProvider(ringBitmap(context, size, stroke, fraction, fill, track)), contentDescription = null, modifier = GlanceModifier.size(size))
        Label(label, labelSize, weight = FontWeight.Medium)
    }
}

private fun ringBitmap(context: Context, size: Dp, stroke: Dp, fraction: Float, fill: ColorProvider, track: ColorProvider): Bitmap {
    val density = context.resources.displayMetrics.density
    val px = (size.value * density).toInt().coerceAtLeast(1)
    val w = stroke.value * density
    val bmp = Bitmap.createBitmap(px, px, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bmp)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = w
        strokeCap = Paint.Cap.ROUND
    }
    val box = RectF(w / 2, w / 2, px - w / 2, px - w / 2)
    paint.color = track.getColor(context).toArgb()
    canvas.drawArc(box, 0f, 360f, false, paint)
    if (fraction > 0f) {
        paint.color = fill.getColor(context).toArgb()
        canvas.drawArc(box, -90f, 360f * fraction.coerceIn(0f, 1f), false, paint)
    }
    return bmp
}
