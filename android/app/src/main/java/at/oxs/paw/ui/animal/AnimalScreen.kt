package at.oxs.paw.ui.animal

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import at.oxs.paw.model.Animal
import at.oxs.paw.model.Document
import at.oxs.paw.network.RetrofitClient
import at.oxs.paw.network.TokenStore
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AnimalScreen(
    animalId: String,
    onBack: () -> Unit,
    onManageTags: () -> Unit,
    onScanDocument: () -> Unit,
    onNavigateToSharing: (String) -> Unit = {}
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var animal by remember { mutableStateOf<Animal?>(null) }
    var documents by remember { mutableStateOf<List<Document>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(animalId) {
        try {
            val token = TokenStore.getToken(context) ?: return@LaunchedEffect
            val api = RetrofitClient.build(TokenStore.getServerUrl(context), token)
            animal = api.getAnimal(animalId)
            documents = api.getAnimalDocuments(animalId)
        } catch (e: Exception) {
            error = e.message
        } finally { loading = false }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(animal?.name ?: "Tier") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, null) } }
            )
        },
        floatingActionButton = {
            FloatingActionButton(onClick = onScanDocument) { Text("📷") }
        }
    ) { inner ->
        if (loading) {
            Box(Modifier.fillMaxSize().padding(inner), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            return@Scaffold
        }
        error?.let {
            Box(Modifier.fillMaxSize().padding(inner), contentAlignment = Alignment.Center) { Text(it, color = MaterialTheme.colorScheme.error) }
            return@Scaffold
        }

        LazyColumn(modifier = Modifier.fillMaxSize().padding(inner).padding(horizontal = 16.dp)) {
            animal?.let { a ->
                item {
                    Card(modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp)) {
                        Row(modifier = Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text(if (a.species == "dog") "🐶" else if (a.species == "cat") "🐱" else "🐾", style = MaterialTheme.typography.displaySmall)
                            Spacer(Modifier.width(16.dp))
                            Column {
                                Text(a.name, style = MaterialTheme.typography.titleLarge)
                                Text(buildString {
                                    append(when (a.species) { "dog" -> "Hund"; "cat" -> "Katze"; else -> "Tier" })
                                    a.breed?.let { append(" · $it") }
                                    a.birthdate?.let { append(" · Geb. $it") }
                                }, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface.copy(.6f))
                            }
                        }
                    }
                }
                item {
                    Column(modifier = Modifier.fillMaxWidth()) {
                        OutlinedButton(onClick = onManageTags, modifier = Modifier.fillMaxWidth()) { Text("🏷 Tags verwalten") }
                        Spacer(Modifier.height(8.dp))
                        OutlinedButton(onClick = { onNavigateToSharing(animalId) }, modifier = Modifier.fillMaxWidth()) { Text("🔒 Freigabe-Einstellungen") }
                    }
                    Spacer(Modifier.height(16.dp))
                    Text("Dokumente (${documents.size})", style = MaterialTheme.typography.titleMedium)
                    Spacer(Modifier.height(8.dp))
                }
            }

            if (documents.isEmpty()) {
                item { Text("Noch keine Dokumente. Tippe auf 📷 um das erste Dokument zu scannen.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface.copy(.6f)) }
            }

            items(documents) { doc ->
                Card(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                            Text(when (doc.doc_type) { "vaccination" -> "💉 Impfung"; "medication" -> "💊 Medikament"; else -> "📄 Dokument" }, style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
                            when (doc.added_by_role) {
                                "vet" -> Text("🐾 Tierarzt", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                                "authority" -> Text("🐾 Behörde", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                                else -> {}
                            }
                        }
                        Text(doc.created_at.take(10), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface.copy(.6f))
                        doc.ocr_provider?.let { Text("via $it", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface.copy(.5f)) }
                    }
                }
            }

            item { Spacer(Modifier.height(80.dp)) }
        }
    }
}
