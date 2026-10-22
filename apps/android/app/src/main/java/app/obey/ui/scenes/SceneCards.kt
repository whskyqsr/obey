package app.obey.ui.scenes

import androidx.compose.foundation.layout.Arrangement
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
fun SceneCards(data: TodayScenes, session: Session, busy: Boolean, onAftercareDone: (Scene) -> Unit, onCheck: (Scene, Int, String) -> Unit) {
    val me = session.userId
    val fresh = freshScene(data.scenes)
    val theirs = data.plans.filter { it.userId != me && (it.needs.isNotEmpty() || it.note.isNotBlank()) }
    val check = sceneToCheck(data.scenes, me)
    val everyone = if (session.relationship?.members?.size == 2) "both of you" else "everyone in your dynamic"
    if ((fresh == null || theirs.isEmpty()) && check == null) return
    val c = MaterialTheme.colorScheme
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        if (fresh != null && theirs.isNotEmpty()) {
            Surface(color = c.tertiaryContainer, contentColor = c.onTertiaryContainer, shape = RoundedCornerShape(24.dp), modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    theirs.forEach { p ->
                        Text("Aftercare for ${session.nameOf(p.userId)}", style = MaterialTheme.typography.titleMedium)
                        Tags(p.needs, color = c.onTertiaryContainer)
                        if (p.note.isNotBlank()) Text(p.note, style = MaterialTheme.typography.bodyMedium)
                    }
                    Button(
                        onClick = { onAftercareDone(fresh) },
                        enabled = !busy,
                        colors = ButtonDefaults.buttonColors(containerColor = c.onTertiaryContainer, contentColor = c.tertiaryContainer),
                        modifier = Modifier.padding(top = 4.dp),
                    ) { Text("Done") }
                }
            }
        }
        if (check != null) {
            Surface(color = c.surfaceContainerHigh, shape = RoundedCornerShape(24.dp), modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Column {
                        Text("How are you feeling after ${whenWas(check)}?", style = MaterialTheme.typography.titleMedium)
                        Text(
                            "Saved with ${if (check.title.isNotBlank()) "“${check.title}”" else "the scene"}, for $everyone to see.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = c.onSurfaceVariant,
                        )
                    }
                    // Keyed by scene, so an answer doesn't carry over to the next one.
                    key(check.id) { SceneCheckIn(busy) { mood, note -> onCheck(check, mood, note) } }
                }
            }
        }
    }
}
