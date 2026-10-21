package app.obey.ui.today

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.RadioButtonUnchecked
import androidx.compose.material.icons.outlined.TaskAlt
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import app.obey.api.CompleteOccurrenceInput
import app.obey.api.ObeyApi
import app.obey.api.Occurrence
import app.obey.api.OccurrenceStatus
import app.obey.api.TaskStep
import app.obey.api.TickStepInput
import app.obey.ui.common.BaseViewModel
import app.obey.ui.common.formatDateTime
import app.obey.ui.common.formatTime
import app.obey.ui.common.parseInstant
import app.obey.api.userMessage
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

@HiltViewModel
class RitualViewModel @Inject constructor(private val api: ObeyApi) : BaseViewModel() {
    private val _done = MutableStateFlow<Set<String>>(emptySet())
    /** Ticked step ids; shown at once, with the server catching up behind. */
    val done: StateFlow<Set<String>> = _done.asStateFlow()
    private val _finished = MutableStateFlow<String?>(null)
    /** "Done" or "Sent for approval" once the ritual is finished. */
    val finished: StateFlow<String?> = _finished.asStateFlow()
    private var loadedFor: String? = null

    fun load(o: Occurrence) {
        if (loadedFor == o.id) return
        loadedFor = o.id
        _done.value = o.stepsDone.toSet()
    }

    fun tick(o: Occurrence, stepId: String, on: Boolean) {
        val before = _done.value
        _done.value = if (on) before + stepId else before - stepId
        viewModelScope.launch {
            runCatching { api.tickStep(o.id, TickStepInput(stepId, on)) }.onFailure {
                _done.value = before
                say(it.userMessage())
            }
        }
    }

    fun finish(o: Occurrence) = action {
        val r = api.complete(o.id, CompleteOccurrenceInput())
        _finished.value = if (r.status == OccurrenceStatus.Submitted) "Sent for approval" else "Done: ${o.title}"
    }
}

/** "opens Thu" or "opens 8:30 PM", for a task that isn't open yet. */
fun Occurrence.opensLabel(): String {
    val today = java.time.LocalDate.now()
    opensOn?.let { if (java.time.LocalDate.parse(it).isAfter(today)) return "opens " + java.time.LocalDate.parse(it).dayOfWeek.getDisplayName(java.time.format.TextStyle.SHORT, java.util.Locale.getDefault()) }
    val at = opensAt ?: return "opens later"
    val day = parseInstant(at).atZone(java.time.ZoneId.systemDefault()).toLocalDate()
    return if (day == today) "opens ${formatTime(at)}" else "opens ${formatDateTime(at)}"
}

