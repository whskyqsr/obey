package app.obey.ui

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
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
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

private val Yellow = Color(0xFFF6D57A)
private val OnYellow = Color(0xFF3A2E00)

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

/** Calling yellow or red, with an optional note. Calling again while one is open changes its level. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SafeWordSheet(vm: SafeCallViewModel, onDismiss: () -> Unit) {
    var note by rememberSaveable { mutableStateOf("") }
    val who = partnersOf(vm)
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(Modifier.padding(horizontal = 24.dp).padding(bottom = 32.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("Use your safe word", style = MaterialTheme.typography.headlineSmall)
            Text("$who is told straight away, even during quiet hours.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(4.dp))
            LevelButton(Icons.Filled.PanTool, "Yellow", "Slow down and check in with me", Yellow, OnYellow) { vm.call(SafeLevel.Yellow, note, onDismiss) }
            LevelButton(Icons.Filled.FrontHand, "Red", "Stop. Tasks that slip are excused until you clear it", MaterialTheme.colorScheme.error, MaterialTheme.colorScheme.onError) {
                vm.call(SafeLevel.Red, note, onDismiss)
            }
            OutlinedTextField(note, { note = it.take(500) }, Modifier.fillMaxWidth(), label = { Text("Add a note (optional)") }, minLines = 2)
        }
    }
}

@Composable
private fun LevelButton(icon: ImageVector, label: String, line: String, container: Color, content: Color, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(container).clickable(onClick = onClick).padding(horizontal = 20.dp, vertical = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(44.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.35f)), contentAlignment = Alignment.Center) { Icon(icon, null, tint = content) }
        Column {
            Text(label, style = MaterialTheme.typography.titleLarge, color = content)
            Text(line, style = MaterialTheme.typography.bodyMedium, color = content.copy(alpha = 0.9f))
        }
    }
}

/** Shown to everyone in the dynamic while a safe call is open; only whoever called it can clear it. */
@Composable
fun SafeCallBanner(vm: SafeCallViewModel, call: SafeCall, modifier: Modifier = Modifier) {
    val session = vm.session ?: return
    val mine = call.callerId == session.userId
    val red = call.level == SafeLevel.Red
    val caller = if (mine) "You" else session.relationship?.members?.firstOrNull { it.userId == call.callerId }?.displayName ?: "Your partner"
    val scheme = MaterialTheme.colorScheme
    val (container, content) = when {
        !red -> Yellow to OnYellow
        mine -> scheme.errorContainer to scheme.onErrorContainer
        else -> scheme.error to scheme.onError
    }
    val level = if (red) "red" else "yellow"
    Column(
        modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp).clip(RoundedCornerShape(20.dp)).background(container).padding(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 8.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Icon(if (red) Icons.Filled.FrontHand else Icons.Filled.PanTool, null, tint = content)
            Column {
                Text("$caller called $level at ${formatTime(call.createdAt)}", style = MaterialTheme.typography.titleMedium, color = content)
                if (call.note.isNotBlank()) Text("“${call.note}”", style = MaterialTheme.typography.bodyMedium, color = content)
                Text(
                    (if (mine) "${partnersOf(vm)} has been told. " else "") +
                        when {
                            red -> "Tasks that slip are excused until ${if (mine) "you clear" else "$caller clears"} it."
                            mine -> "Slow down and check in."
                            else -> "Slow down and check in. Only $caller can clear it."
                        },
                    style = MaterialTheme.typography.bodyMedium,
                    color = content.copy(alpha = 0.9f),
                )
            }
        }
        if (mine) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End)) {
                TextButton(onClick = { vm.call(if (red) SafeLevel.Yellow else SafeLevel.Red, "") }) { Text("Change to ${if (red) "yellow" else "red"}", color = content) }
                Button(
                    onClick = { vm.clear(call.id) },
                    colors = ButtonDefaults.buttonColors(containerColor = if (red) scheme.error else OnYellow, contentColor = if (red) scheme.onError else Yellow),
                ) { Text("I'm okay now") }
            }
        } else {
            Spacer(Modifier.height(8.dp))
        }
    }
}

/** Whether the person may call the safe word here: subs and switches, in a dynamic that hasn't ended. */
fun SafeCallViewModel.canCall(): Boolean {
    val s = session ?: return false
    val rel = s.relationship ?: return false
    return s.myRole != null && s.myRole != app.obey.api.Role.Dominant && !rel.ended
}
