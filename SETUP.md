# 🐾 PAW — Vollständige Setup-Dokumentation

Digitaler Tierimpfpass mit Audit-Log, Rollenmodell, Freigaben und Admin-Panel.

---

## 📋 Systemübersicht

Das System besteht aus **3 Komponenten**:

| Komponente | Rolle | Port | URL |
|---|---|---|---|
| **Server** | REST API + WebSocket | 3000 | http://localhost:3000 |
| **PWA** | Browser-App + Admin-Panel | 5173 | http://localhost:5173 |
| **Android** (optional) | Mobile App | — | Android Emulator/Gerät |

---

## 🚀 Schritt 1: Server einrichten & starten

### Vorbereitung

```bash
cd server
npm install
cp .env.example .env
```

### `.env` Konfiguration

```env
# Pflichtfelder
PORT=3000
JWT_SECRET=super_secret_key_changeme_in_production

# Optional
GEMINI_API_KEY=                    # Leer = Tesseract Fallback
DB_PATH=./paw.db
UPLOADS_DIR=./uploads
ADMIN_EMAIL=admin@example.com      # Erste Admin-Email (automatisch gesetzt beim Start)
```

### Server starten

```bash
npm run dev
```

✅ **Erfolgreich, wenn:**
```
Server läuft auf http://0.0.0.0:3000
✓ Admin-Rolle für admin@example.com gesetzt
```

---

## 🚀 Schritt 2: PWA starten (neues Terminal)

```bash
cd pwa
npm install
npm run dev
```

✅ **Erfolgreich, wenn:**
```
  VITE v... ready in ... ms
  ➜  Local:   http://localhost:5173/
```

---

## 🚀 Schritt 3: Erster Login & Admin-Setup

### 3a: Normalen User registrieren

1. Browser öffnen: **http://localhost:5173**
2. Auf "Registrieren" klicken
3. Daten eingeben:
   - **Name:** Dein Name
   - **Email:** `deine@email.com`
   - **Passwort:** `mindestens 6 Zeichen`
4. ✅ Registrieren → automatisch geloggt

### 3b: Admin-Rolle zuweisen

**Option A: Über `.env` (empfohlen)**

```bash
# server/.env ändern:
ADMIN_EMAIL=deine@email.com

# Terminal 1: Server neu starten
Ctrl+C
npm run dev
```

**Option B: Direkt in Datenbank**

```bash
# Terminal 3 (neues Terminal)
cd server
sqlite3 paw.db "UPDATE accounts SET role='admin', verified=1 WHERE email='deine@email.com'"
```

### 3c: Admin-Portal aufrufen

1. Browser: **http://localhost:5173/admin**
2. ✅ Du siehst das Admin-Dashboard:
   - 📊 **Statistiken** (Accounts, Tiere, Dokumente)
   - 👥 **Accounts** (Account-Management)
   - ✓ **Verifikationen** (Vet-Anträge)
   - 📋 **Audit-Log** (alle Änderungen)

---

## 🔗 Wichtige URLs

### PWA URLs

| URL | Beschreibung | Auth |
|---|---|---|
| http://localhost:5173 | Meine Tiere (Übersicht) | ✅ |
| http://localhost:5173/animals | Tierliste | ✅ |
| http://localhost:5173/animals/:id | Tierprofil + Edit/Delete | ✅ |
| http://localhost:5173/animals/:id/tags | Tag-Verwaltung | ✅ |
| http://localhost:5173/animals/:id/sharing | Freigaben pro Tier | ✅ |
| http://localhost:5173/animals/:id/scan | Dokument hochladen | ✅ |
| http://localhost:5173/scan | Barcode/NFC scannen | ✅ |
| http://localhost:5173/admin | Admin-Panel | ✅ Admin nur |
| http://localhost:5173/login | Login/Registrierung | ❌ |

### Server URLs (REST API)

