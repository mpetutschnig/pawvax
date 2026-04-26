package at.oxs.paw.ui.document

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import at.oxs.paw.network.TokenStore
import at.oxs.paw.network.WsClient
import at.oxs.paw.network.WsEvent
import coil3.compose.rememberAsyncImagePainter
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DocumentScanScreen(animalId: String, onBack: () -> Unit, onDone: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var imageUri by remember { mutableStateOf<Uri?>(null) }
    var phase by remember { mutableStateOf("capture") }
    var statusLog by remember { mutableStateOf(listOf<Pair<String, String>>()) }
    var resultJson by remember { mutableStateOf<String?>(null) }

    val picker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        uri?.let { imageUri = it }
    }

    fun upload() {
        val uri = imageUri ?: return
        scope.launch {
            phase = "uploading"
            statusLog = emptyList()
            val token = TokenStore.getToken(context) ?: return@launch
            val serverUrl = TokenStore.getServerUrl(context)
            val filename = "doc_${System.currentTimeMillis()}.jpg"

            WsClient(context).uploadDocument(serverUrl, token, animalId, uri, filename).collect { event ->
                when (event) {
                    is WsEvent.Status -> statusLog = statusLog + (event.message to "info")
                    is WsEvent.Result -> {
                        statusLog = statusLog + ("Analyse abgeschlossen!" to "result")
                        resultJson = event.content.toString()
                        phase = "done"
                    }
                    is WsEvent.Error -> {
                        statusLog = statusLog + (event.message to "error")
                        phase = "error"
                    }
                }
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Dokument scannen") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, null) } }
            )
        }
    ) { inner ->
        Column(
            modifier = Modifier.fillMaxSize().padding(inner).padding(16.dp).verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            when (phase) {
                "capture" -> {
                    Text("Foto eines Impfpasses oder Dokuments aufnehmen", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface.copy(.6f))
                    Button(onClick = { picker.launch("image/*") }, modifier = Modifier.fillMaxWidth()) { Text("📷 Foto auswählen / aufnehmen") }
                    imageUri?.let { uri ->
                        Image(
                            painter = rememberAsyncImagePainter(uri),
                            contentDescription = null,
                            modifier = Modifier.fillMaxWidth().height(250.dp)
                        )
                        Button(onClick = ::upload, modifier = Modifier.fillMaxWidth()) { Text("Hochladen & analysieren") }
                        OutlinedButton(onClick = { imageUri = null }, modifier = Modifier.fillMaxWidth()) { Text("Anderes Foto") }
                    }
                }
                "uploading", "done", "error" -> {
                    Text("Status", style = MaterialTheme.typography.titleMedium)
                    Surface(color = Color(0xFF1E293B), shape = MaterialTheme.shapes.medium, modifier = Modifier.fillMaxWidth()) {
                        Column(modifier = Modifier.padding(12.dp)) {
                            statusLog.forEach { (msg, kind) ->
                                Text(
                                    "> $msg",
                                    color = when (kind) { "result" -> Color(0xFF4ADE80); "error" -> Color(0xFFF87171); else -> Color(0xFF94A3B8) },
                                    fontSize = 13.sp,
                                    fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace
                                )
                            }
                            if (phase == "uploading") Text("▌", color = Color(0xFF94A3B8), fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace)
                        }
                    }
                }
            }

            resultJson?.let { json ->
                Text("Ergebnis", style = MaterialTheme.typography.titleMedium)
                Surface(color = Color(0xFFF8FAFC), shape = MaterialTheme.shapes.medium, modifier = Modifier.fillMaxWidth()) {
                    Text(json, modifier = Modifier.padding(12.dp), fontSize = 12.sp, fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace)
                }
                Button(onClick = onDone, modifier = Modifier.fillMaxWidth()) { Text("Zurück zum Tier") }
            }

            if (phase == "error") {
                OutlinedButton(onClick = { phase = "capture"; statusLog = emptyList() }, modifier = Modifier.fillMaxWidth()) { Text("Erneut versuchen") }
            }
        }
    }
}
