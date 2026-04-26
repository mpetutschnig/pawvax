# Changelog & Android (Kotlin) Integrations-Guide

## 1. Was im Backend & PWA (Web) gerade angepasst wurde

Folgende kritische Fehler und UX-Probleme wurden in der Web-Anwendung und im Backend behoben:

### 📸 1. Out-Of-Memory Crash beim Fotoupload behoben (`DocumentScanPage.tsx`)
- **Problem**: Smartphones (insbes. iOS Safari) stürzten ab und luden die Seite neu, wenn ein 12MP-Foto aufgenommen wurde. Ursache war `reader.readAsDataURL()`, was das Bild als Base64 in den RAM lud.
- **Lösung**: Umstellung auf `URL.createObjectURL()`. Die Bildverkleinerung im Canvas läuft nun speicherschonend ab.

### 🔌 2. WebSocket "upload_end" Bug (`documentUpload.js`)
- **Problem**: Nach dem Senden der Bild-Chunks wurde die JSON-Nachricht `{"type":"upload_end"}` gesendet. Da Fastify/ws alle Pakete als Buffer empfängt, wurde dieser String irrtümlich als Bild-Chunk (21 Bytes) an das JPEG angehängt, anstatt die Analyse zu starten.
- **Lösung**: Das `isBinary`-Flag der WS-Message wird nun korrekt geprüft, um Text von Binärdaten zu unterscheiden.

### 🤖 3. Gemini Prompt Tuning (`ocr.js`)
- **Problem**: Die Erkennung war teils ungenau und es fehlte ein einheitliches Datum.
- **Lösung**: Der Prompt zwingt Gemini nun dazu, den Dokumententyp doppelt zu verifizieren, explizit ein `document_date` (YYYY-MM-DD) herauszulesen und aussagekräftige `suggested_tags` zu generieren.

### 🔑 4. API-Key Validierung (`ProfilePage.tsx`)
- **Problem**: User konnten ungültige Gemini-Keys speichern. Fehler wurden in der UI schlecht sichtbar platziert.
- **Lösung**: Vor dem Speichern prüft das Frontend nun mit einem direkten Call (`GET /models/...`) zur Google API, ob der Key gültig ist. Fehler-/Erfolgsmeldungen werden direkt beim Button gerendert.

### 🔍 5. Tag/URL Parsing beim Scannen (`ScanPage.tsx`)
- **Problem**: Wenn ein QR-Code eine vollständige URL enthielt (z.B. `https://paw.oxs.at/tag/123`), suchte das Backend nach der kompletten URL und lieferte einen 404-Fehler.
- **Lösung**: Die PWA parst nun den Scan-Input. Handelt es sich um eine URL, wird automatisch nur die ID (letzter Pfad-Bestandteil) für die API verwendet.

---

## 2. To-Dos & Anpassungen für die native Android (Kotlin) App

Wenn die Kotlin-App mit diesem Backend kommuniziert, müssen folgende Punkte exakt umgesetzt werden:

### A. Bildkomprimierung VOR dem Upload (Bitmap Resizing)
Sende **niemals** das rohe 15MB Kamerabild über den Socket.
- Verkleinere das `Bitmap` in Kotlin auf max. **1200x1200px** (unter Beibehaltung der Aspect-Ratio).
- Komprimiere das Bild mit `Bitmap.compress(Bitmap.CompressFormat.JPEG, 80, outputStream)`.

### B. Der WebSocket Upload-Flow
Die App muss `OkHttp` WebSockets (oder Ktor) verwenden und exakt diesen Flow einhalten:
1. **Verbinden:** `ws://<server>/ws?token=<jwt>`
2. **Start-Nachricht (TEXT-Frame):**
   ```json
   { "type": "upload_start", "animalId": "...", "filename": "scan.jpg", "mimeType": "image/jpeg", "allowedRoles": ["vet", "authority", "readonly"] }
   ```
3. Warten auf Server-Antwort (TEXT-Frame): `{"type": "ready"}`
4. **Bild senden (BINARY-Frames):** Sende das komprimierte JPEG in Chunks (z.B. 64KB pro Frame).
5. **Abschluss-Nachricht (TEXT-Frame - GANZ WICHTIG):**
   ```json
   { "type": "upload_end" }
   ```
   *Achtung:* Sende dies unbedingt als Text-Message (bei OkHttp: `webSocket.send("{\"type\":\"upload_end\"}")`), NICHT als ByteString/Binär-Frame, sonst schlägt das Parsing im Backend fehl!

### C. WebSocket Status-Listener (UI Updates)
Während der Analyse sendet das Backend kontinuierlich Status-Updates. Die Android UI muss diese abhören und anzeigen (z.B. in einer `TextView` unter einem ProgressBar):
- Lausche auf: `{"type": "status", "message": "..."}`
- Der Text enthält Infos wie *"Anmeldung bei Google API erfolgreich!..."* oder *"Lokales Tesseract OCR wird gestartet"*.

### D. NFC / QR-Code URL Handling
Wenn der Android Barcode-Scanner oder NFC-Reader getriggert wird:
- Lies den Payload aus.
- Prüfe in Kotlin: Beinhaltet der String `http://` oder `https://`?
- Wenn ja: Extrahiere nur den hintersten Teil (die UUID) via `uri.lastPathSegment`, bevor die API `/api/animals/by-tag/` aufgerufen wird.

### E. Gemini Key Validierung in den App-Settings
Sollte der User seinen eigenen Gemini-Key in der App eintragen können, implementiere denselben Pre-Check via Retrofit/OkHttp:
- Mach einen Test-Call an: `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview?key=YOUR_KEY`
- Nur bei `HTTP 200` darf der Key über den eigenen Backend-Endpunkt (`PATCH /api/accounts/me`) gespeichert werden.
