package at.oxs.paw.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import at.oxs.paw.ui.admin.AdminDashboard
import at.oxs.paw.ui.admin.AuditLogScreen
import at.oxs.paw.ui.animals.AnimalsScreen
import at.oxs.paw.ui.animal.AnimalScreen
import at.oxs.paw.ui.document.DocumentDetailScreen
import at.oxs.paw.ui.document.DocumentScanScreen
import at.oxs.paw.ui.login.LoginScreen
import at.oxs.paw.ui.organization.OrganizationScreen
import at.oxs.paw.ui.organization.OrganizationDetailScreen
import at.oxs.paw.ui.profile.ProfileScreen
import at.oxs.paw.ui.scan.ScanTabScreen
import at.oxs.paw.ui.sharing.SharingSettingsScreen
import at.oxs.paw.ui.tags.TagManagementScreen
import at.oxs.paw.network.TokenStore
import kotlinx.coroutines.launch

@Composable
fun AppNavHost(
    navController: NavHostController,
    modifier: Modifier = Modifier,
    registerNfcCallback: ((String) -> Unit) -> Unit,
    unregisterNfcCallback: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var userRole by remember { mutableStateOf("user") }

    LaunchedEffect(Unit) {
        userRole = TokenStore.getRole(context)
    }

    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = navBackStackEntry?.destination?.route

    val topLevelRoutes = setOf("animals", "scan", "profile", "admin")
    val showBottomBar = currentRoute in topLevelRoutes

    Scaffold(
        bottomBar = {
            if (showBottomBar) {
                NavigationBar {
                    NavigationBarItem(
                        icon = { Text("🐾") },
                        label = { Text("Tiere") },
                        selected = currentRoute == "animals",
                        onClick = {
                            navController.navigate("animals") {
                                popUpTo("animals") { inclusive = true }
                            }
                        }
                    )
                    NavigationBarItem(
                        icon = { Text("📷") },
                        label = { Text("Scannen") },
                        selected = currentRoute == "scan",
                        onClick = {
                            navController.navigate("scan") {
                                popUpTo("scan") { inclusive = true }
                            }
                        }
                    )
                    NavigationBarItem(
                        icon = { Icon(Icons.Default.Person, null) },
                        label = { Text("Profil") },
                        selected = currentRoute == "profile",
                        onClick = {
                            navController.navigate("profile") {
                                popUpTo("profile") { inclusive = true }
                            }
                        }
                    )
                    if (userRole == "admin") {
                        NavigationBarItem(
                            icon = { Icon(Icons.Default.Settings, null) },
                            label = { Text("Admin") },
                            selected = currentRoute == "admin",
                            onClick = {
                                navController.navigate("admin") {
                                    popUpTo("admin") { inclusive = true }
                                }
                            }
                        )
                    }
                }
            }
        }
    ) { innerPadding ->
        Box(modifier = Modifier.padding(innerPadding)) {
            NavHost(navController = navController, startDestination = "login", modifier = modifier) {
                composable("login") {
                    LoginScreen(onLogin = {
                        scope.launch {
                            userRole = TokenStore.getRole(context)
                            navController.navigate("animals") { popUpTo("login") { inclusive = true } }
                        }
                    })
                }

                composable("animals") {
                    AnimalsScreen(
                        onAnimalFound = { id -> navController.navigate("animal/$id") },
                        registerNfcCallback = registerNfcCallback,
                        unregisterNfcCallback = unregisterNfcCallback,
                        onNavigateToProfile = { navController.navigate("profile") },
                        onNavigateToOrganizations = { navController.navigate("organizations") },
                        onNavigateToAdmin = { navController.navigate("admin") }
                    )
                }

                composable("scan") {
                    ScanTabScreen(
                        onAnimalFound = { id -> navController.navigate("animal/$id") },
                        registerNfcCallback = registerNfcCallback,
                        unregisterNfcCallback = unregisterNfcCallback
                    )
                }

                composable("profile") {
                    ProfileScreen(
                        onBack = { navController.popBackStack() },
                        onLogout = {
                            scope.launch {
                                TokenStore.clearRole(context)
                                navController.navigate("login") {
                                    popUpTo(0) { inclusive = true }
                                }
                            }
                        }
                    )
                }

                composable("admin") {
                    AdminDashboard(
                        onBack = { navController.popBackStack() },
                        onNavigateToAuditLog = { navController.navigate("auditLog") }
                    )
                }

                composable("animal/{id}") { back ->
                    val id = back.arguments?.getString("id") ?: return@composable
                    AnimalScreen(
                        animalId = id,
                        onBack = { navController.popBackStack() },
                        onManageTags = { navController.navigate("tags/$id") },
                        onScanDocument = { navController.navigate("docScan/$id") },
                        onNavigateToSharing = { animalId -> navController.navigate("sharing/$animalId") },
                        onDocumentClicked = { docId -> navController.navigate("document/$id/$docId") }
                    )
                }

                composable("tags/{id}") { back ->
                    val id = back.arguments?.getString("id") ?: return@composable
                    TagManagementScreen(
                        animalId = id,
                        onBack = { navController.popBackStack() },
                        registerNfcCallback = registerNfcCallback,
                        unregisterNfcCallback = unregisterNfcCallback
                    )
                }

                composable("docScan/{id}") { back ->
                    val id = back.arguments?.getString("id") ?: return@composable
                    DocumentScanScreen(
                        animalId = id,
                        onBack = { navController.popBackStack() },
                        onDone = { navController.navigate("animal/$id") { popUpTo("animal/$id") { inclusive = true } } }
                    )
                }

                composable("document/{animalId}/{docId}") { back ->
                    val animalId = back.arguments?.getString("animalId") ?: return@composable
                    val docId = back.arguments?.getString("docId") ?: return@composable
                    DocumentDetailScreen(
                        docId = docId,
                        animalId = animalId,
                        onBack = { navController.popBackStack() }
                    )
                }

                composable("organizations") {
                    OrganizationScreen(
                        onBack = { navController.popBackStack() },
                        onOrgSelected = { orgId -> navController.navigate("org/$orgId") }
                    )
                }

                composable("org/{id}") { back ->
                    val id = back.arguments?.getString("id") ?: return@composable
                    OrganizationDetailScreen(
                        orgId = id,
                        onBack = { navController.popBackStack() }
                    )
                }

                composable("sharing/{id}") { back ->
                    val id = back.arguments?.getString("id") ?: return@composable
                    SharingSettingsScreen(
                        animalId = id,
                        onBack = { navController.popBackStack() }
                    )
                }

                composable("auditLog") {
                    AuditLogScreen(
                        onBack = { navController.popBackStack() }
                    )
                }
            }
        }
    }
}
