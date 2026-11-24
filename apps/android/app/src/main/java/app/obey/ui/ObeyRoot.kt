package app.obey.ui

import androidx.compose.material.icons.outlined.CheckBox
import androidx.compose.material.icons.outlined.EditNote
import androidx.compose.material.icons.automirrored.outlined.MenuBook
import androidx.compose.material.icons.outlined.Bedtime
import androidx.compose.material.icons.automirrored.outlined.ReceiptLong
import androidx.compose.material.icons.outlined.Layers
import androidx.compose.material.icons.outlined.SwapHoriz
import androidx.compose.material.icons.outlined.PersonAddAlt
import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.Checklist
import androidx.compose.material.icons.outlined.Redeem
import androidx.compose.material.icons.outlined.StickyNote2
import androidx.compose.material.icons.outlined.LocationOn
import androidx.compose.material.icons.outlined.Widgets
import androidx.compose.material.icons.outlined.Gavel
import androidx.compose.material.icons.outlined.Today
import app.obey.ui.common.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationRail
import androidx.compose.material3.NavigationRailItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavDestination
import androidx.navigation.NavDestination.Companion.hasRoute
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.toRoute
import androidx.compose.foundation.layout.height
import androidx.compose.material.icons.outlined.AutoStories
import androidx.compose.material.icons.outlined.Insights
import androidx.compose.material.icons.outlined.Flag
import androidx.compose.material.icons.outlined.Bolt
import androidx.compose.material.icons.outlined.FactCheck
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.outlined.FavoriteBorder
import androidx.compose.material.icons.outlined.PersonAdd
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.HorizontalDivider
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import app.obey.ui.common.LocalSafeWord
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.AddTask
import androidx.compose.material.icons.outlined.Event
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.unit.sp
import app.obey.ui.common.LocalNavLead
import app.obey.api.SafeCall
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import app.obey.api.ApplyKitResult
import app.obey.api.Features
import app.obey.ui.common.LocalFeatures
import app.obey.auth.AuthState
import app.obey.data.Session
import app.obey.data.SessionState
import androidx.compose.foundation.layout.Spacer
import app.obey.ui.common.LoadingBox
import app.obey.ui.notes.NoteEditorScreen
import app.obey.ui.notes.NotesScreen
import app.obey.ui.onboarding.RelationshipSetupScreen
import app.obey.ui.onboarding.SignInScreen
import app.obey.ui.onboarding.VerifyEmailScreen
import app.obey.ui.onboarding.WelcomeScreen
import app.obey.ui.rewards.RewardsScreen
import app.obey.ui.protocols.ProtocolEditorScreen
import app.obey.ui.protocols.ProtocolsScreen
import app.obey.ui.rulelog.RuleLogScreen
import app.obey.ui.stats.StatsScreen
import app.obey.ui.stats.MonthReviewScreen
import app.obey.ui.agreement.AgreementScreen
import androidx.compose.material.icons.outlined.Handshake
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Tune
import app.obey.ui.chastity.ChastityScreen
import app.obey.ui.limits.LimitsEditScreen
import app.obey.ui.limits.LimitsScreen
import app.obey.ui.scenes.AftercareScreen
import app.obey.ui.scenes.SceneScreen
import app.obey.ui.scenes.ScenesScreen
import app.obey.ui.kits.KitScreen
import app.obey.ui.kits.KitsScreen
import app.obey.ui.kits.NewKitScreen
import app.obey.ui.kits.SharedKitScreen
import app.obey.ui.kits.describe
import app.obey.ui.rules.RulesScreen
import app.obey.ui.settings.DynamicScreen
import app.obey.ui.settings.SettingsScreen
import app.obey.ui.settings.SettingsViewModel
import app.obey.ui.tasks.TaskDetailScreen
import app.obey.ui.tasks.TaskEditorScreen
import app.obey.ui.tasks.TaskHistoryScreen
import app.obey.ui.tasks.TaskListScreen
import app.obey.ui.today.TodayScreen
import app.obey.ui.upcoming.UpcomingScreen

