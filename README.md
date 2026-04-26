# 🐾 PAW — Startup Guide

Digitaler Tierimpfpass mit Gemini Vision AI, Audit-Log, Rollenmodell, Freigaben, öffentlichem Scan-Profil und Admin-Panel.

---

## 📋 Übersicht

Das System besteht aus **3 Komponenten**:

| Komponente | Rolle | Port | URL |
|---|---|---|---|
| **Server** | REST API + WebSocket | 3000 | `http://localhost:3000` |
| **PWA** | Browser-App + Admin-Panel | 5173 | `http://localhost:5173` (+ Netzwerk-IP) |
| **Android** (optional) | Native Mobile App | — | Android Emulator/Gerät |

> 💡 **VS Code:** Debug-Panel (`Ctrl+Shift+D`) → **PAW Full Stack** → ▶ startet beide Dienste automatisch mit Debugger.

---

## 🚀 Schritt-für-Schritt: Von Start bis Admin-Portal

### **Schritt 1: Vorbereitung (erste Benutzung)**

```bash
cd /files/FHJoanneum/2026SS/paw.oxs.at
```

### **Schritt 2: Server konfigurieren & starten**

```bash
cd server
npm install
cp .env.example .env
```

**In `server/.env` eintragen:**

```env
PORT=3000
JWT_SECRET=super_secret_key_123
GEMINI_API_KEY=                    # Leer = Tesseract Fallback
DB_PATH=./paw.db
UPLOADS_DIR=./uploads
ADMIN_EMAIL=admin@example.com      # Erste Admin-Email
```

```bash
npm run dev
```

✅ **Erfolgreich, wenn du siehst:**
```
Server läuft auf http://0.0.0.0:3000
✓ Admin-Rolle für admin@example.com gesetzt
```

### **Schritt 3: PWA starten**

```bash
cd pwa
npm install
npm run dev
```

---

## 📱 Schritt 4: Erster Login & Admin-Setup

### **4a: User registrieren**

1. Browser: **http://localhost:5173**
2. „Registrieren" → Name, E-Mail, Passwort

### **4b: Admin-Rolle zuweisen**

**Via .env (empfohlen):**
```bash
# server/.env:
ADMIN_EMAIL=deine@email.com
# → Server neu starten
```

**Oder direkt:**
```bash
sqlite3 server/paw.db "UPDATE accounts SET role='admin', verified=1 WHERE email='deine@email.com'"
```

### **4c: Admin-Portal**

Öffne: **http://localhost:5173/admin**

Tabs:
- 📊 **Statistiken** — Accounts, Tiere, Dokumente, Audit-Einträge
- 👥 **Accounts** — Rollen ändern, Accounts verwalten
- ✓ **Verifikationen** — Vet-Anträge genehmigen/ablehnen
- 📋 **Audit-Log** — alle Änderungen paginiert

---

## 👤 Benutzer-Rollen & Permissions

| Rolle | Scannen | Tiere anlegen | Dokumente hochladen | Dokumente löschen | Freigaben ändern |
|---|---|---|---|---|---|
| **readonly** | ✅ (nur public) | ❌ | ❌ | ❌ | ❌ |
| **user** | ✅ | ✅ | ✅ | ✅ (eigene) | ✅ (eigene Tiere) |
| **vet** (verifiziert) | ✅ | ✅ | ✅ mit grünem Badge | ✅ (eigene Uploads) | ✅ |
| **authority** | ✅ | ✅ | ✅ mit blauem Badge | ✅ (eigene Uploads) | ✅ |
| **admin** | ✅ | ✅ | ✅ | ✅ | ✅ |

### Besondere Berechtigungsregeln

- **Verifiziertes Tierarzt-Dokument**: Besitzer kann es **nicht löschen** — nur der Tierarzt der es hochgeladen hat. Besitzer kann nur Sichtbarkeit ändern.
- **Readonly-User**: Kein „Scannen"-Menüpunkt in der App, kein Dokument-Upload möglich.
- **Ohne Login (öffentlicher Scan)**: Zeigt nur Felder, die der Besitzer für `readonly` freigegeben hat.

