package app.obey.ui

import android.Manifest
import android.os.Build
import androidx.activity.compose.BackHandler
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
import androidx.compose.material.icons.automirrored.outlined.Notes
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.Checklist
import androidx.compose.material.icons.outlined.EmojiEvents
import androidx.compose.material.icons.outlined.Gavel
import androidx.compose.material.icons.outlined.Today
import androidx.compose.material3.Button
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
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.NavigationDrawerItem
import androidx.compose.material3.NavigationDrawerItemDefaults
import androidx.compose.material3.rememberDrawerState
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import kotlinx.coroutines.launch
import app.obey.ui.common.LocalOpenMenu
import app.obey.ui.common.LocalSafeWord
import app.obey.api.SafeCall
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
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
import app.obey.ui.kits.KitsScreen
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
                            CompositionLocalProvider(LocalFeatures provides s.session.relationship.features, app.obey.ui.location.LocalPlaces provides byId) {
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

private data class TopLevel(
    val route: Any,
    val label: String,
    val icon: ImageVector,
    val matches: (NavDestination) -> Boolean,
)

private val writingRoutes = setOf<Any>(NotesRoute, JournalRoute)

/** The destinations this dynamic uses, in bar order. Rewards and Consequences are separate pages, as on the web. */
private fun topLevels(f: Features) = listOfNotNull(
    TopLevel(TodayRoute, "Today", Icons.Outlined.Today) { it.hasRoute<TodayRoute>() },
    TopLevel(UpcomingRoute, "Calendar", Icons.Outlined.CalendarMonth) { it.hasRoute<UpcomingRoute>() },
    if (f.points) TopLevel(RewardsRoute, "Rewards", Icons.Outlined.EmojiEvents) { it.hasRoute<RewardsRoute>() } else null,
    if (f.consequences) TopLevel(ConsequencesRoute, "Consequences", Icons.Outlined.Bolt) { it.hasRoute<ConsequencesRoute>() } else null,
    if (f.rules) TopLevel(RulesRoute, "Rules", Icons.Outlined.Gavel) { it.hasRoute<RulesRoute>() } else null,
    if (f.protocols) TopLevel(ProtocolsRoute, "Protocols", Icons.Outlined.FactCheck) { it.hasRoute<ProtocolsRoute>() } else null,
    TopLevel(NotesRoute, "Notes", Icons.AutoMirrored.Outlined.Notes) { it.hasRoute<NotesRoute>() },
    if (f.journal) TopLevel(JournalRoute, "Journal", Icons.Outlined.AutoStories) { it.hasRoute<JournalRoute>() } else null,
    if (f.stats) TopLevel(StatsRoute, "Stats", Icons.Outlined.Insights) { it.hasRoute<StatsRoute>() } else null,
    if (f.review) TopLevel(MonthReviewRoute, "Monthly review", Icons.Outlined.Flag) { it.hasRoute<MonthReviewRoute>() } else null,
    // Tasks open from Today and Calendar; the full list is for managing them, so it sits under More.
    TopLevel(TaskListRoute, "All tasks", Icons.Outlined.Checklist) { it.hasRoute<TaskListRoute>() },
)

/** The phone's bar holds Today, Calendar, the next section that's on, and the first writing space; the rest go in the menu. Stats and the monthly review are always in the menu. */
private fun splitBar(all: List<TopLevel>): Pair<List<TopLevel>, List<TopLevel>> {
    val writing = all.firstOrNull { it.route in writingRoutes }
    val bar = all.filter { it.route !in writingRoutes && it.route != StatsRoute && it.route != MonthReviewRoute }.take(3) + listOfNotNull(writing)
    return bar to all.filter { it !in bar }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MainScaffold(session: Session, settingsVm: SettingsViewModel = hiltViewModel(), safeVm: SafeCallViewModel = hiltViewModel(key = "safe-${session.relationship?.id}")) {
    val nav = rememberNavController()
    val entry by nav.currentBackStackEntryAsState()
    val destination = entry?.destination
    val features = LocalFeatures.current
    val all = remember(features) { topLevels(features) }
    val (bar, overflow) = remember(all) { splitBar(all) }
    val isTopLevel = destination != null && all.any { t -> destination.hierarchy.any(t.matches) }
    val wide = LocalConfiguration.current.screenWidthDp >= 600
    // A tab the dynamic just switched off (say, from Settings) shouldn't stay reachable underneath.
    val switchedOff = destination != null && !isTopLevel && destination.hierarchy.any {
        it.hasRoute<RewardsRoute>() || it.hasRoute<ConsequencesRoute>() || it.hasRoute<RulesRoute>() || it.hasRoute<ProtocolsRoute>() || it.hasRoute<JournalRoute>() || it.hasRoute<StatsRoute>() || it.hasRoute<MonthReviewRoute>()
    }
    LaunchedEffect(switchedOff) { if (switchedOff) nav.navigate(TodayRoute) { popUpTo(nav.graph.findStartDestination().id) } }
    // A push asking to set up location opens its screen.
    LaunchedEffect(Unit) {
        app.obey.push.PendingNav.target.collect { target ->
            if (target == app.obey.push.PendingNav.LOCATION && features.location) nav.navigate(LocationRoute)
            if (target != null) app.obey.push.PendingNav.target.value = null
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
    fun selected(t: TopLevel) = destination?.hierarchy?.any(t.matches) == true
    // Joining and starting another dynamic live on Your dynamic.
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
    val switcher = SwitcherActions(session, settingsVm::loadAvatar, { settingsVm.selectRelationship(it) }, { nav.navigate(DynamicRoute) }, { nav.navigate(DynamicRoute) })

    if (wide) {
        Row(Modifier.fillMaxSize()) {
            NavigationRail(header = { DynamicSwitcherCompact(switcher) }) {
                all.forEach { t ->
                    NavigationRailItem(
                        selected = selected(t),
                        onClick = { go(t.route) },
                        icon = { Icon(t.icon, null) },
                        label = { Text(t.label) },
                    )
                }
            }
            CompositionLocalProvider(LocalSafeWord provides openSafe.takeIf { safeVm.canCall() }) {
                Box(Modifier.weight(1f)) { SafeCallFrame(safeVm, activeCall) { ObeyNavHost(nav) } }
            }
        }
    } else {
        val drawer = rememberDrawerState(DrawerValue.Closed)
        val scope = rememberCoroutineScope()
        val openMenu = remember { { scope.launch { drawer.open() }; Unit } }
        LaunchedEffect(destination) { drawer.close() }
        BackHandler(drawer.isOpen) { scope.launch { drawer.close() } }
        ModalNavigationDrawer(
            drawerState = drawer,
            // Swiping open would fight horizontal gestures like the calendar's; the header button opens it.
            gesturesEnabled = drawer.isOpen,
            drawerContent = {
                ModalDrawerSheet(Modifier.width(300.dp), drawerShape = RoundedCornerShape(topEnd = 24.dp, bottomEnd = 24.dp)) {
                    Column(Modifier.verticalScroll(rememberScrollState()).padding(vertical = 12.dp)) {
                        DynamicSwitcher(switcher) { scope.launch { drawer.close() } }
                        Spacer(Modifier.height(8.dp))
                        overflow.forEach { t -> MenuItem(t.label, t.icon, selected(t)) { go(t.route) } }
                        HorizontalDivider(Modifier.padding(horizontal = 28.dp, vertical = 8.dp), color = MaterialTheme.colorScheme.outlineVariant)
                        MenuItem("Your dynamic", Icons.Outlined.FavoriteBorder, destination?.hasRoute<DynamicRoute>() == true) { nav.navigate(DynamicRoute) }
                        MenuItem("Settings", Icons.Outlined.Settings, destination?.hasRoute<SettingsRoute>() == true) { nav.navigate(SettingsRoute) }
                    }
                }
            },
        ) {
            CompositionLocalProvider(LocalOpenMenu provides openMenu, LocalSafeWord provides openSafe.takeIf { safeVm.canCall() }) {
                Scaffold(bottomBar = { if (isTopLevel) FloatingBar(bar, ::selected) { go(it.route) } }) { padding ->
                    // Only the bottom bar's space is reserved here; each screen's own Scaffold handles the top insets.
                    val bottomOnly = androidx.compose.foundation.layout.PaddingValues(bottom = padding.calculateBottomPadding())
                    Box(Modifier.padding(bottomOnly).consumeWindowInsets(bottomOnly)) { SafeCallFrame(safeVm, activeCall) { ObeyNavHost(nav) } }
                }
            }
        }
    }
}

/** An open safe call sits under every screen, just above the bar, until someone clears it; the top bar never moves. */
@Composable
private fun SafeCallFrame(vm: SafeCallViewModel, call: SafeCall?, content: @Composable () -> Unit) {
    Column(Modifier.fillMaxSize()) {
        Box(Modifier.weight(1f)) { content() }
        if (call != null) SafeCallBanner(vm, call)
    }
}

@Composable
private fun MenuItem(label: String, icon: ImageVector, selected: Boolean, onClick: () -> Unit) {
    NavigationDrawerItem(
        label = { Text(label) },
        icon = { Icon(icon, null) },
        selected = selected,
        onClick = onClick,
        modifier = Modifier.padding(NavigationDrawerItemDefaults.ItemPadding),
    )
}

/** The phone's floating row of tiles: the current page fills its tile. */
@Composable
private fun FloatingBar(items: List<TopLevel>, selected: (TopLevel) -> Boolean, onClick: (TopLevel) -> Unit) {
    Surface(
        Modifier.windowInsetsPadding(WindowInsets.navigationBars).padding(start = 12.dp, end = 12.dp, top = 8.dp, bottom = 16.dp).fillMaxWidth().height(76.dp),
        shape = RoundedCornerShape(24.dp),
        color = MaterialTheme.colorScheme.surfaceContainerLowest,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.7f)),
        shadowElevation = 3.dp,
    ) {
        Row(Modifier.selectableGroup().padding(6.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            items.forEach { t ->
                val on = selected(t)
                val color = if (on) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurfaceVariant
                Column(
                    Modifier
                        .weight(1f)
                        .fillMaxHeight()
                        .clip(RoundedCornerShape(18.dp))
                        .background(if (on) MaterialTheme.colorScheme.primaryContainer else Color.Transparent)
                        .selectable(selected = on, role = Role.Tab, onClick = { onClick(t) }),
                    verticalArrangement = Arrangement.spacedBy(2.dp, Alignment.CenterVertically),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Icon(t.icon, null, tint = color)
                    Text(t.label, style = MaterialTheme.typography.labelMedium, color = color, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
        }
    }
}

@Composable
private fun ObeyNavHost(nav: NavHostController) {
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
                onOpenLocation = { nav.navigate(LocationRoute) },
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
        composable<RewardsRoute> { RewardsScreen(onOpenSettings = settings) }
        composable<ConsequencesRoute> { RewardsScreen(onOpenSettings = settings, consequences = true) }
        composable<RulesRoute> {
            RulesScreen(onOpenSettings = settings, onOpenProtocol = { nav.navigate(ProtocolEditorRoute(protocolId = it)) }, onOpenLog = { nav.navigate(RuleLogRoute) })
        }
        composable<RuleLogRoute> { RuleLogScreen(onBack = { nav.popBackStack() }, onOpenTask = openTask) }
        composable<ProtocolsRoute> {
            ProtocolsScreen(
                onOpen = { nav.navigate(ProtocolEditorRoute(protocolId = it)) },
                onNew = { nav.navigate(ProtocolEditorRoute()) },
                onOpenSettings = settings,
                onOpenLog = { nav.navigate(RuleLogRoute) },
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
        composable<StatsRoute> { StatsScreen(onOpenSettings = settings, onOpenTask = openTask) }
        composable<MonthReviewRoute> { MonthReviewScreen(onOpenSettings = settings) }
        composable<TaskListRoute> {
            TaskListScreen(
                onOpen = openTask,
                onNew = { nav.navigate(TaskEditorRoute()) },
                onOpenSettings = settings,
                onKits = { nav.navigate(KitsRoute) },
            )
        }
        composable<KitsRoute> {
            val context = androidx.compose.ui.platform.LocalContext.current
            KitsScreen(
                onBack = { nav.popBackStack() },
                onAdded = { r ->
                    android.widget.Toast.makeText(context, r.describe(), android.widget.Toast.LENGTH_SHORT).show()
                    nav.navigate(if (r.tasks > 0) TaskListRoute else if (r.rules > 0) RulesRoute else ProtocolsRoute) { popUpTo<KitsRoute> { inclusive = true } }
                },
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
        composable<TaskEditorRoute> { TaskEditorScreen(onDone = { nav.popBackStack() }) }
        composable<NoteEditorRoute> { NoteEditorScreen(onDone = { nav.popBackStack() }) }
        composable<SettingsRoute> { SettingsScreen(onBack = { nav.popBackStack() }, onOpenDynamic = { nav.navigate(DynamicRoute) }) }
        composable<DynamicRoute> { DynamicScreen(onBack = { nav.popBackStack() }, onPlaces = { nav.navigate(PlacesRoute) }, onLocation = { nav.navigate(LocationRoute) }, onCurfew = { nav.navigate(CurfewRoute) }) }
        composable<CurfewRoute> { app.obey.ui.location.CurfewScreen(onBack = { nav.popBackStack() }, onPlaces = { nav.navigate(PlacesRoute) }) }
        composable<PlacesRoute> { app.obey.ui.location.PlacesScreen(onBack = { nav.popBackStack() }) }
        composable<LocationRoute> { app.obey.ui.location.LocationScreen(onBack = { nav.popBackStack() }) }
    }
}
