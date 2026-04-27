package at.oxs.paw.ui.organization

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import at.oxs.paw.viewmodel.OrganizationViewModel
import at.oxs.paw.viewmodel.UiState
import at.oxs.paw.viewmodel.ViewModelFactory

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OrganizationDetailScreen(
    orgId: String,
    onBack: () -> Unit
) {
    val context = LocalContext.current
    val viewModel = viewModel<OrganizationViewModel>(factory = ViewModelFactory(context))
    val selectedOrg by viewModel.selectedOrganization.collectAsState()
    val members by viewModel.members.collectAsState()
    val uiState by viewModel.uiState.collectAsState()

    var showInviteDialog by remember { mutableStateOf(false) }
    var inviteEmail by remember { mutableStateOf("") }

    LaunchedEffect(orgId) {
        viewModel.loadOrgMembers(orgId)
    }

    Column(modifier = Modifier.fillMaxSize()) {
        TopAppBar(
            title = { Text("Organisation") },
            navigationIcon = {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back")
                }
            },
            actions = {
                IconButton(onClick = { showInviteDialog = true }) {
                    Icon(Icons.Default.Add, "Invite")
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
                Column(modifier = Modifier.padding(16.dp)) {
                    if (members.isEmpty()) {
                        Text("Keine Mitglieder")
                    } else {
                        Text("Mitglieder:", style = MaterialTheme.typography.titleMedium)
                        LazyColumn {
                            items(members) { member ->
                                Card(modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 8.dp)) {
                                    Row(modifier = Modifier
                                        .padding(16.dp)
                                        .fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween) {
                                        Column(modifier = Modifier.weight(1f)) {
                                            Text(member.name, style = MaterialTheme.typography.bodyLarge)
                                            Text(member.email, style = MaterialTheme.typography.bodySmall)
                                            Text(member.role, style = MaterialTheme.typography.labelSmall)
                                        }
                                        if (member.accepted == 0) {
                                            Text("(ausstehend)", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.outline)
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if (showInviteDialog) {
        AlertDialog(
            onDismissRequest = { showInviteDialog = false },
            title = { Text("Mitglied einladigen") },
            text = {
                OutlinedTextField(
                    value = inviteEmail,
                    onValueChange = { inviteEmail = it },
                    label = { Text("Email") },
                    modifier = Modifier.fillMaxWidth()
                )
            },
            confirmButton = {
                Button(onClick = {
                    viewModel.inviteToOrg(orgId, inviteEmail)
                    showInviteDialog = false
                    inviteEmail = ""
                }) {
                    Text("Einladigen")
                }
            },
            dismissButton = {
                TextButton(onClick = { showInviteDialog = false }) {
                    Text("Abbrechen")
                }
            }
        )
    }
}
