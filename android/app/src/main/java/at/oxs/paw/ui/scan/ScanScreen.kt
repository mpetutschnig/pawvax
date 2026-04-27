package at.oxs.paw.ui.scan

import android.Manifest
import android.content.pm.PackageManager
import android.nfc.NfcAdapter
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.*
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import at.oxs.paw.network.RetrofitClient
import at.oxs.paw.network.TokenStore
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import kotlinx.coroutines.launch
import java.util.concurrent.Executors
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import coil3.compose.AsyncImage

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ScanScreen(
    onAnimalFound: (String) -> Unit,
    registerNfcCallback: ((String) -> Unit) -> Unit,
    unregisterNfcCallback: () -> Unit,
    onNavigateToProfile: () -> Unit = {},
    onNavigateToOrganizations: () -> Unit = {},
    onNavigateToAdmin: () -> Unit = {}
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var animals by remember { mutableStateOf(emptyList<at.oxs.paw.model.Animal>()) }
    var showScanDialog by remember { mutableStateOf(false) }
    var scanMode by remember { mutableStateOf("choose") }
    var manualId by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(false) }
    var showNewAnimalDialog by remember { mutableStateOf(false) }
    var unknownTagId by remember { mutableStateOf<String?>(null) }
    var unknownTagType by remember { mutableStateOf("barcode") }
    var nfcAvailable by remember { mutableStateOf(false) }
    var menuExpanded by remember { mutableStateOf(false) }
    var serverUrl by remember { mutableStateOf("") }

    LaunchedEffect(Unit) {
        serverUrl = TokenStore.getServerUrl(context)
        nfcAvailable = NfcAdapter.getDefaultAdapter(context) != null
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

    suspend fun handleTagId(tagId: String, tagType: String) {
        loading = true
        error = null
        try {
            val token = TokenStore.getToken(context) ?: return
            val serverUrl = TokenStore.getServerUrl(context)
            val api = RetrofitClient.build(serverUrl, token)
            val animal = api.getAnimalByTag(tagId)
            onAnimalFound(animal.id)
        } catch (e: retrofit2.HttpException) {
            if (e.code() == 404) {
                unknownTagId = tagId
                unknownTagType = tagType
                showNewAnimalDialog = true
            } else {
                error = "Fehler: ${e.message()}"
            }
        } catch (e: Exception) {
            error = e.message ?: "Verbindungsfehler"
        } finally {
            loading = false
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
            FloatingActionButton(onClick = { showScanDialog = true; scanMode = "choose" }) {
                Text("🔍")
            }
        }
    ) { innerPadding ->
        Column(modifier = Modifier
            .fillMaxSize()
            .padding(innerPadding)
            .padding(16.dp)) {
            Text("Meine Tiere", style = MaterialTheme.typography.titleLarge)
            Spacer(Modifier.height(8.dp))

            if (animals.isEmpty()) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text("Keine Tiere. Tippe auf 🔍 zum Scannen.", style = MaterialTheme.typography.bodyMedium)
                }
            } else {
                LazyColumn {
                    items(animals) { animal ->
                        Card(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 8.dp)
                                .clickable { onAnimalFound(animal.id) }
                        ) {
                            Row(modifier = Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                                if (animal.avatar_path != null && serverUrl.isNotEmpty()) {
                                    val imageUrl = "$serverUrl/uploads/${animal.avatar_path.substringAfterLast('/')}"
                                    AsyncImage(
                                        model = imageUrl,
                                        contentDescription = "Avatar von ${animal.name}",
                                        modifier = Modifier.size(48.dp).clip(CircleShape),
                                        contentScale = ContentScale.Crop
                                    )
                                } else {
                                    Text(if (animal.species == "dog") "🐶" else if (animal.species == "cat") "🐱" else "🐾", style = MaterialTheme.typography.displaySmall)
                                }
                                Spacer(Modifier.width(16.dp))
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
                Spacer(Modifier.height(16.dp))
                Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }
        }
    }

    if (showScanDialog) {
        AlertDialog(
            onDismissRequest = { showScanDialog = false; scanMode = "choose" },
            title = { Text("Tier scannen") },
            text = {
                when (scanMode) {
                    "choose" -> {
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Button(onClick = { scanMode = "camera" }, modifier = Modifier.fillMaxWidth()) { Text("📷 Barcode/QR Code scannen") }
                            Button(onClick = { scanMode = "manual" }, modifier = Modifier.fillMaxWidth()) { Text("⌨️ ID manuell eingeben") }
                            if (nfcAvailable) {
                                OutlinedButton(onClick = { scanMode = "nfc" }, modifier = Modifier.fillMaxWidth()) { Text("📡 NFC lesen") }
                            }
                        }
                    }
                    "camera" -> {
                        Column {
                            Text("Richte die Kamera auf den Barcode/QR-Code...", style = MaterialTheme.typography.bodyMedium)
                            Spacer(Modifier.height(8.dp))
                            BarcodeScannerView(onResult = { code ->
                                scope.launch {
                                    handleTagId(code, "barcode")
                                    if (error == null && unknownTagId == null) showScanDialog = false
                                }
                            })
                            if (loading) {
                                CircularProgressIndicator(modifier = Modifier.align(Alignment.CenterHorizontally).padding(top = 8.dp))
                            }
                            error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 8.dp)) }
                        }
                    }
                    "manual" -> {
                        Column {
                            OutlinedTextField(value = manualId, onValueChange = { manualId = it }, label = { Text("Tag-ID") }, modifier = Modifier.fillMaxWidth())
                            Spacer(Modifier.height(8.dp))
                            if (loading) {
                                CircularProgressIndicator(modifier = Modifier.align(Alignment.CenterHorizontally))
                            }
                            error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                        }
                    }
                    "nfc" -> {
                        Text("📡 Halte das Gerät an den NFC-Tag...")
                    }
                }
            },
            confirmButton = {
                when (scanMode) {
                    "choose" -> Button(onClick = { showScanDialog = false }) { Text("Abbrechen") }
                    "camera" -> Button(onClick = { showScanDialog = false; scanMode = "choose" }) { Text("Abbrechen") }
                    "manual" -> Button(
                        onClick = { scope.launch { handleTagId(manualId, "manual"); if (error == null) showScanDialog = false } },
                        enabled = manualId.isNotBlank() && !loading
                    ) { Text("Suchen") }
                    "nfc" -> Button(onClick = { showScanDialog = false; scanMode = "choose"; unregisterNfcCallback() }) { Text("Abbrechen") }
                }
            }
        )
    }

    if (showNewAnimalDialog && unknownTagId != null) {
        NewAnimalDialog(
            tagId = unknownTagId!!,
            tagType = unknownTagType,
            onConfirm = { name, species, breed ->
                scope.launch {
                    try {
                        val token = TokenStore.getToken(context) ?: return@launch
                        val api = RetrofitClient.build(TokenStore.getServerUrl(context), token)
                        val animal = api.createAnimal(at.oxs.paw.model.CreateAnimalRequest(name, species, breed.ifBlank { null }, null, unknownTagId, unknownTagType))
                        animals = animals + animal
                        showNewAnimalDialog = false
                        showScanDialog = false
                        onAnimalFound(animal.id)
                    } catch (e: Exception) {
                        error = e.message
                    }
                }
            },
            onDismiss = { showNewAnimalDialog = false }
        )
    }
}

