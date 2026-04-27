package at.oxs.paw.ui.organization

import androidx.compose.foundation.clickable
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
import at.oxs.paw.model.Organization
import at.oxs.paw.ui.theme.Spacing
import at.oxs.paw.viewmodel.OrganizationViewModel
import at.oxs.paw.viewmodel.UiState
import at.oxs.paw.viewmodel.ViewModelFactory

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OrganizationScreen(
    onBack: () -> Unit,
    onOrgSelected: (String) -> Unit
) {
    val context = LocalContext.current
    val viewModel = viewModel<OrganizationViewModel>(factory = ViewModelFactory(context))
    val organizations by viewModel.organizations.collectAsState()
    val uiState by viewModel.uiState.collectAsState()

    var showCreateDialog by remember { mutableStateOf(false) }
    var newOrgName by remember { mutableStateOf("") }
    var newOrgType by remember { mutableStateOf("family") }

    LaunchedEffect(Unit) {
        viewModel.loadOrganizations()
    }

    Column(modifier = Modifier.fillMaxSize()) {
        TopAppBar(
            title = { Text("Organisationen") },
            navigationIcon = {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back")
                }
            },
            actions = {
                IconButton(onClick = { showCreateDialog = true }) {
                    Icon(Icons.Default.Add, "Add")
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
                if (organizations.isEmpty()) {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = androidx.compose.ui.Alignment.Center) {
                        Text("Keine Organisationen")
                    }
                } else {
                    LazyColumn(modifier = Modifier.padding(Spacing.lg)) {
                        items(organizations) { org ->
                            Card(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 8.dp)
                                    .clickable { onOrgSelected(org.id) }
                            ) {
                                Column(modifier = Modifier.padding(Spacing.lg)) {
                                    Text(org.name, style = MaterialTheme.typography.titleMedium)
                                    Text(org.type, style = MaterialTheme.typography.bodySmall)
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if (showCreateDialog) {
        AlertDialog(
            onDismissRequest = { showCreateDialog = false },
            title = { Text("Organisation erstellen") },
            text = {
                Column {
                    OutlinedTextField(
                        value = newOrgName,
                        onValueChange = { newOrgName = it },
                        label = { Text("Name") },
                        modifier = Modifier.fillMaxWidth()
                    )
                    Spacer(modifier = Modifier.height(Spacing.sm))
                    var expandedType by remember { mutableStateOf(false) }
                    Box {
                        OutlinedTextField(
                            value = newOrgType,
                            onValueChange = {},
                            label = { Text("Typ") },
                            modifier = Modifier.fillMaxWidth(),
                            readOnly = true,
                            trailingIcon = {
                                IconButton(onClick = { expandedType = !expandedType }) {
                                    Text("▼")
                                }
                            }
                        )
                        DropdownMenu(
                            expanded = expandedType,
                            onDismissRequest = { expandedType = false }
                        ) {
                            DropdownMenuItem(
                                text = { Text("Familie") },
                                onClick = { newOrgType = "family"; expandedType = false }
                            )
                            DropdownMenuItem(
                                text = { Text("Unternehmen") },
                                onClick = { newOrgType = "company"; expandedType = false }
                            )
                        }
                    }
                }
            },
            confirmButton = {
                Button(onClick = {
                    viewModel.createOrganization(newOrgName, newOrgType)
                    showCreateDialog = false
                    newOrgName = ""
                    newOrgType = "family"
                }) {
                    Text("Erstellen")
                }
            },
            dismissButton = {
                TextButton(onClick = { showCreateDialog = false }) {
                    Text("Abbrechen")
                }
            }
        )
    }
}