| Methode | Endpoint | Beschreibung |
|---|---|---|
| `POST` | http://localhost:3000/api/auth/register | Neue Account registrieren |
| `POST` | http://localhost:3000/api/auth/login | Login mit Email/Passwort |
| `GET` | http://localhost:3000/api/animals | Alle Tiere des Users |
| `POST` | http://localhost:3000/api/animals | Neues Tier anlegen |
| `GET` | http://localhost:3000/api/animals/:id | Tier-Details |
| `PATCH` | http://localhost:3000/api/animals/:id | Tier bearbeiten |
| `DELETE` | http://localhost:3000/api/animals/:id | Tier löschen |
| `GET` | http://localhost:3000/api/animals/by-tag/:tagId | Tier per Barcode/NFC suchen |
| `GET` | http://localhost:3000/api/animals/:id/documents | Dokumente eines Tieres |
| `GET` | http://localhost:3000/api/animals/:id/tags | Tags eines Tieres |
| `POST` | http://localhost:3000/api/animals/:id/tags | Neuen Tag hinzufügen |
| `PATCH` | http://localhost:3000/api/animal-tags/:tagId | Tag aktivieren/deaktivieren |
| `GET` | http://localhost:3000/api/animals/:id/sharing | Freigabe-Einstellungen |
| `PUT` | http://localhost:3000/api/animals/:id/sharing | Freigaben aktualisieren |
| `POST` | http://localhost:3000/api/accounts/request-verification | Vet-Verifikation beantragen |

### Admin API Endpoints

| Methode | Endpoint | Beschreibung |
|---|---|---|
| `GET` | http://localhost:3000/api/admin/stats | System-Statistiken (Accounts, Tiere, Dokumente) |
| `GET` | http://localhost:3000/api/admin/accounts | Alle Accounts |
| `PATCH` | http://localhost:3000/api/admin/accounts/:id | Account bearbeiten (Rolle, Verifizierung) |
| `GET` | http://localhost:3000/api/admin/accounts/pending-verification | Pending Vet-Anfragen |
| `POST` | http://localhost:3000/api/admin/accounts/:id/verify | Vet-Anfrage genehmigen/ablehnen |
| `GET` | http://localhost:3000/api/admin/audit | Paginiertes Audit-Log |

### WebSocket

| Endpoint | Beschreibung |
|---|---|
| `ws://localhost:3000/ws?token=<JWT>` | Dokument-Upload + Live OCR-Status |

### Sonstiges

| URL | Beschreibung |
|---|---|
| http://localhost:3000/health | Server Health-Check |
| http://localhost:3000/api/documents/:id | Dokument herunterladen |

---

## 📖 API-Dokumentation

### 📚 Swagger/OpenAPI UI (Optional)

Fastify hat **built-in Swagger/OpenAPI-Unterstützung** via `@fastify/swagger` Plugin.

Falls installiert und aktiviert, ist die **API-Dokumentation verfügbar unter:**

```
http://localhost:3000/documentation
```

Dort kannst du:

- ✅ Alle Endpoints sehen
- ✅ Parameter und Response-Schemas ansehen
- ✅ Requests direkt testen (mit Bearer Token)
- ✅ JSON-Schema für alle Datenmodelle sehen

**Zum Aktivieren im Server** (falls noch nicht gemacht):

```bash
cd server
npm install @fastify/swagger @fastify/swagger-ui
```

Dann in `server/src/app.js`:

```javascript
import fastifySwagger from '@fastify/swagger'
import fastifySwaggerUi from '@fastify/swagger-ui'

await fastify.register(fastifySwagger, {
  swagger: {
    info: { title: 'PAW API', version: '1.0.0' },
    host: 'localhost:3000',
    schemes: ['http']
  }
})
await fastify.register(fastifySwaggerUi, { routePrefix: '/documentation' })
```

### Authentifizierung

Alle API-Endpoints außer `/api/auth/*` benötigen einen **Bearer Token** im `Authorization`-Header:

```
Authorization: Bearer <JWT-Token>
```

Token wird nach Login/Registrierung zurückgegeben und lokal in `localStorage` gespeichert.

### JWT-Payload

Der Token enthält:
```json
{
  "accountId": "...",
  "name": "...",
  "email": "...",
  "role": "user|vet|authority|admin",
  "verified": 0|1
}
```

---

## 🔐 Benutzer-Rollen

| Rolle | Berechtigung | Details |
|---|---|---|
| **User** (Standard) | Eigene Tiere verwalten | Daten nur für sich sichtbar; kann Freigaben pro Tier einstellen |
| **Vet** (Tierarzt) | Freigegebene Tiere sehen | Benötigt Verifikation durch Admin; erhält grüne 🐾 Badges |
| **Authority** (Behörde) | Freigegebene Tiere sehen | Automatisch berechtigt; erhält blaue 🐾 Badges |
| **Admin** | Vollzugriff | Admin-Panel, Account-Verwaltung, Audit-Log |

---

## 📱 Android App Setup (Optional)

### In Android Studio öffnen

```bash
cd android
# Dann: File → Open → android/
```

### Server-URL eintragen

1. App starten
2. Login-Screen
3. **Server-URL** eingeben:

