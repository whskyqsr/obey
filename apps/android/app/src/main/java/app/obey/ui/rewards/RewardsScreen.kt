package app.obey.ui.rewards

import androidx.compose.foundation.border
import androidx.compose.foundation.background
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.height
import androidx.compose.ui.unit.sp
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
import androidx.compose.material.icons.outlined.Bolt
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Exposure
import androidx.compose.material.icons.outlined.History
import androidx.compose.material3.ListItemDefaults
import app.obey.ui.common.local
import androidx.compose.material.icons.outlined.HourglassTop
import androidx.compose.material.icons.outlined.Redeem
import androidx.compose.material3.AlertDialog
import app.obey.ui.common.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import app.obey.ui.common.TonalButton
import app.obey.ui.common.ChoiceChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import app.obey.ui.common.LettersField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.LargeTopAppBar
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
    var history by remember { mutableStateOf(false) }
    var confirmRedeem by remember { mutableStateOf<Reward?>(null) }
    var marking by remember { mutableStateOf<app.obey.api.LedgerEntry?>(null) }
    val busy by vm.busy.collectAsStateWithLifecycle()
    // Who marks a reward redeemed: the Dominant's name, or "your Dominant" when there's more than one.
    val domName = session?.partners.orEmpty().filter { it.role != app.obey.api.Role.Submissive }.let { if (it.size == 1) it[0].displayName else "your Dominant" }

    Scaffold(
        topBar = {
            app.obey.ui.common.PageHeader(if (consequences) "Consequences" else "Rewards") {
                if (features.points) IconButton(onClick = { history = true }) { Icon(Icons.Outlined.History, "History") }
                if (canManage && consequences && features.consequences) IconButton(onClick = { editConsequence = Editing(null) }) { Icon(Icons.Outlined.Add, "New consequence") }
                if (canManage && !consequences && features.points) IconButton(onClick = { editReward = Editing(null) }) { Icon(Icons.Outlined.Add, "New reward") }
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
                    // The earner's balance leads, big in the serif, with how far it is to the next reward.
                    val members = session?.relationship?.members.orEmpty()
                    val me = session?.userId
                    val all = members.map { m -> m.userId to (d.balances.firstOrNull { it.userId == m.userId }?.balance ?: 0) }
                    val lead = all.firstOrNull { (id, _) -> members.first { it.userId == id }.role == app.obey.api.Role.Submissive || (id == me && (solo || !canManage)) } ?: all.firstOrNull()
                    if (lead != null) {
                        val nameOf = { id: String -> if (id == me) "You have" else "${session?.nameOf(id) ?: "They"} has" }
                        val next = d.rewards.filter { it.cost > lead.second }.minByOrNull { it.cost }
                        Column(Modifier.padding(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 24.dp)) {
                            Text(nameOf(lead.first).uppercase(), style = MaterialTheme.typography.labelMedium.copy(letterSpacing = 1.2.sp), color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Row(verticalAlignment = androidx.compose.ui.Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                Text("${lead.second}", style = MaterialTheme.typography.displayLarge.copy(fontSize = 88.sp, lineHeight = 88.sp), color = MaterialTheme.colorScheme.onSurface)
                                Text("points", style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(bottom = 14.dp).weight(1f))
                                // A Dominant adjusts the balance right beside it, as in the mockup.
                                if (canManage) androidx.compose.material3.OutlinedButton(onClick = { adjusting = true }, modifier = Modifier.padding(bottom = 10.dp)) { Text("Adjust") }
                            }
                            // Points since the week began (less spent), for "+31 this week".
                            val weekFrom = java.time.LocalDate.now().with(java.time.temporal.TemporalAdjusters.previousOrSame(session?.weekStart ?: java.time.DayOfWeek.SUNDAY))
                            val week = d.ledger.filter { it.userId == lead.first && !app.obey.ui.common.parseInstant(it.createdAt).local().toLocalDate().isBefore(weekFrom) }.sumOf { it.delta }
                            val line = listOfNotNull(
                                if (week != 0) "${signed(week)} this week." else null,
                                if (d.rewards.isNotEmpty()) next?.let { "${it.cost - lead.second} more for ${it.title}." } ?: "Enough for any reward." else null,
                            )
                            if (line.isNotEmpty()) Text(line.joinToString(" "), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            all.filter { it != lead && it.second != 0 }.forEach { (id, bal) ->
                                Text("${nameOf(id)} $bal points.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                }

                // Rewards spent but not yet given: a Dominant marks them redeemed; a sub sees what they're waiting on.
                val waiting = if (features.points) d.ledger.filter {
                    it.kind == app.obey.api.LedgerKind.Redemption && it.redeemedAt == null && (solo || if (canManage) it.userId != session?.userId else it.userId == session?.userId)
                } else emptyList()
                // A Dominant's page leads with what's waiting on them: a card each, as in the mockup.
                if (canManage && !solo && waiting.isNotEmpty()) {
                    item(key = "h-waiting") { SectionHeader("Waiting on you") }
                    items(waiting, key = { "w-" + it.id }) { e ->
                        WaitingCard(e, session?.nameOf(e.userId) ?: "Your partner", busy, onRedeemed = { vm.markRedeemed(e, null) {} }, onAddWord = { marking = e })
                    }
                }

                if (features.points) item(key = "h-rewards") { SectionHeader(if (canManage && !solo) "Your menu" else "Spend") }
                if (features.points && d.rewards.isEmpty()) item(key = "e-rewards") { EmptyBox("No rewards yet", icon = Icons.Outlined.Redeem) }
                items(if (features.points) d.rewards else emptyList(), key = { "r-" + it.id }) { r ->
                    val myBalance = vm.balanceOf(session?.userId.orEmpty())
                    // A menu, not cards: the title, a dotted leader, the price; dimmed until it's affordable.
                    val spender = solo || !canManage
                    val dim = spender && myBalance < r.cost
                    val ink = if (dim) MaterialTheme.colorScheme.outline else MaterialTheme.colorScheme.onSurface
                    val leader = MaterialTheme.colorScheme.outlineVariant
                    val notes = listOfNotNull(r.bodyMd.takeIf { it.isNotBlank() }, if (r.letsOff) "Gets ${if (canManage && !solo) "them" else "you"} out of a consequence" else null, r.lockMinutes?.takeIf { features.chastity }?.let { "Takes ${app.obey.ui.chastity.fmtMinutes(it)} off the lock" })
                    Column(
                        Modifier.fillMaxWidth()
                            .clickable(enabled = canManage || !dim, onClickLabel = if (canManage) "Edit" else "Spend ${r.cost} points") { if (canManage) editReward = Editing(r) else confirmRedeem = r }
                            .padding(horizontal = 16.dp, vertical = 12.dp),
                    ) {
                        Row(verticalAlignment = androidx.compose.ui.Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            Text(r.title, style = MaterialTheme.typography.headlineSmall, color = ink, modifier = Modifier.weight(1f, fill = false))
                            androidx.compose.foundation.Canvas(Modifier.weight(1f).padding(bottom = 8.dp).height(2.dp)) {
                                var x = 0f
                                while (x < size.width) { drawCircle(leader, radius = 1.dp.toPx(), center = androidx.compose.ui.geometry.Offset(x + 1.dp.toPx(), size.height / 2)); x += 5.dp.toPx() }
                            }
                            Text("${r.cost}", style = MaterialTheme.typography.bodyLarge, color = ink, modifier = Modifier.padding(bottom = 2.dp))
                        }
                        if (notes.isNotEmpty()) Text(notes.joinToString(" · "), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }

                // What's owed: on Rewards for the one who owes it, on Consequences for everyone.
                val showOwed = (consequences || !canManage || solo) && (d.owed.isNotEmpty() || d.excused.isNotEmpty())
                if (showOwed) {
                    val earnerName = (d.owed + d.excused).firstOrNull()?.assigneeId?.let { if (it == session?.userId) null else session?.nameOf(it) }
                    item(key = "h-owed") { SectionHeader(if (!consequences) "Owed" else earnerName?.let { "$it owes" } ?: "You owe") }
                    items(d.owed + d.excused, key = { "o-" + it.id }) { o ->
                        OwedRow(
                            o,
                            mine = o.assigneeId == session?.userId,
                            canManage = canManage,
                            excuser = if (canManage) "You" else domName,
                            busy = busy,
                            onDone = { vm.completeOwed(o) },
                            onExcuse = { vm.excuse(o) },
                        )
                    }
                }

                if (!(canManage && !solo) && waiting.isNotEmpty()) {
                    item(key = "h-waiting") { SectionHeader("Waiting on $domName") }
                    items(waiting, key = { "w-" + it.id }) { e ->
                        ListItem(
                            colors = ListItemDefaults.colors(containerColor = androidx.compose.ui.graphics.Color.Transparent),
                            leadingContent = { app.obey.ui.common.Diamond(app.obey.ui.common.DiamondState.Waiting, size = 14.dp) },
                            headlineContent = { Text(e.note) },
                            supportingContent = { Text("${-e.delta} pts spent ${app.obey.ui.common.ago(e.createdAt)}" + (e.consequenceTitle?.let { " · gets you out of $it" } ?: "")) },
                        )
                    }
                }

                if (consequences && features.consequences) item(key = "h-list") { SectionHeader(if (canManage) "Your list" else "The list") }
                if (features.consequences && d.consequences.isEmpty()) item(key = "e-cons") { EmptyBox("No consequences yet", icon = Icons.Outlined.Bolt) }
                items(if (features.consequences) d.consequences else emptyList(), key = { "c-" + it.id }) { c ->
                    val used = d.usedBy[c.id] ?: 0
                    val notes = listOfNotNull(
                        SEVERITY.getOrNull(c.severity - 1),
                        c.bodyMd.takeIf { it.isNotBlank() },
                        c.lockMinutes?.takeIf { features.chastity }?.let { "adds ${app.obey.ui.chastity.fmtMinutes(it)} to the lock" },
                        if (used > 0) "used by $used task${if (used == 1) "" else "s"}" else null,
                    )
                    Column(Modifier.padding(horizontal = 16.dp)) {
                        Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                            Column(
                                Modifier.weight(1f)
                                    .then(if (canManage) Modifier.clickable { editConsequence = Editing(c) } else Modifier)
                                    .padding(vertical = 12.dp),
                            ) {
                                Text(c.title, style = MaterialTheme.typography.bodyLarge)
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    SeverityBolts(c.severity, Modifier.padding(top = 2.dp))
                                    Text(notes.joinToString(" · "), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2)
                                }
                            }
                            if (canManage) TextButton(onClick = { assigning = c }) { Text("Assign") }
                        }
                        androidx.compose.material3.HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                    }
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
    if (history) {
        val ledger = (state as? Load.Ready)?.value?.ledger.orEmpty()
        AlertDialog(
            onDismissRequest = { history = false },
            title = { Text("History") },
            text = {
                androidx.compose.foundation.lazy.LazyColumn {
                    if (ledger.isEmpty()) item { Text("No points yet.", color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    items(ledger, key = { it.id }) { e ->
                        Row(Modifier.padding(vertical = 10.dp)) {
                            Column(Modifier.weight(1f)) {
                                Text(e.note.ifBlank { e.kind.name }, style = MaterialTheme.typography.bodyLarge)
                                Text(
                                    listOfNotNull(
                                        if (e.userId == session?.userId) null else session?.nameOf(e.userId),
                                        app.obey.ui.common.ago(e.createdAt),
                                        e.createdBy?.takeIf { it != e.userId }?.let { "by ${if (it == session?.userId) "you" else session?.nameOf(it)}" },
                                        if (e.kind == app.obey.api.LedgerKind.Redemption) {
                                            if (e.redeemedAt != null) "redeemed${e.consequenceTitle?.let { ", $it excused" } ?: ""}" else "waiting on ${if (canManage) "you" else domName}"
                                        } else null,
                                    ).joinToString(" · "),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                                e.redeemNote?.let { Text("“$it”", style = MaterialTheme.typography.bodyMedium, fontStyle = androidx.compose.ui.text.font.FontStyle.Italic) }
                            }
                            Text(signed(e.delta), style = MaterialTheme.typography.bodyMedium, color = if (e.delta < 0) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        androidx.compose.material3.HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                    }
                }
            },
            confirmButton = { TextButton(onClick = { history = false }) { Text("Close") } },
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
                LettersField(title, { title = it.take(200) }, label = { Text("Title") }, singleLine = true)
                LettersField(body, { body = it.take(5000) }, label = { Text("Description") }, minLines = 2)
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
                LettersField(title, { title = it.take(200) }, label = { Text("Title") }, singleLine = true)
                LettersField(body, { body = it.take(5000) }, label = { Text("Description") }, minLines = 2)
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
                    members.forEach { (id, name) -> ChoiceChip(selected = user == id, onClick = { user = id }, label = { Text(name) }) }
                }
                NumberField("Points (negative to deduct)", delta, Modifier.fillMaxWidth()) { delta = it }
                LettersField(note, { note = it.take(500) }, label = { Text("Why") }, singleLine = true)
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

private val SEVERITY = listOf("Light", "Mild", "Moderate", "Strict", "Severe")

/** Severity as five bolts, filled up to how heavy it is, as before the redesign (Jake, 2026-11-24). */
@Composable
private fun SeverityBolts(level: Int, modifier: Modifier = Modifier) {
    val tint = MaterialTheme.colorScheme.primary
    Row(modifier.semantics(mergeDescendants = true) { contentDescription = "Severity $level of 5" }) {
        repeat(5) { i ->
            Icon(
                if (i < level) Icons.Filled.Bolt else Icons.Outlined.Bolt,
                contentDescription = null,
                tint = if (i < level) tint else tint.copy(alpha = 0.3f),
                modifier = Modifier.size(16.dp),
            )
        }
    }
}

/** "Kitten spent 20 on Choose tonight's movie." with Mark redeemed, and Add a word for a note with it. */
@Composable
private fun WaitingCard(e: app.obey.api.LedgerEntry, name: String, busy: Boolean, onRedeemed: () -> Unit, onAddWord: () -> Unit) {
    androidx.compose.material3.Surface(
        shape = MaterialTheme.shapes.large,
        color = MaterialTheme.colorScheme.surfaceContainerLowest,
        border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(
                androidx.compose.ui.text.buildAnnotatedString {
                    append("$name spent ${-e.delta} on ")
                    pushStyle(androidx.compose.ui.text.SpanStyle(fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold))
                    append(e.note)
                    pop()
                    e.consequenceTitle?.let { append(" to get out of $it") }
                    append(".")
                },
                style = MaterialTheme.typography.bodyLarge,
            )
            Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                Button(onClick = onRedeemed, enabled = !busy) { Text("Mark redeemed") }
                androidx.compose.foundation.layout.Spacer(Modifier.weight(1f))
                TextButton(onClick = onAddWord) { Text("Add a word") }
            }
        }
    }
}

/** An owed consequence: the oxblood diamond, what it is, when it's due; Done it for the one who owes it, Excuse for a Dominant. */
@Composable
private fun OwedRow(
    o: app.obey.api.Occurrence,
    mine: Boolean,
    canManage: Boolean,
    excuser: String,
    busy: Boolean,
    onDone: () -> Unit,
    onExcuse: () -> Unit,
) {
    val excused = o.status == app.obey.api.OccurrenceStatus.Excused
    val due = app.obey.ui.common.parseInstant(o.dueAt).local().toLocalDate()
    val today = java.time.LocalDate.now()
    val day = when (java.time.temporal.ChronoUnit.DAYS.between(today, due)) {
        0L -> "today"
        1L -> "tomorrow"
        -1L -> "yesterday"
        else -> app.obey.ui.common.formatDate(due)
    }
    val sub = when (o.status) {
        app.obey.api.OccurrenceStatus.Excused -> "$excuser excused it"
        app.obey.api.OccurrenceStatus.Submitted -> "Sent for approval"
        app.obey.api.OccurrenceStatus.Missed -> "Not done, was due $day"
        else -> "Due $day"
    }
    // Ones that need a photo, a mood or an entry are finished from Today, where those are asked for.
    val canDo = mine && o.status == app.obey.api.OccurrenceStatus.Pending && !o.proofRequired && !o.askMood && !o.asksJournal
    val canExcuse = canManage && !mine && (o.status == app.obey.api.OccurrenceStatus.Pending || o.status == app.obey.api.OccurrenceStatus.Missed)
    Column(Modifier.padding(horizontal = 16.dp)) {
        Row(Modifier.padding(vertical = 12.dp), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            app.obey.ui.common.Diamond(
                when (o.status) {
                    app.obey.api.OccurrenceStatus.Excused -> app.obey.ui.common.DiamondState.Off
                    app.obey.api.OccurrenceStatus.Submitted -> app.obey.ui.common.DiamondState.Waiting
                    else -> app.obey.ui.common.DiamondState.Owed
                },
                Modifier.padding(start = 4.dp),
                size = 16.dp,
            )
            Column(Modifier.weight(1f)) {
                Text(o.title, style = MaterialTheme.typography.bodyLarge, color = if (excused) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface)
                Text(sub, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (canDo) androidx.compose.material3.OutlinedButton(onClick = onDone, enabled = !busy) { Text("Done it") }
            if (canExcuse) androidx.compose.material3.OutlinedButton(onClick = onExcuse, enabled = !busy) { Text("Excuse") }
        }
        androidx.compose.material3.HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
    }
}