@Composable
fun ObeyRoot(vm: RootViewModel = hiltViewModel()) {
    val auth by vm.authState.collectAsStateWithLifecycle()
    val session by vm.session.collectAsStateWithLifecycle()
    val welcome by vm.welcome.collectAsStateWithLifecycle()
    val places by vm.places.collectAsStateWithLifecycle()

    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        when {
            auth == null -> LoadingBox()
            auth is AuthState.SignedOut -> SignInScreen()
            (auth as? AuthState.Firebase)?.needsVerification == true -> VerifyEmailScreen((auth as AuthState.Firebase).email)
            else -> when (val s = session) {
                SessionState.Loading -> LoadingBox()
                is SessionState.Error -> SessionError(s.message, vm::retry)
                is SessionState.Ready ->
                    if (s.session.relationship == null) {
                        RelationshipSetupScreen()
                    } else {
                        // A new NavHost (and fresh ViewModels) per relationship.
                        key(s.session.relationship.id) {
                            val byId = remember(places, s.session.relationship.id) { places[s.session.relationship.id].orEmpty().associateBy { it.id } }
                            // Someone on their own has nobody to sign an agreement with or hold a key, so those stay out of the way.
                            val features = s.session.relationship.features.let { f -> if (s.session.solo) f.copy(agreement = false, chastity = false) else f }
                            CompositionLocalProvider(LocalFeatures provides features, app.obey.ui.location.LocalPlaces provides byId) {
                                if (welcome == s.session.relationship.id) WelcomeScreen() else MainScaffold(s.session)
                            }
                        }
                    }
            }
        }
    }
}

@Composable
private fun SessionError(message: String, onRetry: () -> Unit, settingsVm: SettingsViewModel = hiltViewModel()) {
    Column(
        Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("Couldn't load your account", style = MaterialTheme.typography.titleLarge, textAlign = TextAlign.Center)
        Text(message, style = MaterialTheme.typography.bodyMedium, textAlign = TextAlign.Center)
        Button(onClick = onRetry) { Text("Try again") }
        OutlinedButton(onClick = settingsVm::signOut) { Text("Sign out") }
    }
}

internal data class TopLevel(
    val route: Any,
    val label: String,
    val icon: ImageVector,
    val hint: String? = null,
    val matches: (NavDestination) -> Boolean,
)

/** The three tabs. Week is the calendar; Us lists everything else. */
private val TodayTab = TopLevel(TodayRoute, "Today", Icons.Outlined.Today) { it.hasRoute<TodayRoute>() }
private val WeekTab = TopLevel(UpcomingRoute, "Week", Icons.Outlined.CalendarMonth) { it.hasRoute<UpcomingRoute>() }
private val UsTab = TopLevel(UsRoute, "Us", Icons.Outlined.FavoriteBorder) { it.hasRoute<UsRoute>() }

/** Everything the tabs don't cover, in the order Us lists it (the same as the web). Protocols are a tab inside Rules. */
private fun sections(f: Features) = listOfNotNull(
    when {
        f.rules -> TopLevel(RulesRoute, "Rules", Icons.Outlined.Gavel, if (f.protocols) "Rules and protocols" else null) { it.hasRoute<RulesRoute>() || it.hasRoute<ProtocolsRoute>() }
        // With rules off, Protocols take Rules' place.
        f.protocols -> TopLevel(ProtocolsRoute, "Protocols", Icons.Outlined.FactCheck, "How things are done") { it.hasRoute<ProtocolsRoute>() }
        else -> null
    },
    if (f.points) TopLevel(RewardsRoute, "Rewards", Icons.Outlined.Redeem, "Points and what they buy") { it.hasRoute<RewardsRoute>() } else null,
    if (f.consequences) TopLevel(ConsequencesRoute, "Consequences", Icons.Outlined.Bolt, "What's owed, and the list") { it.hasRoute<ConsequencesRoute>() } else null,
    TopLevel(NotesRoute, "Notes", Icons.Outlined.StickyNote2, "Shared and private notes") { it.hasRoute<NotesRoute>() },
    if (f.journal) TopLevel(JournalRoute, "Journal", Icons.Outlined.AutoStories, "Entries and replies") { it.hasRoute<JournalRoute>() } else null,
    if (f.limits) TopLevel(LimitsRoute, "Limits", Icons.Outlined.Tune, "Yes, no and maybe") { it.hasRoute<LimitsRoute>() } else null,
    if (f.agreement) TopLevel(AgreementRoute(), "Agreement", Icons.Outlined.Handshake, "What you've agreed to") { it.hasRoute<AgreementRoute>() } else null,
    if (f.scenes) TopLevel(ScenesRoute, "Scenes", Icons.Outlined.AutoAwesome, "Scenes and aftercare") { it.hasRoute<ScenesRoute>() } else null,
    if (f.chastity) TopLevel(ChastityRoute, "Chastity", Icons.Outlined.Lock) { it.hasRoute<ChastityRoute>() } else null,
    if (f.location) TopLevel(LocationRoute, "Location", Icons.Outlined.LocationOn, "Places and curfew") { it.hasRoute<LocationRoute>() } else null,
    if (f.stats) TopLevel(StatsRoute(), "Stats", Icons.Outlined.Insights, "How the weeks are going") { it.hasRoute<StatsRoute>() } else null,
    if (f.review) TopLevel(MonthReviewRoute, "Monthly review", Icons.Outlined.Flag, "Look back together") { it.hasRoute<MonthReviewRoute>() } else null,
    TopLevel(KitsRoute, "Kits", Icons.Outlined.Widgets, "Sets of tasks, rules and rewards") { it.hasRoute<KitsRoute>() },
    TopLevel(TaskListRoute, "All tasks", Icons.Outlined.Checklist, "Every task, paused ones too") { it.hasRoute<TaskListRoute>() },
)

