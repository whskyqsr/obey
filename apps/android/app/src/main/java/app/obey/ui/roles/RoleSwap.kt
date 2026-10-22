package app.obey.ui.roles

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowForward
import androidx.compose.material.icons.outlined.SwapHoriz
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.material3.rememberTimePickerState
import android.widget.Toast
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.obey.api.Member
import app.obey.api.ObeyApi
import app.obey.api.Role
import app.obey.api.RoleSwap
import app.obey.api.RoleSwapInput
import app.obey.data.Session
import app.obey.data.SessionRepository
import app.obey.ui.common.BaseViewModel
import app.obey.ui.onboarding.label
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.time.temporal.TemporalAdjusters
import javax.inject.Inject

/** Asking for, answering and ending a role swap. Roles change, so the session reloads after each. */
@HiltViewModel
class RoleSwapViewModel @Inject constructor(private val api: ObeyApi, private val sessions: SessionRepository) : BaseViewModel() {
    // Success shows in the screen itself (the card or row changes), so only failures get a message.
    fun ask(endsAt: Instant?, pauseTasks: Boolean, onDone: () -> Unit) = action {
        api.askRoleSwap(sessions.requireRelationshipId(), RoleSwapInput(endsAt?.toString(), pauseTasks))
        sessions.refresh()
        onDone()
    }

    fun accept() = action {
        api.acceptRoleSwap(sessions.requireRelationshipId())
        sessions.refresh()
    }

    fun end(onDone: () -> Unit = {}) = action {
        api.endRoleSwap(sessions.requireRelationshipId())
        onDone()
        sessions.refresh()
    }
}

/** This view model's messages, as toasts: the swap controls sit on screens with their own snackbars. */
@Composable
private fun SwapMessages(vm: RoleSwapViewModel) {
    val message by vm.message.collectAsStateWithLifecycle()
    val context = LocalContext.current
    LaunchedEffect(message) {
        message?.let {
            Toast.makeText(context, it, Toast.LENGTH_SHORT).show()
            vm.messageShown()
        }
    }
}

/** Who the signed-in person would swap with: the one member in the opposite role. Switches already do both. */
fun swapPartner(session: Session): Member? {
    val want = when (session.myRole) {
        Role.Dominant -> Role.Submissive
        Role.Submissive -> Role.Dominant
        else -> return null
    }
    return session.relationship?.members?.filter { it.role == want }?.singleOrNull()
}

private fun Role.flipped() = if (this == Role.Dominant) Role.Submissive else Role.Dominant

private fun zoned(iso: String) = runCatching { Instant.parse(iso).atZone(ZoneId.systemDefault()) }.getOrNull()
private val timeFmt = DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT)

/** "Sun, Oct 26 at 8:00 PM" */
fun formatSwapEnd(iso: String): String = zoned(iso)?.let { "${it.format(DateTimeFormatter.ofPattern("EEE, MMM d"))} at ${it.format(timeFmt)}" } ?: iso
private fun shortEnd(iso: String) = zoned(iso)?.let { "${it.format(DateTimeFormatter.ofPattern("EEE"))} ${it.format(timeFmt)}" } ?: iso

