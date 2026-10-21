package app.obey.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.ExpandLess
import androidx.compose.material.icons.outlined.UnfoldMore
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import app.obey.api.Relationship
import app.obey.api.title
import app.obey.data.Session
import app.obey.ui.common.Avatar
import app.obey.ui.onboarding.label

/** What the switcher needs: the session, a way to load pictures, to switch, and to join or start another. */
class SwitcherActions(
    val session: Session,
    val loadAvatar: suspend (String, String) -> ImageBitmap?,
    val select: (String) -> Unit,
    val joinOrStart: () -> Unit,
    val openDynamic: () -> Unit,
)

/** "with Sam", or the dynamic's own name. */
private fun Relationship.heading(myId: String) = if (name != null || members.size < 2) title(myId) else "with ${title(myId)}"

private fun Relationship.subtitle(myId: String): String =
    if (ended) "Ended" else members.firstOrNull { it.userId == myId }?.let { "You're the ${it.role.label}" } ?: ""

/** A dynamic's mark: the partner's picture, or your own in a dynamic nobody has joined yet. */
@Composable
private fun DynamicMark(rel: Relationship, a: SwitcherActions, size: Dp) {
    val who = rel.members.firstOrNull { it.userId != a.session.userId } ?: rel.members.firstOrNull() ?: return
    Avatar(who.userId, who.displayName, who.avatarVersion, a.loadAvatar, size = size)
}

/** Every dynamic, the current one first and checked, then a way to join or start another. */
@Composable
private fun DynamicList(a: SwitcherActions, onPick: () -> Unit) {
    val me = a.session.userId
    val current = a.session.relationship?.id
    val all = a.session.me.relationships.sortedWith(compareBy({ it.id != current }, { it.ended }))
    Column(Modifier.padding(6.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
        all.forEach { r ->
            val on = r.id == current
            Row(
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(16.dp))
                    .background(if (on) MaterialTheme.colorScheme.secondaryContainer else androidx.compose.ui.graphics.Color.Transparent)
                    .clickable { onPick(); if (!on) a.select(r.id) }
                    .padding(horizontal = 12.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                DynamicMark(r, a, 36.dp)
                Column(Modifier.weight(1f)) {
                    Text(
                        r.heading(me),
                        style = MaterialTheme.typography.labelLarge,
                        color = if (r.ended) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(r.subtitle(me), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
                }
                if (on) Icon(Icons.Outlined.Check, "Current", tint = MaterialTheme.colorScheme.onSecondaryContainer)
            }
        }
        Row(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(16.dp))
                .clickable { onPick(); a.joinOrStart() }
                .padding(horizontal = 12.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Surface(Modifier.size(36.dp), shape = CircleShape, color = androidx.compose.ui.graphics.Color.Transparent, border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)) {
                Box(contentAlignment = Alignment.Center) { Icon(Icons.Outlined.Add, null, Modifier.size(20.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant) }
            }
            Text("Join or start another", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

/** The phone menu's header: the dynamic in view. With more than one, tapping it opens the list in place. */
@Composable
fun DynamicSwitcher(a: SwitcherActions, onSwitched: () -> Unit) {
    val rel = a.session.relationship ?: return
    val me = a.session.userId
    val many = a.session.me.relationships.size > 1
    var open by remember { mutableStateOf(false) }
    Column(Modifier.padding(horizontal = 12.dp)) {
        Row(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(16.dp))
                .clickable { if (many) open = !open else a.openDynamic() }
                .padding(horizontal = 12.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            DynamicMark(rel, a, 40.dp)
            Column(Modifier.weight(1f)) {
                Text(rel.heading(me), style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(rel.subtitle(me), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
            }
            if (many) Icon(if (open) Icons.Outlined.ExpandLess else Icons.Outlined.UnfoldMore, if (open) "Hide dynamics" else "Switch dynamic", tint = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        AnimatedVisibility(open) {
            Surface(Modifier.padding(top = 4.dp, bottom = 8.dp), shape = RoundedCornerShape(24.dp), color = MaterialTheme.colorScheme.surfaceContainer) {
                DynamicList(a) { open = false; onSwitched() }
            }
        }
    }
}

/** The rail's header on tablets: the partner's picture, opening the list as a menu beside it. */
@Composable
fun DynamicSwitcherCompact(a: SwitcherActions) {
    val rel = a.session.relationship ?: return
    val many = a.session.me.relationships.size > 1
    var open by remember { mutableStateOf(false) }
    Box(Modifier.padding(vertical = 8.dp)) {
        Box(Modifier.clip(RoundedCornerShape(16.dp)).clickable { if (many) open = true else a.openDynamic() }.padding(4.dp)) {
            DynamicMark(rel, a, 48.dp)
            if (many) {
                Surface(
                    Modifier.align(Alignment.BottomEnd).offset(2.dp, 2.dp).size(20.dp),
                    shape = CircleShape,
                    color = MaterialTheme.colorScheme.surfaceContainerHighest,
                    border = BorderStroke(2.dp, MaterialTheme.colorScheme.surface),
                ) {
                    Box(contentAlignment = Alignment.Center) { Icon(Icons.Outlined.UnfoldMore, "Switch dynamic", Modifier.size(14.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant) }
                }
            }
        }
        DropdownMenu(open, onDismissRequest = { open = false }, shape = RoundedCornerShape(24.dp), containerColor = MaterialTheme.colorScheme.surfaceContainerHigh) {
            Box(Modifier.width(288.dp)) { DynamicList(a) { open = false } }
        }
    }
}
