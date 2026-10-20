package app.obey.ui

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
import androidx.compose.material.icons.automirrored.outlined.Notes
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.EmojiEvents
import androidx.compose.material.icons.outlined.Gavel
import androidx.compose.material.icons.outlined.Today
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
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
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.material.icons.outlined.AutoStories
import androidx.compose.material.icons.outlined.Bolt
import androidx.compose.material.icons.outlined.FactCheck
import androidx.compose.material.icons.outlined.Menu
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ListItem
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import app.obey.api.Features
import app.obey.ui.common.LocalFeatures
import app.obey.auth.AuthState
import app.obey.data.SessionState
import app.obey.ui.common.LoadingBox
import app.obey.ui.notes.NoteEditorScreen
import app.obey.ui.notes.NotesScreen
import app.obey.ui.onboarding.RelationshipSetupScreen
import app.obey.ui.onboarding.SignInScreen
import app.obey.ui.rewards.RewardsScreen
import app.obey.ui.protocols.ProtocolsScreen
import app.obey.ui.rules.RulesScreen
import app.obey.ui.settings.SettingsScreen
import app.obey.ui.settings.SettingsViewModel
import app.obey.ui.tasks.TaskEditorScreen
import app.obey.ui.tasks.TaskListScreen
import app.obey.ui.today.TodayScreen
import app.obey.ui.upcoming.UpcomingScreen

