package app.obey.ui.today

import android.content.Context
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import app.obey.api.Role
import app.obey.api.SoloSetup
import app.obey.data.Session

private fun plural(n: Int, one: String) = "$n ${if (n == 1) one else "${one}s"}"

/** "3 tasks, 4 rules and 2 rewards": what was set up, leaving out what wasn't. */
fun SoloSetup.list(): String {
    val parts = listOfNotNull(
        tasks.takeIf { it > 0 }?.let { plural(it, "task") },
        rules.takeIf { it > 0 }?.let { plural(it, "rule") },
        rewards.takeIf { it > 0 }?.let { plural(it, "reward") },
        consequences.takeIf { it > 0 }?.let { plural(it, "consequence") },
    )
    return if (parts.size > 1) parts.dropLast(1).joinToString(", ") + " and " + parts.last() else parts.firstOrNull().orEmpty()
}

/** A card hidden once its button is tapped, remembered on this device. */
@Composable
private fun rememberDismissed(key: String): Pair<Boolean, () -> Unit> {
    val prefs = LocalContext.current.getSharedPreferences("cards", Context.MODE_PRIVATE)
    var gone by remember(key) { mutableStateOf(prefs.getBoolean(key, false)) }
    return gone to { prefs.edit().putBoolean(key, true).apply(); gone = true }
}

@Composable
private fun TodayCard(title: String, body: String, actions: @Composable () -> Unit) {
    val c = MaterialTheme.colorScheme
    Surface(color = c.secondaryContainer, contentColor = c.onSecondaryContainer, shape = RoundedCornerShape(24.dp), modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium)
            Text(body, style = MaterialTheme.typography.bodyMedium)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { actions() }
        }
    }
}

/**
 * Today's cards around solo mode: a nudge to invite someone while you're on your own, and once a Dominant joins
 * someone who set things up alone, one card each saying who manages it all now.
 */
@Composable
fun SoloCards(session: Session, onInvite: () -> Unit, onLookThrough: () -> Unit) {
    val rel = session.relationship ?: return
    val c = MaterialTheme.colorScheme
    val (inviteGone, hideInvite) = rememberDismissed("solo-invite-${rel.id}")
    val (setupGone, hideSetup) = rememberDismissed("solo-setup-${rel.id}")
    if (session.solo) {
        if (inviteGone) return
        TodayCard(
            "You're using Fealty on your own",
            "Set your own tasks, rules and rewards. Invite a partner whenever you're ready, and everything you've set up comes with you.",
        ) {
            Button(onClick = onInvite) { Text("Invite a partner") }
            TextButton(onClick = hideInvite) { Text("Not now", color = c.onSecondaryContainer) }
        }
        return
    }
    val s = rel.soloSetup ?: return
    val setter = rel.members.firstOrNull { it.userId == s.setById }
    val joiner = rel.members.firstOrNull { it.userId == s.joinerId }
    if (setupGone || setter?.role != Role.Submissive || joiner == null || joiner.role == Role.Submissive) return
    if (session.userId == joiner.userId) {
        val one = s.tasks + s.rules + s.rewards + s.consequences == 1
        TodayCard(
            "${setter.displayName} set things up on their own",
            "${s.list()}. " + if (one) "It's yours to manage now: keep it, change it or clear it out." else "They're yours to manage now: keep them, change them or clear them out.",
        ) {
            Button(onClick = { hideSetup(); onLookThrough() }) { Text("Look through them") }
            TextButton(onClick = hideSetup) { Text("Got it", color = c.onSecondaryContainer) }
        }
    } else {
        val name = joiner.displayName
        TodayCard(
            "$name joined as your ${if (joiner.role == Role.Switch) "Switch" else "Dominant"}",
            "$name now sets your tasks, rules and rewards. Everything you set up stays as it was until $name changes it.",
        ) {
            TextButton(onClick = hideSetup) { Text("Got it", color = c.onSecondaryContainer) }
        }
    }
}