/** On Today: a request to answer, a request you're waiting on, or the swap under way with the way out. */
@Composable
fun RoleSwapCard(session: Session, vm: RoleSwapViewModel = hiltViewModel()) {
    val swap = session.relationship?.roleSwap ?: return
    val me = session.userId
    if (session.readOnly || (swap.requestedBy != me && swap.partnerId != me)) return
    val busy by vm.busy.collectAsStateWithLifecycle()
    SwapMessages(vm)
    var ending by remember { mutableStateOf(false) }
    val other = if (swap.requestedBy == me) swap.partnerId else swap.requestedBy
    val otherName = session.nameOf(other)
    val mine = session.myRole
    val c = MaterialTheme.colorScheme

    if (!swap.active && swap.partnerId == me) {
        val until = swap.endsAt?.let { "until ${formatSwapEnd(it)}" } ?: "until one of you swaps back"
        val pauses = when {
            !swap.pauseTasks -> ""
            mine == Role.Submissive -> " Your tasks pause until then."
            else -> " $otherName's tasks pause until then."
        }
        Surface(color = c.secondaryContainer, contentColor = c.onSecondaryContainer, shape = RoundedCornerShape(24.dp), modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp)) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("$otherName asked to swap roles", style = MaterialTheme.typography.titleMedium)
                Text("You'd be the ${(mine ?: Role.Submissive).flipped().label} $until.$pauses", style = MaterialTheme.typography.bodyMedium)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = vm::accept, enabled = !busy) { Text("Accept") }
                    TextButton(onClick = { vm.end() }, enabled = !busy) { Text("Decline", color = c.onSecondaryContainer) }
                }
            }
        }
        return
    }

    val otherIsDom = session.relationship?.members?.firstOrNull { it.userId == other }?.role == Role.Dominant
    val line = when {
        !swap.active -> "Waiting for $otherName to accept your role swap"
        swap.endsAt != null -> "Roles swapped until ${shortEnd(swap.endsAt)}"
        else -> "Roles swapped until you swap back"
    }
    val sub = if (!swap.active) {
        swap.endsAt?.let { "Until ${formatSwapEnd(it)}" } ?: "Until one of you swaps back"
    } else {
        listOfNotNull(
            if (otherIsDom) "$otherName is the Dominant for now" else "You're the Dominant for now",
            if (!swap.pauseTasks) null else if (mine == Role.Dominant) "your own tasks are paused" else "$otherName's tasks are paused",
        ).joinToString(" · ")
    }
    Surface(color = c.tertiaryContainer, contentColor = c.onTertiaryContainer, shape = RoundedCornerShape(24.dp), modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp)) {
        Row(Modifier.padding(start = 16.dp, top = 12.dp, bottom = 12.dp, end = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Outlined.SwapHoriz, null)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(line, style = MaterialTheme.typography.titleSmall)
                Text(sub, style = MaterialTheme.typography.bodySmall)
            }
            TextButton(onClick = { ending = true }) { Text(if (swap.active) "End" else "Take back", color = c.onTertiaryContainer) }
        }
    }
    if (ending) EndSwapDialog(session, swap, onDismiss = { ending = false }, vm = vm, messages = false)
}

/** Ending a swap early, or taking back a request. */
@Composable
fun EndSwapDialog(session: Session, swap: RoleSwap, onDismiss: () -> Unit, vm: RoleSwapViewModel = hiltViewModel(), messages: Boolean = true) {
    val busy by vm.busy.collectAsStateWithLifecycle()
    if (messages) SwapMessages(vm)
    val other = session.nameOf(if (swap.requestedBy == session.userId) swap.partnerId else swap.requestedBy)
    val text = if (swap.active) {
        val back = if (session.myRole == Role.Submissive) "You go back to being the Dominant and $other the Submissive." else "$other goes back to being the Dominant and you the Submissive."
        "$back${if (swap.pauseTasks) " Paused tasks pick up again." else ""} $other gets a notification."
    } else {
        "$other won't be asked any more."
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (swap.active) "End the swap now?" else "Take back your request?") },
        text = { Text(text) },
        confirmButton = {
            TextButton(enabled = !busy, onClick = { vm.end(onDismiss) }) {
                Text(if (swap.active) "End swap" else "Take back")
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(if (swap.active) "Keep it" else "Keep asking") } },
    )
}

@Composable
private fun Becomes(m: Member, label: String) {
    val c = MaterialTheme.colorScheme
    Surface(color = c.surfaceContainerHighest, shape = RoundedCornerShape(16.dp), modifier = Modifier.fillMaxWidth()) {
        Row(Modifier.padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            Surface(color = c.primaryContainer, contentColor = c.onPrimaryContainer, shape = CircleShape, modifier = Modifier.size(40.dp)) {
                Row(horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) { Text(m.displayName.take(1).uppercase()) }
            }
            Spacer(Modifier.width(12.dp))
            Column {
                Text(label, style = MaterialTheme.typography.bodyLarge)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(m.role.label, style = MaterialTheme.typography.bodyMedium, color = c.onSurfaceVariant, textDecoration = TextDecoration.LineThrough)
                    Icon(Icons.AutoMirrored.Outlined.ArrowForward, null, Modifier.padding(horizontal = 4.dp).size(16.dp), tint = c.onSurfaceVariant)
                    Text(m.role.flipped().label, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
                }
            }
        }
    }
}

