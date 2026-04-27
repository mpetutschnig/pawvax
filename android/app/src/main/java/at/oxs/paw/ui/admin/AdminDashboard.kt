package at.oxs.paw.ui.admin

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import at.oxs.paw.viewmodel.AdminViewModel
import at.oxs.paw.ui.theme.Spacing
import at.oxs.paw.viewmodel.UiState
import at.oxs.paw.viewmodel.ViewModelFactory

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AdminDashboard(
    onBack: () -> Unit,
    onNavigateToAuditLog: () -> Unit
) {
    val context = LocalContext.current
    val viewModel = viewModel<AdminViewModel>(factory = ViewModelFactory(context))
    
    val accounts by viewModel.accounts.collectAsState()
    val animals by viewModel.animals.collectAsState()
    val verifications by viewModel.verifications.collectAsState()
    val stats by viewModel.stats.collectAsState()
    val auditLog by viewModel.auditLog.collectAsState()
    val uiState by viewModel.uiState.collectAsState()

    var selectedTab by remember { mutableIntStateOf(0) }
    val tabs = listOf("Übersicht", "Accounts", "Tiere", "Verifikationen", "Audit")

    var showRoleDialog by remember { mutableStateOf(false) }
    var selectedAccountId by remember { mutableStateOf("") }
    var selectedRole by remember { mutableStateOf("user") }

    LaunchedEffect(selectedTab) {
        when (selectedTab) {
            0 -> viewModel.loadStats()
            1 -> viewModel.loadAccounts()
            2 -> viewModel.loadAnimals()
            3 -> viewModel.loadVerifications()
            4 -> viewModel.loadAuditLog()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Admin Panel") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back")
                    }
                }
            )
        }
    ) { innerPadding ->
        Column(modifier = Modifier.fillMaxSize().padding(innerPadding)) {
            ScrollableTabRow(selectedTabIndex = selectedTab, edgePadding = 16.dp) {
                tabs.forEachIndexed { index, title ->
                    Tab(
                        selected = selectedTab == index,
                        onClick = { selectedTab = index },
                        text = { Text(title) }
                    )
                }
            }

            Box(modifier = Modifier.fillMaxSize()) {
                if (uiState is UiState.Loading) {
                    CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
                } else {
                    when (selectedTab) {
                        0 -> OverviewTab(stats)
                        1 -> AccountsTab(accounts) { id, role ->
                            selectedAccountId = id
                            selectedRole = role
                            showRoleDialog = true
                        }
                        2 -> AnimalsTab(animals)
                        3 -> VerificationsTab(verifications) { id, approved ->
                            viewModel.verifyAccount(id, approved)
                        }
                        4 -> AuditTab(auditLog)
                    }
                }
            }
        }
    }

    if (showRoleDialog) {
        AlertDialog(
            onDismissRequest = { showRoleDialog = false },
            title = { Text("Rolle ändern") },
            text = {
                var expandedRole by remember { mutableStateOf(false) }
                Box {
                    OutlinedTextField(
                        value = selectedRole,
                        onValueChange = {},
                        label = { Text("Rolle") },
                        modifier = Modifier.fillMaxWidth(),
                        readOnly = true,
                        trailingIcon = {
                            IconButton(onClick = { expandedRole = !expandedRole }) {
                                Icon(Icons.Default.ArrowDropDown, null)
                            }
                        }
                    )
                    DropdownMenu(
                        expanded = expandedRole,
                        onDismissRequest = { expandedRole = false }
                    ) {
                        listOf("user", "vet", "authority", "admin").forEach { role ->
                            DropdownMenuItem(
                                text = { Text(role) },
                                onClick = { selectedRole = role; expandedRole = false }
                            )
                        }
                    }
                }
            },
            confirmButton = {
                Button(onClick = {
                    viewModel.updateAccountRole(selectedAccountId, selectedRole)
                    showRoleDialog = false
                }) {
                    Text("Speichern")
                }
            },
            dismissButton = {
                TextButton(onClick = { showRoleDialog = false }) {
                    Text("Abbrechen")
                }
            }
        )
    }
}

