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
import app.obey.auth.AuthState
import app.obey.data.SessionState
import app.obey.ui.common.LoadingBox
import app.obey.ui.notes.NoteEditorScreen
import app.obey.ui.notes.NotesScreen
import app.obey.ui.onboarding.RelationshipSetupScreen
import app.obey.ui.onboarding.SignInScreen
import app.obey.ui.rewards.RewardsScreen
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
                        key(s.session.relationship.id) { MainScaffold() }
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

private val topLevels = listOf(
    TopLevel(TodayRoute, "Today", Icons.Outlined.Today) { it.hasRoute<TodayRoute>() },
    TopLevel(UpcomingRoute, "Upcoming", Icons.Outlined.CalendarMonth) { it.hasRoute<UpcomingRoute>() },
    TopLevel(RewardsRoute, "Rewards", Icons.Outlined.EmojiEvents) { it.hasRoute<RewardsRoute>() },
    TopLevel(RulesRoute, "Rules", Icons.Outlined.Gavel) { it.hasRoute<RulesRoute>() },
    TopLevel(NotesRoute, "Notes", Icons.AutoMirrored.Outlined.Notes) { it.hasRoute<NotesRoute>() },
)

@Composable
private fun MainScaffold() {
    val nav = rememberNavController()
    val entry by nav.currentBackStackEntryAsState()
    val destination = entry?.destination
    val isTopLevel = destination != null && topLevels.any { t -> destination.hierarchy.any(t.matches) }
    val wide = LocalConfiguration.current.screenWidthDp >= 600

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
                topLevels.forEach { t ->
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
                        topLevels.forEach { t ->
                            NavigationBarItem(
                                selected = selected(t),
                                onClick = { go(t.route) },
                                icon = { Icon(t.icon, null) },
                                label = { Text(t.label) },
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
        composable<NotesRoute> {
            NotesScreen(
                onOpen = { nav.navigate(NoteEditorRoute(noteId = it)) },
                onNew = { nav.navigate(NoteEditorRoute()) },
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
