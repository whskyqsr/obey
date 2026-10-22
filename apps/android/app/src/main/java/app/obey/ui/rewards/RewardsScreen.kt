package app.obey.ui.rewards

import app.obey.ui.common.LocalFeatures
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
import androidx.compose.foundation.selection.selectable
import androidx.compose.ui.semantics.Role
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Exposure
import androidx.compose.material.icons.outlined.HourglassTop
import androidx.compose.material.icons.outlined.Redeem
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
import androidx.compose.material3.RadioButton
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
import app.obey.ui.common.MenuButton
import app.obey.ui.common.SafeWordAction
import app.obey.ui.common.SettingsAction
import app.obey.ui.common.formatDateTime
import app.obey.ui.common.signed
import app.obey.ui.tasks.LabeledSwitch
import app.obey.ui.tasks.NumberField
import app.obey.ui.tasks.Stepper

private data class Editing<T>(val item: T?)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RewardsScreen(onOpenSettings: () -> Unit, consequences: Boolean = false, vm: RewardsViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    val message by vm.message.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    MessageEffect(message, snackbar, vm::messageShown)
    val session = vm.session
    val canManage = session?.canManage == true
    // On their own, they both set rewards and spend points on them.
    val solo = session?.solo == true
    // Rewards and Consequences are separate pages that share this screen and its data, as on the web.
    val features = LocalFeatures.current.let { if (consequences) it.copy(points = false) else it.copy(consequences = false) }

    // null = dialog closed; Editing(null) = creating; Editing(x) = editing x.
    var editReward by remember { mutableStateOf<Editing<Reward>?>(null) }
    var editConsequence by remember { mutableStateOf<Editing<Consequence>?>(null) }
    var assigning by remember { mutableStateOf<Consequence?>(null) }
    var adjusting by remember { mutableStateOf(false) }
    var confirmRedeem by remember { mutableStateOf<Reward?>(null) }
    var marking by remember { mutableStateOf<app.obey.api.LedgerEntry?>(null) }
    val busy by vm.busy.collectAsStateWithLifecycle()
    // Who marks a reward redeemed: the Dominant's name, or "your Dominant" when there's more than one.
    val domName = session?.partners.orEmpty().filter { it.role != app.obey.api.Role.Submissive }.let { if (it.size == 1) it[0].displayName else "your Dominant" }

    Scaffold(
        topBar = {
            TopAppBar(
                navigationIcon = { MenuButton() },
                title = { Text(if (consequences) "Consequences" else "Rewards & points") },
                actions = {
                    if (canManage && features.points) IconButton(onClick = { adjusting = true }) { Icon(Icons.Outlined.Exposure, "Adjust points") }
                    SafeWordAction()
                    SettingsAction(onOpenSettings)
                },
            )
        },
        floatingActionButton = {
            if (canManage && features.points) {
                ExtendedFloatingActionButton(
                    onClick = { editReward = Editing(null) },
                    icon = { Icon(Icons.Outlined.Add, null) },
                    text = { Text("Reward") },
                )
            }
            if (canManage && features.consequences) {
                ExtendedFloatingActionButton(
                    onClick = { editConsequence = Editing(null) },
                    icon = { Icon(Icons.Outlined.Add, null) },
                    text = { Text("Consequence") },
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
                if (features.points) item(key = "balances") {
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

                if (features.points) item(key = "h-rewards") { SectionHeader("Rewards") }
                if (features.points && d.rewards.isEmpty()) item(key = "e-rewards") { EmptyBox("No rewards yet", if (canManage) "Add things worth earning." else null) }
                items(if (features.points) d.rewards else emptyList(), key = { "r-" + it.id }) { r ->
                    val myBalance = vm.balanceOf(session?.userId.orEmpty())
                    ListItem(
                        modifier = if (canManage) Modifier.clickable { editReward = Editing(r) } else Modifier,
                        headlineContent = { Text(r.title) },
                        supportingContent = {
                            Text(listOfNotNull(r.bodyMd.takeIf { it.isNotBlank() }, if (r.letsOff) "Gets ${if (canManage) "them" else "you"} out of a consequence" else null, r.lockMinutes?.takeIf { features.chastity }?.let { "Takes ${app.obey.ui.chastity.fmtMinutes(it)} off the lock" }).joinToString(" · "))
                        },
                        trailingContent = {
                            if (canManage && !solo) Text("${r.cost} pts", style = MaterialTheme.typography.labelLarge)
                            else FilledTonalButton(onClick = { confirmRedeem = r }, enabled = myBalance >= r.cost) {
                                Text("${r.cost} pts")
                            }
                        },
                    )
                }

                // Rewards spent but not yet given: a Dominant marks them redeemed; a sub sees what they're waiting on.
                val waiting = if (features.points) d.ledger.filter {
                    it.kind == app.obey.api.LedgerKind.Redemption && it.redeemedAt == null && (solo || if (canManage) it.userId != session?.userId else it.userId == session?.userId)
                } else emptyList()
                if (waiting.isNotEmpty()) item(key = "h-waiting") { SectionHeader(if (canManage) "To redeem" else "Waiting on $domName") }
                items(waiting, key = { "w-" + it.id }) { e ->
                    if (canManage) app.obey.ui.today.RedemptionRow(e, session?.nameOf(e.userId) ?: "Your partner") { marking = e }
                    else ListItem(
                        leadingContent = { Icon(Icons.Outlined.HourglassTop, null, tint = MaterialTheme.colorScheme.tertiary) },
                        headlineContent = { Text(e.note) },
                        supportingContent = { Text("${-e.delta} pts spent ${app.obey.ui.common.ago(e.createdAt)}" + (e.consequenceTitle?.let { " · gets you out of $it" } ?: "")) },
                    )
                }

                if (features.consequences) item(key = "h-cons") {
                    Text(
                        "Attach one to a task for when it's missed, or hand one out on its own.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                    )
                }
                if (features.consequences && d.consequences.isEmpty()) item(key = "e-cons") { EmptyBox("No consequences yet") }
                items(if (features.consequences) d.consequences else emptyList(), key = { "c-" + it.id }) { c ->
                    ListItem(
                        modifier = if (canManage) Modifier.clickable { editConsequence = Editing(c) } else Modifier,
                        headlineContent = { Text(c.title) },
                        supportingContent = listOfNotNull(c.bodyMd.takeIf { it.isNotBlank() }, c.lockMinutes?.takeIf { features.chastity }?.let { "Adds ${app.obey.ui.chastity.fmtMinutes(it)} to their lock" })
                            .takeIf { it.isNotEmpty() }?.let { lines -> { Text(lines.joinToString("\n")) } },
                        trailingContent = {
                            Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                                Text("●".repeat(c.severity), color = MaterialTheme.colorScheme.error)
                                if (canManage) TextButton(onClick = { assigning = c }) { Text("Assign") }
                            }
                        },
                    )
                }

                if (features.points) item(key = "h-ledger") { SectionHeader("Activity") }
                if (features.points && d.ledger.isEmpty()) item(key = "e-ledger") { EmptyBox("No points yet") }
                items(if (features.points) d.ledger else emptyList(), key = { "l-" + it.id }) { e ->
                    ListItem(
                        headlineContent = { Text(e.note.ifBlank { e.kind.name }) },
                        supportingContent = {
                            Column {
                                Text(
                                    "${session?.nameOf(e.userId) ?: ""} · ${formatDateTime(e.createdAt)}" +
                                        if (e.kind == app.obey.api.LedgerKind.Redemption) {
                                            if (e.redeemedAt != null) " · redeemed${e.consequenceTitle?.let { ", $it excused" } ?: ""}" else " · waiting on $domName"
                                        } else "",
                                )
                                e.redeemNote?.let { Text("“$it”", fontStyle = androidx.compose.ui.text.font.FontStyle.Italic) }
                            }
                        },
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
            features.chastity,
            onDismiss = { editReward = null },
            onSave = { vm.saveReward(existing, it); editReward = null },
            onDelete = existing?.let { r -> { vm.deleteReward(r); editReward = null } },
        )
    }
    assigning?.let { c ->
        // Usually the one partner; with more, the first submissive.
        val assignee = session?.partners?.let { p -> p.firstOrNull { it.role == app.obey.api.Role.Submissive } ?: p.firstOrNull() }?.userId ?: session?.userId
        if (assignee != null) {
            AssignConsequenceDialog(c, assignee, features.chastity, onDismiss = { assigning = null }, onAssign = { vm.assignConsequence(c, it, features.chastity); assigning = null })
        }
    }
    editConsequence?.let { editing ->
        val existing = editing.item
        ConsequenceDialog(
            existing,
            features.chastity,
            onDismiss = { editConsequence = null },
            onSave = { vm.saveConsequence(existing, it); editConsequence = null },
            onDelete = existing?.let { c -> { vm.deleteConsequence(c); editConsequence = null } },
        )
    }
    confirmRedeem?.let { r ->
        if (r.letsOff) {
            LetOffDialog(
                r,
                (state as? Load.Ready)?.value?.myConsequences.orEmpty(),
                domName,
                busy,
                onDismiss = { confirmRedeem = null },
            ) { occurrenceId -> vm.redeem(r, domName, occurrenceId); confirmRedeem = null }
        } else {
            AlertDialog(
                onDismissRequest = { confirmRedeem = null },
                title = { Text("Redeem “${r.title}”?") },
                text = { Text(if (solo) "Spend ${r.cost} points on “${r.title}”? Mark it redeemed once you've had it." else "Spend ${r.cost} points on “${r.title}”? $domName marks it redeemed once it's given.") },
                confirmButton = { Button(onClick = { vm.redeem(r, if (solo) null else domName); confirmRedeem = null }) { Text("Spend ${r.cost} pts") } },
                dismissButton = { TextButton(onClick = { confirmRedeem = null }) { Text("Cancel") } },
            )
        }
    }
    marking?.let { e ->
        app.obey.ui.today.RedeemedDialog(e, session?.nameOf(e.userId) ?: "them", busy, onDismiss = { marking = null }) { note -> vm.markRedeemed(e, note) { marking = null } }
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
private fun RewardDialog(existing: Reward?, chastity: Boolean, onDismiss: () -> Unit, onSave: (RewardInput) -> Unit, onDelete: (() -> Unit)?) {
    var title by remember { mutableStateOf(existing?.title.orEmpty()) }
    var body by remember { mutableStateOf(existing?.bodyMd.orEmpty()) }
    var cost by remember { mutableStateOf(existing?.cost?.toString() ?: "50") }
    var letsOff by remember { mutableStateOf(existing?.letsOff ?: false) }
    var lockMinutes by remember { mutableStateOf(existing?.lockMinutes) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (existing == null) "New reward" else "Edit reward") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(title, { title = it.take(200) }, label = { Text("Title") }, singleLine = true)
                OutlinedTextField(body, { body = it.take(5000) }, label = { Text("Description") }, minLines = 2)
                NumberField("Cost (points)", cost, Modifier.fillMaxWidth()) { cost = it }
                LabeledSwitch(
                    "Gets them out of a consequence",
                    "Redeeming it means picking a consequence of theirs; it's excused when you mark the reward redeemed.",
                    letsOff,
                ) { letsOff = it }
                if (chastity) app.obey.ui.chastity.LockTimeField("Takes time off their lock", lockMinutes) { lockMinutes = it }
            }
        },
        confirmButton = {
            Button(
                onClick = { onSave(RewardInput(title.trim(), body, cost.toInt().coerceAtLeast(0), letsOff, lockMinutes)) },
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

/** Spending a "lets off" reward: which of their consequences it's for. */
@Composable
private fun LetOffDialog(
    reward: Reward,
    mine: List<app.obey.api.Occurrence>,
    who: String,
    busy: Boolean,
    onDismiss: () -> Unit,
    onSpend: (String) -> Unit,
) {
    var picked by remember { mutableStateOf<String?>(null) }
    AlertDialog(
        onDismissRequest = onDismiss,
        icon = { Icon(Icons.Outlined.Redeem, null) },
        title = { Text(reward.title) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (mine.isEmpty()) {
                    Text("You don't have a consequence to get out of right now.")
                } else {
                    Text("Which consequence is it for?")
                    mine.forEach { o ->
                        Row(
                            Modifier.fillMaxWidth().selectable(selected = picked == o.id, role = Role.RadioButton) { picked = o.id }.padding(vertical = 4.dp),
                            verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
                        ) {
                            RadioButton(selected = picked == o.id, onClick = null)
                            Column(Modifier.padding(start = 12.dp)) {
                                Text(o.title, style = MaterialTheme.typography.bodyLarge)
                                Text(
                                    if (o.status == app.obey.api.OccurrenceStatus.Missed) "Missed" else "Due ${formatDateTime(o.dueAt)}",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                    }
                    Text("It's excused once $who marks the reward redeemed. Until then it stays on your list.", style = MaterialTheme.typography.bodySmall)
                }
            }
        },
        confirmButton = { Button(onClick = { picked?.let(onSpend) }, enabled = picked != null && !busy) { Text("Spend ${reward.cost} pts") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

@Composable
private fun ConsequenceDialog(existing: Consequence?, chastity: Boolean, onDismiss: () -> Unit, onSave: (ConsequenceInput) -> Unit, onDelete: (() -> Unit)?) {
    var title by remember { mutableStateOf(existing?.title.orEmpty()) }
    var body by remember { mutableStateOf(existing?.bodyMd.orEmpty()) }
    var severity by remember { mutableStateOf(existing?.severity ?: 1) }
    var lockMinutes by remember { mutableStateOf(existing?.lockMinutes) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (existing == null) "New consequence" else "Edit consequence") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(title, { title = it.take(200) }, label = { Text("Title") }, singleLine = true)
                OutlinedTextField(body, { body = it.take(5000) }, label = { Text("Description") }, minLines = 2)
                Stepper("Severity", severity, "of 5", 1..5) { severity = it }
                if (chastity) app.obey.ui.chastity.LockTimeField("Adds lock time", lockMinutes) { lockMinutes = it }
            }
        },
        confirmButton = {
            Button(onClick = { onSave(ConsequenceInput(title.trim(), body, severity, lockMinutes)) }, enabled = title.isNotBlank()) { Text("Save") }
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
