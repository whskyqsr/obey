package app.obey.ui.common

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.unit.dp

/** Material has no collar, so this is drawn to match its outline icons: a collar with an O-ring. Same path as the web's CollarIcon. */
val CollarIcon: ImageVector by lazy {
    ImageVector.Builder("Collar", 24.dp, 24.dp, 24f, 24f).addPath(
        pathData = PathParser().parsePathString(
            "M3 6.5a9 3.5 0 1 0 18 0a9 3.5 0 1 0 -18 0M3 6.5v3c0 1.9 4 3.5 9 3.5s9-1.6 9-3.5v-3M8.5 17.5a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0 -7 0",
        ).toNodes(),
        fill = null,
        stroke = SolidColor(Color.Black),
        strokeLineWidth = 2f,
        strokeLineCap = StrokeCap.Round,
        strokeLineJoin = StrokeJoin.Round,
    ).build()
}
