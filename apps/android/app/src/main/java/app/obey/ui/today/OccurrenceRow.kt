package app.obey.ui.today

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.material.icons.Icons
import app.obey.ui.common.TonalIconButton
import androidx.compose.material.icons.outlined.RemoveCircleOutline
import androidx.compose.material.icons.outlined.RemoveDone
import androidx.compose.material.icons.automirrored.outlined.Notes
import androidx.compose.material.icons.automirrored.outlined.Undo
import androidx.compose.material.icons.outlined.AddComment
import androidx.compose.material.icons.outlined.ChatBubbleOutline
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.EventBusy
import androidx.compose.material.icons.outlined.MoreHoriz
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material.icons.outlined.TaskAlt
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
import app.obey.api.Occurrence
import app.obey.api.OccurrenceStatus
import app.obey.api.TaskStreak
import app.obey.ui.common.Diamond
import app.obey.ui.common.DiamondState
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.ui.unit.dp
import app.obey.ui.common.formatDue
import app.obey.ui.common.local

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
    /** Keep the miss but drop the consequence it handed out (only when one is still to be done). */
    val onDropConsequence: (() -> Unit)? = null,
    /** A Dominant excusing a miss from the ⋯ menu; with it, Reschedule shows for the miss too. */
    val onExcuseInMenu: (() -> Unit)? = null,
    /** Skip this one due date; [skipAsks] when it goes to a Dominant to approve. */
    val onSkip: (() -> Unit)? = null,
    val skipAsks: Boolean = false,
    /** Opens the comments on this due date. */
    val onComments: (() -> Unit)? = null,
    /** A count task: a tap adds one; holding opens the dialog to change the count. */
    val onCount: (() -> Unit)? = null,
    val onCountHold: (() -> Unit)? = null,
    /** A location task: "I'm here", checking the phone's location against the place. */
    val onCheckIn: (() -> Unit)? = null,
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
    /** Runs into a plan that nobody has sorted out yet: the title turns oxblood. */
    clash: Boolean = false,
) {
    var menu by remember { mutableStateOf(false) }
    val done = occurrence.status == OccurrenceStatus.Completed || occurrence.status == OccurrenceStatus.Excused
    // Today's time sits at the row's end, as in the mockups; other days keep the day in the line under the title.
    val dueToday = app.obey.ui.common.parseInstant(occurrence.dueAt).local().toLocalDate() == java.time.LocalDate.now()
    val endTime = dueToday && !occurrence.isStaying
    val place = app.obey.ui.location.LocalPlaces.current[occurrence.placeId]
    val supporting = buildList {
        if (occurrence.isCounted) add(occurrence.countLine)
        if (occurrence.isPlaced) app.obey.ui.location.placeLine(occurrence, place)?.let { add(it) }
        // While someone is staying, the clock that matters is the stay's, not the deadline.
        if (!occurrence.isStaying && !dueToday) add(formatDue(occurrence.dueAt))
        if (occurrence.status == OccurrenceStatus.Pending && occurrence.diamondState() == DiamondState.Owed) add("Overdue")
        if (occurrence.rescheduled) add("moved")
        if (assigneeName != null) add(assigneeName)
        if (occurrence.status == OccurrenceStatus.Pending && occurrence.isRitual && occurrence.stepsDone.isNotEmpty()) add(occurrence.stepProgress)
        if (occurrence.status == OccurrenceStatus.Pending && actions.onComplete != null && !occurrence.isOpen()) add(occurrence.opensLabel())
        if (occurrence.waitingToSync) add("waiting to sync")
        when (occurrence.status) {
            OccurrenceStatus.Submitted -> add("awaiting approval")
            OccurrenceStatus.Missed -> if (!occurrence.isCounted && occurrence.leftAt == null) add("missed")
            OccurrenceStatus.Excused -> add("excused")
            else -> Unit
        }
    }.joinToString(" · ")

    ListItem(
        modifier = if (onOpen != null) modifier.clickable(onClick = onOpen) else modifier,
        colors = ListItemDefaults.colors(),
        leadingContent = {
            if (occurrence.isPlaced && (occurrence.status == OccurrenceStatus.Pending || occurrence.leftAt != null)) {
                app.obey.ui.location.PlaceRing(occurrence, actions.onCheckIn)
            } else if (occurrence.isCounted) {
                CountRing(occurrence, actions.onCount, actions.onCountHold)
            } else {
            val canComplete = actions.onComplete != null && occurrence.status == OccurrenceStatus.Pending && occurrence.isOpen()
            IconButton(
                onClick = { actions.onComplete?.invoke() },
                enabled = canComplete,
                modifier = Modifier.semantics {
                    contentDescription = when (occurrence.status) {
                        OccurrenceStatus.Completed -> "Completed"
                        OccurrenceStatus.Submitted -> "Awaiting approval"
                        OccurrenceStatus.Missed -> "Missed"
                        OccurrenceStatus.Excused -> "Excused"
                        else -> if (occurrence.isRitual) "Start" else "Mark done"
                    }
                },
            ) {
                // Rituals too: the diamond is the checkbox, and tapping it starts the steps.
                Diamond(occurrence.diamondState())
            }
            }
        },
        headlineContent = {
            Text(occurrence.title, color = if (clash) MaterialTheme.colorScheme.error else if (done && !occurrence.isCounted) MaterialTheme.colorScheme.onSurfaceVariant else androidx.compose.ui.graphics.Color.Unspecified)
        },
        supportingContent = if (supporting.isEmpty() && occurrence.mood == null && occurrence.commentCount == 0) null else ({
            Column {
                if (supporting.isNotEmpty()) Text(supporting, color = if (occurrence.status == OccurrenceStatus.Missed || occurrence.countState() == app.obey.api.CountState.Over) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant)
                occurrence.mood?.let { m ->
                    Text("Felt ${app.obey.ui.common.moodLabel(m).lowercase()}", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 4.dp))
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
            }
        }),
        trailingContent = {
          Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
            if (endTime && actions.onExcuse == null && actions.onApprove == null) {
                val owed = occurrence.diamondState() == DiamondState.Owed
                Text(
                    app.obey.ui.common.formatTime(occurrence.dueAt),
                    style = MaterialTheme.typography.bodyMedium,
                    color = if (owed) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (actions.onExcuse != null || actions.onConfirmMiss != null) {
                Row {
                    actions.onExcuse?.let { IconButton(onClick = it) { Icon(Icons.Outlined.RemoveCircleOutline, "Excuse: no penalty") } }
                    actions.onDropConsequence?.let { IconButton(onClick = it) { Icon(Icons.Outlined.RemoveDone, "Drop “${occurrence.missConsequence}”: it stays missed") } }
                    actions.onConfirmMiss?.let { TonalIconButton(onClick = it) { Icon(Icons.Outlined.Check, "Accept: it stays missed") } }
                }
            } else if (actions.onApprove != null || actions.onReject != null) {
                Row {
                    actions.onComments?.let { IconButton(onClick = it) { Icon(Icons.Outlined.AddComment, "Comment") } }
                    actions.onReject?.let { IconButton(onClick = it) { Icon(Icons.AutoMirrored.Outlined.Undo, "Send back") } }
                    actions.onApprove?.let { IconButton(onClick = it) { Icon(Icons.Outlined.TaskAlt, "Approve") } }
                }
            } else if (listOf(actions.onCompleteWithNote, actions.onReschedule, actions.onSkip, actions.onEditTask, actions.onComments, actions.onExcuseInMenu).any { it != null }) {
                Box {
                    IconButton(onClick = { menu = true }) { Icon(Icons.Outlined.MoreHoriz, "More") }
                    DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                        val missed = occurrence.status == OccurrenceStatus.Missed && actions.onExcuseInMenu != null
                        if (missed) actions.onExcuseInMenu?.let {
                            DropdownMenuItem(
                                text = { Text("Excuse") },
                                leadingIcon = { Icon(Icons.Outlined.RemoveCircleOutline, null) },
                                onClick = { menu = false; it() },
                            )
                        }
                        if (occurrence.status == OccurrenceStatus.Pending || missed) {
                            if (occurrence.status == OccurrenceStatus.Pending && occurrence.isOpen() && !occurrence.isRitual && !occurrence.isCounted && !occurrence.isPlaced) actions.onCompleteWithNote?.let {
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
                        if (occurrence.status == OccurrenceStatus.Pending) actions.onSkip?.let {
                            DropdownMenuItem(
                                text = { Text(occurrence.skipLabel(asks = actions.skipAsks)) },
                                leadingIcon = { Icon(Icons.Outlined.EventBusy, null) },
                                onClick = { menu = false; it() },
                            )
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
          }
        },
    )
}

/** Skip while it's still to come; Excuse once it's past due, since it already shows as owed (the API excuses it then). */
fun Occurrence.skipLabel(asks: Boolean): String {
    val word = if (app.obey.ui.common.parseInstant(dueAt).isAfter(java.time.Instant.now())) "Skip" else "Excuse"
    return if (asks) "Ask to ${word.lowercase()}" else word
}

/** How a task reads as a diamond: done, waiting on approval, owed (missed or overdue), excused, or still open. */
fun Occurrence.diamondState(now: java.time.Instant = java.time.Instant.now()): DiamondState = when (status) {
    OccurrenceStatus.Completed -> DiamondState.Done
    OccurrenceStatus.Submitted -> DiamondState.Waiting
    OccurrenceStatus.Missed -> DiamondState.Owed
    OccurrenceStatus.Excused -> DiamondState.Off
    else -> if (app.obey.ui.common.parseInstant(dueAt).isBefore(now)) DiamondState.Owed else DiamondState.Open
}
