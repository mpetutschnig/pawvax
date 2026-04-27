package at.oxs.paw.ui.animals

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.*
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Add
import androidx.compose.ui.text.input.TextFieldValue
import androidx.core.content.ContextCompat
import android.Manifest
import android.content.pm.PackageManager
import android.nfc.NfcAdapter
import at.oxs.paw.model.Animal
import at.oxs.paw.model.CreateAnimalRequest
import at.oxs.paw.network.RetrofitClient
import at.oxs.paw.network.TokenStore
import at.oxs.paw.ui.theme.Spacing
import at.oxs.paw.ui.theme.Primary500
import coil3.compose.AsyncImage
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import kotlinx.coroutines.launch
import java.util.concurrent.Executors
import androidx.compose.foundation.lazy.itemsIndexed

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AnimalsScreen(
    onAnimalFound: (String) -> Unit,
    registerNfcCallback: ((String) -> Unit) -> Unit,
    unregisterNfcCallback: () -> Unit,
    onNavigateToProfile: () -> Unit = {},
    onNavigateToOrganizations: () -> Unit = {},
    onNavigateToAdmin: () -> Unit = {}
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var animals by remember { mutableStateOf(emptyList<Animal>()) }
    var searchQuery by remember { mutableStateOf("") }
    var showAddDialog by remember { mutableStateOf(false) }
    var newAnimalName by remember { mutableStateOf("") }
    var newAnimalSpecies by remember { mutableStateOf("dog") }
    var newAnimalBreed by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(false) }
    var menuExpanded by remember { mutableStateOf(false) }
    var serverUrl by remember { mutableStateOf("") }

    val filteredAnimals = animals.filter { animal ->
        searchQuery.isBlank() ||
        animal.name.contains(searchQuery, ignoreCase = true) ||
        animal.species.contains(searchQuery, ignoreCase = true)
    }

    LaunchedEffect(Unit) {
        serverUrl = TokenStore.getServerUrl(context)
        scope.launch {
            try {
                val token = TokenStore.getToken(context) ?: return@launch
                val api = RetrofitClient.build(TokenStore.getServerUrl(context), token)
                animals = api.getAnimals()
            } catch (e: Exception) {
                error = e.message
            }
        }
    }

    fun createAnimal() {
        if (newAnimalName.isBlank()) return
        scope.launch {
            loading = true
            error = null
            try {
                val token = TokenStore.getToken(context) ?: return@launch
                val api = RetrofitClient.build(TokenStore.getServerUrl(context), token)
                val request = CreateAnimalRequest(newAnimalName, newAnimalSpecies, newAnimalBreed.ifBlank { null }, null, null, null)
                val created = api.createAnimal(request)
                animals = animals + created
                showAddDialog = false
                newAnimalName = ""
                newAnimalBreed = ""
                newAnimalSpecies = "dog"
            } catch (e: Exception) {
                error = "Tier konnte nicht erstellt werden: ${e.message}"
            } finally {
                loading = false
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("🐾 PAW") },
                actions = {
                    IconButton(onClick = { menuExpanded = true }) {
                        Icon(Icons.Default.MoreVert, "Menu")
                    }
                    DropdownMenu(expanded = menuExpanded, onDismissRequest = { menuExpanded = false }) {
                        DropdownMenuItem(text = { Text("Profil") }, onClick = { onNavigateToProfile(); menuExpanded = false })
                        DropdownMenuItem(text = { Text("Organisationen") }, onClick = { onNavigateToOrganizations(); menuExpanded = false })
                        DropdownMenuItem(text = { Text("Admin") }, onClick = { onNavigateToAdmin(); menuExpanded = false })
                    }
                }
            )
        },
        floatingActionButton = {
            FloatingActionButton(onClick = { showAddDialog = true }) {
                Icon(Icons.Default.Add, "Add")
            }
        }
    ) { innerPadding ->
        Column(modifier = Modifier
            .fillMaxSize()
            .padding(innerPadding)
            .padding(Spacing.screenPadding)) {
            Text("Meine Tiere", style = MaterialTheme.typography.headlineSmall)
            Spacer(Modifier.height(Spacing.md))

            if (animals.isNotEmpty()) {
                OutlinedTextField(
                    value = searchQuery,
                    onValueChange = { searchQuery = it },
                    label = { Text("🔎 Tier suchen...") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )
                Spacer(Modifier.height(Spacing.md))
            }

            if (animals.isEmpty()) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text("Keine Tiere. Tippe auf + zum Hinzufügen.", style = MaterialTheme.typography.bodyMedium)
                }
            } else if (filteredAnimals.isEmpty()) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text("Keine Tiere gefunden für \"$searchQuery\"", style = MaterialTheme.typography.bodyMedium)
                }
            } else {
                LazyColumn {
                    items(filteredAnimals) { animal ->
                        Card(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = Spacing.md)
                                .clickable { onAnimalFound(animal.id) }
                        ) {
                            Row(modifier = Modifier.padding(Spacing.lg), verticalAlignment = Alignment.CenterVertically) {
                                if (animal.avatar_path != null && serverUrl.isNotEmpty()) {
                                    val baseUrl = serverUrl.removeSuffix("/api/").removeSuffix("/")
                                    val imageUrl = "$baseUrl/uploads/${animal.avatar_path}"
                                    AsyncImage(
                                        model = imageUrl,
                                        contentDescription = "Avatar von ${animal.name}",
                                        modifier = Modifier.size(Spacing.avatarMd).clip(CircleShape),
                                        contentScale = ContentScale.Crop
                                    )
                                } else {
                                    Text(if (animal.species == "dog") "🐶" else if (animal.species == "cat") "🐱" else "🐾", style = MaterialTheme.typography.displaySmall)
                                }
                                Spacer(Modifier.width(Spacing.lg))
                                Column {
                                    Text(animal.name, style = MaterialTheme.typography.titleMedium)
                                    Text(animal.species, style = MaterialTheme.typography.bodySmall)
                                }
                            }
                        }
                    }
                }
            }

            error?.let {
                Spacer(Modifier.height(Spacing.lg))
                Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }
        }
    }

    if (showAddDialog) {
        AlertDialog(
            onDismissRequest = { showAddDialog = false },
            title = { Text("Neues Tier hinzufügen") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(Spacing.md)) {
                    OutlinedTextField(
                        value = newAnimalName,
                        onValueChange = { newAnimalName = it },
                        label = { Text("Name") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                        listOf("dog" to "🐶 Hund", "cat" to "🐱 Katze", "other" to "Sonstiges").forEach { (val_, label) ->
                            FilterChip(selected = newAnimalSpecies == val_, onClick = { newAnimalSpecies = val_ }, label = { Text(label) })
                        }
                    }
                    OutlinedTextField(
                        value = newAnimalBreed,
                        onValueChange = { newAnimalBreed = it },
                        label = { Text("Rasse (optional)") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true
                    )
                }
            },
            confirmButton = {
                Button(onClick = { createAnimal() }, enabled = newAnimalName.isNotBlank() && !loading) {
                    Text("Anlegen")
                }
            },
            dismissButton = {
                TextButton(onClick = { showAddDialog = false }) {
                    Text("Abbrechen")
                }
            }
        )
    }
}
