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
GEMINI_API_KEY=
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
- **API-Key erforderlich**: Kein lokaler Fallback vorhanden

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

## 📚 Interaktive API-Dokumentation (Swagger/OpenAPI)

Fastify generiert automatisch eine interaktive API-Dokumentation.

**Zugriff:** `http://localhost:3000/documentation` (bzw. auf deinem Server unter der entsprechenden Subdomain).

**So testest du Endpoints im Swagger:**
1. Logge dich in der PWA ein (`http://localhost:5173/login`).
2. Öffne die Entwicklertools (F12) → Tab "Anwendung/Application" → "Lokaler Speicher/Local Storage".
3. Kopiere den Wert des Schlüssels `token`.
4. Klicke im Swagger UI oben rechts auf den grünen Button **"Authorize"** und füge den Token ein.
5. Jetzt kannst du jeden Endpoint mit `Try it out` testen!

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

### Server-URL für lokales Testen eintragen
Wenn du die App im Android Studio entwickelst, trage im Login-Screen diese URLs ein:

| Gerät | URL |
|---|---|
| **Android Emulator** | `http://10.0.2.2:3000/api/` |
| **USB-Debugging** | `http://localhost:3000/api/` (nach `adb reverse tcp:3000 tcp:3000`) |
| **LAN-Gerät** | `http://192.168.X.X:3000/api/` (IP des Servers im lokalen WLAN) |

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

## ✅ Features Testing & Deployment

### 🧪 Feature-Testing (Development)

#### 1. **Register/Login (JWT 7-Tage Expiry)**
```bash
# Registrieren
→ /login → "Registrieren"
→ E-Mail, Passwort eintragen
→ Login & Token in localStorage gespeichert
→ Token hat 7-Tage Gültigkeitsdauer (JWT expiry)
→ Logout blacklistet Token sofort (JWT jti blacklist)
```

#### 2. **Create Animal + Multi-Page Document Upload** ⭐ **NEU**
```bash
# Tier anlegen
→ /animals → "Neues Tier"
→ Name, Art, Rasse, Geburtsdatum

# Dokument mit mehreren Seiten scannen
→ Tier-Details → "Dokument scannen"
→ Erste Seite fotografieren + "Add page" Button
→ 2-3 weitere Seiten hinzufügen (Thumbnails sichtbar)
→ Seite entfernen mit X-Button möglich
→ "Hochladen & analysieren" → alle Seiten kombiniert
→ OCR-Text kombiniert, AI schlägt document type vor
→ Ergebnis zeigt Seitenzahl: "Pages: 3"
```

#### 3. **Dark/Light Mode Toggle** ⭐ **NEU**
```bash
# Profil-Seite → Sun/Moon Icon oben rechts
→ Light (☀️) → Dark (🌙) → System (Voreinstellung)
→ Einstellung in localStorage persistent
→ Automatische CSS-Token-Anpassung (oklch Farben)
```

#### 4. **Admin Panel (Mobile-Responsive)** ⭐ **NEU**
```bash
# Desktop: Sidebar immer sichtbar
# Mobile (<768px): Hamburger Menu ☰
→ Click ☰ → Drawer slides in
→ Click Menü-Item → Drawer closes
→ Alle Tabs (Statistiken, Accounts, Verifikationen, Audit-Log) funktionieren
```

#### 5. **Create Organization + Invite** ⭐ **NEU**
```bash
# Profil → (neue Org-Seite falls Frontend integriert)
# Oder API-Test:
POST /api/organizations
{ "name": "Familie Schmidt", "type": "family" }
→ Erhalte organizationId

# Andere User einladen:
POST /api/organizations/:id/invite
{ "email": "anna@example.com" }

# User akzeptiert Einladung:
POST /api/organizations/:id/accept
→ Org-Mitgliedschaft aktiv
```

### 🚀 Production Deployment

#### **Schritt 1: JWT_SECRET Generieren**
```bash
# Sicherer random 64-hex-String (NICHT 'changeme'!)
openssl rand -hex 32
# Ausgabe: ab12cd34ef56...

# In server/.env:
JWT_SECRET=ab12cd34ef56...
```

#### **Schritt 2: ENCRYPTION_KEY (Auto)**
```bash
# Die AES-256 encryption key wird automatisch aus JWT_SECRET abgeleitet
# via SHA-256(JWT_SECRET) - kein separates Env-Var nötig!
```

