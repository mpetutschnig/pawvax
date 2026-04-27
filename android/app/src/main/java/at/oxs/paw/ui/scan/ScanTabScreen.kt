package at.oxs.paw.ui.scan

import android.Manifest
import android.content.pm.PackageManager
import android.nfc.NfcAdapter
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.*
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.layout.*
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
import at.oxs.paw.ui.theme.Spacing
import at.oxs.paw.network.TokenStore
import at.oxs.paw.model.CreateAnimalRequest
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import kotlinx.coroutines.launch
import retrofit2.HttpException
import java.util.concurrent.Executors
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ScanTabScreen(
    onAnimalFound: (String) -> Unit,
    registerNfcCallback: ((String) -> Unit) -> Unit,
    unregisterNfcCallback: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var scanMode by remember { mutableStateOf("choose") }
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
        loading = true
        error = null
        try {
            val token = TokenStore.getToken(context) ?: return
            val serverUrl = TokenStore.getServerUrl(context)
            val api = RetrofitClient.build(serverUrl, token)
            val animal = api.getAnimalByTag(tagId)
            onAnimalFound(animal.id)
        } catch (e: HttpException) {
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

    Column(modifier = Modifier.fillMaxSize().padding(Spacing.lg), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Text("Tier scannen", style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(Spacing.sm))

        when (scanMode) {
            "choose" -> {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Button(onClick = { scanMode = "camera" }, modifier = Modifier.fillMaxWidth()) {
                        Text("📷 Barcode/QR Code scannen")
                    }
                    Button(onClick = { scanMode = "manual" }, modifier = Modifier.fillMaxWidth()) {
                        Text("⌨️ ID manuell eingeben")
                    }
                    if (nfcAvailable) {
                        OutlinedButton(onClick = { scanMode = "nfc" }, modifier = Modifier.fillMaxWidth()) {
                            Text("📡 NFC lesen")
                        }
                    }
                }
            }
            "camera" -> {
                Text("Richte die Kamera auf den Barcode/QR-Code...", style = MaterialTheme.typography.bodyMedium)
                Spacer(Modifier.height(Spacing.sm))
                BarcodeScannerView(onResult = { code ->
                    scope.launch {
                        handleTagId(code, "barcode")
                        if (error == null && unknownTagId == null) scanMode = "choose"
                    }
                })
                if (loading) {
                    CircularProgressIndicator(modifier = Modifier.align(Alignment.CenterHorizontally).padding(top = 8.dp))
                }
                error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 8.dp)) }
            }
            "manual" -> {
                OutlinedTextField(value = manualId, onValueChange = { manualId = it }, label = { Text("Tag-ID") }, modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(Spacing.sm))
                if (loading) {
                    CircularProgressIndicator(modifier = Modifier.align(Alignment.CenterHorizontally))
                }
                error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                Button(
                    onClick = { scope.launch { handleTagId(manualId, "manual"); if (error == null) { scanMode = "choose"; manualId = "" } } },
                    enabled = manualId.isNotBlank() && !loading,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("Suchen")
                }
            }
            "nfc" -> {
                Text("📡 Halte das Gerät an den NFC-Tag...", style = MaterialTheme.typography.bodyMedium)
                Spacer(Modifier.height(Spacing.sm))
                Button(onClick = { scanMode = "choose"; unregisterNfcCallback() }, modifier = Modifier.fillMaxWidth()) {
                    Text("Abbrechen")
                }
            }
        }

        if (scanMode != "choose") {
            Button(onClick = { scanMode = "choose"; manualId = ""; error = null }, modifier = Modifier.fillMaxWidth()) {
                Text("Zurück")
            }
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
                        val animal = api.createAnimal(CreateAnimalRequest(name, species, if (breed.isBlank()) null else breed, null, unknownTagId, unknownTagType))
                        showNewAnimalDialog = false
                        scanMode = "choose"
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
        Text("Kamera-Berechtigung wird benötigt", modifier = Modifier.padding(Spacing.lg))
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
                Spacer(Modifier.height(Spacing.sm))
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