| Gerät | URL |
|---|---|
| **Android Emulator** | `http://10.0.2.2:3000/api/` |
| **USB-Debugging** | `http://localhost:3000/api/` (nach `adb reverse tcp:3000 tcp:3000`) |
| **LAN-Gerät** | `http://192.168.X.X:3000/api/` (IP des Servers) |

4. Mit denselben Credentials wie PWA einloggen

### Features
- 📷 ML Kit Barcode-Scanner
- 📡 NFC-Reader
- 🐕 Tierverwaltung
- 📸 Dokument-Upload
- 🐾 Paw-Badges auf Dokumenten

---

## 📊 Admin-Panel Tabs

### 📊 Statistiken
- **Accounts:** Gesamtanzahl Benutzer
- **Tiere:** Alle Tiere im System
- **Dokumente:** Alle Dokumente
- **Audit-Einträge:** Größe des Audit-Logs

### 👥 Accounts
- Liste aller User
- Pro User: Rolle ändern, Verifizierung setzen

### ✓ Verifikationen
- Pending Vet-Anfragen
- Genehmigen (grüne 🐾) oder Ablehnen

### 📋 Audit-Log
- Alle Systemänderungen
- Paginiert (25 Einträge pro Seite)
- Filterbar nach Resource und Account

---

## 🎯 Workflows

### Workflow 1: Normaler User — Tier anlegen

1. Gehe zu **http://localhost:5173/animals**
2. Klicke auf **➕ Neues Tier anlegen**
3. Gebe an:
   - Name, Tierart, Rasse (optional), Geburtsdatum (optional)
4. ✅ Tier ist angelegt

### Workflow 2: Dokument hochladen

1. Öffne ein Tier
2. Klicke **📷 Dokument scannen**
3. Lade Foto hoch
4. Warte auf OCR-Analyse
5. ✅ Dokument gespeichert mit Daten-Extraktion

### Workflow 3: Freigaben einstellen

1. Öffne ein Tier
2. Klicke **🔐 Freigaben**
3. Pro Rolle (User, Vet, Behörde):
   - ☑️ Impfungen
   - ☑️ Medikamente
   - ☑️ Sonstige Dokumente
   - ☑️ Kontaktdaten
   - ☑️ Rasse
   - ☑️ Geburtsdatum
4. ✅ Sofort gespeichert

### Workflow 4: Admin — Vet-Verifikation

1. Gehe zu **http://localhost:5173/admin**
2. Tab **✓ Verifikationen** aufrufen
3. Pending-Anfrage sehen
4. **Genehmigen** klicken
5. ✅ Vet ist verifiziert → grüne 🐾 Badges

### Workflow 5: Tier bearbeiten/löschen

1. Öffne ein Tier
2. Klicke **✏️ Bearbeiten**
3. Ändere Daten (Name, Tierart, Rasse, Geburtsdatum)
4. Klicke **💾 Speichern**
5. Oder: Klicke **🗑️ Löschen** → Bestätigung → Tier gelöscht

---

## 🐛 Häufige Probleme & Lösungen

### Problem: "Tag nicht gefunden"
- Der Barcode/NFC-Tag existiert noch nicht im System
- App bietet an, neues Tier anzulegen

### Problem: "Kein Zugriff auf diese Tierdaten"
- Du bist ein Vet/Authority, aber der Besitzer hat dir keine Daten freigegeben
- Besitzer muss die Freigaben einstellen: `🔐 Freigaben`

### Problem: JWT-Token abgelaufen
- Du wirst automatisch zu `/login` weitergeleitet
- Einfach erneut einloggen

### Problem: Gemini OCR funktioniert nicht
- `GEMINI_API_KEY` in `.env` nicht gesetzt?
- Server fällt automatisch auf **Tesseract.js** zurück (lokal, weniger akkurat)

### Problem: Android Emulator zeigt "16 KB alignment error"
- **Fix:** `android/gradle.properties` hat `android.enableElfPageAlign=false`
- Rebuild und Fehler sollte weg sein

### Problem: "Datenbank ist gesperrt"
- Ein anderer Prozess hat die DB offen
- Server neu starten: `Ctrl+C` und `npm run dev`

---

## 🔧 Umgebungsvariablen (.env)

| Variable | Default | Beschreibung |
|---|---|---|
| `PORT` | 3000 | Server-Port |
| `JWT_SECRET` | changeme | JWT Signing-Key (⚠️ In Produktion ändern!) |
| `GEMINI_API_KEY` | (leer) | Leer = Tesseract Fallback |
| `DB_PATH` | ./paw.db | SQLite-Datei |
| `UPLOADS_DIR` | ./uploads | Dokumentbilder speichern |
| `ADMIN_EMAIL` | (leer) | Optional: beim Start admin setzen |