@androidx.annotation.OptIn(androidx.camera.core.ExperimentalGetImage::class)
@Composable
fun BarcodeScannerView(onResult: (String) -> Unit) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    var permissionGranted by remember { mutableStateOf(ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { permissionGranted = it }

    LaunchedEffect(Unit) { if (!permissionGranted) launcher.launch(Manifest.permission.CAMERA) }

    if (!permissionGranted) {
        Text("Kamera-Berechtigung wird benötigt", modifier = Modifier.padding(16.dp))
        return
    }

    val executor = remember { Executors.newSingleThreadExecutor() }
    var scanned by remember { mutableStateOf(false) }

    AndroidView(
        modifier = Modifier.fillMaxWidth().height(300.dp),
        factory = { ctx ->
            val previewView = PreviewView(ctx)
            val cameraProviderFuture = ProcessCameraProvider.getInstance(ctx)
            cameraProviderFuture.addListener({
                val provider = cameraProviderFuture.get()
                val preview = Preview.Builder().build().also { it.setSurfaceProvider(previewView.surfaceProvider) }
                val imageAnalysis = ImageAnalysis.Builder()
                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                    .build()
                    .also { ia ->
                        ia.setAnalyzer(executor) { proxy ->
                            if (!scanned) {
                                proxy.image?.let { img ->
                                    val image = InputImage.fromMediaImage(img, proxy.imageInfo.rotationDegrees)
                                    BarcodeScanning.getClient().process(image)
                                        .addOnSuccessListener { barcodes ->
                                            barcodes.firstOrNull { it.format == Barcode.FORMAT_QR_CODE || it.valueType == Barcode.TYPE_TEXT }
                                                ?.rawValue?.let { code -> if (!scanned) { scanned = true; onResult(code) } }
                                        }
                                        .addOnCompleteListener { proxy.close() }
                                } ?: proxy.close()
                            } else proxy.close()
                        }
                    }
                try {
                    provider.unbindAll()
                    provider.bindToLifecycle(lifecycleOwner, CameraSelector.DEFAULT_BACK_CAMERA, preview, imageAnalysis)
                } catch (_: Exception) {}
            }, ContextCompat.getMainExecutor(ctx))
            previewView
        }
    )
}

@Composable
fun NewAnimalDialog(tagId: String, tagType: String, onConfirm: (String, String, String) -> Unit, onDismiss: () -> Unit) {
    var name by remember { mutableStateOf("") }
    var species by remember { mutableStateOf("dog") }
    var breed by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Neues Tier anlegen") },
        text = {
            Column {
                Text("Tag $tagId ($tagType) ist noch nicht registriert.", style = MaterialTheme.typography.bodySmall)
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text("Name") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                Spacer(Modifier.height(4.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("dog" to "🐶 Hund", "cat" to "🐱 Katze", "other" to "Sonstiges").forEach { (val_, label) ->
                        FilterChip(selected = species == val_, onClick = { species = val_ }, label = { Text(label) })
                    }
                }
                Spacer(Modifier.height(4.dp))
                OutlinedTextField(value = breed, onValueChange = { breed = it }, label = { Text("Rasse (optional)") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
            }
        },
        confirmButton = { TextButton(onClick = { if (name.isNotBlank()) onConfirm(name, species, breed) }, enabled = name.isNotBlank()) { Text("Anlegen") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Abbrechen") } }
    )
}