---

## 🔍 Scan-Modi

### 1. Öffentlicher Scan (ohne Login)
- Login-Screen → **„Tier scannen ohne Anmeldung"**
- Barcode/QR-Code scannen → zeigt öffentliches Tierprofil
- Daten basieren auf den `readonly`-Freigaben des Besitzers

### 2. Authenticated Scan (mit Login)
- Bottom Nav → **„Scannen"** (nur für non-readonly)
- **Eigenes Tier** → voller Zugriff, Tier-Detailseite öffnet sich
- **Fremdes Tier in DB** → Readonly-Ansicht, gefiltert nach Rollenfreigaben
- **Unbekannter Tag** → Neues Tier registrieren

### 3. Dokument-Scan
- Im Tierprofil → **„Dokument scannen"**
- Kamera öffnet sich, Bild wird direkt am Gerät komprimiert (max. 1200×1200px)
- Per WebSocket an Server gesendet (Binary-Chunks + JSON-Kontrollmeldungen)
- Gemini 3.1 Flash-Lite analysiert → strukturiertes JSON zurück

---

## 🤖 Gemini Vision AI — Dokumentenanalyse

### Aktivierung
- **Server-weit**: `GEMINI_API_KEY` in `server/.env`
- **Pro User**: Im Profil eigenen API-Key hinterlegen → wird für diesen User verwendet
- **Fallback**: Ohne Key → Tesseract.js lokal

### API-Key Validierung
Beim Speichern im Profil wird der Key live gegen `GET https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview?key=...` geprüft. Nur bei HTTP 200 wird gespeichert.

### Analysiertes JSON-Format

**Impfdokument:**
```json
{
  "type": "vaccination",
  "document_date": "2024-03-15",
  "summary": "Tollwut-Impfung für Hund Bello, gültig bis 2025-03-15",
  "animal": { "name": "Bello", "species": "dog", "breed": "Labrador", "birthdate": "2020-01-10" },
  "vaccinations": [{ "vaccine": "Nobivac Rabies", "date": "2024-03-15", "nextDue": "2025-03-15", "vet": "Dr. Müller" }],
  "suggested_tags": ["Tollwut", "Nobivac", "Impfpass"]
}
```

**Medikament:**
```json
{
  "type": "medication",
  "document_date": "2024-04-01",
  "summary": "Antibiotikum-Verschreibung für Katze Luna",
  "medications": [{
    "name": "Amoxicillin",
    "dosage": "10mg/kg",
    "frequency": "2x täglich",
    "startDate": "2024-04-01",
    "endDate": "2024-04-10",
    "details": "Breitspektrum-Penicillin, Wirkung gegen gram-positive Bakterien",
    "manufacturer_link": "https://www.msd-tiergesundheit.de"
  }],
  "suggested_tags": ["Antibiotikum", "Rezept", "Amoxicillin"]
}
```

### WebSocket Status-Events während Analyse
```
→ Technologie: Gemini 3.1 Flash-Lite wird initialisiert...
→ Anmeldung bei Google API erfolgreich...
→ Bild wird an Gemini gesendet (Base64-kodiert)...
→ Analyse abgeschlossen. Ergebnis wird verarbeitet...
```

---

## 📄 Dokumenten-Features

### Optische Hervorhebung nach Uploader
| Uploader | Darstellung in der Liste |
|---|---|
| **Verifizierter Tierarzt** | Grüner Rahmen, grüner Hintergrund, grünes Häkchen-Badge „Tierarzt" |
| **Behörde** | Blaues Badge „Behörde" |
| **Besitzer/Admin** | Neutrales Badge „Besitzer" |