@Composable
fun OverviewTab(stats: at.oxs.paw.model.AdminStats?) {
    if (stats == null) return
    Column(modifier = Modifier.padding(16.dp).verticalScroll(androidx.compose.foundation.rememberScrollState())) {
        Text("Systemübersicht", style = MaterialTheme.typography.titleLarge)
        Spacer(Modifier.height(16.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            StatCard("Accounts", stats.accounts.toString(), Modifier.weight(1f))
            StatCard("Tiere", stats.animals.toString(), Modifier.weight(1f))
        }
        Spacer(Modifier.height(8.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            StatCard("Dokumente", stats.documents.toString(), Modifier.weight(1f))
            StatCard("Audit-Logs", stats.auditEntries.toString(), Modifier.weight(1f))
        }
    }
}

@Composable
fun StatCard(label: String, value: String, modifier: Modifier = Modifier) {
    Card(modifier = modifier) {
        Column(Modifier.padding(16.dp)) {
            Text(value, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
            Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface.copy(.6f))
        }
    }
}

@Composable
fun AccountsTab(accounts: List<at.oxs.paw.model.AdminAccount>, onEdit: (String, String) -> Unit) {
    LazyColumn(Modifier.fillMaxSize().padding(horizontal = 16.dp)) {
        items(accounts) { acc ->
            Card(Modifier.fillMaxWidth().padding(vertical = 4.dp).clickable { onEdit(acc.id, acc.role) }) {
                Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(acc.name, fontWeight = FontWeight.Bold)
                        Text(acc.email, style = MaterialTheme.typography.bodySmall)
                    }
                    Badge { Text(acc.role) }
                }
            }
        }
    }
}

@Composable
fun AnimalsTab(animals: List<at.oxs.paw.model.AdminAnimal>) {
    LazyColumn(Modifier.fillMaxSize().padding(horizontal = 16.dp)) {
        items(animals) { animal ->
            Card(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                Column(Modifier.padding(16.dp)) {
                    Text(animal.name, fontWeight = FontWeight.Bold)
                    Text("${animal.species} · ${animal.breed ?: "Mischling"}", style = MaterialTheme.typography.bodySmall)
                    HorizontalDivider(Modifier.padding(vertical = 8.dp))
                    Text("Besitzer: ${animal.owner_name} (${animal.owner_email})", style = MaterialTheme.typography.labelSmall)
                }
            }
        }
    }
}

@Composable
fun VerificationsTab(verifications: List<at.oxs.paw.model.PendingVerification>, onVerify: (String, Boolean) -> Unit) {
    if (verifications.isEmpty()) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text("Keine ausstehenden Verifikationen", color = MaterialTheme.colorScheme.onSurface.copy(.5f))
        }
        return
    }
    LazyColumn(Modifier.fillMaxSize().padding(horizontal = 16.dp)) {
        items(verifications) { v ->
            Card(Modifier.fillMaxWidth().padding(vertical = 8.dp)) {
                Column(Modifier.padding(16.dp)) {
                    Text(v.name, fontWeight = FontWeight.Bold)
                    Text(v.email, style = MaterialTheme.typography.bodySmall)
                    Text("Rolle: ${v.role}", style = MaterialTheme.typography.labelSmall)
                    Spacer(Modifier.height(12.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(onClick = { onVerify(v.id, true) }, modifier = Modifier.weight(1f)) {
                            Text("Bestätigen")
                        }
                        OutlinedButton(onClick = { onVerify(v.id, false) }, modifier = Modifier.weight(1f)) {
                            Text("Ablehnen")
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun AuditTab(logs: List<at.oxs.paw.model.AuditLogEntry>) {
    LazyColumn(Modifier.fillMaxSize().padding(horizontal = 16.dp)) {
        items(logs) { entry ->
            Card(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                Column(Modifier.padding(12.dp)) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(entry.action, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.primary)
                        Text(entry.created_at.take(16).replace("T", " "), style = MaterialTheme.typography.labelSmall)
                    }
                    Text("${entry.resource} #${entry.resource_id ?: "N/A"}", style = MaterialTheme.typography.bodySmall)
                }
            }
        }
    }
}
