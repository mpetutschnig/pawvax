package at.oxs.paw.ui.animal

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.core.content.ContextCompat
import at.oxs.paw.model.Animal
import at.oxs.paw.model.Document
import at.oxs.paw.network.RetrofitClient
import at.oxs.paw.network.TokenStore
import kotlinx.coroutines.launch
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import java.io.ByteArrayOutputStream
import android.util.Base64
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import coil3.compose.AsyncImage

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AnimalScreen(
    animalId: String,
    onBack: () -> Unit,
    onManageTags: () -> Unit,
    onScanDocument: () -> Unit,
    onNavigateToSharing: (String) -> Unit = {},
    onDocumentClicked: (String) -> Unit = {}
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var animal by remember { mutableStateOf<Animal?>(null) }
    var documents by remember { mutableStateOf<List<Document>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var uploadingAvatar by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var showAvatarMenu by remember { mutableStateOf(false) }
    var serverUrl by remember { mutableStateOf("") }

    fun compressImage(bitmap: Bitmap): String {
        val resized = Bitmap.createScaledBitmap(bitmap, 512, 512, true)
        val baos = ByteArrayOutputStream()
        resized.compress(Bitmap.CompressFormat.JPEG, 75, baos)
        return Base64.encodeToString(baos.toByteArray(), Base64.DEFAULT)
    }

    fun handleAvatarUpload(imageBase64: String) {
        scope.launch {
            uploadingAvatar = true
            try {
                val token = TokenStore.getToken(context) ?: return@launch
                val api = RetrofitClient.build(TokenStore.getServerUrl(context), token)
                val request = at.oxs.paw.model.AvatarUploadRequest(imageBase64)
                api.uploadAvatar(animalId, request)
                val updated = api.getAnimal(animalId)
                animal = updated
                showAvatarMenu = false
            } catch (e: Exception) {
                error = e.message
            } finally {
                uploadingAvatar = false
            }
        }
    }

    val imagePickerLauncher = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) {
            try {
                val inputStream = context.contentResolver.openInputStream(uri)
                val bitmap = BitmapFactory.decodeStream(inputStream)
                val compressed = compressImage(bitmap)
                handleAvatarUpload(compressed)
            } catch (e: Exception) {
                error = "Bild konnte nicht hochgeladen werden: ${e.message}"
            }
        }
    }

    val cameraLauncher = rememberLauncherForActivityResult(ActivityResultContracts.TakePicturePreview()) { bitmap ->
        if (bitmap != null) {
            try {
                val compressed = compressImage(bitmap)
                handleAvatarUpload(compressed)
            } catch (e: Exception) {
                error = "Bild konnte nicht hochgeladen werden: ${e.message}"
            }
        }
    }

    val cameraPermissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) {
            cameraLauncher.launch(null)
        } else {
            error = "Kameraberechtigung erforderlich"
        }
    }

    LaunchedEffect(animalId) {
        try {
            serverUrl = TokenStore.getServerUrl(context)
            val token = TokenStore.getToken(context) ?: return@LaunchedEffect
            val api = RetrofitClient.build(serverUrl, token)
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
                        Row(modifier = Modifier
                            .padding(16.dp)
                            .fillMaxWidth()
                            .clickable { showAvatarMenu = true },
                            verticalAlignment = Alignment.CenterVertically) {
                            Box(modifier = Modifier.size(64.dp), contentAlignment = Alignment.Center) {
                                if (a.avatar_path != null && serverUrl.isNotEmpty()) {
                                    val baseUrl = serverUrl.removeSuffix("/api/").removeSuffix("/")
                                    val imageUrl = "$baseUrl/uploads/${a.avatar_path}"
                                    AsyncImage(
                                        model = imageUrl,
                                        contentDescription = "Avatar von ${a.name}",
                                        modifier = Modifier.size(64.dp).clip(CircleShape),
                                        contentScale = ContentScale.Crop
                                    )
                                } else {
                                    Text(if (a.species == "dog") "🐶" else if (a.species == "cat") "🐱" else "🐾", style = MaterialTheme.typography.displaySmall)
                                }
                                if (uploadingAvatar) {
                                    CircularProgressIndicator(modifier = Modifier.size(64.dp), strokeWidth = 2.dp)
                                }
                            }
                            Spacer(Modifier.width(16.dp))
                            Column(modifier = Modifier.weight(1f)) {
                                Text(a.name, style = MaterialTheme.typography.titleLarge)
                                Text(buildString {
                                    append(when (a.species) { "dog" -> "Hund"; "cat" -> "Katze"; else -> "Tier" })
                                    a.breed?.let { append(" · $it") }
                                    a.birthdate?.let { append(" · Geb. $it") }
                                }, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface.copy(.6f))
                                Text("Tippe zum Ändern des Bildes", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.outline)
                            }
                        }
                    }

                    if (showAvatarMenu) {
                        AlertDialog(
                            onDismissRequest = { showAvatarMenu = false },
                            title = { Text("Tierbild ändern") },
                            text = { Text("Wähle Quelle für das neue Bild") },
                            confirmButton = {
                                Button(onClick = {
                                    if (ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                                        cameraLauncher.launch(null)
                                    } else {
                                        cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
                                    }
                                    showAvatarMenu = false
                                }) {
                                    Text("📷 Kamera")
                                }
                            },
                            dismissButton = {
                                Button(onClick = {
                                    imagePickerLauncher.launch("image/*")
                                    showAvatarMenu = false
                                }) {
                                    Text("🖼️ Galerie")
                                }
                            }
                        )
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
                Card(modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 4.dp)
                    .clickable { onDocumentClicked(doc.id) }) {
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
