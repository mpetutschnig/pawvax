package at.oxs.paw.ui.admin

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import at.oxs.paw.viewmodel.AdminViewModel
import at.oxs.paw.viewmodel.UiState
import at.oxs.paw.viewmodel.ViewModelFactory

@Composable
fun AdminDashboard(
    onBack: () -> Unit,
    onNavigateToAuditLog: () -> Unit
) {
    val context = LocalContext.current
    val viewModel = viewModel<AdminViewModel>(factory = ViewModelFactory(context))
    val accounts by viewModel.accounts.collectAsState()
    val uiState by viewModel.uiState.collectAsState()

    var showRoleDialog by remember { mutableStateOf(false) }
    var selectedAccountId by remember { mutableStateOf("") }
    var selectedRole by remember { mutableStateOf("user") }

    LaunchedEffect(Unit) {
        viewModel.loadAccounts()
    }

    Column(modifier = Modifier.fillMaxSize()) {
        TopAppBar(
            title = { Text("Admin Panel") },
            navigationIcon = {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back")
                }
            }
        )

        when (uiState) {
            is UiState.Loading -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = androidx.compose.ui.Alignment.Center) {
                    CircularProgressIndicator()
                }
            }
            is UiState.Error -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = androidx.compose.ui.Alignment.Center) {
                    Text((uiState as UiState.Error).message, color = MaterialTheme.colorScheme.error)
                }
            }
            UiState.Success, UiState.Idle -> {
                Column(modifier = Modifier.padding(16.dp).fillMaxSize()) {
                    Button(onClick = onNavigateToAuditLog, modifier = Modifier.fillMaxWidth()) {
                        Text("Audit Log anzeigen")
                    }

                    Spacer(modifier = Modifier.height(16.dp))

                    Text("Accounts (${accounts.size})", style = MaterialTheme.typography.titleMedium)

                    LazyColumn {
                        items(accounts) { account ->
                            Card(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 8.dp)
                                    .clickable {
                                        selectedAccountId = account.id
                                        selectedRole = account.role
                                        showRoleDialog = true
                                    }
                            ) {
                                Column(modifier = Modifier.padding(16.dp)) {
                                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                        Column(modifier = Modifier.weight(1f)) {
                                            Text(account.email, style = MaterialTheme.typography.bodyLarge)
                                            Text(account.name, style = MaterialTheme.typography.bodySmall)
                                        }
                                        Badge {
                                            Text(account.role)
                                        }
                                    }
                                    if (account.verified == 1) {
                                        Text("✓ Verifiziert", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                                    }
                                }
                            }
                        }
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
                                Text("▼")
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