### Dokument-Detailseite zeigt
- **Zusammenfassung** (Gemini `summary`) als blaue Box direkt unter dem Bild
- **Verifiziertes Tierarzt-Dokument Banner** (grün, mit CheckCircle-Icon) wenn `added_by_role = 'vet'`
- **Tags** mit Uploader-Badge (unveränderbar: wer hat es hochgeladen)
- **Freigaben** — wer darf es sehen (Tierarzt / Behörde / Lesender Zugriff)
- **OCR-Text** — Volltext des erkannten Inhalts
- **JSON-Details anzeigen** — das komplette Gemini-JSON ausklappen
- **Kalender-Erinnerung erstellen** — für jedes Dokument, egal welchen Typs

### Kalender-Reminder
- Pre-fill mit Tier-Name, Dokumenttyp, Produkt (z.B. Impfstoff), erkanntem Datum
- **Download als .ics** → native Kalender-App (iOS, Android, Desktop)
- **Per E-Mail senden** → `mailto:`-Link mit Betreff + Inhalt

### Bild-Rotation & Komprimierung
- Vor dem Upload: Bild kann per Rotations-Button (90°) gedreht werden
- Komprimierung am Device auf max. 1200×1200px, JPEG 80% Qualität
- Nutzt `createImageBitmap()` (kein Out-Of-Memory Crash auf mobilen Browsern)

---

## 🔌 API-Endpunkte

### Öffentlich (kein Token nötig)

| Method | Endpoint | Beschreibung |
|---|---|---|
| `GET` | `/api/public/tag/:tagId` | Öffentliches Tierprofil — nur readonly-freigegebene Felder |

### Auth-Endpunkte

| Method | Endpoint | Beschreibung |
|---|---|---|
| `POST` | `/api/auth/register` | Account erstellen |
| `POST` | `/api/auth/login` | Login → JWT Token |

### Animals (🔐 JWT erforderlich)

| Method | Endpoint | Beschreibung |
|---|---|---|
| `GET` | `/api/animals` | Eigene Tiere auflisten |
| `POST` | `/api/animals` | Neues Tier anlegen |
| `GET` | `/api/animals/:id` | Tier-Details |
| `PATCH` | `/api/animals/:id` | Tier bearbeiten |
| `DELETE` | `/api/animals/:id` | Tier löschen (nur Besitzer) |
| `GET` | `/api/animals/by-tag/:tagId` | Tier per Tag-ID suchen |
| `GET` | `/api/animals/:id/documents` | Dokumente eines Tieres |
| `GET` | `/api/animals/:id/tags` | Tags eines Tieres |
| `POST` | `/api/animals/:id/tags` | Neuen Tag hinzufügen |
| `PATCH` | `/api/animals/:id/tags/:tagId` | Tag aktivieren/deaktivieren |
| `GET` | `/api/animals/:id/sharing` | Freigaben anzeigen |
| `PUT` | `/api/animals/:id/sharing` | Freigaben aktualisieren |

### Documents (🔐 JWT erforderlich)

| Method | Endpoint | Beschreibung |
|---|---|---|
| `GET` | `/api/documents/:id` | Dokument-Details inkl. JSON |
| `PATCH` | `/api/documents/:id` | Tags/Sichtbarkeit bearbeiten |
| `DELETE` | `/api/documents/:id` | Dokument löschen |

> **Löschen-Regeln**: Besitzer oder Uploader darf löschen — **außer** der Uploader war ein verifizierter Vet und du bist nicht dieser Vet.

### WebSocket Upload

| Endpoint | Beschreibung |
|---|---|
| `ws://.../ws?token=JWT` | Dokument-Upload via WebSocket |

**Flow:**
1. Verbinden mit `?token=JWT`
2. JSON (Text-Frame): `{ "type": "upload_start", "animalId": "...", "filename": "scan.jpg", "mimeType": "image/jpeg", "allowedRoles": ["vet"] }`
3. Server antwortet (Text-Frame): `{ "type": "ready" }`
4. Binär-Frames: JPEG-Chunks (max. 64KB each)
5. JSON (Text-Frame): `{ "type": "upload_end" }` ← **MUSS Text-Frame sein, nicht Binary!**
6. Server sendet Status-Updates: `{ "type": "status", "message": "..." }`
7. Server sendet Ergebnis: `{ "type": "done", "document": { ... } }`