---

## 🔐 Datensicherheit

### Login-Token (JWT)
- Beim Login erhälst du einen **Bearer Token**
- Token wird in `localStorage` gespeichert
- Enthält: accountId, name, email, **role**, **verified**
- Alle Endpoints validieren den Token

### Datenisolation
- Jeder User sieht NUR seine eigenen Tiere
- Vets/Behörden sehen nur Tiere, die ihnen freigegeben wurden
- **Feldweise Filterung:** Z.B. nur Impfungen, nicht Medikamente

### Audit-Logging
- JEDE Änderung wird protokolliert:
  - Wer (account_id + role)
  - Wann (timestamp)
  - Was (action: create_animal, add_tag, update_sharing, etc.)
  - Details (JSON mit before/after)
- Abrufbar im Admin-Panel → 📋 **Audit-Log**

---

## 📁 Projektstruktur

```
paw.oxs.at/
├── server/
│   ├── src/
│   │   ├── app.js                    # Fastify Setup, Routes
│   │   ├── db/
│   │   │   ├── index.js              # DB Init, Migrations
│   │   │   └── schema.sql            # DB Schema
│   │   ├── routes/
│   │   │   ├── auth.js               # Auth Endpoints
│   │   │   ├── animals.js            # Animal Endpoints
│   │   │   └── admin.js              # Admin Endpoints
│   │   ├── services/
│   │   │   └── audit.js              # Audit Logging
│   │   └── ws/
│   │       └── documentUpload.js      # WebSocket Upload
│   ├── .env.example
│   └── package.json
├── pwa/
│   ├── src/
│   │   ├── App.tsx                   # Main App + Routing
│   │   ├── api/
│   │   │   └── rest.ts               # API Client
│   │   ├── pages/
│   │   │   ├── LoginPage.tsx
│   │   │   ├── AnimalsPage.tsx        # Tierliste
│   │   │   ├── AnimalPage.tsx         # Tierprofil + Edit/Delete
│   │   │   ├── ScanPage.tsx           # Barcode/NFC Scan
│   │   │   ├── DocumentScanPage.tsx   # Upload + OCR
│   │   │   ├── SharingSettingsPage.tsx # Freigaben
│   │   │   ├── TagManagementPage.tsx  # Tag-Verwaltung
│   │   │   └── AdminPage.tsx          # Admin-Panel
│   │   └── index.css                 # Styles
│   └── package.json
└── android/
    └── app/src/main/java/at/oxs/paw/
        ├── ui/
        │   ├── auth/
        │   ├── animal/
        │   └── ...
        └── model/
            └── Models.kt
```

---

## ✨ Tipps & Tricks

### QR-Code zum Testen generieren
- Online-Tool: https://qr-code-generator.com
- Text eingeben: `TEST-BARCODE-12345`
- QR downloaden
- Mit Barcode-Scanner in App einscannen

### NFC-Tag simulieren (Android Emulator)
```bash
adb emu gsm send-nfc-test-event nfc_data
# oder: Android Studio → Extended controls → NFC → "Tap tag"
```

### Mehrere Accounts testen
```bash
# Terminal 2: PWA lädt automatisch neu
# Öffne: http://localhost:5173
# Registriere: user1@test.com
# Logout → Registriere: user2@test.com
# Beide lokal speichern
```

### Datenbank zurücksetzen
```bash
rm server/paw.db
# Server neu starten → neue Datenbank wird erstellt
```

---

## 🎓 Lernen & Debugging

### Browser-Console (F12)
- Token ansehen: `localStorage.getItem('token')`
- Role prüfen: `localStorage.getItem('role')`
- Logout: `localStorage.clear(); location.reload()`

### Server-Logs
- Server läuft in `npm run dev` → alle Requests werden geloggt
- WebSocket Upload: Status wird in Echtzeit angezeigt

### Datenbank ansehen
```bash
cd server
sqlite3 paw.db ".tables"
sqlite3 paw.db "SELECT * FROM accounts;"
sqlite3 paw.db "SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 10;"
```

---

## 📞 Support

| Problem | Lösung |
|---|---|
| Fehler im Server? | `.env` prüfen, Server-Logs ansehen |
| Fehler in PWA? | Browser-Console öffnen (F12) |
| Fehler in Android? | Logcat in Android Studio |
| Datenbank Probleme? | `rm server/paw.db` und Server neu starten |
| Passwort vergessen? | Neuer Account mit anderer Email, oder SQLite: `UPDATE accounts SET password_hash='...'` |

---

**Viel Erfolg! 🚀🐾**
