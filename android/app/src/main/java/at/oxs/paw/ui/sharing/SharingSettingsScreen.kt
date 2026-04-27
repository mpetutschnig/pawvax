package at.oxs.paw.ui.sharing

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import at.oxs.paw.viewmodel.AnimalViewModel
import at.oxs.paw.viewmodel.UiState
import at.oxs.paw.viewmodel.ViewModelFactory

@Composable
fun SharingSettingsScreen(
    animalId: String,
    onBack: () -> Unit
) {
    val context = LocalContext.current
    val viewModel = viewModel<AnimalViewModel>(factory = ViewModelFactory(context))
    val sharingSettings by viewModel.sharingSettings.collectAsState()
    val uiState by viewModel.uiState.collectAsState()

    var vetVaccination by remember { mutableStateOf(true) }
    var vetMedications by remember { mutableStateOf(true) }
    var vetContact by remember { mutableStateOf(false) }

    var authorityVaccination by remember { mutableStateOf(true) }
    var authorityMedications by remember { mutableStateOf(false) }
    var authorityContact by remember { mutableStateOf(false) }

    LaunchedEffect(sharingSettings) {
        sharingSettings?.let { settings ->
            vetVaccination = settings.roles["vet"]?.get("vaccination") ?: true
            vetMedications = settings.roles["vet"]?.get("medications") ?: true
            vetContact = settings.roles["vet"]?.get("contact") ?: false

            authorityVaccination = settings.roles["authority"]?.get("vaccination") ?: true
            authorityMedications = settings.roles["authority"]?.get("medications") ?: false
            authorityContact = settings.roles["authority"]?.get("contact") ?: false
        }
    }

    Column(modifier = Modifier.fillMaxSize()) {
        TopAppBar(
            title = { Text("Freigabe-Einstellungen") },
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
                Column(modifier = Modifier
                    .padding(16.dp)
                    .fillMaxSize()) {
                    Text("Tierärzte", style = MaterialTheme.typography.titleMedium)
                    CheckboxWithLabel("Impfungen", vetVaccination) { vetVaccination = it }
                    CheckboxWithLabel("Medikamente", vetMedications) { vetMedications = it }
                    CheckboxWithLabel("Kontaktdaten", vetContact) { vetContact = it }

                    Spacer(modifier = Modifier.height(16.dp))

                    Text("Behörden", style = MaterialTheme.typography.titleMedium)
                    CheckboxWithLabel("Impfungen", authorityVaccination) { authorityVaccination = it }
                    CheckboxWithLabel("Medikamente", authorityMedications) { authorityMedications = it }
                    CheckboxWithLabel("Kontaktdaten", authorityContact) { authorityContact = it }

                    Spacer(modifier = Modifier.height(32.dp))

                    Button(
                        onClick = {
                            val newRoles = mapOf(
                                "vet" to mapOf(
                                    "vaccination" to vetVaccination,
                                    "medications" to vetMedications,
                                    "contact" to vetContact
                                ),
                                "authority" to mapOf(
                                    "vaccination" to authorityVaccination,
                                    "medications" to authorityMedications,
                                    "contact" to authorityContact
                                )
                            )
                            viewModel.updateSharing(animalId, newRoles)
                        },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text("Speichern")
                    }
                }
            }
        }
    }
}

@Composable
fun CheckboxWithLabel(label: String, checked: Boolean, onCheckedChange: (Boolean) -> Unit) {
    Row(modifier = Modifier
        .fillMaxWidth()
        .height(48.dp)
        .padding(vertical = 8.dp),
        verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
        Checkbox(checked = checked, onCheckedChange = onCheckedChange)
        Text(label, modifier = Modifier.padding(start = 8.dp))
    }
}
