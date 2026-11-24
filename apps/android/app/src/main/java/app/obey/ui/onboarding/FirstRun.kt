package app.obey.ui.onboarding

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * The page every sign-in and setup screen sits on (mockups 31–38): paper edge to edge, an optional top line (Back,
 * the step, Skip), the content, and the actions held at the bottom.
 */
@Composable
fun FirstRunPage(
    top: (@Composable RowScope.() -> Unit)? = null,
    actions: (@Composable ColumnScope.() -> Unit)? = null,
    center: Boolean = false,
    content: @Composable ColumnScope.() -> Unit,
) {
    Box(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().imePadding(), contentAlignment = Alignment.TopCenter) {
        Column(Modifier.widthIn(max = 480.dp).fillMaxSize().padding(horizontal = 24.dp)) {
            if (top != null) Row(Modifier.fillMaxWidth().heightIn(min = 48.dp), verticalAlignment = Alignment.CenterVertically) { top() }
            Column(
                Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState()).padding(top = if (top != null) 8.dp else 64.dp, bottom = 16.dp),
                horizontalAlignment = if (center) Alignment.CenterHorizontally else Alignment.Start,
                content = content,
            )
            if (actions != null) Column(Modifier.fillMaxWidth().padding(bottom = 16.dp), verticalArrangement = Arrangement.spacedBy(12.dp), content = actions)
        }
    }
}

/** The large serif line that opens each of those screens, with its line under it. */
@Composable
fun FirstRunTitle(title: String, sub: String? = null) {
    Text(title, style = MaterialTheme.typography.displayMedium.copy(fontSize = 44.sp, lineHeight = 48.sp))
    if (sub != null) Text(sub, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 12.dp))
}