#### **Schritt 3: npm start (kein --watch)**
```bash
cd server

# Development (mit auto-reload):
npm run dev

# Production (WICHTIG: KEIN --watch):
npm start
# Falls package.json kein "start" hat → node src/app.js statt npm run dev

# Oder:
NODE_ENV=production node src/app.js
```

#### **Schritt 4: CORS Origins für deine Domain**
```javascript
// server/src/app.js Zeile 31-33:
await fastify.register(fastifyCors, {
  origin: [
    'https://deine-domain.com',           // ← ANPASSEN!
    'https://www.deine-domain.com',       // ← ANPASSEN!
    'http://localhost:5173'               // Dev only
  ],
  credentials: true
})
```

#### **Schritt 5: PWA Production Build**
```bash
cd pwa

# Build optimiert (statt dev):
npm run build
# Outputs: dist/

# Serve lokal testen:
npm run preview

# Oder production serve:
# (nginx, Apache, Vercel, etc.)
```

#### **Schritt 6: Umgebungsvariablen sichern**
```bash
# server/.env (Secrets, NICHT in Git!)
PORT=3000
JWT_SECRET=ab12cd34ef56...    # Aus openssl generiert
GEMINI_API_KEY=your_key_here  # Optional
DB_PATH=./paw.db
UPLOADS_DIR=./uploads
ADMIN_EMAIL=admin@deine-domain.com
```

#### **Schritt 7: Datenbank-Backup**
```bash
# Vor Deployment: SQLite sichern
cp server/paw.db server/paw.db.backup

# Uploads-Folder sichern:
tar -czf uploads.tar.gz server/uploads/
```

#### **Schritt 8: Test nach Deployment**
```bash
# Health-Check:
curl https://deine-domain.com/health
# → {"status":"ok"}

# Login testen:
curl -X POST https://deine-domain.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@...","password":"..."}'
# → JWT Token zurück

# Admin-Panel:
https://deine-domain.com/#/admin
```

---

## 🔧 Konfiguration (.env)

```bash
# server/.env
PORT=3000
JWT_SECRET=changeme_to_something_secure
GEMINI_API_KEY=
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

## 📁 Projektstruktur

```text
paw.oxs.at/
├── server/
│   ├── src/
│   │   ├── app.js                    # Fastify Setup, Routes
│   │   ├── db/
│   │   │   ├── index.js              # DB Init, Migrations
│   │   │   └── schema.sql            # DB Schema
│   │   ├── routes/                   # API Endpoints
│   │   ├── services/                 # OCR, Audit Logging, Storage
│   │   └── ws/                       # WebSocket Upload Handler
│   ├── .env.example
│   └── package.json
├── pwa/
│   ├── src/
│   │   ├── App.tsx                   # Main App + Routing
│   │   ├── api/
│   │   │   └── rest.ts               # API Client
│   │   ├── pages/                    # React Views (Login, Animals, Scan...)
│   │   └── index.css                 # Styles & Theme Variables
│   └── package.json
└── android/                          # Native Kotlin App
```

---

## ✨ Tipps & Tricks für die Entwicklung

### QR-Code zum Testen generieren
- Nutze ein Online-Tool (z.B. qr-code-generator.com).
- Text eingeben: `TEST-BARCODE-12345`
- QR-Code auf dem Bildschirm anzeigen und mit dem Barcode-Scanner der App einscannen.

### NFC-Tag simulieren (Android Emulator)
Du kannst NFC-Scans im Emulator über das Terminal simulieren:
```bash
adb emu gsm send-nfc-test-event nfc_data
```
*Oder direkt in Android Studio: Extended controls (...) → Virtual sensors → NFC → "Tap tag".*

### Mehrere Accounts lokal testen
Öffne ein normales Browserfenster und ein Inkognito-Fenster, um das Teilen von Tieren (Vet vs. User) zu testen.

### Datenbank zurücksetzen
```bash
rm server/paw.db
# Server neu starten → eine frische, leere Datenbank wird erstellt.
```

---

## 📞 Support

- **Fehler im Server?** → `server/.env` prüfen, `server/paw.db` zurücksetzen
- **Fehler in PWA?** → Browser-Console (F12)
- **Fehler in Android?** → Logcat in Android Studio
- **Datenbank korrupt?** → `rm server/paw.db` und neu starten

---

**Viel Erfolg! 🚀🐾**
