package app.obey.ui.today

import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import android.widget.Toast
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import app.obey.ui.common.Eyebrow
import app.obey.ui.common.inkButtonColors
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
import app.obey.ui.common.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
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
 * The run view for a ritual (mockup 16): one step at a time on the whole screen, one button that ticks it and moves on,
 * and "Back a step" to untick the one before. When the last one is done, Finish completes it; a ritual that needs proof hands over to the
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

    val last = index == o.steps.lastIndex
    val previous = if (index > 0) o.steps[index - 1] else null
    val upNext = if (current != null) o.steps.getOrNull(index + 1) else null

    // Mockup 16: the whole screen, one step at a time.
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false)) {
        Surface(color = colors.surface, contentColor = colors.onSurface, modifier = Modifier.fillMaxSize()) {
            Column(Modifier.fillMaxSize().systemBarsPadding().padding(horizontal = 24.dp)) {
                Box(Modifier.fillMaxWidth().padding(top = 8.dp), contentAlignment = Alignment.Center) {
                    IconButton(onClick = onDismiss, modifier = Modifier.align(Alignment.CenterStart).offset(x = (-12).dp)) {
                        Icon(Icons.Outlined.Close, contentDescription = if (current != null) "Later" else "Close")
                    }
                    Text(
                        "${o.title} · ${if (current != null) "step ${index + 1} of ${o.steps.size}" else "done"}",
                        style = MaterialTheme.typography.bodyLarge,
                        color = colors.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.padding(horizontal = 48.dp),
                    )
                }
                Spacer(Modifier.height(16.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    o.steps.forEachIndexed { i, _ ->
                        Box(Modifier.weight(1f).height(3.dp).background(if (i <= index) colors.onSurface else colors.outlineVariant))
                    }
                }
                Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(top = 96.dp, bottom = 24.dp)) {
                    if (current != null) {
                        Eyebrow("Step ${stepWord(index + 1)}")
                        Spacer(Modifier.height(12.dp))
                        Text(current.title, style = MaterialTheme.typography.displaySmall)
                    } else {
                        Eyebrow(o.stepProgress)
                        Spacer(Modifier.height(12.dp))
                        Text("Every step done.", style = MaterialTheme.typography.displaySmall)
                    }
                    if (!ready) {
                        Spacer(Modifier.height(16.dp))
                        Text("This one ${o.opensLabel()}.", style = MaterialTheme.typography.bodyLarge, color = colors.onSurfaceVariant)
                    }
                }
                if (current != null) {
                    Button(
                        onClick = { vm.tick(o, current.id, true) },
                        enabled = ready,
                        colors = inkButtonColors(),
                        shape = MaterialTheme.shapes.small,
                        modifier = Modifier.fillMaxWidth().height(52.dp),
                    ) { Text(if (last) "Done" else "Done, next") }
                } else {
                    Button(
                        onClick = { if (o.needsDoneDialog && onNeedsProof != null) onNeedsProof(o) else vm.finish(o) },
                        enabled = !busy,
                        colors = inkButtonColors(),
                        shape = MaterialTheme.shapes.small,
                        modifier = Modifier.fillMaxWidth().height(52.dp),
                    ) { Text("Finish") }
                }
                Row(Modifier.fillMaxWidth().height(48.dp).padding(bottom = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                    if (previous != null) {
                        TextButton(onClick = { vm.tick(o, previous.id, false) }, modifier = Modifier.offset(x = (-12).dp)) {
                            Text("‹ Back a step", style = MaterialTheme.typography.bodyLarge, color = colors.onSurfaceVariant)
                        }
                    }
                    Spacer(Modifier.weight(1f))
                    if (upNext != null) {
                        Text(
                            "Next: ${upNext.title}",
                            style = MaterialTheme.typography.bodyLarge,
                            color = colors.onSurfaceVariant,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.padding(start = 16.dp),
                        )
                    }
                }
            }
        }
    }
}

private val WORDS = listOf("one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve")
/** "two" for 2, "13" past twelve. */
private fun stepWord(n: Int) = WORDS.getOrNull(n - 1) ?: n.toString()

/** A ritual's steps as a read-only checklist, under its row. */
@Composable
fun StepList(o: Occurrence, modifier: Modifier = Modifier) {
    val colors = MaterialTheme.colorScheme
    Column(modifier, verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(o.stepProgress, style = MaterialTheme.typography.labelLarge, color = colors.onSurfaceVariant)
        o.steps.forEachIndexed { i, s ->
            val on = s.id in o.stepsDone
            Row(verticalAlignment = Alignment.CenterVertically) {
                app.obey.ui.common.Diamond(if (on) app.obey.ui.common.DiamondState.Done else app.obey.ui.common.DiamondState.Open, Modifier.padding(horizontal = 3.dp), size = 12.dp)
                Spacer(Modifier.width(8.dp))
                Text(
                    "${i + 1}. ${s.title}",
                    style = MaterialTheme.typography.bodyMedium,
                    color = if (on) colors.onSurfaceVariant else colors.onSurface,
                )
            }
        }
    }
}
