package app.obey.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.FavoriteBorder
import androidx.compose.material.icons.outlined.FrontHand
import androidx.compose.material.icons.outlined.PersonAdd
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.obey.ui.common.LocalSafeWord

/** A section on Us. */
class UsItem(val label: String, val icon: ImageVector, val onClick: () -> Unit)

/** The order Us reads in, left to right then down; anything not named follows. */
private val ORDER = listOf(
    "Rules", "Protocols", "Rewards", "Consequences", "Notes", "Journal", "Limits", "Agreement",
    "Scenes", "Chastity", "Location", "Stats", "Monthly review", "Kits", "All tasks",
)

/** Us: who's in the dynamic, then everything the Today and Week tabs don't cover, in two columns. Settings is the gear. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun UsScreen(items: List<UsItem>, switcher: SwitcherActions, onDynamic: () -> Unit, onSettings: () -> Unit, onInvite: (() -> Unit)?, vm: UsViewModel = hiltViewModel()) {
    val safeWord = LocalSafeWord.current
    val counts by vm.counts.collectAsStateWithLifecycle()
    val labels = items.map { it.label }.toSet()
    LaunchedEffect(labels, switcher.session.relationship?.id) { vm.refresh(labels) }
    val sorted = items.sortedBy { ORDER.indexOf(it.label).let { i -> if (i < 0) ORDER.size else i } }
    Scaffold(
        topBar = {
            TopAppBar(
                title = {},
                actions = { IconButton(onClick = onSettings) { Icon(Icons.Outlined.Settings, "Settings") } },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surface),
            )
        },
    ) { padding ->
        Column(Modifier.padding(padding).fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp)) {
            DynamicSwitcherHero(switcher)
            Spacer(Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                if (safeWord != null) {
                    OutlinedButton(
                        onClick = safeWord,
                        shape = MaterialTheme.shapes.small,
                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.primary),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.primary),
                        modifier = Modifier.weight(1f).height(48.dp),
                    ) {
                        Icon(Icons.Outlined.FrontHand, null, Modifier.size(20.dp))
                        Spacer(Modifier.size(8.dp))
                        Text("Safe call")
                    }
                }
                OutlinedButton(
                    onClick = onDynamic,
                    shape = MaterialTheme.shapes.small,
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.onSurface),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.onSurface),
                    modifier = Modifier.weight(1f).height(48.dp),
                ) {
                    Icon(Icons.Outlined.FavoriteBorder, null, Modifier.size(20.dp))
                    Spacer(Modifier.size(8.dp))
                    Text("Your dynamic")
                }
            }
            Spacer(Modifier.height(8.dp))
            sorted.chunked(2).forEach { pair ->
                Row(horizontalArrangement = Arrangement.spacedBy(24.dp)) {
                    pair.forEach { item -> Cell(item, counts[item.label], Modifier.weight(1f)) }
                    if (pair.size == 1) Spacer(Modifier.weight(1f))
                }
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
            Spacer(Modifier.height(24.dp))
        }
    }
}

@Composable
private fun Cell(item: UsItem, count: String?, modifier: Modifier) {
    Column(modifier) {
        Row(
            Modifier.fillMaxWidth().height(48.dp).clickable(onClick = item.onClick),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(item.icon, null, Modifier.size(20.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(
                item.label,
                style = MaterialTheme.typography.titleLarge.copy(fontSize = 19.sp, lineHeight = 24.sp),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            if (count != null) Text(count, style = MaterialTheme.typography.bodySmall.copy(fontSize = 11.sp), color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
        }
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
    }
}
