package app.obey.ui

import androidx.compose.foundation.border
import androidx.compose.material.icons.outlined.FrontHand
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.FrontHand
import androidx.compose.material.icons.filled.PanTool
import app.obey.ui.common.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import app.obey.ui.common.LettersField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewModelScope
import app.obey.api.ObeyApi
import app.obey.api.SafeCall
import app.obey.api.SafeCallInput
import app.obey.api.SafeLevel
import app.obey.data.SessionRepository
import app.obey.ui.common.BaseViewModel
import app.obey.ui.common.formatTime
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

// Safe call keeps its own yellow and red (allowlisted in the design check): they have to read as yellow and red.
private val Yellow = Color(0xFFD9A13B)
private val OnYellow = Color(0xFF2B2108)

/** The dynamic's open safe call, checked often so a partner sees one soon even without a push. */
@HiltViewModel
class SafeCallViewModel @Inject constructor(private val api: ObeyApi, private val sessions: SessionRepository) : BaseViewModel() {
    val session get() = sessions.session
    private val _active = MutableStateFlow<SafeCall?>(null)
    val active: StateFlow<SafeCall?> = _active.asStateFlow()

    init {
        viewModelScope.launch {
            while (isActive) {
                refresh()
                delay(20_000)
            }
        }
    }

    private suspend fun refresh() {
        runCatching { api.safeCalls(sessions.requireRelationshipId()) }.onSuccess { _active.value = it.active }
    }

    fun call(level: SafeLevel, note: String, onDone: () -> Unit = {}) = action {
        _active.value = api.callSafeWord(sessions.requireRelationshipId(), SafeCallInput(level, note.trim()))
        onDone()
    }

    fun clear(id: String) = action {
        api.clearSafeCall(id)
        _active.value = null
    }
}

private fun partnersOf(vm: SafeCallViewModel): String {
    val s = vm.session ?: return "Your partner"
    return s.relationship?.members?.filter { it.userId != s.userId }?.joinToString(" and ") { it.displayName }?.ifEmpty { null } ?: "Your partner"
}

/** Calling yellow or red, with an optional note (mockup 20). Calling again while one is open changes its level. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SafeWordSheet(vm: SafeCallViewModel, onDismiss: () -> Unit) {
    var note by rememberSaveable { mutableStateOf("") }
    val who = partnersOf(vm)
    val c = MaterialTheme.colorScheme
    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = c.surface) {
        Column(Modifier.padding(horizontal = 24.dp).padding(bottom = 32.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("Safe call", style = MaterialTheme.typography.displaySmall)
            Text("$who is told straight away, even during quiet hours. Only you can clear it.", style = MaterialTheme.typography.bodyLarge, color = c.onSurfaceVariant)
            Spacer(Modifier.height(4.dp))
            LevelButton("Yellow", "Slow down and check in with me.", Yellow) { vm.call(SafeLevel.Yellow, note, onDismiss) }
            LevelButton("Red", "Stop. Anything that slips while it's open is excused.", c.error) { vm.call(SafeLevel.Red, note, onDismiss) }
            Spacer(Modifier.height(4.dp))
            LettersField(note, { note = it.take(500) }, Modifier.fillMaxWidth(), label = { Text("A note for $who (optional)") }, minLines = 2)
        }
    }
}

/** An outlined card in the level's colour, with its dot. */
@Composable
private fun LevelButton(label: String, line: String, color: Color, onClick: () -> Unit) {
    val c = MaterialTheme.colorScheme
    val shape = RoundedCornerShape(8.dp)
    Row(
        Modifier.fillMaxWidth().clip(shape).border(1.dp, color, shape).background(c.surfaceContainerLowest).clickable(onClick = onClick).padding(horizontal = 20.dp, vertical = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(14.dp).clip(CircleShape).background(color))
        Column {
            Text(label, style = MaterialTheme.typography.headlineSmall, color = c.onSurface)
            Text(line, style = MaterialTheme.typography.bodyLarge, color = c.onSurfaceVariant)
        }
    }
}

/** Shown to everyone in the dynamic while a safe call is open, as a band across the top (mockups 42, 43); only whoever called it can clear it. */
@Composable
fun SafeCallBanner(vm: SafeCallViewModel, call: SafeCall, modifier: Modifier = Modifier) {
    val session = vm.session ?: return
    val mine = call.callerId == session.userId
    val red = call.level == SafeLevel.Red
    val caller = session.relationship?.members?.firstOrNull { it.userId == call.callerId }?.displayName ?: "Your partner"
    val scheme = MaterialTheme.colorScheme
    val (container, content) = if (red) scheme.error to scheme.onError else Yellow to OnYellow
    val level = if (red) "red" else "yellow"
    val told = partnersOf(vm)
    Column(
        modifier.fillMaxWidth().background(container).padding(horizontal = 16.dp, vertical = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Icon(Icons.Outlined.FrontHand, null, tint = content)
            Column {
                Text(
                    if (mine) "${level.replaceFirstChar { it.uppercase() }} · you called it at ${formatTime(call.createdAt)}" else "$caller called $level · ${formatTime(call.createdAt)}",
                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold),
                    color = content,
                )
                Text(
                    if (mine) "${if (red) "Everything is paused" else "Slow down and check in"}. $told has been told."
                    else "${if (red) "Stop" else "Slow down"} and check in. Only $caller can clear it.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = content,
                )
            }
        }
        if (call.note.isNotBlank()) Text("“${call.note}”", style = MaterialTheme.typography.headlineSmall.copy(fontStyle = androidx.compose.ui.text.font.FontStyle.Italic), color = content)
        if (mine) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                androidx.compose.material3.OutlinedButton(
                    onClick = { vm.call(if (red) SafeLevel.Yellow else SafeLevel.Red, "") },
                    modifier = Modifier.weight(1f).height(44.dp),
                    shape = MaterialTheme.shapes.small,
                    border = androidx.compose.foundation.BorderStroke(1.dp, content),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = content),
                ) { Text("Change to ${if (red) "yellow" else "red"}") }
                Button(
                    onClick = { vm.clear(call.id) },
                    modifier = Modifier.weight(1f).height(44.dp),
                    shape = MaterialTheme.shapes.small,
                    colors = ButtonDefaults.buttonColors(containerColor = scheme.surfaceContainerLowest, contentColor = if (red) scheme.error else scheme.onSurface),
                ) { Text("I'm okay now") }
            }
        }
    }
}

/** Whether the person may call the safe word here: subs and switches, and both people while roles are swapped, in a dynamic that hasn't ended and has someone else to tell. */
fun SafeCallViewModel.canCall(): Boolean {
    val s = session ?: return false
    val rel = s.relationship ?: return false
    val swapped = rel.roleSwap?.status == "active"
    return s.myRole != null && (s.myRole != app.obey.api.Role.Dominant || swapped) && !rel.ended && !s.solo
}
