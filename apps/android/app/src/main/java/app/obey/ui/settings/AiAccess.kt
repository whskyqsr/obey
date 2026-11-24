package app.obey.ui.settings

import android.content.Context
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import app.obey.BuildConfig
import app.obey.api.AiAccess
import app.obey.api.AiAccessInput
import app.obey.api.ObeyApi
import app.obey.api.Relationship
import app.obey.data.Session
import app.obey.data.SessionRepository
import app.obey.ui.common.BaseViewModel
import app.obey.ui.common.Button
import app.obey.ui.common.SectionHeader
import app.obey.ui.common.Switch
import app.obey.ui.common.ago
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

val MCP_URL: String = BuildConfig.API_BASE_URL.trimEnd('/') + "/mcp"

/** What a call did, in the words of the history list: "added a plan". Mirrors the web's list. */
private val DID = mapOf(
    "list_dynamics" to "looked up your dynamics",
    "get_tasks_due" to "read tasks due",
    "list_tasks" to "read the tasks",
    "get_pending" to "read what's waiting",
    "get_calendar" to "read the calendar",
    "list_rules" to "read the rules",
    "list_protocols" to "read the protocols",
    "list_rewards" to "read the rewards",
    "list_consequences" to "read the consequences",
    "get_rule_log" to "read broken rules",
    "get_balances" to "read points",
    "get_agreement" to "read the agreement",
    "get_limits" to "read limits",
    "list_notes" to "read notes",
    "get_stats" to "read stats",
    "get_moods" to "read moods",
    "get_month" to "read the monthly review",
    "request_more_time" to "asked for more time",
    "request_more_time_today" to "asked for more time",
    "decide_request" to "answered a request",
    "review_task" to "reviewed a task",
    "add_plan" to "added a plan",
    "edit_plan" to "changed a plan",
    "delete_plan" to "deleted a plan",
    "add_note" to "wrote a note",
    "edit_note" to "changed a note",
    "delete_note" to "deleted a note",
    "create_task" to "added a task",
    "edit_task" to "changed a task",
    "delete_task" to "deleted a task",
    "add_rule" to "added a rule",
    "edit_rule" to "changed a rule",
    "delete_rule" to "deleted a rule",
    "add_protocol" to "added a protocol",
    "edit_protocol" to "changed a protocol",
    "delete_protocol" to "deleted a protocol",
    "log_broken_rule" to "logged a broken rule",
)
fun didWords(tool: String) = DID[tool] ?: tool.replace('_', ' ')

/** "Waiting on Kitten", "On", "Off": the AI access row's state on Your dynamic. */
fun aiAccessState(rel: Relationship, myId: String): String {
    val me = rel.members.firstOrNull { it.userId == myId }
    if (me?.aiAccess != true) return "Off"
    val waiting = rel.members.filter { !it.aiAccess }
    return if (waiting.isEmpty()) "On" else "Waiting on ${waiting.joinToString(", ") { it.displayName }}"
}

@HiltViewModel
class AiAccessViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val api: ObeyApi,
    private val sessions: SessionRepository,
) : BaseViewModel() {
    private val _data = MutableStateFlow<AiAccess?>(null)
    val data: StateFlow<AiAccess?> = _data.asStateFlow()

    fun load() {
        viewModelScope.launch { runCatching { _data.value = api.aiAccess(sessions.requireRelationshipId()) } }
    }

    fun setAllowed(on: Boolean) = action {
        api.setAiAccess(sessions.requireRelationshipId(), AiAccessInput(on))
        _data.value = api.aiAccess(sessions.requireRelationshipId())
        sessions.refresh()
        if (on) say("AI access allowed")
    }

    fun disconnect(id: String, name: String) = action {
        api.disconnectAiApp(id)
        _data.value = api.aiAccess(sessions.requireRelationshipId())
        say("$name disconnected")
    }

    private fun prefs() = context.getSharedPreferences("ai_access", Context.MODE_PRIVATE)
    fun askDismissed(rel: String) = prefs().getBoolean("dismissed.$rel", false)
    fun dismissAsk(rel: String) = prefs().edit().putBoolean("dismissed.$rel", true).apply()
}

/** An AI app's mark. Every app gets the plain sparkle for now; real marks for known apps come from their brand kits. */
@Composable
fun AppMark(size: Dp = 40.dp) {
    val c = MaterialTheme.colorScheme
    Box(Modifier.size(size).clip(RoundedCornerShape(size * 0.22f)).background(c.surfaceContainerHigh), contentAlignment = Alignment.Center) {
        Icon(Icons.Outlined.AutoAwesome, null, Modifier.size(size * 0.55f), tint = c.onSurface)
    }
}

private val timeFmt = DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT)
private fun whenText(iso: String): String {
    val t = runCatching { Instant.parse(iso).atZone(ZoneId.systemDefault()) }.getOrNull() ?: return ""
    return if (t.toLocalDate() == LocalDate.now()) t.format(timeFmt) else t.format(DateTimeFormatter.ofPattern("EEE, MMM d"))
}

@Composable
private fun Hair() = HorizontalDivider(Modifier.padding(horizontal = 16.dp), color = MaterialTheme.colorScheme.outlineVariant)

