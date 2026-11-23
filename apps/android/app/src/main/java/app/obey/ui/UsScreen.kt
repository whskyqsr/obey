package app.obey.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material.icons.outlined.FrontHand
import androidx.compose.material.icons.outlined.PersonAdd
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.obey.ui.common.LocalSafeWord
import app.obey.ui.common.MenuButton
import app.obey.ui.common.SafeWordAction

/** A row on Us: a section of the app, with a line on what's in it. */
class UsItem(val label: String, val hint: String?, val icon: ImageVector, val onClick: () -> Unit)

/** Us: everything the Today and Week tabs don't cover, as one plain list. Settings is the gear. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun UsScreen(items: List<UsItem>, onSettings: () -> Unit, onInvite: (() -> Unit)?) {
    val safeWord = LocalSafeWord.current
    Scaffold(
        topBar = {
            TopAppBar(
                navigationIcon = { MenuButton() },
                title = {},
                actions = {
                    IconButton(onClick = onSettings) { Icon(Icons.Outlined.Settings, "Settings") }
                    SafeWordAction()
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surface),
            )
        },
    ) { padding ->
        Column(Modifier.padding(padding).fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp)) {
            Text("Us", style = MaterialTheme.typography.displaySmall, modifier = Modifier.padding(top = 4.dp, bottom = 16.dp))
            if (safeWord != null) {
                Surface(
                    onClick = safeWord,
                    shape = MaterialTheme.shapes.medium,
                    color = MaterialTheme.colorScheme.surface,
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.4f)),
                    modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp),
                ) {
                    Row(Modifier.padding(horizontal = 16.dp, vertical = 12.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Outlined.FrontHand, null, Modifier.size(20.dp), tint = MaterialTheme.colorScheme.primary)
                        Text("Safe word", style = MaterialTheme.typography.titleLarge.copy(fontSize = 20.sp), color = MaterialTheme.colorScheme.primary, modifier = Modifier.weight(1f))
                        Text("Yellow to slow down, red to stop", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                    }
                }
            }
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            items.forEach { item ->
                Row(
                    Modifier.fillMaxWidth().clickable(onClick = item.onClick).padding(vertical = 12.dp),
                    horizontalArrangement = Arrangement.spacedBy(14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(item.icon, null, Modifier.size(20.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    Column(Modifier.weight(1f)) {
                        Text(item.label, style = MaterialTheme.typography.titleLarge.copy(fontSize = 20.sp, lineHeight = 24.sp))
                        if (item.hint != null) Text(item.hint, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.outline, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    Icon(Icons.AutoMirrored.Outlined.KeyboardArrowRight, null, tint = MaterialTheme.colorScheme.outline)
                }
                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            }
            if (onInvite != null) {
                Row(
                    Modifier.fillMaxWidth().clickable(onClick = onInvite).padding(vertical = 14.dp),
                    horizontalArrangement = Arrangement.spacedBy(14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Outlined.PersonAdd, null, Modifier.size(20.dp), tint = MaterialTheme.colorScheme.primary)
                    Text("Invite a partner", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
                }
            }
        }
    }
}