/**
 * The run view for a ritual: the next step large, the whole list under it, and one button that ticks the current
 * step and moves on. When the last one is done, Finish completes it; a ritual that needs proof hands over to the
 * caller's Done sheet through [onNeedsProof] instead.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RitualSheet(o: Occurrence, onDismiss: () -> Unit, onNeedsProof: ((Occurrence) -> Unit)? = null, vm: RitualViewModel = hiltViewModel(key = "ritual-${o.id}")) {
    LaunchedEffect(o.id) { vm.load(o) }
    val done by vm.done.collectAsStateWithLifecycle()
    val finished by vm.finished.collectAsStateWithLifecycle()
    val message by vm.message.collectAsStateWithLifecycle()
    val busy by vm.busy.collectAsStateWithLifecycle()
    val context = LocalContext.current
    LaunchedEffect(message) { message?.let { Toast.makeText(context, it, Toast.LENGTH_SHORT).show(); vm.messageShown() } }
    LaunchedEffect(finished) { finished?.let { Toast.makeText(context, it, Toast.LENGTH_SHORT).show(); onDismiss() } }
    val colors = MaterialTheme.colorScheme
    val current: TaskStep? = o.steps.firstOrNull { it.id !in done }
    val index = current?.let { o.steps.indexOf(it) } ?: o.steps.size
    val ready = o.isOpen()

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(Modifier.padding(horizontal = 24.dp).navigationBarsPadding().verticalScroll(rememberScrollState())) {
            Text(o.title, style = MaterialTheme.typography.headlineSmall)
            Spacer(Modifier.height(16.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Row(Modifier.weight(1f), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    o.steps.forEach { s ->
                        Box(Modifier.weight(1f).height(4.dp).background(if (s.id in done) colors.primary else colors.surfaceContainerHighest, CircleShape))
                    }
                }
                Spacer(Modifier.width(12.dp))
                Text("${minOf(index + 1, o.steps.size)} of ${o.steps.size}", style = MaterialTheme.typography.labelMedium, color = colors.onSurfaceVariant)
            }
            Spacer(Modifier.height(16.dp))
            if (!ready) {
                Text("This one ${o.opensLabel()}.", style = MaterialTheme.typography.bodyMedium, color = colors.onSurfaceVariant)
                Spacer(Modifier.height(12.dp))
            }
            Surface(color = colors.primaryContainer, contentColor = colors.onPrimaryContainer, shape = MaterialTheme.shapes.large, modifier = Modifier.fillMaxWidth()) {
                if (current != null) {
                    Column(Modifier.padding(horizontal = 20.dp, vertical = 24.dp)) {
                        Text("Step ${index + 1}", style = MaterialTheme.typography.labelLarge)
                        Text(current.title, style = MaterialTheme.typography.headlineSmall)
                    }
                } else {
                    Row(Modifier.padding(horizontal = 20.dp, vertical = 24.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Filled.CheckCircle, null, Modifier.size(32.dp))
                        Spacer(Modifier.width(12.dp))
                        Text("Every step done", style = MaterialTheme.typography.titleLarge)
                    }
                }
            }
            Spacer(Modifier.height(12.dp))
            o.steps.forEachIndexed { i, s ->
                val on = s.id in done
                Row(
                    Modifier
                        .fillMaxWidth()
                        .background(if (s == current) colors.surfaceContainer else androidx.compose.ui.graphics.Color.Transparent, MaterialTheme.shapes.medium)
                        .clickable(enabled = ready) { vm.tick(o, s.id, !on) }
                        .padding(horizontal = 8.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        if (on) Icons.Filled.CheckCircle else Icons.Outlined.RadioButtonUnchecked,
                        if (on) "Done" else "Not done",
                        tint = if (on) colors.primary else colors.outline,
                    )
                    Spacer(Modifier.width(12.dp))
                    Text(
                        "${i + 1}. ${s.title}",
                        style = MaterialTheme.typography.bodyLarge,
                        color = if (on) colors.onSurfaceVariant else colors.onSurface,
                        textDecoration = if (on) TextDecoration.LineThrough else null,
                    )
                }
            }
            Row(Modifier.fillMaxWidth().padding(vertical = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End)) {
                TextButton(onClick = onDismiss) { Text(if (current != null) "Later" else "Close") }
                if (current != null) {
                    Button(onClick = { vm.tick(o, current.id, true) }, enabled = ready) {
                        Icon(Icons.Outlined.Check, null)
                        Text(if (index == o.steps.lastIndex) "  Done" else "  Done, next")
                    }
                } else {
                    Button(
                        onClick = { if (o.needsDoneDialog && onNeedsProof != null) onNeedsProof(o) else vm.finish(o) },
                        enabled = !busy,
                    ) {
                        Icon(Icons.Outlined.TaskAlt, null)
                        Text("  Finish")
                    }
                }
            }
        }
    }
}

/** A ritual's steps as a read-only checklist, under its row. */
@Composable
fun StepList(o: Occurrence, modifier: Modifier = Modifier) {
    val colors = MaterialTheme.colorScheme
    Column(modifier, verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(o.stepProgress, style = MaterialTheme.typography.labelLarge, color = colors.onSurfaceVariant)
        o.steps.forEachIndexed { i, s ->
            val on = s.id in o.stepsDone
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(if (on) Icons.Filled.CheckCircle else Icons.Outlined.RadioButtonUnchecked, null, Modifier.size(18.dp), tint = if (on) colors.primary else colors.outline)
                Spacer(Modifier.width(8.dp))
                Text(
                    "${i + 1}. ${s.title}",
                    style = MaterialTheme.typography.bodyMedium,
                    color = if (on) colors.onSurfaceVariant else colors.onSurface,
                    textDecoration = if (on) TextDecoration.LineThrough else null,
                )
            }
        }
    }
}
