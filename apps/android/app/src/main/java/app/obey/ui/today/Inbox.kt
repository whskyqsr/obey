package app.obey.ui.today

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.ExpandLess
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.obey.api.LibraryChange
import app.obey.ui.common.SectionHeader

enum class InboxTone { Primary, Secondary, Tertiary, Error, Neutral }

/**
 * One kind of thing waiting on Today: how many, a line naming them, and what they are once opened. [action] is a bulk
 * button under the opened list ("Approve all"); [onOpen] makes it a row that opens a screen instead (the agreement).
 */
data class InboxGroup(
    val key: String,
    val icon: ImageVector,
    val tone: InboxTone,
    val title: String,
    val subtitle: String,
    val count: Int,
    val action: Pair<String, () -> Unit>? = null,
    val onOpen: (() -> Unit)? = null,
    val body: (@Composable () -> Unit)? = null,
)

internal fun plural(n: Int, one: String, many: String = one + "s") = "$n ${if (n == 1) one else many}"

/**
 * Everything on Today that waits on this person, one row per kind with a count, so a busy day doesn't turn into a wall
 * of cards. Opening a row shows the same cards and actions as before; with only one kind waiting it starts open.
 */
@Composable
fun TodayInbox(heading: String, groups: List<InboxGroup>, busy: Boolean) {
    SectionHeader("$heading · ${groups.sumOf { it.count }}")
    Column(
        Modifier.padding(horizontal = 16.dp).fillMaxWidth().clip(MaterialTheme.shapes.large),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        groups.forEach { g -> key(g.key) { InboxRow(g, startOpen = groups.size == 1, busy = busy) } }
    }
}

@Composable
private fun InboxRow(g: InboxGroup, startOpen: Boolean, busy: Boolean) {
    var toggled by rememberSaveable(g.key) { mutableStateOf(false) }
    val open = g.body != null && g.onOpen == null && toggled != startOpen
    val c = MaterialTheme.colorScheme
    val (container, onContainer) = when (g.tone) {
        InboxTone.Primary -> c.primaryContainer to c.onPrimaryContainer
        InboxTone.Secondary -> c.secondaryContainer to c.onSecondaryContainer
        InboxTone.Tertiary -> c.tertiaryContainer to c.onTertiaryContainer
        InboxTone.Error -> c.errorContainer to c.onErrorContainer
        InboxTone.Neutral -> c.surfaceContainerHighest to c.onSurfaceVariant
    }
    Column(Modifier.fillMaxWidth().background(c.surfaceContainerLow)) {
        Row(
            Modifier
                .fillMaxWidth()
                .heightIn(min = 64.dp)
                .clickable {
                    if (g.onOpen != null) {
                        g.onOpen.invoke()
                    } else {
                        toggled = !toggled
                    }
                }
                .padding(horizontal = 16.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Box(Modifier.size(40.dp).background(container, CircleShape), contentAlignment = Alignment.Center) {
                Icon(g.icon, null, Modifier.size(22.dp), tint = onContainer)
            }
            Column(Modifier.weight(1f)) {
                Text(g.title, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (!open && g.subtitle.isNotEmpty()) {
                    Text(g.subtitle, style = MaterialTheme.typography.bodyMedium, color = c.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
            if (g.onOpen != null) {
                Icon(Icons.AutoMirrored.Outlined.KeyboardArrowRight, null, tint = c.onSurfaceVariant)
            } else {
                if (!open) {
                    Surface(color = c.primary, contentColor = c.onPrimary, shape = CircleShape) {
                        Text("${g.count}", style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp))
                    }
                }
                Icon(if (open) Icons.Outlined.ExpandLess else Icons.Outlined.ExpandMore, if (open) "Collapse" else "Expand", tint = c.onSurfaceVariant)
            }
        }
        AnimatedVisibility(open) {
            Column(Modifier.padding(start = 8.dp, end = 8.dp, bottom = 8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                g.body?.invoke()
                g.action?.let { (label, run) ->
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                        OutlinedButton(onClick = run, enabled = !busy) { Text(label) }
                    }
                }
            }
        }
    }
}

/** Rows inside an opened group, joined like the groups themselves. */
@Composable
fun InboxRows(content: @Composable ColumnScope.() -> Unit) {
    Column(Modifier.fillMaxWidth().clip(MaterialTheme.shapes.large), verticalArrangement = Arrangement.spacedBy(2.dp), content = content)
}

/** "Sam added 1 rule, changed 2 protocols" from one person, otherwise "Changes: …". */
internal fun librarySummary(list: List<LibraryChange>, nameOf: (String) -> String): String {
    val parts = list.groupingBy { it.verb to it.kind }.eachCount().map { (k, n) -> "${k.first} ${plural(n, k.second.dropLast(1))}" }.joinToString(", ")
    val by = list.map { it.changedBy }.toSet()
    val first = list.firstOrNull()?.changedBy
    return if (by.size == 1 && first != null) "${nameOf(first)} $parts" else "Changes: $parts"
}

/** A rule or protocol someone else changed, until it's marked seen. [onOpen] is null for one that was removed. */
@Composable
fun LibraryChangeRow(change: LibraryChange, name: String, onOpen: (() -> Unit)?, onSeen: () -> Unit) {
    ListItem(
        modifier = if (onOpen != null) Modifier.clickable(onClick = onOpen) else Modifier,
        colors = ListItemDefaults.colors(containerColor = MaterialTheme.colorScheme.surfaceContainer),
        headlineContent = { Text(change.title, maxLines = 1, overflow = TextOverflow.Ellipsis) },
        supportingContent = { Text("$name ${change.verb} this ${if (change.kind == "rules") "rule" else "protocol"} · ${dayAndTime(change.createdAt)}") },
        trailingContent = { IconButton(onClick = onSeen) { Icon(Icons.Outlined.Close, "Seen") } },
    )
}
