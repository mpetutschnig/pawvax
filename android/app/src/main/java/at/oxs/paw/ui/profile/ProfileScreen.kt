package at.oxs.paw.ui.profile

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import at.oxs.paw.viewmodel.ProfileViewModel
import at.oxs.paw.viewmodel.UiState
import at.oxs.paw.viewmodel.ViewModelFactory
import at.oxs.paw.network.TokenStore
import at.oxs.paw.network.RetrofitClient

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileScreen(
    onBack: () -> Unit = {},
    onLogout: () -> Unit = {}
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val viewModel = viewModel<ProfileViewModel>(factory = ViewModelFactory(context))
    val profile by viewModel.profile.collectAsState()
    val uiState by viewModel.uiState.collectAsState()

    var showEditDialog by remember { mutableStateOf(false) }
    var editName by remember { mutableStateOf("") }
    var editGeminiToken by remember { mutableStateOf("") }

    LaunchedEffect(Unit) {
        viewModel.loadProfile()
    }

    LaunchedEffect(profile) {
        profile?.let {
            editName = it.name
            editGeminiToken = it.gemini_token ?: ""
        }
    }

    Column(modifier = Modifier.fillMaxSize()) {
        TopAppBar(
            title = { Text("Profil") },
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
                profile?.let { p ->
                    Column(modifier = Modifier.padding(16.dp)) {
                        Card(modifier = Modifier.fillMaxWidth()) {
                            Column(modifier = Modifier.padding(16.dp)) {
                                Text("Name: ${p.name}", style = MaterialTheme.typography.bodyLarge)
                                Text("Email: ${p.email}", style = MaterialTheme.typography.bodyMedium)
                                Text("Rolle: ${p.role}", style = MaterialTheme.typography.bodyMedium)
                                if (p.verified == 1) {
                                    Text("✓ Verifiziert", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.primary)
                                }
                            }
                        }

                        Spacer(modifier = Modifier.height(16.dp))

                        Button(onClick = { showEditDialog = true }, modifier = Modifier.fillMaxWidth()) {
                            Text("Profil bearbeiten")
                        }

                        if (p.role == "user") {
                            Button(
                                onClick = { viewModel.requestVerification() },
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Text("Verifikation anfordern")
                            }
                        }

                        Spacer(modifier = Modifier.height(16.dp))

                        Button(
                            onClick = { viewModel.deleteAccount() },
                            modifier = Modifier.fillMaxWidth(),
                            colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)
                        ) {
                            Text("Konto löschen")
                        }

                        Spacer(modifier = Modifier.height(16.dp))

                        OutlinedButton(
                            onClick = {
                                scope.launch {
                                    try {
                                        val token = TokenStore.getToken(context)
                                        if (token != null) {
                                            val api = RetrofitClient.build(TokenStore.getServerUrl(context), token)
                                            api.logout()
                                        }
                                    } catch (_: Exception) {}
                                    TokenStore.clearToken(context)
                                    TokenStore.clearRole(context)
                                    onLogout()
                                }
                            },
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text("Abmelden")
                        }
                    }
                }
            }
        }
    }

    if (showEditDialog && profile != null) {
        AlertDialog(
            onDismissRequest = { showEditDialog = false },
            title = { Text("Profil bearbeiten") },
            text = {
                Column {
                    OutlinedTextField(
                        value = editName,
                        onValueChange = { editName = it },
                        label = { Text("Name") },
                        modifier = Modifier.fillMaxWidth()
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    OutlinedTextField(
                        value = editGeminiToken,
                        onValueChange = { editGeminiToken = it },
                        label = { Text("Gemini API Token (optional)") },
                        modifier = Modifier.fillMaxWidth(),
                        visualTransformation = PasswordVisualTransformation()
                    )
                }
            },
            confirmButton = {
                Button(onClick = {
                    viewModel.updateProfile(editName.ifEmpty { null }, editGeminiToken.ifEmpty { null })
                    showEditDialog = false
                }) {
                    Text("Speichern")
                }
            },
            dismissButton = {
                TextButton(onClick = { showEditDialog = false }) {
                    Text("Abbrechen")
                }
            }
        )
    }
}
