package app.obey.ui.onboarding

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.text.KeyboardOptions
import app.obey.ui.common.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import app.obey.ui.common.LettersField
import app.obey.ui.common.PillSegment
import app.obey.ui.common.PillRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.foundation.layout.padding
import kotlinx.coroutines.delay
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import app.obey.api.Role

val Role.label: String
    get() = when (this) {
        Role.Dominant -> "Dominant"
        Role.Submissive -> "submissive"
        Role.Switch -> "Switch"
    }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RolePicker(role: Role, onChange: (Role) -> Unit, modifier: Modifier = Modifier) {
    PillRow(modifier.fillMaxWidth()) {
        Role.entries.forEachIndexed { i, r ->
            PillSegment(
                selected = role == r,
                onClick = { onChange(r) },
            ) { Text(r.label) }
        }
    }
}

@Composable
fun CreateRelationshipForm(busy: Boolean, onCreate: (String, Role) -> Unit) {
    var name by rememberSaveable { mutableStateOf("") }
    var role by rememberSaveable { mutableStateOf(Role.Dominant) }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        LettersField(
            value = name,
            onValueChange = { name = it.take(80) },
            label = { Text("Name (optional)") },
            supportingText = { Text("Leave it blank to show your partner's name.") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words),
            modifier = Modifier.fillMaxWidth(),
        )
        Text("Your role")
        RolePicker(role, { role = it })
        Button(onClick = { onCreate(name, role) }, enabled = !busy, modifier = Modifier.fillMaxWidth()) {
            Text("Create and invite")
        }
    }
}

/** What a typed invite code says about the role: Loading until it's looked up. */
sealed interface InviteRoleState {
    data object Loading : InviteRoleState
    data object Invalid : InviteRoleState
    data object Open : InviteRoleState
    data class Named(val role: Role) : InviteRoleState
}

private val CODE = Regex("^[A-Za-z0-9]{4,16}$")

/** Looks up [code] shortly after typing stops, so an invite that names the role can skip the choice. */
@Composable
fun rememberInviteRole(code: String, lookup: suspend (String) -> app.obey.api.InvitePreview?): InviteRoleState {
    var state by remember { mutableStateOf<InviteRoleState>(InviteRoleState.Loading) }
    LaunchedEffect(code) {
        state = InviteRoleState.Loading
        if (!CODE.matches(app.obey.api.parseInviteCode(code))) return@LaunchedEffect
        delay(400)
        val p = lookup(code)
        state = when {
            p == null -> InviteRoleState.Invalid
            p.role != null -> InviteRoleState.Named(p.role)
            else -> InviteRoleState.Open
        }
    }
    return state
}

fun joinAs(role: Role) = "You'll join as ${if (role == Role.Switch) "a Switch" else "the ${role.label}"}."

/** Under an invite code: the role it names, or the role choice when it leaves that to you. */
@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
fun InviteRole(state: InviteRoleState, role: Role, onRole: (Role) -> Unit) {
    val c = MaterialTheme.colorScheme
    when (state) {
        InviteRoleState.Loading -> {}
        InviteRoleState.Invalid -> Text("This invite can't be used. Ask for a new link.", style = MaterialTheme.typography.bodySmall, color = c.error, modifier = Modifier.padding(top = 12.dp))
        is InviteRoleState.Named -> Text(joinAs(state.role), style = MaterialTheme.typography.bodyMedium, color = c.onSurfaceVariant, modifier = Modifier.padding(top = 12.dp))
        InviteRoleState.Open -> {
            Text("Your role", style = MaterialTheme.typography.bodySmall, color = c.onSurfaceVariant, modifier = Modifier.padding(top = 12.dp))
            androidx.compose.foundation.layout.FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Role.entries.forEach { r -> app.obey.ui.common.LettersChip(r.label, role == r, { onRole(r) }) }
            }
        }
    }
}

@Composable
fun JoinRelationshipForm(busy: Boolean, lookup: suspend (String) -> app.obey.api.InvitePreview?, onJoin: (String, Role) -> Unit) {
    var code by rememberSaveable { mutableStateOf("") }
    var role by rememberSaveable { mutableStateOf(Role.Submissive) }
    val invite = rememberInviteRole(code, lookup)
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        LettersField(
            value = code,
            onValueChange = { code = it.trim().take(200) },
            label = { Text("Invite link or code") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters),
            modifier = Modifier.fillMaxWidth(),
        )
        Column { InviteRole(invite, role) { role = it } }
        Button(onClick = { onJoin(code, role) }, enabled = !busy && code.length >= 4 && invite != InviteRoleState.Invalid, modifier = Modifier.fillMaxWidth()) {
            Text("Join")
        }
    }
}
