package at.oxs.paw.ui.tags

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import at.oxs.paw.model.AnimalTag
import at.oxs.paw.ui.theme.Spacing
import at.oxs.paw.model.AddTagRequest
import at.oxs.paw.model.UpdateTagRequest
import at.oxs.paw.network.RetrofitClient
import at.oxs.paw.network.TokenStore
import at.oxs.paw.ui.scan.BarcodeScannerView
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TagManagementScreen(
    animalId: String,
    onBack: () -> Unit,
    registerNfcCallback: ((String) -> Unit) -> Unit,
    unregisterNfcCallback: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var tags by remember { mutableStateOf<List<AnimalTag>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var scanMode by remember { mutableStateOf("none") }

    suspend fun reload() {
        val token = TokenStore.getToken(context) ?: return
        val api = RetrofitClient.build(TokenStore.getServerUrl(context), token)
        tags = api.getAnimalTags(animalId)
        loading = false
    }

    LaunchedEffect(animalId) { reload() }

    suspend fun addTag(tagId: String, tagType: String) {
        scanMode = "none"
        try {
            val token = TokenStore.getToken(context) ?: return
            val api = RetrofitClient.build(TokenStore.getServerUrl(context), token)
            api.addTag(animalId, AddTagRequest(tagId, tagType))
            reload()
        } catch (e: Exception) {
            error = if (e.message?.contains("409") == true) "Tag bereits vergeben" else e.message
        }
    }

    DisposableEffect(scanMode) {
        if (scanMode == "nfc") registerNfcCallback { uid -> scope.launch { addTag(uid, "nfc") } }
        onDispose { if (scanMode == "nfc") unregisterNfcCallback() }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Tags verwalten") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, null) } }
            )
        }
    ) { inner ->
        LazyColumn(modifier = Modifier.fillMaxSize().padding(inner).padding(horizontal = 16.dp)) {
            item {
                Row(modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = { scanMode = "barcode" }, modifier = Modifier.weight(1f)) { Text("📷 Barcode") }
                    OutlinedButton(onClick = { scanMode = "nfc" }, modifier = Modifier.weight(1f)) { Text("📡 NFC") }
                }
                error?.let { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(bottom = 8.dp)) }
            }

            if (scanMode == "barcode") {
                item {
                    BarcodeScannerView(onResult = { code -> scope.launch { addTag(code, "barcode") } })
                    OutlinedButton(onClick = { scanMode = "none" }, modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) { Text("Abbrechen") }
                }
            }
            if (scanMode == "nfc") {
                item {
                    Card(modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp)) {
                        Column(modifier = Modifier.padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                            Text("📡", style = MaterialTheme.typography.displayMedium)
                            Text("Halte das Gerät an den NFC-Tag...", style = MaterialTheme.typography.bodyLarge)
                        }
                    }
                    OutlinedButton(onClick = { scanMode = "none"; unregisterNfcCallback() }, modifier = Modifier.fillMaxWidth()) { Text("Abbrechen") }
                }
            }

            item { Text("Registrierte Tags (${tags.size})", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(vertical = 8.dp)) }

            items(tags) { tag ->
                Card(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                    Row(modifier = Modifier.padding(Spacing.lg), verticalAlignment = Alignment.CenterVertically) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(tag.tag_id, style = MaterialTheme.typography.bodyMedium)
                            Text(
                                "${if (tag.tag_type == "nfc") "📡 NFC" else "📷 Barcode"} · ${tag.added_at.take(10)}",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurface.copy(.6f)
                            )
                        }
                        Column(horizontalAlignment = Alignment.End) {
                            Surface(color = if (tag.active == 1) Color(0xFFDCFCE7) else Color(0xFFFEE2E2), shape = MaterialTheme.shapes.small) {
                                Text(
                                    if (tag.active == 1) "Aktiv" else "Inaktiv",
                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                                    style = MaterialTheme.typography.labelSmall,
                                    color = if (tag.active == 1) Color(0xFF15803D) else Color(0xFFB91C1C)
                                )
                            }
                            TextButton(onClick = {
                                scope.launch {
                                    val token = TokenStore.getToken(context) ?: return@launch
                                    val api = RetrofitClient.build(TokenStore.getServerUrl(context), token)
                                    api.updateTag(tag.tag_id, UpdateTagRequest(tag.active != 1))
                                    reload()
                                }
                            }) { Text(if (tag.active == 1) "Deaktivieren" else "Aktivieren", style = MaterialTheme.typography.labelSmall) }
                        }
                    }
                }
            }
            item { Spacer(Modifier.height(32.dp)) }
        }
    }
}
