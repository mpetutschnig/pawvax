package at.oxs.paw.ui.scan

import android.Manifest
import android.content.pm.PackageManager
import android.nfc.NfcAdapter
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.annotation.OptIn
import androidx.camera.core.*
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.layout.*
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
    var mode by remember { mutableStateOf("choose") }
    var manualId by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(false) }
    var showNewAnimalDialog by remember { mutableStateOf(false) }
    var unknownTagId by remember { mutableStateOf<String?>(null) }
    var unknownTagType by remember { mutableStateOf("barcode") }
    var nfcAvailable by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        nfcAvailable = NfcAdapter.getDefaultAdapter(context) != null
    }

    suspend fun handleTagId(tagId: String, tagType: String) {
        loading = true; error = null
        try {
            val token = TokenStore.getToken(context) ?: return
            val serverUrl = TokenStore.getServerUrl(context)
            val api = RetrofitClient.build(serverUrl, token)
            val animal = api.getAnimalByTag(tagId)
            onAnimalFound(animal.id)
        } catch (e: retrofit2.HttpException) {
            if (e.code() == 404) {
                unknownTagId = tagId; unknownTagType = tagType; showNewAnimalDialog = true
            } else error = "Fehler: ${e.message()}"
        } catch (e: Exception) {
            error = e.message ?: "Verbindungsfehler"
        } finally { loading = false }
    }

    DisposableEffect(mode) {
        if (mode == "nfc") {
            registerNfcCallback { uid -> scope.launch { handleTagId(uid, "nfc") } }
        }
        onDispose { if (mode == "nfc") unregisterNfcCallback() }
    }

    var menuExpanded by remember { mutableStateOf(false) }

    Column(modifier = Modifier.fillMaxSize()) {
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

        Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
            Text("Tier scannen", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface.copy(.6f))
            Spacer(Modifier.height(24.dp))

        when (mode) {
            "choose" -> {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = { mode = "barcode" }, modifier = Modifier.fillMaxWidth()) { Text("📷 Barcode scannen") }
                    if (nfcAvailable) {
                        OutlinedButton(onClick = { mode = "nfc" }, modifier = Modifier.fillMaxWidth()) { Text("📡 NFC lesen") }
                    }
                    OutlinedButton(onClick = { mode = "manual" }, modifier = Modifier.fillMaxWidth()) { Text("⌨️ ID manuell eingeben") }
                }
            }
            "barcode" -> {
                BarcodeScannerView(onResult = { code -> scope.launch { handleTagId(code, "barcode"); mode = "choose" } })
                Spacer(Modifier.height(8.dp))
                OutlinedButton(onClick = { mode = "choose" }, modifier = Modifier.fillMaxWidth()) { Text("Abbrechen") }
            }
            "nfc" -> {
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("📡", style = MaterialTheme.typography.displayMedium)
                        Spacer(Modifier.height(16.dp))
                        Text("Halte das Gerät an den NFC-Tag...", style = MaterialTheme.typography.bodyLarge)
                    }
                }
                Spacer(Modifier.height(8.dp))
                OutlinedButton(onClick = { mode = "choose"; unregisterNfcCallback() }, modifier = Modifier.fillMaxWidth()) { Text("Abbrechen") }
            }
            "manual" -> {
                OutlinedTextField(value = manualId, onValueChange = { manualId = it }, label = { Text("Tag-ID") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                Spacer(Modifier.height(8.dp))
                Button(onClick = { scope.launch { handleTagId(manualId, "barcode"); mode = "choose" } }, modifier = Modifier.fillMaxWidth(), enabled = manualId.isNotBlank() && !loading) {
                    Text(if (loading) "Suche..." else "Suchen")
                }
                Spacer(Modifier.height(4.dp))
                OutlinedButton(onClick = { mode = "choose" }, modifier = Modifier.fillMaxWidth()) { Text("Abbrechen") }
            }
        }

            error?.let { Spacer(Modifier.height(8.dp)); Text(it, color = MaterialTheme.colorScheme.error) }
            if (loading) { Spacer(Modifier.height(8.dp)); LinearProgressIndicator(modifier = Modifier.fillMaxWidth()) }
        }
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
                        showNewAnimalDialog = false
                        onAnimalFound(animal.id)
                    } catch (e: Exception) { error = e.message }
                }
            },
            onDismiss = { showNewAnimalDialog = false; mode = "choose" }
        )
    }
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

@OptIn(ExperimentalGetImage::class)
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