/** What + can start (mockup 17). Each opens where it's made. */
private data class NewItem(val label: String, val icon: ImageVector, val go: () -> Unit)

@OptIn(ExperimentalMaterial3Api::class, androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
private fun NewSheet(items: List<NewItem>, onSwap: (() -> Unit)?, onInvite: (() -> Unit)?, onDismiss: () -> Unit) {
    val c = MaterialTheme.colorScheme
    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = c.surface) {
        Column(Modifier.padding(horizontal = 24.dp).padding(bottom = 24.dp)) {
            app.obey.ui.common.Eyebrow("New", Modifier.padding(bottom = 4.dp))
            items.forEachIndexed { i, item ->
                if (i > 0) HorizontalDivider(color = c.outlineVariant)
                Row(
                    Modifier.fillMaxWidth().clickable { onDismiss(); item.go() }.padding(vertical = 14.dp),
                    horizontalArrangement = Arrangement.spacedBy(16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(item.icon, null, tint = c.onSurfaceVariant)
                    Text(item.label, style = MaterialTheme.typography.headlineSmall.copy(fontSize = 22.sp, lineHeight = 28.sp))
                }
            }
            if (onSwap != null || onInvite != null) {
                androidx.compose.foundation.layout.FlowRow(Modifier.padding(top = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    onSwap?.let { go ->
                        app.obey.ui.common.ChoiceChip(
                            selected = false,
                            onClick = { onDismiss(); go() },
                            label = { Text("Ask to swap roles") },
                            leadingIcon = { Icon(Icons.Outlined.SwapHoriz, null, Modifier.size(18.dp)) },
                        )
                    }
                    onInvite?.let { go ->
                        app.obey.ui.common.ChoiceChip(
                            selected = false,
                            onClick = { onDismiss(); go() },
                            label = { Text("Invite") },
                            leadingIcon = { Icon(Icons.Outlined.PersonAddAlt, null, Modifier.size(18.dp)) },
                        )
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MainScaffold(session: Session, settingsVm: SettingsViewModel = hiltViewModel(), safeVm: SafeCallViewModel = hiltViewModel(key = "safe-${session.relationship?.id}")) {
    val nav = rememberNavController()
    val entry by nav.currentBackStackEntryAsState()
    val destination = entry?.destination
    val features = LocalFeatures.current
    val sections = remember(features) { sections(features) }
    val tabs = listOf(TodayTab, WeekTab, UsTab)
    val onTab = destination != null && tabs.any { t -> destination.hierarchy.any(t.matches) }
    val onSection = destination != null && sections.any { t -> destination.hierarchy.any(t.matches) }
    // The tab bar stays on the tabs and the pages Us lists; anything opened from them has its own back arrow.
    val showBar = onTab || onSection
    val wide = LocalConfiguration.current.screenWidthDp >= 600
    // A page the dynamic just switched off (say, from Settings) shouldn't stay reachable underneath.
    val switchedOff = destination != null && !onTab && !onSection && destination.hierarchy.any {
        it.hasRoute<RewardsRoute>() || it.hasRoute<ConsequencesRoute>() || it.hasRoute<RulesRoute>() || it.hasRoute<ProtocolsRoute>() || it.hasRoute<JournalRoute>() || it.hasRoute<StatsRoute>() || it.hasRoute<MonthReviewRoute>() || it.hasRoute<AgreementRoute>() || it.hasRoute<ScenesRoute>() || it.hasRoute<ChastityRoute>() || it.hasRoute<LimitsRoute>() || it.hasRoute<LocationRoute>() ||
            // Limits' editor isn't listed either.
            (!features.limits && it.hasRoute<LimitsEditRoute>()) ||
            // A scene and the aftercare plans aren't listed, so they only go when scenes are off.
            (!features.scenes && (it.hasRoute<SceneRoute>() || it.hasRoute<AftercareRoute>()))
    }
    LaunchedEffect(switchedOff) { if (switchedOff) nav.navigate(TodayRoute) { popUpTo(nav.graph.findStartDestination().id) } }
    // A push naming a screen (location setup, the agreement, rules, protocols or a scene) opens it.
    LaunchedEffect(Unit) {
        app.obey.push.PendingNav.target.collect { target ->
            if (target == app.obey.push.PendingNav.LOCATION && features.location) nav.navigate(LocationRoute)
            if (target == app.obey.push.PendingNav.AGREEMENT && features.agreement) nav.navigate(AgreementRoute())
            if (target == app.obey.push.PendingNav.RULES && features.rules) nav.navigate(RulesRoute)
            if (target == app.obey.push.PendingNav.PROTOCOLS && features.protocols) nav.navigate(ProtocolsRoute)
            if (target != null && target.startsWith(app.obey.push.PendingNav.SCENE) && features.scenes) nav.navigate(SceneRoute(target.removePrefix(app.obey.push.PendingNav.SCENE)))
            // Today picks up "I'm home" itself, once it knows tonight's curfew.
            if (target == app.obey.push.PendingNav.HOME) nav.navigate(TodayRoute) { popUpTo(nav.graph.findStartDestination().id) }
            else if (target != null) app.obey.push.PendingNav.target.value = null
        }
    }

    // Ask for notification permission once we're in the app (Android 13+).
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { }
    LaunchedEffect(Unit) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) permission.launch(Manifest.permission.POST_NOTIFICATIONS)
    }

    fun go(route: Any) = nav.navigate(route) {
        popUpTo(nav.graph.findStartDestination().id) { saveState = true }
        launchSingleTop = true
        restoreState = true
    }
    // Back to the Us list itself, not to whichever page under it was open last (as tapping a tab would restore).
    fun backToUs() {
        if (!nav.popBackStack<UsRoute>(inclusive = false)) nav.navigate(UsRoute) { popUpTo(nav.graph.findStartDestination().id); launchSingleTop = true }
    }
    fun selected(t: TopLevel) = destination?.hierarchy?.any(t.matches) == true
    // On a page under Us, the tab it was reached from stays marked: Week for All tasks opened from Week.
    val prev = remember(entry) { nav.previousBackStackEntry?.destination }
    val homeTab = if (!onSection) null else prev?.let { p -> tabs.firstOrNull { t -> p.hierarchy.any(t.matches) } } ?: UsTab
    fun marked(t: TopLevel) = selected(t) || (onSection && t === homeTab)
    // Tapping the marked tab from a page under it goes back to that tab (Week from All tasks), not to the saved page.
    fun tab(t: TopLevel) {
        when {
            t === UsTab && onSection -> backToUs()
            onSection && t === homeTab -> if (!nav.popBackStack(t.route, inclusive = false)) go(t.route)
            else -> go(t.route)
        }
    }
    val activeCall by safeVm.active.collectAsStateWithLifecycle()
    var safeOpen by remember { mutableStateOf(false) }
    val openSafe = remember { { safeOpen = true } }
    if (safeOpen) SafeWordSheet(safeVm) { safeOpen = false }
    // A failed call must never pass silently.
    val safeError by safeVm.message.collectAsStateWithLifecycle()
    val context = androidx.compose.ui.platform.LocalContext.current
    LaunchedEffect(safeError) {
        safeError?.let { android.widget.Toast.makeText(context, it, android.widget.Toast.LENGTH_LONG).show(); safeVm.messageShown() }
    }
    // Joining and starting another dynamic live on Your dynamic.
    val switcher = SwitcherActions(session, settingsVm::loadAvatar, { settingsVm.selectRelationship(it) }, { nav.navigate(DynamicRoute()) }, { nav.navigate(DynamicRoute()) })

    // What + can start, for this person in this dynamic.
    val manage = session.canManage
    val newItems = buildList {
        if (session.readOnly) return@buildList
        if (manage) add(NewItem("Task", Icons.Outlined.CheckBox) { nav.navigate(TaskEditorRoute()) })
        add(NewItem("Plan", Icons.Outlined.Event) { app.obey.ui.plans.NewPlanRequest.pending.value = true; go(UpcomingRoute) })
        add(NewItem("Note", Icons.Outlined.EditNote) { nav.navigate(NoteEditorRoute()) })
        if (features.journal) add(NewItem("Journal entry", Icons.AutoMirrored.Outlined.MenuBook) { nav.navigate(NoteEditorRoute(journal = true)) })
        if (features.scenes && !session.solo) add(NewItem("Log a scene", Icons.Outlined.Bedtime) { go(ScenesRoute) })
        if (features.rules || features.protocols) add(
            NewItem(if (manage) "Log a broken rule" else "Own up to a rule", Icons.AutoMirrored.Outlined.ReceiptLong) { nav.navigate(RuleLogRoute) },
        )
        if (features.consequences && manage) add(NewItem("Assign a consequence", Icons.Outlined.Bolt) { go(ConsequencesRoute) })
        if (manage) add(NewItem("Start from a kit", Icons.Outlined.Layers) { go(KitsRoute) })
    }
    var newOpen by remember { mutableStateOf(false) }
    var swapping by remember { mutableStateOf(false) }
    val canSwap = !session.readOnly && session.relationship?.roleSwap == null && session.myRole != app.obey.api.Role.Switch && app.obey.ui.roles.swapPartner(session) != null
    if (newOpen) NewSheet(
        newItems,
        onSwap = if (canSwap) ({ swapping = true }) else null,
        onInvite = if (!session.readOnly) ({ nav.navigate(DynamicRoute(invite = true)) }) else null,
    ) { newOpen = false }
    if (swapping) app.obey.ui.roles.SwapSheet(session, onDismiss = { swapping = false })

    val usItems = sections.map { t -> UsItem(t.label, t.icon) { nav.navigate(t.route) { launchSingleTop = true } } }

    // Phones: the switcher leads Today, Week and Us; the pages Us lists lead back to it. Tablets have the rail.
    val chipLead: @Composable () -> Unit = { DynamicSwitcherChip(switcher) }
    // Pages under Us go back to wherever they were opened from (All tasks from Week says "‹ Week"), else to Us.
    val prevLabel = prev?.let { p -> (tabs + sections).firstOrNull { t -> p.hierarchy.any(t.matches) }?.label }
    val backLead: @Composable () -> Unit = { app.obey.ui.common.BackLink(prevLabel ?: "Us") { if (prevLabel != null) nav.popBackStack() else backToUs() } }
    val lead: (@Composable () -> Unit)? = if (wide) null else if (onTab) chipLead else if (onSection) backLead else null
    val host: @Composable () -> Unit = {
        SafeCallFrame(safeVm, activeCall) {
            ObeyNavHost(nav, usItems, switcher, onInvite = if (session.solo) ({ nav.navigate(DynamicRoute(invite = true)) }) else null)
        }
    }

    CompositionLocalProvider(LocalNavLead provides lead, LocalSafeWord provides openSafe.takeIf { safeVm.canCall() }) {
        if (wide) {
            Row(Modifier.fillMaxSize()) {
                NavigationRail(
                    containerColor = MaterialTheme.colorScheme.surface,
                    header = {
                        DynamicSwitcherCompact(switcher)
                        if (newItems.isNotEmpty()) NewButton { newOpen = true }
                    },
                ) {
                    tabs.forEach { t ->
                        NavigationRailItem(
                            selected = marked(t),
                            onClick = { tab(t) },
                            icon = { Icon(t.icon, null) },
                            label = { Text(t.label) },
                        )
                    }
                }
                Box(Modifier.weight(1f)) { host() }
            }
        } else {
            Scaffold(
                bottomBar = {
                    if (showBar) TabBar(tabs, { t -> marked(t) }, { tab(it) }, if (newItems.isNotEmpty()) ({ newOpen = true }) else null)
                },
            ) { padding ->
                // Only the bar's space is reserved here; each screen's own Scaffold handles the top insets.
                val bottomOnly = androidx.compose.foundation.layout.PaddingValues(bottom = padding.calculateBottomPadding())
                Box(Modifier.padding(bottomOnly).consumeWindowInsets(bottomOnly)) { host() }
            }
        }
    }
}

/** An open safe call sits under every screen, just above the bar, until whoever called it clears it; the top bar never moves. */
@Composable
private fun SafeCallFrame(vm: SafeCallViewModel, call: SafeCall?, content: @Composable () -> Unit) {
    Column(Modifier.fillMaxSize()) {
        Box(Modifier.weight(1f)) { content() }
        if (call != null) SafeCallBanner(vm, call)
    }
}

/** The ink + that starts anything new: a rounded square raised through the bar's top line, in a notch of the page colour. */
@Composable
private fun NewButton(modifier: Modifier = Modifier, onClick: () -> Unit) {
    Box(modifier.background(MaterialTheme.colorScheme.surface, RoundedCornerShape(22.dp)).padding(6.dp)) {
        Surface(onClick = onClick, shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.onSurface, contentColor = MaterialTheme.colorScheme.surface, modifier = Modifier.size(56.dp)) {
            Box(contentAlignment = Alignment.Center) { Icon(Icons.Outlined.Add, "New", Modifier.size(28.dp)) }
        }
    }
}

/** The phone's tab bar: Today, Week and Us as words in the serif, the current one in ink under a diamond, then +. */
@Composable
private fun TabBar(tabs: List<TopLevel>, selected: (TopLevel) -> Boolean, onClick: (TopLevel) -> Unit, onNew: (() -> Unit)?) {
    // The + rises 20dp above the line, so the bar keeps a strip above it; content never scrolls under the button.
    Box(Modifier.background(MaterialTheme.colorScheme.surface).windowInsetsPadding(WindowInsets.navigationBars).fillMaxWidth().height(if (onNew != null) 94.dp else 69.dp)) {
      Column(Modifier.align(Alignment.BottomStart).fillMaxWidth()) {
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        Row(Modifier.fillMaxWidth().height(68.dp).padding(horizontal = 24.dp), verticalAlignment = Alignment.CenterVertically) {
            // Grouped on the left, the way the mockup has them, with + on its own at the right.
            Row(Modifier.selectableGroup(), horizontalArrangement = Arrangement.spacedBy(22.dp)) {
                tabs.forEach { t ->
                    val on = selected(t)
                    Box(
                        Modifier.height(56.dp).clip(MaterialTheme.shapes.small).selectable(selected = on, role = Role.Tab, onClick = { onClick(t) }).padding(horizontal = 4.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        if (on) Box(Modifier.align(Alignment.TopCenter).padding(top = 4.dp).size(6.dp).rotate(45f).background(MaterialTheme.colorScheme.primary))
                        Text(
                            t.label,
                            style = MaterialTheme.typography.titleLarge.copy(fontSize = 22.sp),
                            color = if (on) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.outline,
                            maxLines = 1,
                        )
                    }
                }
            }
        }
      }
      if (onNew != null) NewButton(Modifier.align(Alignment.TopEnd).padding(end = 18.dp), onClick = onNew)
    }
}

@Composable
private fun ObeyNavHost(nav: NavHostController, usItems: List<UsItem>, switcher: SwitcherActions, onInvite: (() -> Unit)?) {
    val settings = { nav.navigate(SettingsRoute) }
    val openTask = { id: String -> nav.navigate(TaskDetailRoute(id)) }
    NavHost(navController = nav, startDestination = TodayRoute) {
        composable<TodayRoute> {
            TodayScreen(
                onNewTask = { nav.navigate(TaskEditorRoute()) },
                onEditTask = { nav.navigate(TaskEditorRoute(taskId = it)) },
                onOpenTask = openTask,
                onOpenSettings = settings,
                onKits = { nav.navigate(KitsRoute) },
                onInvite = { nav.navigate(DynamicRoute(invite = true)) },
                onOpenTasks = { nav.navigate(TaskListRoute) },
                onOpenLocation = { nav.navigate(LocationRoute) },
                onOpenAgreement = { edit -> nav.navigate(if (edit) AgreementRoute(edit = true) else AgreementRoute(review = true)) },
                onOpenRules = { nav.navigate(RulesRoute) },
                onOpenProtocol = { nav.navigate(ProtocolEditorRoute(protocolId = it)) },
                onOpenScene = { nav.navigate(SceneRoute(it)) },
                onOpenChastity = { nav.navigate(ChastityRoute) },
            )
        }
        composable<UpcomingRoute> {
            UpcomingScreen(
                onNewTask = { date -> nav.navigate(TaskEditorRoute(date = date?.toString())) },
                onEditTask = { nav.navigate(TaskEditorRoute(taskId = it)) },
                onOpenTask = openTask,
                onAllTasks = { nav.navigate(TaskListRoute) },
                onOpenSettings = settings,
            )
        }
        composable<UsRoute> { UsScreen(usItems, switcher, onDynamic = { nav.navigate(DynamicRoute()) }, onSettings = settings, onInvite = onInvite) }
        composable<RewardsRoute> { RewardsScreen(onOpenSettings = settings) }
        composable<ConsequencesRoute> { RewardsScreen(onOpenSettings = settings, consequences = true) }
        composable<RulesRoute> {
            RulesScreen(
                onOpenSettings = settings,
                onOpenProtocol = { nav.navigate(ProtocolEditorRoute(protocolId = it)) },
                onOpenLog = { nav.navigate(RuleLogRoute) },
                // Protocols are a tab inside Rules: switching replaces the page rather than stacking it.
                onProtocols = if (LocalFeatures.current.protocols) ({ nav.navigate(ProtocolsRoute) { popUpTo<RulesRoute> { inclusive = true } } }) else null,
            )
        }
        composable<RuleLogRoute> { RuleLogScreen(onBack = { nav.popBackStack() }, onOpenTask = openTask) }
        composable<ProtocolsRoute> {
            ProtocolsScreen(
                onOpen = { nav.navigate(ProtocolEditorRoute(protocolId = it)) },
                onNew = { nav.navigate(ProtocolEditorRoute()) },
                onOpenSettings = settings,
                onOpenLog = { nav.navigate(RuleLogRoute) },
                onRules = if (LocalFeatures.current.rules) ({ nav.navigate(RulesRoute) { popUpTo<ProtocolsRoute> { inclusive = true } } }) else null,
            )
        }
        composable<ProtocolEditorRoute> { ProtocolEditorScreen(onDone = { nav.popBackStack() }) }
        composable<NotesRoute> {
            NotesScreen(
                journal = false,
                onOpen = { nav.navigate(NoteEditorRoute(noteId = it)) },
                onNew = { nav.navigate(NoteEditorRoute()) },
                onOpenSettings = settings,
            )
        }
        composable<JournalRoute> {
            NotesScreen(
                journal = true,
                onOpen = { nav.navigate(NoteEditorRoute(noteId = it, journal = true)) },
                onNew = { nav.navigate(NoteEditorRoute(journal = true)) },
                onOpenSettings = settings,
            )
        }
        composable<StatsRoute> { StatsScreen(onOpenSettings = settings, onOpenTask = openTask, onOpenReview = { nav.navigate(MonthReviewRoute) }) }
        composable<MonthReviewRoute> { MonthReviewScreen(onOpenSettings = settings, onOpenStats = { month, who -> nav.navigate(StatsRoute(month, who)) }) }
        composable<AgreementRoute> { AgreementScreen(onOpenSettings = settings, onOpenNote = { nav.navigate(NoteEditorRoute(noteId = it)) }, onOpenLimits = { nav.navigate(LimitsRoute) }) }
        composable<ScenesRoute> { ScenesScreen(onOpenSettings = settings, onOpen = { nav.navigate(SceneRoute(it)) }, onAftercare = { nav.navigate(AftercareRoute) }) }
        composable<SceneRoute> { SceneScreen(onBack = { nav.popBackStack() }) }
        composable<AftercareRoute> { AftercareScreen(onBack = { nav.popBackStack() }) }
        composable<ChastityRoute> { ChastityScreen(onOpenSettings = settings) }
        composable<LimitsRoute> { LimitsScreen(onEdit = { nav.navigate(LimitsEditRoute) }) }
        composable<LimitsEditRoute> { LimitsEditScreen(onClose = { nav.popBackStack() }) }
        composable<TaskListRoute> {
            TaskListScreen(
                onOpen = openTask,
                onNew = { nav.navigate(TaskEditorRoute()) },
                onOpenSettings = settings,
                onKits = { nav.navigate(KitsRoute) },
            )
        }
        // After a kit is added, open what it added: tasks first, then rules, protocols, rewards, consequences.
        val kitAdded: (ApplyKitResult) -> Unit = { r ->
            android.widget.Toast.makeText(nav.context, r.describe(), android.widget.Toast.LENGTH_SHORT).show()
            val to: Any = when {
                r.tasks > 0 -> TaskListRoute
                r.rules > 0 -> RulesRoute
                r.protocols > 0 -> ProtocolsRoute
                r.rewards > 0 -> RewardsRoute
                else -> ConsequencesRoute
            }
            nav.navigate(to) { popUpTo<KitsRoute> { inclusive = true } }
        }
        composable<KitsRoute> {
            KitsScreen(
                onAdded = { kitAdded(it) },
                onOpenKit = { nav.navigate(KitRoute(it)) },
                onNewKit = { nav.navigate(NewKitRoute) },
                onOpenShared = { nav.navigate(SharedKitRoute(it)) },
            )
        }
        composable<KitRoute> { entry ->
            KitScreen(entry.toRoute<KitRoute>().kitId, onBack = { nav.popBackStack() }, onAdded = { kitAdded(it) })
        }
        composable<NewKitRoute> {
            NewKitScreen(onBack = { nav.popBackStack() }, onSaved = { nav.navigate(KitRoute(it)) { popUpTo<NewKitRoute> { inclusive = true } } })
        }
        composable<SharedKitRoute> { entry ->
            SharedKitScreen(
                entry.toRoute<SharedKitRoute>().code,
                onBack = { nav.popBackStack() },
                onAdded = { kitAdded(it) },
                onSaved = { nav.navigate(KitRoute(it)) { popUpTo<SharedKitRoute> { inclusive = true } } },
            )
        }
        composable<TaskDetailRoute> {
            TaskDetailScreen(
                onBack = { nav.popBackStack() },
                onEdit = { nav.navigate(TaskEditorRoute(taskId = it)) },
                onHistory = { nav.navigate(TaskHistoryRoute(it)) },
                onOpenJournal = { nav.navigate(NoteEditorRoute(noteId = it, journal = true)) },
            )
        }
        composable<TaskHistoryRoute> { TaskHistoryScreen(onBack = { nav.popBackStack() }) }
        composable<TaskEditorRoute> { TaskEditorScreen(onDone = { nav.popBackStack() }, onKits = { nav.navigate(KitsRoute) }) }
        composable<NoteEditorRoute> { NoteEditorScreen(onDone = { nav.popBackStack() }) }
        composable<SettingsRoute> { SettingsScreen(onBack = { nav.popBackStack() }, onOpenDynamic = { nav.navigate(DynamicRoute()) }, onOpenFeatures = { nav.navigate(DynamicRoute(features = true)) }) }
        composable<DynamicRoute> { entry -> DynamicScreen(startInvite = entry.toRoute<DynamicRoute>().invite, startFeatures = entry.toRoute<DynamicRoute>().features, onBack = { nav.popBackStack() }, onPlaces = { nav.navigate(PlacesRoute) }, onLocation = { nav.navigate(LocationRoute) }, onCurfew = { nav.navigate(CurfewRoute) }) }
        composable<CurfewRoute> { app.obey.ui.location.CurfewScreen(onBack = { nav.popBackStack() }, onPlaces = { nav.navigate(PlacesRoute) }) }
        // Places are listed on Location now (mockup 22).
        composable<PlacesRoute> { app.obey.ui.location.LocationScreen(onCurfew = { nav.navigate(CurfewRoute) }) }
        composable<LocationRoute> { app.obey.ui.location.LocationScreen(onCurfew = { nav.navigate(CurfewRoute) }) }
    }
}
