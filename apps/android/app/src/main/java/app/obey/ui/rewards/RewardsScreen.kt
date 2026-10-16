package app.obey.ui.rewards

import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Exposure
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.obey.api.Consequence
import app.obey.api.ConsequenceInput
import app.obey.api.Reward
import app.obey.api.RewardInput
import app.obey.ui.common.EmptyBox
import app.obey.ui.common.ErrorBox
import app.obey.ui.common.Load
import app.obey.ui.common.LoadingBox
import app.obey.ui.common.MessageEffect
import app.obey.ui.common.SectionHeader
import app.obey.ui.common.SettingsAction
import app.obey.ui.common.formatDateTime
import app.obey.ui.common.signed
import app.obey.ui.tasks.LabeledSwitch
import app.obey.ui.tasks.NumberField
import app.obey.ui.tasks.Stepper

private data class Editing<T>(val item: T?)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RewardsScreen(onOpenSettings: () -> Unit, vm: RewardsViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    val message by vm.message.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    MessageEffect(message, snackbar, vm::messageShown)
    val session = vm.session
    val canManage = session?.canManage == true

    // null = dialog closed; Editing(null) = creating; Editing(x) = editing x.
    var editReward by remember { mutableStateOf<Editing<Reward>?>(null) }
    var editConsequence by remember { mutableStateOf<Editing<Consequence>?>(null) }
    var adjusting by remember { mutableStateOf(false) }
    var confirmRedeem by remember { mutableStateOf<Reward?>(null) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Rewards & points") },
                actions = {
                    if (canManage) IconButton(onClick = { adjusting = true }) { Icon(Icons.Outlined.Exposure, "Adjust points") }
                    SettingsAction(onOpenSettings)
                },
            )
        },
        floatingActionButton = {
            if (canManage) {
                ExtendedFloatingActionButton(
                    onClick = { editReward = Editing(null) },
                    icon = { Icon(Icons.Outlined.Add, null) },
                    text = { Text("Reward") },
                )
            }
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        when (val s = state) {
            Load.Loading -> LoadingBox(Modifier.padding(padding))
            is Load.Failed -> ErrorBox(s.message, vm::refresh, Modifier.padding(padding))
            is Load.Ready -> LazyColumn(Modifier.padding(padding).fillMaxSize()) {
                val d = s.value
                item(key = "balances") {
                    Row(
                        Modifier.horizontalScroll(rememberScrollState()).padding(16.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        val members = session?.relationship?.members.orEmpty()
                        members.forEach { m ->
                            val bal = d.balances.firstOrNull { it.userId == m.userId }?.balance ?: 0
                            Card(
                                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer),
                                modifier = Modifier.widthIn(min = 140.dp),
                            ) {
                                Column(Modifier.padding(16.dp)) {
                                    Text(if (m.userId == session?.userId) "You" else m.displayName, style = MaterialTheme.typography.labelLarge)
                                    Text("$bal", style = MaterialTheme.typography.displaySmall)
                                    Text("points", style = MaterialTheme.typography.bodySmall)
                                }
                            }
                        }
                    }
                }

                item(key = "h-rewards") { SectionHeader("Rewards") }
                if (d.rewards.isEmpty()) item(key = "e-rewards") { EmptyBox("No rewards yet", if (canManage) "Add things worth earning." else null) }
                items(d.rewards, key = { "r-" + it.id }) { r ->
                    val myBalance = vm.balanceOf(session?.userId.orEmpty())
                    ListItem(
                        modifier = if (canManage) Modifier.clickable { editReward = Editing(r) } else Modifier,
                        headlineContent = { Text(r.title) },
                        supportingContent = {
                            Text(listOfNotNull(r.bodyMd.takeIf { it.isNotBlank() }, if (r.needsApproval) "needs approval" else null).joinToString(" · "))
                        },
                        trailingContent = {
                            FilledTonalButton(onClick = { confirmRedeem = r }, enabled = myBalance >= r.cost) {
                                Text("${r.cost} pts")
                            }
                        },
                    )
                }

                item(key = "h-cons") {
                    Row(Modifier.fillMaxWidth(), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                        SectionHeader("Consequences", Modifier.weight(1f))
                        if (canManage) TextButton(onClick = { editConsequence = Editing(null) }) { Text("Add") }
                    }
                }
                if (d.consequences.isEmpty()) item(key = "e-cons") { EmptyBox("No consequences defined") }
                items(d.consequences, key = { "c-" + it.id }) { c ->
                    ListItem(
                        modifier = if (canManage) Modifier.clickable { editConsequence = Editing(c) } else Modifier,
                        headlineContent = { Text(c.title) },
                        supportingContent = if (c.bodyMd.isNotBlank()) { { Text(c.bodyMd) } } else null,
                        trailingContent = { Text("●".repeat(c.severity), color = MaterialTheme.colorScheme.error) },
                    )
                }

                item(key = "h-ledger") { SectionHeader("Activity") }
                if (d.ledger.isEmpty()) item(key = "e-ledger") { EmptyBox("No points yet") }
                items(d.ledger, key = { "l-" + it.id }) { e ->
                    ListItem(
                        headlineContent = { Text(e.note.ifBlank { e.kind.name }) },
                        supportingContent = { Text("${session?.nameOf(e.userId) ?: ""} · ${formatDateTime(e.createdAt)}") },
                        trailingContent = {
                            Text(
                                signed(e.delta),
                                style = MaterialTheme.typography.titleMedium,
                                color = if (e.delta < 0) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary,
                            )
                        },
                    )
                }
                item(key = "pad") { androidx.compose.foundation.layout.Spacer(Modifier.padding(40.dp)) }
            }
        }
    }

    editReward?.let { editing ->
        val existing = editing.item
        RewardDialog(
            existing,
            onDismiss = { editReward = null },
            onSave = { vm.saveReward(existing, it); editReward = null },
            onDelete = existing?.let { r -> { vm.deleteReward(r); editReward = null } },
        )
    }
    editConsequence?.let { editing ->
        val existing = editing.item
        ConsequenceDialog(
            existing,
            onDismiss = { editConsequence = null },
            onSave = { vm.saveConsequence(existing, it); editConsequence = null },
            onDelete = existing?.let { c -> { vm.deleteConsequence(c); editConsequence = null } },
        )
    }
    confirmRedeem?.let { r ->
        AlertDialog(
            onDismissRequest = { confirmRedeem = null },
            title = { Text("Redeem “${r.title}”?") },
            text = { Text("This spends ${r.cost} points." + if (r.needsApproval) " Your partner will need to approve it." else "") },
            confirmButton = { Button(onClick = { vm.redeem(r); confirmRedeem = null }) { Text("Redeem") } },
            dismissButton = { TextButton(onClick = { confirmRedeem = null }) { Text("Cancel") } },
        )
    }
    if (adjusting) {
        AdjustDialog(
            members = session?.relationship?.members.orEmpty().map { it.userId to it.displayName },
            onDismiss = { adjusting = false },
            onSave = { user, delta, note -> vm.adjust(user, delta, note); adjusting = false },
        )
    }
}

