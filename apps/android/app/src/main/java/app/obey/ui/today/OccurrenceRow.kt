package app.obey.ui.today

import app.obey.ui.common.LocalFeatures
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Notes
import androidx.compose.material.icons.outlined.AddComment
import androidx.compose.material.icons.outlined.ChatBubbleOutline
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.HourglassTop
import androidx.compose.material.icons.outlined.MoreVert
import androidx.compose.material.icons.outlined.PlayCircle
import androidx.compose.material.icons.outlined.RadioButtonUnchecked
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material.icons.outlined.TaskAlt
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextDecoration
import app.obey.api.Occurrence
import app.obey.api.OccurrenceStatus
import app.obey.api.TaskStreak
import app.obey.ui.common.StreakStrip
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.ui.unit.dp
import app.obey.ui.common.formatDue
import app.obey.ui.common.signed

/** Actions available on an occurrence row; null hides the action. */
data class OccurrenceActions(
    val onComplete: (() -> Unit)? = null,
    val onCompleteWithNote: (() -> Unit)? = null,
    val onReschedule: (() -> Unit)? = null,
    val onEditTask: (() -> Unit)? = null,
    val onApprove: (() -> Unit)? = null,
    val onReject: (() -> Unit)? = null,
    /** A Dominant excusing a miss: no penalty, and the streak holds. */
    val onExcuse: (() -> Unit)? = null,
    /** A Dominant leaving a miss as missed: the penalty stays and it stops needing them. */
    val onConfirmMiss: (() -> Unit)? = null,
    /** Opens the comments on this due date. */
    val onComments: (() -> Unit)? = null,
)

@Composable
fun OccurrenceRow(
    occurrence: Occurrence,
    assigneeName: String?,
    actions: OccurrenceActions,
    modifier: Modifier = Modifier,
    /** Opens the task this occurrence belongs to. */
    onOpen: (() -> Unit)? = null,
    streak: TaskStreak? = null,
) {
    var menu by remember { mutableStateOf(false) }
    val done = occurrence.status == OccurrenceStatus.Completed || occurrence.status == OccurrenceStatus.Excused
    val showPoints = LocalFeatures.current.points
    val supporting = buildList {
        add(formatDue(occurrence.dueAt))
        if (occurrence.rescheduled) add("moved")
        if (assigneeName != null) add(assigneeName)
        if (showPoints && occurrence.points != 0) add("${signed(occurrence.points)} pts")
        if (occurrence.status == OccurrenceStatus.Pending && occurrence.isRitual && occurrence.stepsDone.isNotEmpty()) add(occurrence.stepProgress)
        if (occurrence.status == OccurrenceStatus.Pending && actions.onComplete != null && !occurrence.isOpen()) add(occurrence.opensLabel())
        when (occurrence.status) {
            OccurrenceStatus.Submitted -> add("awaiting approval")
            OccurrenceStatus.Missed -> add("missed")
            OccurrenceStatus.Excused -> add("excused")
            else -> Unit
        }
    }.joinToString(" · ")

    ListItem(
        modifier = if (onOpen != null) modifier.clickable(onClick = onOpen) else modifier,
        colors = ListItemDefaults.colors(),
        leadingContent = {
            val canComplete = actions.onComplete != null && occurrence.status == OccurrenceStatus.Pending && occurrence.isOpen()
            IconButton(onClick = { actions.onComplete?.invoke() }, enabled = canComplete) {
                when (occurrence.status) {
                    OccurrenceStatus.Completed -> Icon(Icons.Outlined.CheckCircle, "Completed", tint = MaterialTheme.colorScheme.primary)
                    OccurrenceStatus.Submitted -> Icon(Icons.Outlined.HourglassTop, "Awaiting approval")
                    OccurrenceStatus.Missed -> Icon(Icons.Outlined.ErrorOutline, "Missed", tint = MaterialTheme.colorScheme.error)
                    else -> if (occurrence.isRitual) {
                        Icon(Icons.Outlined.PlayCircle, "Start", tint = if (canComplete) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outline)
                    } else {
                        Icon(Icons.Outlined.RadioButtonUnchecked, "Mark done")
                    }
                }
            }
        },
        headlineContent = {
            Text(occurrence.title, textDecoration = if (done) TextDecoration.LineThrough else null)
        },
        supportingContent = {
            Column {
                Text(supporting, color = if (occurrence.status == OccurrenceStatus.Missed) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant)
                occurrence.mood?.let { m ->
                    Row(Modifier.padding(top = 4.dp), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                        Icon(app.obey.ui.common.moodIcon(m), null, Modifier.size(16.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(" Felt ${app.obey.ui.common.moodLabel(m).lowercase()}", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                if (occurrence.commentCount > 0) {
                    val n = occurrence.commentCount
                    Row(
                        Modifier.padding(top = 4.dp).then(if (actions.onComments != null) Modifier.clickable(onClick = actions.onComments) else Modifier),
                        verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
                    ) {
                        Icon(Icons.Outlined.ChatBubbleOutline, null, Modifier.size(16.dp), tint = MaterialTheme.colorScheme.primary)
                        Text(
                            " $n ${if (n == 1) "comment" else "comments"}",
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.primary,
                        )
                    }
                }
                StreakStrip(streak, Modifier.padding(top = 6.dp))
            }
        },
        trailingContent = {
            if (actions.onExcuse != null || actions.onConfirmMiss != null) {
                Row {
                    actions.onExcuse?.let { androidx.compose.material3.TextButton(onClick = it) { Text("Excuse") } }
                    actions.onConfirmMiss?.let { androidx.compose.material3.TextButton(onClick = it) { Text("Dismiss") } }
                }
            } else if (actions.onApprove != null || actions.onReject != null) {
                Row {
                    actions.onComments?.let { IconButton(onClick = it) { Icon(Icons.Outlined.AddComment, "Comment") } }
                    actions.onReject?.let { IconButton(onClick = it) { Icon(Icons.Outlined.Close, "Send back") } }
                    actions.onApprove?.let { IconButton(onClick = it) { Icon(Icons.Outlined.TaskAlt, "Approve") } }
                }
            } else if (listOf(actions.onCompleteWithNote, actions.onReschedule, actions.onEditTask, actions.onComments).any { it != null }) {
                Box {
                    IconButton(onClick = { menu = true }) { Icon(Icons.Outlined.MoreVert, "More") }
                    DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                        if (occurrence.status == OccurrenceStatus.Pending) {
                            if (occurrence.isOpen() && !occurrence.isRitual) actions.onCompleteWithNote?.let {
                                DropdownMenuItem(
                                    text = { Text("Done, with a note") },
                                    leadingIcon = { Icon(Icons.AutoMirrored.Outlined.Notes, null) },
                                    onClick = { menu = false; it() },
                                )
                            }
                            actions.onReschedule?.let {
                                DropdownMenuItem(
                                    text = { Text("Reschedule") },
                                    leadingIcon = { Icon(Icons.Outlined.Schedule, null) },
                                    onClick = { menu = false; it() },
                                )
                            }
                        }
                        actions.onComments?.let {
                            DropdownMenuItem(
                                text = { Text("Comment") },
                                leadingIcon = { Icon(Icons.Outlined.AddComment, null) },
                                onClick = { menu = false; it() },
                            )
                        }
                        actions.onEditTask?.let {
                            DropdownMenuItem(
                                text = { Text("Edit task") },
                                leadingIcon = { Icon(Icons.Outlined.Edit, null) },
                                onClick = { menu = false; it() },
                            )
                        }
                    }
                }
            }
        },
    )
}
