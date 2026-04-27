package at.oxs.paw.ui.scan

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import at.oxs.paw.network.TokenStore
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import androidx.camera.view.PreviewView
import androidx.camera.core.*
import androidx.compose.ui.viewinterop.AndroidView

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PublicScanScreen(onLogin: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var phase by remember { mutableStateOf("scan") } // scan | result | notfound
    var animal by remember { mutableStateOf<JSONObject?>(null) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var permissionGranted by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
        )
    }
    val permLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {
        permissionGranted = it
    }

    fun handleTag(rawTagId: String) {
        scope.launch {
            loading = true
            error = null
            var tagId = rawTagId.trim()
            // Strip URL if full URL was scanned
            try {
                val url = java.net.URL(tagId)
                val parts = url.path.split("/")
                tagId = parts.last()
            } catch (_: Exception) {}

            try {
                val serverUrl = TokenStore.getServerUrl(context)
                    .removeSuffix("/api/").removeSuffix("/")
                val url = "$serverUrl/api/public/tag/${java.net.URLEncoder.encode(tagId, "UTF-8")}"
                val client = OkHttpClient()
                val request = Request.Builder().url(url).get().build()
                val response = client.newCall(request).execute()
                if (response.isSuccessful) {
                    val body = response.body?.string()
                    if (body != null) {
                        animal = JSONObject(body)
                        phase = "result"
                    } else {
                        phase = "notfound"
                    }
                } else {
                    phase = "notfound"
                }
            } catch (e: Exception) {
                error = "Fehler: ${e.message}"
                phase = "notfound"
            } finally {
                loading = false
            }
        }
    }

    when (phase) {
        "result" -> {
            val a = animal ?: return
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(16.dp)
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(
                        modifier = Modifier.padding(24.dp).fillMaxWidth(),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        val speciesEmoji = when (a.optString("species")) {
                            "cat" -> "🐱"; "dog" -> "🐶"; else -> "🐾"
                        }
                        Text(speciesEmoji, style = MaterialTheme.typography.displayMedium)
                        Text(
                            a.optString("name", "Unbekanntes Tier"),
                            style = MaterialTheme.typography.headlineSmall,
                            fontWeight = FontWeight.Bold
                        )
                        val subInfo = buildString {
                            val breed = a.optString("breed")
                            if (breed.isNotEmpty()) append(breed)
                            val birthdate = a.optString("birthdate")
                            if (birthdate.isNotEmpty()) {
                                if (isNotEmpty()) append(" · ")
                                append("geb. $birthdate")
                            }
                        }
                        if (subInfo.isNotEmpty()) {
                            Text(subInfo, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface.copy(.6f))
                        }
                    }
                }

                // Public badge
                Card(
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("🔒", modifier = Modifier.padding(end = 8.dp))
                        Text(
                            "Öffentliches Profil – nur freigegebene Daten",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSecondaryContainer
                        )
                    }
                }

                // Contact
                if (a.has("contact")) {
                    val contact = a.getJSONObject("contact")
                    Card(modifier = Modifier.fillMaxWidth()) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Text("Kontakt", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurface.copy(.6f))
                            Text(contact.optString("name", "—"), style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
                        }
                    }
                }

                // Vaccinations
                if (a.has("vaccinations")) {
                    val vaccinations = a.getJSONArray("vaccinations")
                    if (vaccinations.length() > 0) {
                        Card(modifier = Modifier.fillMaxWidth()) {
                            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text(
                                    "💉 Impfungen (${vaccinations.length()})",
                                    style = MaterialTheme.typography.titleSmall,
                                    fontWeight = FontWeight.Bold
                                )
                                for (i in 0 until vaccinations.length()) {
                                    val doc = vaccinations.getJSONObject(i)
                                    val date = doc.optString("created_at").take(10)
                                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                        Text("Impfung", style = MaterialTheme.typography.bodyMedium)
                                        Text(date, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface.copy(.6f))
                                    }
                                }
                            }
                        }
                    }
                }

                Spacer(Modifier.height(8.dp))
                Button(onClick = onLogin, modifier = Modifier.fillMaxWidth()) {
                    Text("🔑 Anmelden für mehr Details")
                }
                OutlinedButton(onClick = { phase = "scan"; animal = null }, modifier = Modifier.fillMaxWidth()) {
                    Text("Erneut scannen")
                }
            }
        }

        "notfound" -> {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(16.dp)) {
                    Text("❓", style = MaterialTheme.typography.displayMedium)
                    Text("Tier nicht gefunden", style = MaterialTheme.typography.headlineSmall)
                    Text(
                        "Dieser Tag ist noch keinem Tier zugeordnet oder hat kein öffentliches Profil.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurface.copy(.6f)
                    )
                    error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                    OutlinedButton(onClick = { phase = "scan"; error = null }) { Text("Zurück zum Scanner") }
                    Button(onClick = onLogin) { Text("🔑 Anmelden & Tier registrieren") }
                }
            }
        }

        else -> {
            // Scan phase
            Column(
                modifier = Modifier.fillMaxSize().padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Spacer(Modifier.height(16.dp))
                Text("🐾", style = MaterialTheme.typography.displayLarge)
                Text("Tier scannen", style = MaterialTheme.typography.headlineSmall)
                Text(
                    "Scanne den QR-Code oder Barcode am Tag des Tieres",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface.copy(.6f)
                )
                Spacer(Modifier.height(8.dp))

                if (loading) {
                    CircularProgressIndicator()
                } else if (permissionGranted) {
                    BarcodeScannerView(onResult = { code -> handleTag(code) })
                } else {
                    Card(modifier = Modifier.fillMaxWidth()) {
                        Column(modifier = Modifier.padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                            Text("Kamera-Berechtigung erforderlich", style = MaterialTheme.typography.bodyMedium)
                            Spacer(Modifier.height(8.dp))
                            Button(onClick = { permLauncher.launch(Manifest.permission.CAMERA) }) {
                                Text("Berechtigung erteilen")
                            }
                        }
                    }
                }

                error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }

                Spacer(Modifier.weight(1f))
                OutlinedButton(onClick = onLogin, modifier = Modifier.fillMaxWidth()) {
                    Text("🔑 Anmelden")
                }
            }
        }
    }
}
