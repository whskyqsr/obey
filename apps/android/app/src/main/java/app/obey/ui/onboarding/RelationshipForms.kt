package app.obey.ui.onboarding

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import app.obey.api.Role

val Role.label: String
    get() = when (this) {
        Role.Dominant -> "Dominant"
        Role.Submissive -> "Submissive"
        Role.Switch -> "Switch"
    }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RolePicker(role: Role, onChange: (Role) -> Unit, modifier: Modifier = Modifier) {
    SingleChoiceSegmentedButtonRow(modifier.fillMaxWidth()) {
        Role.entries.forEachIndexed { i, r ->
            SegmentedButton(
                selected = role == r,
                onClick = { onChange(r) },
                shape = SegmentedButtonDefaults.itemShape(i, Role.entries.size),
            ) { Text(r.label) }
        }
    }
}

@Composable
fun CreateRelationshipForm(busy: Boolean, onCreate: (String, Role) -> Unit) {
    var name by rememberSaveable { mutableStateOf("") }
    var role by rememberSaveable { mutableStateOf(Role.Dominant) }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        OutlinedTextField(
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

@Composable
fun JoinRelationshipForm(busy: Boolean, onJoin: (String, Role) -> Unit) {
    var code by rememberSaveable { mutableStateOf("") }
    var role by rememberSaveable { mutableStateOf(Role.Submissive) }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        OutlinedTextField(
            value = code,
            onValueChange = { code = it.trim().take(32) },
            label = { Text("Invite code") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters),
            modifier = Modifier.fillMaxWidth(),
        )
        Text("Your role")
        RolePicker(role, { role = it })
        Button(onClick = { onJoin(code, role) }, enabled = !busy && code.length >= 4, modifier = Modifier.fillMaxWidth()) {
            Text("Join")
        }
    }
}
