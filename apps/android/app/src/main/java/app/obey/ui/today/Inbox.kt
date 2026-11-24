package app.obey.ui.today

import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.contentDescription
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
import androidx.compose.material3.HorizontalDivider
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
    /** For a Dominant, one card per item (keyed) instead of [body]'s rows: the mockup's sentence cards. */
    val cards: List<Pair<String, @Composable () -> Unit>>? = null,
)

internal fun plural(n: Int, one: String, many: String = one + "s") = "$n ${if (n == 1) one else many}"

/**
 * Everything on Today that waits on this person (mockup 11): sentence cards, each with its own buttons. The greeting
 * already says how many, so there's no heading or count. [heading] names the section for screen readers.
 */
@Composable
fun TodayInbox(heading: String, groups: List<InboxGroup>, busy: Boolean) {
    Box(Modifier.padding(top = 8.dp, bottom = 8.dp).semantics { contentDescription = "$heading · ${groups.sumOf { it.count }}" }) {
        NeedsYouCards(groups, busy)
    }
}

/** A Dominant's decisions at the top of Today (mockup 03): a card each, with its buttons showing. */
@Composable
fun NeedsYouCards(groups: List<InboxGroup>, busy: Boolean) {
    Column(Modifier.padding(horizontal = 16.dp).fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        groups.forEach { g ->
            if (g.cards != null) {
                g.cards.forEach { (k, card) -> key(g.key, k) { InboxSurface { Box(Modifier.padding(16.dp)) { card() } } } }
                g.action?.let { (label, run) ->
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                        OutlinedButton(onClick = run, enabled = !busy) { Text(label) }
                    }
                }
            } else {
                key(g.key) { InboxCard(g, startOpen = groups.size == 1, busy = busy) }
            }
        }
    }
}

@Composable
private fun InboxSurface(content: @Composable () -> Unit) {
    val c = MaterialTheme.colorScheme
    Surface(
        shape = androidx.compose.foundation.shape.RoundedCornerShape(12.dp),
        color = c.surfaceContainerLowest,
        border = androidx.compose.foundation.BorderStroke(1.dp, c.outlineVariant),
        modifier = Modifier.fillMaxWidth(),
        content = content,
    )
}

/** A kind of thing waiting, as one card: what it is, a line under it, and a quiet link to open it or show the items. */
@Composable
private fun InboxCard(g: InboxGroup, startOpen: Boolean, busy: Boolean) {
    var toggled by rememberSaveable(g.key) { mutableStateOf(false) }
    val open = g.body != null && g.onOpen == null && toggled != startOpen
    val c = MaterialTheme.colorScheme
    InboxSurface {
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Column(Modifier.weight(1f)) {
                    Text(g.title, style = MaterialTheme.typography.bodyLarge)
                    if (!open && g.subtitle.isNotEmpty()) {
                        Text(g.subtitle, style = MaterialTheme.typography.bodyMedium, color = c.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    }
                }
                val link = when {
                    g.onOpen != null -> "Open"
                    g.body != null -> if (open) "Hide" else if (g.count > 1) "Show ${g.count}" else "Show"
                    else -> null
                }
                if (link != null) {
                    Text(
                        link,
                        style = MaterialTheme.typography.bodyMedium,
                        color = c.primary,
                        modifier = Modifier.clickable { if (g.onOpen != null) g.onOpen.invoke() else toggled = !toggled }.padding(vertical = 2.dp),
                    )
                }
            }
            AnimatedVisibility(open) {
                Column(Modifier.padding(top = 8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
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
}

/** Rows inside an opened group, joined like the groups themselves. */
@Composable
fun InboxRows(content: @Composable ColumnScope.() -> Unit) {
    Column(Modifier.fillMaxWidth()) {
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        content()
    }
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
        colors = ListItemDefaults.colors(containerColor = androidx.compose.ui.graphics.Color.Transparent),
        headlineContent = { Text(change.title, maxLines = 1, overflow = TextOverflow.Ellipsis) },
        supportingContent = { Text("$name ${change.verb} this ${if (change.kind == "rules") "rule" else "protocol"} · ${dayAndTime(change.createdAt)}") },
        trailingContent = { IconButton(onClick = onSeen) { Icon(Icons.Outlined.Close, "Seen") } },
    )
}
