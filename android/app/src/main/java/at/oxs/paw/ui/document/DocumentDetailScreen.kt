package at.oxs.paw.ui.document

import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat.startActivity
import at.oxs.paw.model.Document
import at.oxs.paw.model.UpdateDocumentRequest
import at.oxs.paw.network.RetrofitClient
import at.oxs.paw.network.TokenStore
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.*

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun DocumentDetailScreen(
    docId: String,
    animalId: String,
    onBack: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var doc by remember { mutableStateOf<Document?>(null) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var editMode by remember { mutableStateOf(false) }
    var reminderMode by remember { mutableStateOf(false) }
    var saving by remember { mutableStateOf(false) }
    var showJsonDetails by remember { mutableStateOf(false) }

    var tags by remember { mutableStateOf<List<String>>(emptyList()) }
    var newTag by remember { mutableStateOf("") }
    var visibility by remember { mutableStateOf<List<String>>(emptyList()) }

    var reminderTitle by remember { mutableStateOf("") }
    var reminderDate by remember { mutableStateOf("") }
    var reminderNotes by remember { mutableStateOf("") }

    var isOwner by remember { mutableStateOf(false) }
    var isUploader by remember { mutableStateOf(false) }
    var addedByRole by remember { mutableStateOf<String?>(null) }
    var selectedDocType by remember { mutableStateOf("other") }

    LaunchedEffect(docId) {
        scope.launch {
            loading = true
            error = null
            try {
                val token = TokenStore.getToken(context) ?: return@launch
                val api = RetrofitClient.build(TokenStore.getServerUrl(context), token)
                val loadedDoc = api.getDocument(docId)
                doc = loadedDoc
                selectedDocType = loadedDoc.doc_type ?: "other"

                val extractedJson = loadedDoc.extracted_json
                if (extractedJson != null && extractedJson is String) {
                    try {
                        val json = JSONObject(extractedJson)
                        val suggestedTags = json.optJSONArray("suggested_tags")
                        if (suggestedTags != null) {
                            tags = (0 until suggestedTags.length()).map { suggestedTags.getString(it) }
                        }
                    } catch (e: Exception) {
                        tags = emptyList()
                    }
                }

                val allowedRolesStr = loadedDoc.allowed_roles
                if (!allowedRolesStr.isNullOrEmpty()) {
                    try {
                        val json = JSONArray(allowedRolesStr)
                        visibility = (0 until json.length()).map { json.getString(it) }
                    } catch (e: Exception) {
                        visibility = emptyList()
                    }
                }

                isOwner = loadedDoc.is_owner ?: false
                isUploader = loadedDoc.is_uploader ?: false
                addedByRole = loadedDoc.added_by_role

            } catch (e: Exception) {
                error = "Dokument konnte nicht geladen werden"
            } finally {
                loading = false
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(getDocTypeLabel(doc?.doc_type)) },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, null) } }
            )
        }
    ) { innerPadding ->
        if (loading) {
            Box(Modifier.fillMaxSize().padding(innerPadding), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
            return@Scaffold
        }

        error?.let {
            Box(Modifier.fillMaxSize().padding(innerPadding), contentAlignment = Alignment.Center) {
                Text(it, color = MaterialTheme.colorScheme.error)
            }
            return@Scaffold
        }

        if (doc == null) {
            Box(Modifier.fillMaxSize().padding(innerPadding), contentAlignment = Alignment.Center) {
                Text("Dokument nicht gefunden")
            }
            return@Scaffold
        }

        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            item {
                if (addedByRole == "vet") {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            Icon(Icons.Default.CheckCircle, null, tint = MaterialTheme.colorScheme.primary)
                            Column {
                                Text("Verifiziertes Tierarztdokument", style = MaterialTheme.typography.labelLarge)
                                Text("Offiziell hochgeladen und medizinisch bestätigt", style = MaterialTheme.typography.labelSmall)
                            }
                        }
                    }
                }
            }

            item {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    AssistChip(
                        onClick = {},
                        label = { Text(doc!!.ocr_provider ?: "Unbekannt") },
                        modifier = Modifier.weight(1f)
                    )
                    if (addedByRole == "vet") {
                        AssistChip(onClick = {}, label = { Text("🐾 Tierarzt") })
                    }
                    if (addedByRole == "authority") {
                        AssistChip(onClick = {}, label = { Text("🏛️ Behörde") })
                    }
                }
            }

            item {
                Text(
                    "Hinzugefügt am ${formatDate(doc!!.created_at)}",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            if (doc?.image_path != null) {
                item {
                    Card(modifier = Modifier.fillMaxWidth()) {
                        Text("📷 Dokumentbild", style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(12.dp))
                    }
                }
            }

            item {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 8.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("🏷 Tags & Freigabe", style = MaterialTheme.typography.titleMedium)
                    if (!editMode && (canEditTags(addedByRole, isUploader) || isOwner)) {
                        TextButton(onClick = { editMode = true }) {
                            Text("Bearbeiten")
                        }
                    }
                }
            }

            if (editMode) {
                item {
                    Card {
                        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            if (canEditTags(addedByRole, isUploader)) {
                                Text("Dokumenttyp", style = MaterialTheme.typography.labelLarge)
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    listOf("vaccination" to "Impfung", "medication" to "Medikament", "other" to "Sonstiges").forEach { (type, label) ->
                                        FilterChip(
                                            selected = selectedDocType == type,
                                            onClick = { selectedDocType = type },
                                            label = { Text(label) }
                                        )
                                    }
                                }
                                Spacer(Modifier.height(8.dp))
                                Text("Tags", style = MaterialTheme.typography.labelLarge)
                                FlowRow(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    tags.forEach { t ->
                                        AssistChip(
                                            onClick = { tags = tags.filter { it != t } },
                                            label = { Text(t) },
                                            trailingIcon = { Icon(Icons.Default.Close, null, modifier = Modifier.size(16.dp)) }
                                        )
                                    }
                                }
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    OutlinedTextField(
                                        value = newTag,
                                        onValueChange = { newTag = it },
                                        label = { Text("Neuer Tag") },
                                        modifier = Modifier.weight(1f),
                                        singleLine = true
                                    )
                                    Button(onClick = {
                                        if (newTag.isNotBlank() && !tags.contains(newTag)) {
                                            tags = tags + newTag
                                            newTag = ""
                                        }
                                    }) { Text("Add") }
                                }
                            }

                            if (isOwner) {
                                Spacer(Modifier.height(8.dp))
                                Text("Wer darf dieses Dokument sehen?", style = MaterialTheme.typography.labelLarge)
                                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                    listOf("vet" to "Tierarzt", "authority" to "Behörde", "readonly" to "Lesender Zugriff").forEach { (id, label) ->
                                        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                                            Checkbox(
                                                checked = visibility.contains(id),
                                                onCheckedChange = {
                                                    visibility = if (it) visibility + id else visibility.filter { r -> r != id }
                                                }
                                            )
                                            Text(label, modifier = Modifier.padding(start = 8.dp))
                                        }
                                    }
                                }
                            }

                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(top = 8.dp),
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Button(
                                    onClick = {
                                        scope.launch {
                                            saving = true
                                            try {
                                                val token = TokenStore.getToken(context) ?: return@launch
                                                val api = RetrofitClient.build(TokenStore.getServerUrl(context), token)
                                                
                                                val newJson = try {
                                                    val obj = if (doc?.extracted_json is String) JSONObject(doc?.extracted_json as String) else JSONObject()
                                                    obj.put("suggested_tags", JSONArray(tags))
                                                    obj.toString()
                                                } catch(e: Exception) {
                                                    JSONObject().put("suggested_tags", JSONArray(tags)).toString()
                                                }
                                                
                                                val req = UpdateDocumentRequest(
                                                    doc_type = selectedDocType,
                                                    extracted_json = newJson,
                                                    allowed_roles = if (isOwner) visibility else null
                                                )
                                                
                                                api.updateDocument(docId, req)
                                                
                                                val updatedDoc = api.getDocument(docId)
                                                doc = updatedDoc
                                                
                                                editMode = false
                                            } catch (e: Exception) {
                                                error = "Fehler beim Speichern"
                                            } finally {
                                                saving = false
                                            }
                                        }
                                    },
                                    modifier = Modifier.weight(1f),
                                    enabled = !saving
                                ) { Text("Speichern") }
                                OutlinedButton(
                                    onClick = { editMode = false },
                                    modifier = Modifier.weight(1f),
                                    enabled = !saving
                                ) { Text("Abbrechen") }
                            }
                        }
                    }
                }
            } else {
                item {
                    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                        Column {
                            Text("Tags", style = MaterialTheme.typography.labelMedium)
                            if (tags.isNotEmpty()) {
                                FlowRow(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    tags.forEach { t -> AssistChip(onClick = {}, label = { Text(t) }) }
                                }
                            } else {
                                Text("Keine Tags vergeben.", style = MaterialTheme.typography.bodySmall)
                            }
                        }
                        Column {
                            Text("Freigegeben für", style = MaterialTheme.typography.labelMedium)
                            if (visibility.isNotEmpty()) {
                                FlowRow(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    visibility.forEach { r ->
                                        AssistChip(onClick = {}, label = {
                                            Text(when (r) {
                                                "vet" -> "Tierarzt"
                                                "authority" -> "Behörde"
                                                else -> "Lesender Zugriff"
                                            })
                                        })
                                    }
                                }
                            } else {
                                Text("Nur für mich sichtbar.", style = MaterialTheme.typography.bodySmall)
                            }
                        }
                    }
                }
            }

            val extractedText = getExtractedText(doc?.extracted_json)
            if (extractedText.isNotEmpty()) {
                item {
                    Text("OCR-Text", style = MaterialTheme.typography.titleMedium)
                }
                item {
                    Card {
                        Text(
                            extractedText,
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(12.dp)
                                .heightIn(max = 300.dp),
                            style = MaterialTheme.typography.bodySmall,
                            fontFamily = FontFamily.Monospace,
                            fontSize = 10.sp
                        )
                    }
                }
            }

            item {
                Button(
                    onClick = { showJsonDetails = !showJsonDetails },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(if (showJsonDetails) "JSON-Details ausblenden" else "JSON-Details anzeigen")
                }
            }

            if (showJsonDetails) {
                item {
                    Card {
                        Text(
                            doc?.extracted_json?.toString() ?: "{}",
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(12.dp)
                                .heightIn(max = 400.dp),
                            style = MaterialTheme.typography.bodySmall,
                            fontFamily = FontFamily.Monospace,
                            fontSize = 10.sp
                        )
                    }
                }
            }

            if (!reminderMode) {
                item {
                    Button(
                        onClick = {
                            val json = doc?.extracted_json
                            var title = getDocTypeLabel(doc?.doc_type)
                            var date = if (json is JSONObject) json.optString("document_date") else ""

                            if (doc?.doc_type == "vaccination" && json is JSONObject) {
                                val vaccinations = json.optJSONArray("vaccinations")
                                if (vaccinations != null && vaccinations.length() > 0) {
                                    val vaccine = vaccinations.getJSONObject(0)
                                    title += ": ${vaccine.optString("vaccine")}"
                                    vaccine.optString("nextDue").let { if (it.isNotEmpty()) date = it }
                                }
                            } else if (doc?.doc_type == "medication" && json is JSONObject) {
                                val medications = json.optJSONArray("medications")
                                if (medications != null && medications.length() > 0) {
                                    val med = medications.getJSONObject(0)
                                    title += ": ${med.optString("name")}"
                                    med.optString("endDate").let { if (it.isNotEmpty()) date = it }
                                }
                            }

                            if (json is JSONObject) {
                                val animal = json.optJSONObject("animal")
                                if (animal != null) {
                                    val animalName = animal.optString("name")
                                    if (animalName.isNotEmpty()) title = "$animalName - $title"
                                }
                            }

                            if (date.length >= 10) {
                                date = date.substring(0, 10)
                            } else {
                                date = ""
                            }

                            reminderTitle = title
                            reminderDate = date
                            reminderMode = true
                        },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text("📅 Kalender-Erinnerung erstellen")
                    }
                }
            }

            if (isOwner || isUploader) {
                if (!(addedByRole == "vet" && !isUploader)) {
                    item {
                        OutlinedButton(
                            onClick = {
                                scope.launch {
                                    saving = true
                                    try {
                                        val token = TokenStore.getToken(context) ?: return@launch
                                        val api = RetrofitClient.build(TokenStore.getServerUrl(context), token)
                                        api.deleteDocument(docId)
                                        onBack()
                                    } catch (e: Exception) {
                                        error = "Fehler beim Löschen"
                                    } finally {
                                        saving = false
                                    }
                                }
                            },
                            modifier = Modifier.fillMaxWidth(),
                            enabled = !saving
                        ) {
                            Text("🗑️ Dokument löschen")
                        }
                    }
                }
            }

            if (addedByRole == "vet" && !isUploader) {
                item {
                    Card(
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)
                    ) {
                        Text(
                            "Verifiziertes Tierarzt-Dokument: Dieses Dokument wurde durch einen Tierarzt hochgeladen und kann daher nicht gelöscht werden. Du kannst nur die Sichtbarkeit bearbeiten.",
                            style = MaterialTheme.typography.bodySmall,
                            modifier = Modifier.padding(12.dp)
                        )
                    }
                }
            }

            if (reminderMode) {
                item {
                    Card(
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)
                    ) {
                        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            Text("📅 Reminder für Kalender", style = MaterialTheme.typography.titleMedium)

                            OutlinedTextField(
                                value = reminderTitle,
                                onValueChange = { reminderTitle = it },
                                label = { Text("Titel") },
                                modifier = Modifier.fillMaxWidth(),
                                singleLine = true
                            )

                            OutlinedTextField(
                                value = reminderDate,
                                onValueChange = { reminderDate = it },
                                label = { Text("Datum") },
                                modifier = Modifier.fillMaxWidth(),
                                singleLine = true
                            )

                            OutlinedTextField(
                                value = reminderNotes,
                                onValueChange = { reminderNotes = it },
                                label = { Text("Notizen") },
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .heightIn(min = 80.dp),
                                maxLines = 4
                            )

                            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Button(
                                    onClick = {
                                        reminderMode = false
                                        reminderTitle = ""
                                        reminderDate = ""
                                        reminderNotes = ""
                                    },
                                    modifier = Modifier.fillMaxWidth(),
                                    enabled = reminderDate.isNotBlank()
                                ) {
                                    Text("⬇️ Datei downloaden")
                                }
                                OutlinedButton(
                                    onClick = {
                                        val intent = Intent(Intent.ACTION_SEND).apply {
                                            type = "message/rfc822"
                                            putExtra(Intent.EXTRA_SUBJECT, "PAW Reminder: $reminderTitle")
                                            putExtra(Intent.EXTRA_TEXT, "Titel: $reminderTitle\nDatum: $reminderDate\n\n$reminderNotes")
                                        }
                                        try {
                                            startActivity(context, intent, null)
                                        } catch (e: Exception) {
                                            error = "E-Mail-App nicht verfügbar"
                                        }
                                        reminderMode = false
                                        reminderTitle = ""
                                        reminderDate = ""
                                        reminderNotes = ""
                                    },
                                    modifier = Modifier.fillMaxWidth(),
                                    enabled = reminderDate.isNotBlank()
                                ) {
                                    Text("📧 Per E-Mail senden")
                                }
                                TextButton(
                                    onClick = {
                                        reminderMode = false
                                        reminderTitle = ""
                                        reminderDate = ""
                                        reminderNotes = ""
                                    },
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Text("Abbrechen")
                                }
                            }
                        }
                    }
                }
            }

            item { Spacer(Modifier.height(40.dp)) }
        }
    }
}

fun getDocTypeLabel(type: String?): String = when (type) {
    "vaccination" -> "💉 Impfung"
    "medication" -> "💊 Medikament"
    else -> "📄 Dokument"
}

fun formatDate(dateStr: String?): String {
    return try {
        val date = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.GERMANY).parse(dateStr ?: "")
        SimpleDateFormat("dd.MM.yyyy HH:mm", Locale.GERMANY).format(date ?: Date())
    } catch (e: Exception) {
        dateStr ?: "Unbekannt"
    }
}

fun canEditTags(addedByRole: String?, isUploader: Boolean): Boolean = isUploader || addedByRole != "vet"

fun getExtractedText(extractedJson: Any?): String {
    return if (extractedJson is JSONObject) {
        extractedJson.optString("rawText", "") + extractedJson.optString("raw_text", "")
    } else if (extractedJson is String) {
        try {
            val json = JSONObject(extractedJson)
            json.optString("rawText", "") + json.optString("raw_text", "")
        } catch (e: Exception) {
            ""
        }
    } else {
        ""
    }
}