@Composable
fun ObeyRoot(vm: RootViewModel = hiltViewModel()) {
    val auth by vm.authState.collectAsStateWithLifecycle()
    val session by vm.session.collectAsStateWithLifecycle()

    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        when {
            auth == null -> LoadingBox()
            auth is AuthState.SignedOut -> SignInScreen()
            else -> when (val s = session) {
                SessionState.Loading -> LoadingBox()
                is SessionState.Error -> SessionError(s.message, vm::retry)
                is SessionState.Ready ->
                    if (s.session.relationship == null) {
                        RelationshipSetupScreen()
                    } else {
                        // A new NavHost (and fresh ViewModels) per relationship.
                        key(s.session.relationship.id) {
                            CompositionLocalProvider(LocalFeatures provides s.session.relationship.features) { MainScaffold() }
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

/** The destinations this dynamic uses, in bar order. Rewards stays as a home for consequences when points are off. */
private fun topLevels(f: Features) = listOfNotNull(
    TopLevel(TodayRoute, "Today", Icons.Outlined.Today) { it.hasRoute<TodayRoute>() },
    TopLevel(UpcomingRoute, "Upcoming", Icons.Outlined.CalendarMonth) { it.hasRoute<UpcomingRoute>() },
    when {
        f.points -> TopLevel(RewardsRoute, "Rewards", Icons.Outlined.EmojiEvents) { it.hasRoute<RewardsRoute>() }
        f.consequences -> TopLevel(RewardsRoute, "Consequences", Icons.Outlined.Bolt) { it.hasRoute<RewardsRoute>() }
        else -> null
    },
    if (f.rules) TopLevel(RulesRoute, "Rules", Icons.Outlined.Gavel) { it.hasRoute<RulesRoute>() } else null,
    if (f.protocols) TopLevel(ProtocolsRoute, "Protocols", Icons.Outlined.FactCheck) { it.hasRoute<ProtocolsRoute>() } else null,
    TopLevel(NotesRoute, "Notes", Icons.AutoMirrored.Outlined.Notes) { it.hasRoute<NotesRoute>() },
    if (f.journal) TopLevel(JournalRoute, "Journal", Icons.Outlined.AutoStories) { it.hasRoute<JournalRoute>() } else null,
)

/** A phone's bar fits five; past that it keeps Today, Upcoming, Rewards and the first writing space, and the rest go under More. */
private fun splitBar(all: List<TopLevel>): Pair<List<TopLevel>, List<TopLevel>> {
    if (all.size <= 5) return all to emptyList()
    val writing = all.firstOrNull { it.route in writingRoutes }
    val bar = (all.filter { it.route !in writingRoutes }.take(3) + listOfNotNull(writing)).take(4)
    return bar to all.filter { it !in bar }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MainScaffold() {
    val nav = rememberNavController()
    val entry by nav.currentBackStackEntryAsState()
    val destination = entry?.destination
    val features = LocalFeatures.current
    val all = remember(features) { topLevels(features) }
    val (bar, overflow) = remember(all) { splitBar(all) }
    val isTopLevel = destination != null && all.any { t -> destination.hierarchy.any(t.matches) }
    val wide = LocalConfiguration.current.screenWidthDp >= 600
    var moreOpen by remember { mutableStateOf(false) }
    // A tab the dynamic just switched off (say, from Settings) shouldn't stay reachable underneath.
    val switchedOff = destination != null && !isTopLevel && destination.hierarchy.any {
        it.hasRoute<RewardsRoute>() || it.hasRoute<RulesRoute>() || it.hasRoute<ProtocolsRoute>() || it.hasRoute<JournalRoute>()
    }
    LaunchedEffect(switchedOff) { if (switchedOff) nav.navigate(TodayRoute) { popUpTo(nav.graph.findStartDestination().id) } }

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

    if (wide) {
        Row(Modifier.fillMaxSize()) {
            NavigationRail {
                all.forEach { t ->
                    NavigationRailItem(
                        selected = selected(t),
                        onClick = { go(t.route) },
                        icon = { Icon(t.icon, null) },
                        label = { Text(t.label) },
                    )
                }
            }
            Box(Modifier.weight(1f)) { ObeyNavHost(nav) }
        }
    } else {
        Scaffold(
            bottomBar = {
                if (isTopLevel) {
                    NavigationBar {
                        bar.forEach { t ->
                            NavigationBarItem(
                                selected = selected(t),
                                onClick = { go(t.route) },
                                icon = { Icon(t.icon, null) },
                                label = { Text(t.label) },
                            )
                        }
                        if (overflow.isNotEmpty()) {
                            NavigationBarItem(
                                selected = overflow.any(::selected),
                                onClick = { moreOpen = true },
                                icon = { Icon(Icons.Outlined.Menu, null) },
                                label = { Text("More") },
                            )
                        }
                    }
                }
            },
        ) { padding ->
            // Only the bottom bar's space is reserved here; each screen's own Scaffold handles the top insets.
            val bottomOnly = androidx.compose.foundation.layout.PaddingValues(bottom = padding.calculateBottomPadding())
            Box(Modifier.padding(bottomOnly).consumeWindowInsets(bottomOnly)) { ObeyNavHost(nav) }
        }
        if (moreOpen) {
            ModalBottomSheet(onDismissRequest = { moreOpen = false }) {
                overflow.forEach { t ->
                    ListItem(
                        headlineContent = { Text(t.label) },
                        leadingContent = { Icon(t.icon, null) },
                        modifier = Modifier.clickable { moreOpen = false; go(t.route) },
                    )
                }
                Spacer(Modifier.height(24.dp))
            }
        }
    }
}

@Composable
private fun ObeyNavHost(nav: NavHostController) {
    val settings = { nav.navigate(SettingsRoute) }
    NavHost(navController = nav, startDestination = TodayRoute) {
        composable<TodayRoute> {
            TodayScreen(
                onNewTask = { nav.navigate(TaskEditorRoute()) },
                onEditTask = { nav.navigate(TaskEditorRoute(taskId = it)) },
                onOpenSettings = settings,
            )
        }
        composable<UpcomingRoute> {
            UpcomingScreen(
                onNewTask = { date -> nav.navigate(TaskEditorRoute(date = date?.toString())) },
                onEditTask = { nav.navigate(TaskEditorRoute(taskId = it)) },
                onAllTasks = { nav.navigate(TaskListRoute) },
                onOpenSettings = settings,
            )
        }
        composable<RewardsRoute> { RewardsScreen(onOpenSettings = settings) }
        composable<RulesRoute> { RulesScreen(onOpenSettings = settings) }
        composable<ProtocolsRoute> { ProtocolsScreen(onOpenSettings = settings) }
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
        composable<TaskListRoute> {
            TaskListScreen(
                onBack = { nav.popBackStack() },
                onEdit = { nav.navigate(TaskEditorRoute(taskId = it)) },
                onNew = { nav.navigate(TaskEditorRoute()) },
            )
        }
        composable<TaskEditorRoute> { TaskEditorScreen(onDone = { nav.popBackStack() }) }
        composable<NoteEditorRoute> { NoteEditorScreen(onDone = { nav.popBackStack() }) }
        composable<SettingsRoute> { SettingsScreen(onBack = { nav.popBackStack() }) }
    }
}
