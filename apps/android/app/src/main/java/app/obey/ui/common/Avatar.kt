package app.obey.ui.common

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/** A member's picture, or their initial on a tonal circle when they haven't added one. */
@Composable
fun Avatar(
    userId: String,
    name: String,
    version: String?,
    load: suspend (userId: String, version: String) -> ImageBitmap?,
    modifier: Modifier = Modifier,
    size: Dp = 40.dp,
    /** Shows a small collar badge at the bottom right. */
    collared: Boolean = false,
) {
    var image by remember(userId, version) { mutableStateOf<ImageBitmap?>(null) }
    LaunchedEffect(userId, version) { image = version?.let { load(userId, it) } }
    Box(modifier.size(size)) {
        Box(
            Modifier.matchParentSize().clip(CircleShape).background(MaterialTheme.colorScheme.secondaryContainer),
            contentAlignment = Alignment.Center,
        ) {
            val img = image
            if (img != null) {
                Image(img, null, Modifier.size(size), contentScale = ContentScale.Crop)
            } else {
                val fontSize = with(LocalDensity.current) { (size * 0.42f).toSp() }
                Text(
                    name.trim().take(1).uppercase().ifEmpty { "?" },
                    color = MaterialTheme.colorScheme.onSecondaryContainer,
                    fontSize = fontSize,
                )
            }
        }
        if (collared) {
            val badge = maxOf(16.dp, size * 0.4f)
            Box(
                Modifier
                    .align(Alignment.BottomEnd)
                    .offset(2.dp, 2.dp)
                    .size(badge)
                    .border(2.dp, MaterialTheme.colorScheme.surface, CircleShape)
                    .clip(CircleShape)
                    .background(MaterialTheme.colorScheme.primary),
                contentAlignment = Alignment.Center,
            ) {
                Icon(CollarIcon, "Collared", Modifier.size(badge * 0.7f), tint = MaterialTheme.colorScheme.onPrimary)
            }
        }
    }
}