/** AI access for this dynamic: your switch, everyone else's, the connected apps, the address, and the last 30 days of calls. */
@Composable
fun AiAccessPage(s: Session, rel: Relationship, vm: AiAccessViewModel = hiltViewModel()) {
    LaunchedEffect(rel.id) { vm.load() }
    val data by vm.data.collectAsStateWithLifecycle()
    val busy by vm.busy.collectAsStateWithLifecycle()
    Messages(vm)
    val c = MaterialTheme.colorScheme
    val clipboard = LocalClipboardManager.current
    val context = LocalContext.current
    val mine = data?.members?.firstOrNull { it.userId == s.userId }?.allowed ?: (s.myMember?.aiAccess == true)
    val others = rel.members.filter { it.userId != s.userId }
    fun who(id: String) = if (id == s.userId) s.me.user.displayName else s.nameOf(id)
    val muted = MaterialTheme.typography.bodyMedium

    Column(Modifier.widthIn(max = 720.dp).fillMaxWidth().verticalScroll(rememberScrollState())) {
        ListItem(
            headlineContent = { Text("Allow for me") },
            trailingContent = { Switch(checked = mine, enabled = !busy && (!rel.ended || mine), onCheckedChange = vm::setAllowed) },
        )
        Hair()
        others.forEach { m ->
            val allowed = data?.members?.firstOrNull { it.userId == m.userId }?.allowed == true
            ListItem(headlineContent = { Text(m.displayName) }, trailingContent = { Text(if (allowed) "Allowed" else "Not yet", style = muted, color = c.onSurfaceVariant) })
            Hair()
        }
        val d = data
        if (d != null && !d.reachable) {
            val both = if (others.size > 1) "all" else if (others.size == 1) "both" else "you"
            Text(
                "AI apps reach ${dynamicTitle(rel, s.userId)} only once $both of you allow it, and only what each of you can see here.",
                style = muted,
                color = c.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
            )
        }

        if (d != null && d.apps.isNotEmpty()) {
            SectionHeader("Connected apps")
            d.apps.forEach { a ->
                ListItem(
                    leadingContent = { AppMark() },
                    headlineContent = { Text(a.app) },
                    supportingContent = { Text("${who(a.userId)} · ${a.lastUsedAt?.let { "used ${ago(it)}" } ?: "connected ${ago(a.connectedAt)}"}") },
                    trailingContent = if (a.userId == s.userId) {
                        { TextButton(onClick = { vm.disconnect(a.id, a.app) }, enabled = !busy) { Text("Disconnect", color = c.primary) } }
                    } else {
                        null
                    },
                )
                Hair()
            }
        }

        if (!rel.ended) {
            ListItem(
                overlineContent = { Text("Address for AI apps") },
                headlineContent = { Text(MCP_URL.removePrefix("https://").removePrefix("http://")) },
                trailingContent = {
                    TextButton(onClick = {
                        clipboard.setText(AnnotatedString(MCP_URL))
                        Toast.makeText(context, "Address copied", Toast.LENGTH_SHORT).show()
                    }) { Text("Copy", color = c.primary) }
                },
            )
            Hair()
        }

        val calls = d?.calls?.filter { it.ok }.orEmpty()
        if (d?.reachable == true && calls.isNotEmpty()) {
            SectionHeader("Last 30 days")
            calls.forEach { call ->
                Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                    AppMark(22.dp)
                    Spacer(Modifier.size(12.dp))
                    Text("${who(call.userId)} ${didWords(call.tool)}", Modifier.weight(1f), style = MaterialTheme.typography.bodyLarge)
                    Text(whenText(call.at), style = muted, color = c.onSurfaceVariant)
                }
                Hair()
            }
        }
        Spacer(Modifier.height(24.dp))
    }
}

/** On Today: a partner has allowed AI access and you haven't yet. Not now hides it on this phone. */
@Composable
fun AiAccessAsk(s: Session, vm: AiAccessViewModel = hiltViewModel()) {
    val rel = s.relationship ?: return
    val mine = s.myMember ?: return
    val asker = rel.members.firstOrNull { it.userId != s.userId && it.aiAccess } ?: return
    var dismissed by remember(rel.id) { mutableStateOf(vm.askDismissed(rel.id)) }
    if (s.readOnly || mine.aiAccess || dismissed) return
    LaunchedEffect(rel.id) { vm.load() }
    val data by vm.data.collectAsStateWithLifecycle()
    val busy by vm.busy.collectAsStateWithLifecycle()
    Messages(vm)
    val c = MaterialTheme.colorScheme
    val app = data?.apps?.firstOrNull { it.userId == asker.userId }?.app ?: "an AI app"
    Surface(
        color = c.surfaceContainerLowest,
        contentColor = c.onSurface,
        border = androidx.compose.foundation.BorderStroke(1.dp, c.outlineVariant),
        shape = MaterialTheme.shapes.medium,
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(
                buildAnnotatedString {
                    withStyle(SpanStyle(fontWeight = FontWeight.SemiBold)) { append(s.nameOf(asker.userId)) }
                    append(" wants to use Fealty with $app.")
                },
                style = MaterialTheme.typography.bodyLarge,
            )
            Text("It would see and do what each of you can here. You can switch it off any time.", style = MaterialTheme.typography.bodyMedium, color = c.onSurfaceVariant)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = { vm.setAllowed(true) }, enabled = !busy) { Text("Allow") }
                TextButton(onClick = { vm.dismissAsk(rel.id); dismissed = true }) { Text("Not now", color = c.onSurfaceVariant) }
            }
        }
    }
}

@Composable
private fun Messages(vm: AiAccessViewModel) {
    val message by vm.message.collectAsStateWithLifecycle()
    val context = LocalContext.current
    LaunchedEffect(message) {
        message?.let {
            Toast.makeText(context, it, Toast.LENGTH_SHORT).show()
            vm.messageShown()
        }
    }
}