@Composable
private fun RewardDialog(existing: Reward?, onDismiss: () -> Unit, onSave: (RewardInput) -> Unit, onDelete: (() -> Unit)?) {
    var title by remember { mutableStateOf(existing?.title.orEmpty()) }
    var body by remember { mutableStateOf(existing?.bodyMd.orEmpty()) }
    var cost by remember { mutableStateOf(existing?.cost?.toString() ?: "50") }
    var approval by remember { mutableStateOf(existing?.needsApproval ?: true) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (existing == null) "New reward" else "Edit reward") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(title, { title = it.take(200) }, label = { Text("Title") }, singleLine = true)
                OutlinedTextField(body, { body = it.take(5000) }, label = { Text("Description") }, minLines = 2)
                NumberField("Cost (points)", cost, Modifier.fillMaxWidth()) { cost = it }
                LabeledSwitch("Needs approval", null, approval) { approval = it }
            }
        },
        confirmButton = {
            Button(
                onClick = { onSave(RewardInput(title.trim(), body, cost.toInt().coerceAtLeast(0), approval)) },
                enabled = title.isNotBlank() && cost.toIntOrNull() != null,
            ) { Text("Save") }
        },
        dismissButton = {
            Row {
                onDelete?.let { TextButton(onClick = it) { Text("Delete", color = MaterialTheme.colorScheme.error) } }
                TextButton(onClick = onDismiss) { Text("Cancel") }
            }
        },
    )
}

@Composable
private fun ConsequenceDialog(existing: Consequence?, onDismiss: () -> Unit, onSave: (ConsequenceInput) -> Unit, onDelete: (() -> Unit)?) {
    var title by remember { mutableStateOf(existing?.title.orEmpty()) }
    var body by remember { mutableStateOf(existing?.bodyMd.orEmpty()) }
    var severity by remember { mutableStateOf(existing?.severity ?: 1) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (existing == null) "New consequence" else "Edit consequence") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(title, { title = it.take(200) }, label = { Text("Title") }, singleLine = true)
                OutlinedTextField(body, { body = it.take(5000) }, label = { Text("Description") }, minLines = 2)
                Stepper("Severity", severity, "of 5", 1..5) { severity = it }
            }
        },
        confirmButton = {
            Button(onClick = { onSave(ConsequenceInput(title.trim(), body, severity)) }, enabled = title.isNotBlank()) { Text("Save") }
        },
        dismissButton = {
            Row {
                onDelete?.let { TextButton(onClick = it) { Text("Delete", color = MaterialTheme.colorScheme.error) } }
                TextButton(onClick = onDismiss) { Text("Cancel") }
            }
        },
    )
}

@Composable
private fun AdjustDialog(
    members: List<Pair<String, String>>,
    onDismiss: () -> Unit,
    onSave: (userId: String, delta: Int, note: String) -> Unit,
) {
    var user by remember { mutableStateOf(members.firstOrNull()?.first.orEmpty()) }
    var delta by remember { mutableStateOf("10") }
    var note by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Adjust points") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    members.forEach { (id, name) -> FilterChip(selected = user == id, onClick = { user = id }, label = { Text(name) }) }
                }
                NumberField("Points (negative to deduct)", delta, Modifier.fillMaxWidth()) { delta = it }
                OutlinedTextField(note, { note = it.take(500) }, label = { Text("Why") }, singleLine = true)
            }
        },
        confirmButton = {
            Button(
                onClick = { onSave(user, delta.toInt(), note.trim()) },
                enabled = user.isNotEmpty() && delta.toIntOrNull()?.let { it != 0 } == true && note.isNotBlank(),
            ) { Text("Apply") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}
