package app.obey.ui.scenes

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.material3.TextButton
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.clip
import app.obey.ui.common.Eyebrow
import app.obey.ui.common.inkButtonColors
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.key
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.obey.api.AftercarePlan
import app.obey.api.Scene
import app.obey.data.Session
import app.obey.ui.common.parseInstant
import java.time.Duration
import java.time.Instant
import java.time.ZoneId

/** Today's scenes and everyone's aftercare plans, while scenes are on and the dynamic isn't read-only. */
data class TodayScenes(val scenes: List<Scene>, val plans: List<AftercarePlan>)

private val DAY = Duration.ofDays(1)

/** "last night" for an evening scene, "yesterday" otherwise, as the server words the push. */
private fun whenWas(s: Scene): String {
    val zone = runCatching { ZoneId.of(s.timezone) }.getOrDefault(ZoneId.systemDefault())
    val hour = parseInstant(s.occurredAt).atZone(zone).hour
    return if (hour >= 17 || hour < 4) "last night" else "yesterday"
}

/** The newest scene logged in the last day whose aftercare I haven't closed. */
fun freshScene(scenes: List<Scene>, now: Instant = Instant.now()): Scene? =
    scenes.firstOrNull { Duration.between(parseInstant(it.createdAt), now) < DAY && !it.aftercareDone }

/** The newest scene whose next-day check-in opened in the last three days and that I haven't answered. */
fun sceneToCheck(scenes: List<Scene>, me: String, now: Instant = Instant.now()): Scene? = scenes.firstOrNull { s ->
    val from = parseInstant(s.checkFrom)
    !now.isBefore(from) && now.isBefore(from.plus(DAY.multipliedBy(3))) && s.checks.none { it.userId == me }
}

/**
 * On Today, right after a scene: the others' aftercare plans until closed (for a day), and the next morning the check-in
 * until answered (for three days). Only the latest scene of each shows.
 */
@Composable
fun SceneCards(data: TodayScenes, session: Session, busy: Boolean, onAftercareDone: (Scene) -> Unit, onOpen: (String) -> Unit, onCheck: (Scene, Int, String) -> Unit) {
    val me = session.userId
    val fresh = freshScene(data.scenes)
    val theirs = data.plans.filter { it.userId != me && (it.needs.isNotEmpty() || it.note.isNotBlank()) }
    val check = sceneToCheck(data.scenes, me)
    if ((fresh == null || theirs.isEmpty()) && check == null) return
    val c = MaterialTheme.colorScheme
    val box = MaterialTheme.shapes.medium
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        if (fresh != null && theirs.isNotEmpty()) {
            Column(
                Modifier.fillMaxWidth().clip(box).background(c.surfaceContainerLowest).border(1.dp, c.primary, box).padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                theirs.forEach { p ->
                    val name = session.nameOf(p.userId)
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Eyebrow("$name's aftercare plan", color = c.primary)
                        Text("$name likes: " + listOf(p.needs.joinToString(", "), p.note).filter { it.isNotBlank() }.joinToString(". "), style = MaterialTheme.typography.bodyLarge)
                    }
                }
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Button(onClick = { onAftercareDone(fresh) }, enabled = !busy, colors = inkButtonColors(), shape = MaterialTheme.shapes.small) { Text("Done") }
                    Spacer(Modifier.weight(1f))
                    TextButton(onClick = { onOpen(fresh.id) }) { Text("Open the scene", color = c.primary) }
                }
            }
        }
        if (check != null) {
            Column(
                Modifier.fillMaxWidth().clip(box).background(c.surfaceContainerLowest).border(1.dp, c.outlineVariant, box).padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                Text("How are you feeling after ${whenWas(check)}?", style = MaterialTheme.typography.headlineSmall)
                // Keyed by scene, so an answer doesn't carry over to the next one.
                key(check.id) { SceneCheckIn(busy) { mood, note -> onCheck(check, mood, note) } }
            }
        }
    }
}