### Accounts (🔐 JWT erforderlich)

| Method | Endpoint | Beschreibung |
|---|---|---|
| `GET` | `/api/accounts/me` | Eigenes Profil |
| `PATCH` | `/api/accounts/me` | Profil bearbeiten (inkl. Gemini-Key) |
| `DELETE` | `/api/accounts/me` | Account löschen (DSGVO Art. 17) |
| `POST` | `/api/accounts/me/verify-request` | Vet-Verifikation beantragen |

### Admin (🔐 Admin-JWT erforderlich)

| Method | Endpoint | Beschreibung |
|---|---|---|
| `GET` | `/api/admin/stats` | Systemstatistiken |
| `GET` | `/api/admin/accounts` | Alle Accounts |
| `PATCH` | `/api/admin/accounts/:id` | Rolle/Verifikation ändern |
| `GET` | `/api/admin/verifications` | Pending Vet-Anträge |
| `POST` | `/api/admin/verifications/:id/approve` | Vet genehmigen |
| `POST` | `/api/admin/verifications/:id/reject` | Vet ablehnen |
| `GET` | `/api/admin/animals` | Alle Tiere |
| `GET` | `/api/admin/audit` | Audit-Log (paginiert) |

---

## ✅ Verifikationsprozess (Tierarzt)

```
User → "Verifikation beantragen" (Profil-Seite)
     → Status: "pending"
Admin → Admin-Panel → Tab "Verifikationen"
     → "Genehmigen" klicken
     → account.verified = 1
User → Alle künftigen Dokument-Uploads bekommen:
     → added_by_role = 'vet'
     → Grünes Tierarzt-Badge in der Dokumentenliste
     → Grünes Banner "Verifiziertes Tierarztdokument" in der Detailansicht
     → Dokument kann nur vom Tierarzt selbst gelöscht werden
```

---

## 🔐 Sicherheit & Datenfluss

### Login-Token (JWT)
- Enthält: `accountId`, `name`, `email`, `role`, `roles[]`, `verified`
- Gespeichert in `localStorage`

### Datenisolation
- User sieht NUR seine eigenen Tiere
- Vets/Behörden sehen nur freigegebene Tiere und Felder
- Felderweise Filterung via `animal_sharing`-Tabelle (Impfungen, Medikamente, Kontakt, Rasse, etc.)

### Gemini API Key
- Wird im Nutzerprofil gespeichert und vor dem Speichern live validiert
- Beim Analyse-Prozess: Server liest Key aus DB, sendet Request direkt an Google

### Audit-Log
Jede Änderung wird protokolliert: `who` (accountId + role), `when`, `what` (action), `details` (JSON before/after)

---

## 📱 Android App (Kotlin) — Integration

Beim Implementieren der Android App müssen folgende Punkte beachtet werden:

### A. Bild-Komprimierung vor Upload
```kotlin
// Max. 1200x1200px, JPEG 80%
Bitmap.compress(Bitmap.CompressFormat.JPEG, 80, outputStream)
```

### B. WebSocket Upload-Flow (OkHttp)
```kotlin
// 1. Text-Frame (upload_start)
webSocket.send("""{"type":"upload_start","animalId":"...","filename":"scan.jpg","mimeType":"image/jpeg","allowedRoles":["vet"]}""")

// 2. Binary-Frames (Chunks à 64KB)
webSocket.send(ByteString.of(*chunk))

// 3. Text-Frame (upload_end) — NICHT als ByteString!
webSocket.send("""{"type":"upload_end"}""")
```

### C. Status-Events lauschen
```kotlin
override fun onMessage(webSocket: WebSocket, text: String) {
    val json = JSONObject(text)
    when (json.getString("type")) {
        "status" -> showStatus(json.getString("message"))
        "done"   -> showResult(json.getJSONObject("document"))
    }
}
```

