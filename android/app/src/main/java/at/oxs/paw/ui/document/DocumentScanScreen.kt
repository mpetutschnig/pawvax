package at.oxs.paw.ui.document

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Close
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

data class CapturedPage(val uri: Uri, val index: Int)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DocumentScanScreen(animalId: String, onBack: () -> Unit, onDone: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var pages by remember { mutableStateOf<List<CapturedPage>>(emptyList()) }
    var phase by remember { mutableStateOf("capture") }
    var statusLog by remember { mutableStateOf(listOf<Pair<String, String>>()) }
    var resultJson by remember { mutableStateOf<String?>(null) }
    var uploading by remember { mutableStateOf(false) }

    val picker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        uri?.let {
            pages = pages + CapturedPage(it, pages.size + 1)
        }
    }

    fun uploadPages() {
        if (pages.isEmpty()) return
        scope.launch {
            phase = "uploading"
            statusLog = emptyList()
            uploading = true
            val token = TokenStore.getToken(context) ?: return@launch
            val serverUrl = TokenStore.getServerUrl(context)

            try {
                var documentId: String? = null

                for ((index, page) in pages.withIndex()) {
                    val pageNum = index + 1
                    val isLast = pageNum == pages.size
                    val filename = "doc_${System.currentTimeMillis()}_page_$pageNum.jpg"

                    statusLog = statusLog + ("Seite $pageNum wird hochgeladen..." to "info")

                    WsClient(context).uploadDocument(
                        serverUrl,
                        token,
                        animalId,
                        page.uri,
                        filename,
                        pageNumber = pageNum,
                        isLast = isLast
                    ).collect { event ->
                        when (event) {
                            is WsEvent.Status -> statusLog = statusLog + (event.message to "info")
                            is WsEvent.Result -> {
                                statusLog = statusLog + ("Seite $pageNum analysiert!" to "result")
                                if (isLast) {
                                    statusLog = statusLog + ("Vollständige Analyse abgeschlossen!" to "result")
                                    resultJson = event.content.toString()
                                    phase = "done"
                                }
                            }
                            is WsEvent.Error -> {
                                statusLog = statusLog + ("Fehler bei Seite $pageNum: ${event.message}" to "error")
                                phase = "error"
                            }
                        }
                    }
                }
            } catch (e: Exception) {
                statusLog = statusLog + ("Fehler: ${e.message}" to "error")
                phase = "error"
            } finally {
                uploading = false
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
            modifier = Modifier.fillMaxSize().padding(inner).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            when (phase) {
                "capture" -> {
                    LazyColumn(modifier = Modifier.weight(1f)) {
                        item {
                            Text(
                                "Fotos von Impfpass oder Dokumenten aufnehmen",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurface.copy(.6f)
                            )
                            Spacer(Modifier.height(8.dp))
                        }

                        if (pages.isEmpty()) {
                            item {
                                Button(
                                    onClick = { picker.launch("image/*") },
                                    modifier = Modifier.fillMaxWidth()
                                ) { Text("📷 Erstes Foto auswählen") }
                            }
                        } else {
                            item {
                                Text("${pages.size} Seite(n) erfasst", style = MaterialTheme.typography.titleMedium)
                                Spacer(Modifier.height(8.dp))
                            }

                            items(pages) { page ->
                                Card(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(vertical = 4.dp)
                                ) {
                                    Row(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .padding(12.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                                    ) {
                                        Image(
                                            painter = rememberAsyncImagePainter(page.uri),
                                            contentDescription = null,
                                            modifier = Modifier
                                                .size(60.dp)
                                                .background(MaterialTheme.colorScheme.surfaceVariant)
                                        )
                                        Column(modifier = Modifier.weight(1f)) {
                                            Text("Seite ${page.index}", style = MaterialTheme.typography.labelLarge)
                                            Text("Bereit zum Upload", style = MaterialTheme.typography.labelSmall)
                                        }
                                        IconButton(onClick = { pages = pages.filter { it.index != page.index } }) {
                                            Icon(Icons.Default.Close, null, tint = MaterialTheme.colorScheme.error)
                                        }
                                    }
                                }
                            }

                            item {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    Button(
                                        onClick = { picker.launch("image/*") },
                                        modifier = Modifier.weight(1f)
                                    ) { Text("➕ Weitere Seite") }
                                    Button(
                                        onClick = { uploadPages() },
                                        modifier = Modifier.weight(1f),
                                        enabled = pages.isNotEmpty()
                                    ) { Text("✓ Fertig") }
                                }
                            }
                        }
                    }
                }

                "uploading", "done", "error" -> {
                    Text("Status", style = MaterialTheme.typography.titleMedium)
                    Surface(
                        color = Color(0xFF1E293B),
                        shape = MaterialTheme.shapes.medium,
                        modifier = Modifier
                            .fillMaxWidth()
                            .weight(1f)
                    ) {
                        LazyColumn(modifier = Modifier.padding(12.dp)) {
                            items(statusLog) { (msg, kind) ->
                                Text(
                                    "> $msg",
                                    color = when (kind) {
                                        "result" -> Color(0xFF4ADE80)
                                        "error" -> Color(0xFFF87171)
                                        else -> Color(0xFF94A3B8)
                                    },
                                    fontSize = 13.sp,
                                    fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace,
                                    modifier = Modifier.padding(vertical = 2.dp)
                                )
                            }
                            if (phase == "uploading") {
                                item {
                                    Text(
                                        "▌",
                                        color = Color(0xFF94A3B8),
                                        fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace
                                    )
                                }
                            }
                        }
                    }
                }
            }

            resultJson?.let { json ->
                Text("Ergebnis", style = MaterialTheme.typography.titleMedium)
                Surface(
                    color = Color(0xFFF8FAFC),
                    shape = MaterialTheme.shapes.medium,
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(max = 200.dp)
                ) {
                    Text(
                        json,
                        modifier = Modifier
                            .padding(12.dp)
                            .verticalScroll(rememberScrollState()),
                        fontSize = 12.sp,
                        fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace
                    )
                }
                Button(onClick = onDone, modifier = Modifier.fillMaxWidth()) { Text("Zurück zum Tier") }
            }

            if (phase == "error") {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(
                        onClick = { phase = "capture"; statusLog = emptyList() },
                        modifier = Modifier.weight(1f)
                    ) { Text("Erneut versuchen") }
                    Button(
                        onClick = { phase = "capture"; pages = emptyList(); statusLog = emptyList() },
                        modifier = Modifier.weight(1f)
                    ) { Text("Neue Bilder") }
                }
            }
        }
    }
}
