package at.oxs.paw.ui.admin

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import at.oxs.paw.viewmodel.AdminViewModel
import at.oxs.paw.viewmodel.UiState

@Composable
fun AuditLogScreen(
    viewModel: AdminViewModel,
    onBack: () -> Unit
) {
    val auditLog by viewModel.auditLog.collectAsState()
    val uiState by viewModel.uiState.collectAsState()

    LaunchedEffect(Unit) {
        viewModel.loadAuditLog()
    }

    Column(modifier = Modifier.fillMaxSize()) {
        TopAppBar(
            title = { Text("Audit Log") },
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
            is UiState.Success, UiState.Idle -> {
                if (auditLog.isEmpty()) {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = androidx.compose.ui.Alignment.Center) {
                        Text("Keine Einträge")
                    }
                } else {
                    LazyColumn(modifier = Modifier.padding(16.dp)) {
                        items(auditLog) { entry ->
                            Card(modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 8.dp)) {
                                Column(modifier = Modifier.padding(16.dp)) {
                                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                        Text(entry.action, style = MaterialTheme.typography.titleSmall)
                                        Text(entry.created_at.take(10), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.outline)
                                    }
                                    Text("Ressource: ${entry.resource}", style = MaterialTheme.typography.bodySmall)
                                    Text("User ID: ${entry.account_id}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.outline)
                                    if (!entry.details.isNullOrEmpty()) {
                                        Text("Details: ${entry.details}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.outline)
                                    }
                                    if (!entry.ip.isNullOrEmpty()) {
                                        Text("IP: ${entry.ip}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.outline)
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