### D. NFC/QR URL-Parsing
```kotlin
val tagId = if (payload.startsWith("http")) Uri.parse(payload).lastPathSegment else payload
```

### E. Gemini Key Validierung
```kotlin
val response = okHttpClient.newCall(Request.Builder()
    .url("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview?key=$key")
    .build()).execute()
if (response.isSuccessful) saveKey(key)
```

---

## 📊 Admin-Panel Tabs erklärt

### 📊 Statistiken
Accounts, Tiere, Dokumente, Audit-Einträge

### 👥 Accounts
- Liste aller User
- Rolle via Dropdown ändern (user → vet → authority → admin)
- Verifiziert-Checkbox manuell setzen

### ✓ Verifikationen
- Pending-Anfragen von Tierärzten
- **Genehmigen** → `verified = 1`, Vet-Badge aktiv
- **Ablehnen** → Status `rejected`

### 📋 Audit-Log
Paginiert, filterbar nach Resource und Account-ID

---

## 🔧 Konfiguration (.env)

```bash
# server/.env
PORT=3000
JWT_SECRET=changeme_to_something_secure
GEMINI_API_KEY=                          # Leer = Tesseract fallback
DB_PATH=./paw.db
UPLOADS_DIR=./uploads
ADMIN_EMAIL=admin@example.com
```

---

## 🐳 Container-Deployment (Podman)

```bash
# .env im Projekt-Root:
JWT_SECRET=ein_langer_zufallsstring_hier
ADMIN_EMAIL=deine@email.com

# Starten:
podman compose up --build

# Stoppen:
podman compose down

# Logs:
podman compose logs -f
```

| Gerät | URL |
|---|---|
| **Lokal** | `http://localhost` |
| **Handy im LAN** | `http://192.168.x.x` |

---

## 🐛 Häufige Probleme

| Problem | Lösung |
|---|---|
| „Tag nicht gefunden" | Tag existiert noch nicht → Neues Tier anlegen |
| „Kein Zugriff auf diese Tierdaten" | Besitzer muss Freigaben setzen (🔐 Freigaben) |
| Seite lädt nach Kamera-Foto neu | Normales Verhalten bei sehr alten Browsern — Update des Browsers |
| Gemini liefert falschen Dokumenttyp | Gemini prüft jetzt doppelt — Bilder von weiter weg fotografieren |
| API-Key wird nicht gespeichert | Key wird live validiert — ungültiger Key wird abgelehnt |
| Menu-Icons fehlen | Token leer? → Neu einloggen |
| WebSocket upload_end wird nicht erkannt | `upload_end` muss als Text-Frame (nicht Binary) gesendet werden |

---

## 🎯 Checkliste: Erste Schritte

- [ ] Server starten (`npm run dev` in `server/`)
- [ ] PWA starten (`npm run dev` in `pwa/`)
- [ ] PWA öffnen: http://localhost:5173
- [ ] Registrieren mit Email + Passwort
- [ ] Admin-Rolle zuweisen (ADMIN_EMAIL in .env)
- [ ] Admin-Panel öffnen: http://localhost:5173/admin
- [ ] Gemini API-Key im Profil hinterlegen (optional)
- [ ] Barcode/QR-Code scannen → Tier anlegen
- [ ] Dokument fotografieren → Gemini-Analyse abwarten
- [ ] Tags & Zusammenfassung prüfen
- [ ] Freigaben einstellen
- [ ] Öffentliches Profil testen (logout → „Tier scannen ohne Anmeldung")
- [ ] Audit-Log ansehen

---

## 📞 Support

- **Fehler im Server?** → `server/.env` prüfen, `server/paw.db` zurücksetzen
- **Fehler in PWA?** → Browser-Console (F12)
- **Fehler in Android?** → Logcat in Android Studio
- **Datenbank korrupt?** → `rm server/paw.db` und neu starten

---

**Viel Erfolg! 🚀🐾**
