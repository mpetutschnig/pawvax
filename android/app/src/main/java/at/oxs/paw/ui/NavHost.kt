package at.oxs.paw.ui

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import at.oxs.paw.ui.admin.AdminDashboard
import at.oxs.paw.ui.admin.AuditLogScreen
import at.oxs.paw.ui.animal.AnimalScreen
import at.oxs.paw.ui.document.DocumentScanScreen
import at.oxs.paw.ui.login.LoginScreen
import at.oxs.paw.ui.organization.OrganizationScreen
import at.oxs.paw.ui.organization.OrganizationDetailScreen
import at.oxs.paw.ui.profile.ProfileScreen
import at.oxs.paw.ui.scan.ScanScreen
import at.oxs.paw.ui.sharing.SharingSettingsScreen
import at.oxs.paw.ui.tags.TagManagementScreen
import at.oxs.paw.viewmodel.*
import at.oxs.paw.network.RetrofitClient

@Composable
fun AppNavHost(
    navController: NavHostController,
    modifier: Modifier = Modifier,
    registerNfcCallback: ((String) -> Unit) -> Unit,
    unregisterNfcCallback: () -> Unit
) {
    val apiService = RetrofitClient.apiService
    val authViewModel = androidx.lifecycle.viewmodel.compose.viewModel<AuthViewModel> { AuthViewModel(apiService) }
    val animalViewModel = androidx.lifecycle.viewmodel.compose.viewModel<AnimalViewModel> { AnimalViewModel(apiService) }
    val documentViewModel = androidx.lifecycle.viewmodel.compose.viewModel<DocumentViewModel> { DocumentViewModel(apiService) }
    val profileViewModel = androidx.lifecycle.viewmodel.compose.viewModel<ProfileViewModel> { ProfileViewModel(apiService) }
    val organizationViewModel = androidx.lifecycle.viewmodel.compose.viewModel<OrganizationViewModel> { OrganizationViewModel(apiService) }
    val adminViewModel = androidx.lifecycle.viewmodel.compose.viewModel<AdminViewModel> { AdminViewModel(apiService) }

    NavHost(navController = navController, startDestination = "login", modifier = modifier) {
        composable("login") {
            LoginScreen(onLogin = { navController.navigate("scan") { popUpTo("login") { inclusive = true } } })
        }
        composable("scan") {
            ScanScreen(
                onAnimalFound = { id -> navController.navigate("animal/$id") },
                registerNfcCallback = registerNfcCallback,
                unregisterNfcCallback = unregisterNfcCallback,
                onNavigateToProfile = { navController.navigate("profile") },
                onNavigateToOrganizations = { navController.navigate("organizations") },
                onNavigateToAdmin = { navController.navigate("admin") }
            )
        }
        composable("animal/{id}") { back ->
            val id = back.arguments?.getString("id") ?: return@composable
            AnimalScreen(
                animalId = id,
                onBack = { navController.popBackStack() },
                onManageTags = { navController.navigate("tags/$id") },
                onScanDocument = { navController.navigate("docScan/$id") },
                onNavigateToSharing = { animalId -> navController.navigate("sharing/$animalId") }
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
        composable("profile") {
            ProfileScreen(
                viewModel = profileViewModel,
                onBack = { navController.popBackStack() }
            )
        }
        composable("organizations") {
            OrganizationScreen(
                viewModel = organizationViewModel,
                onBack = { navController.popBackStack() },
                onOrgSelected = { orgId -> navController.navigate("org/$orgId") }
            )
        }
        composable("org/{id}") { back ->
            val id = back.arguments?.getString("id") ?: return@composable
            OrganizationDetailScreen(
                viewModel = organizationViewModel,
                orgId = id,
                onBack = { navController.popBackStack() }
            )
        }
        composable("sharing/{id}") { back ->
            val id = back.arguments?.getString("id") ?: return@composable
            SharingSettingsScreen(
                viewModel = animalViewModel,
                animalId = id,
                onBack = { navController.popBackStack() }
            )
        }
        composable("admin") {
            AdminDashboard(
                viewModel = adminViewModel,
                onBack = { navController.popBackStack() },
                onNavigateToAuditLog = { navController.navigate("auditLog") }
            )
        }
        composable("auditLog") {
            AuditLogScreen(
                viewModel = adminViewModel,
                onBack = { navController.popBackStack() }
            )
        }
    }
}