/** The coming Sunday at 8 PM. */
private fun defaultEnd(): LocalDateTime = LocalDateTime.now().toLocalDate().with(TemporalAdjusters.next(DayOfWeek.SUNDAY)).atTime(20, 0)

/** Asking to swap: who becomes what, for how long, and whether the submissive's tasks pause. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SwapSheet(session: Session, onDismiss: () -> Unit, vm: RoleSwapViewModel = hiltViewModel()) {
    val partner = swapPartner(session) ?: return
    val self = session.myMember ?: return
    val busy by vm.busy.collectAsStateWithLifecycle()
    SwapMessages(vm)
    var timed by remember { mutableStateOf(true) }
    var at by remember { mutableStateOf(defaultEnd()) }
    var pause by remember { mutableStateOf(true) }
    var picking by remember { mutableStateOf<String?>(null) }
    val subName = if (self.role == Role.Submissive) "your" else "${partner.displayName}'s"
    val endsAt = if (timed) at.atZone(ZoneId.systemDefault()).toInstant() else null
    val valid = endsAt == null || endsAt.isAfter(Instant.now())
    val c = MaterialTheme.colorScheme

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(Modifier.padding(horizontal = 24.dp).navigationBarsPadding().verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Text("Swap roles with ${partner.displayName}", style = MaterialTheme.typography.headlineSmall)
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Becomes(self, "${self.displayName} (you)")
                Becomes(partner, partner.displayName)
            }
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("For how long", style = MaterialTheme.typography.titleSmall)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(selected = timed, onClick = { timed = true }, label = { Text("Until a set time") })
                    FilterChip(selected = !timed, onClick = { timed = false }, label = { Text("Until we swap back") })
                }
            }
            if (timed) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { picking = "date" }, modifier = Modifier.weight(1f)) { Text(at.format(DateTimeFormatter.ofPattern("EEE, MMM d")), maxLines = 1) }
                    OutlinedButton(onClick = { picking = "time" }) { Text(at.format(timeFmt), maxLines = 1) }
                }
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("Pause $subName tasks meanwhile", style = MaterialTheme.typography.bodyLarge)
                    Text(
                        if (timed) "They pick up again when you swap back" else "They pick up again when either of you swaps back",
                        style = MaterialTheme.typography.bodyMedium,
                        color = c.onSurfaceVariant,
                    )
                }
                Switch(checked = pause, onCheckedChange = { pause = it })
            }
            Text(
                "${partner.displayName} has to accept first. Points, rules and history stay as they are, and either of you can end the swap at any time.",
                style = MaterialTheme.typography.bodySmall,
                color = c.onSurfaceVariant,
            )
            Row(Modifier.fillMaxWidth().padding(bottom = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End)) {
                TextButton(onClick = onDismiss) { Text("Cancel") }
                Button(enabled = !busy && valid, onClick = { vm.ask(endsAt, pause, onDismiss) }) { Text("Ask ${partner.displayName}") }
            }
        }
    }

    when (picking) {
        "date" -> {
            val state = rememberDatePickerState(initialSelectedDateMillis = at.toLocalDate().atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli())
            DatePickerDialog(
                onDismissRequest = { picking = null },
                confirmButton = {
                    TextButton(onClick = {
                        // DatePicker reports midnight UTC of the chosen day.
                        state.selectedDateMillis?.let { at = Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate().atTime(at.toLocalTime()) }
                        picking = null
                    }) { Text("OK") }
                },
                dismissButton = { TextButton(onClick = { picking = null }) { Text("Cancel") } },
            ) { DatePicker(state = state) }
        }
        "time" -> {
            val state = rememberTimePickerState(initialHour = at.hour, initialMinute = at.minute)
            AlertDialog(
                onDismissRequest = { picking = null },
                text = { TimePicker(state = state) },
                confirmButton = {
                    TextButton(onClick = {
                        at = at.toLocalDate().atTime(LocalTime.of(state.hour, state.minute))
                        picking = null
                    }) { Text("OK") }
                },
                dismissButton = { TextButton(onClick = { picking = null }) { Text("Cancel") } },
            )
        }
    }
}
