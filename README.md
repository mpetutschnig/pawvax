# 🐾 PAW — Startup Guide

Digitaler Tierimpfpass mit Audit-Log, Rollenmodell, Freigaben, Admin-Panel und Containerisierung.

---

## 📋 Übersicht

Das System besteht aus **3 Komponenten**:

| Komponente | Rolle | Port | URL |
|---|---|---|---|
| **Server** | REST API + WebSocket | 3000 | `http://localhost:3000` |
| **PWA** | Browser-App + Admin-Panel | 5173 | `http://localhost:5173` (+ Netzwerk-IP) |
| **Android** (optional) | Mobile App | — | Android Emulator/Gerät |

> 💡 **VS Code:** Debug-Panel (`Ctrl+Shift+D`) → **PAW Full Stack** → ▶ startet beide Dienste automatisch mit Debugger.

---

## 🚀 Schritt-für-Schritt: Von Start bis Admin-Portal

### **Schritt 1: Vorbereitung (erste Benutzung)**

Stelle sicher, dass du im Projekt-Root bist:

```bash
cd /files/FHJoanneum/2026SS/paw.oxs.at
```

### **Schritt 2: Server konfigurieren & starten**

```bash
# Terminal 1
cd server

# Dependencies installieren (falls noch nicht geschehen)
npm install

# .env-Datei erstellen
cp .env.example .env
```

**In `server/.env` eintragen (optional):**

```env
PORT=3000
JWT_SECRET=super_secret_key_123
GEMINI_API_KEY=                    # Leer = Tesseract Fallback
DB_PATH=./paw.db
UPLOADS_DIR=./uploads
ADMIN_EMAIL=admin@example.com      # Erste Admin-Email
```

**Server starten:**

```bash
npm run dev
```

✅ **Erfolgreich, wenn du siehst:**
```
Server läuft auf http://0.0.0.0:3000
✓ Admin-Rolle für admin@example.com gesetzt
```

### **Schritt 3: PWA starten (neues Terminal)**

```bash
# Terminal 2
cd pwa

# Dependencies installieren (falls noch nicht geschehen)
npm install

# Dev-Server starten
npm run dev
```

✅ **Erfolgreich, wenn du siehst:**
```
  VITE v... ready in ... ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: http://192.168.x.x:5173/   ← diese URL am Handy öffnen
```

> `--host` ist bereits in `vite.config.ts` konfiguriert, kein extra Flag nötig.

---

## 📱 Schritt 4: Erster Login & Admin-Setup

### **4a: Normalen User registrieren (falls kein ADMIN_EMAIL gesetzt)**

1. Browser öffnen: **http://localhost:5173**
2. Auf "Registrieren" klicken
3. Daten eingeben:
   - **Name:** Dein Name
   - **Email:** `deine@email.com`
   - **Passwort:** `mindestens 6 Zeichen`
4. ✅ **Registrieren** klicken → automatisch geloggt

### **4b: Admin-Rolle zuweisen**

Du hast zwei Optionen:

**Option A: Über .env (empfohlen)**

```bash
# server/.env ändern:
ADMIN_EMAIL=deine@email.com

# Terminal 1: Server neu starten
# Ctrl+C zum Stoppen
npm run dev
```

**Option B: Direkt in Datenbank**

```bash
# Terminal 3 (neues Terminal)
cd server
sqlite3 paw.db "UPDATE accounts SET role='admin', verified=1 WHERE email='deine@email.com'"
```

### **4c: Admin-Portal aufrufen**

1. Browser: **http://localhost:5173/admin**
2. ✅ Du siehst jetzt das Admin-Dashboard mit 4 Tabs:
   - 📊 **Statistiken** (Accounts, Tiere, Dokumente)
   - 👥 **Accounts** (Account-Management)
   - ✓ **Verifikationen** (Vet-Anträge)
   - 📋 **Audit-Log** (alle Änderungen)

---

## 👤 Benutzer-Rollen verstehen

### **1. User (Standard)**
- Kann eigene Tiere anlegen
- Kann Dokumente hochladen
- Kann Freigaben pro Tier einstellen

### **2. Vet (Tierarzt)**
- Kann Verifikation beantragen → Admin genehmigt
- Nach Genehmigung: grünes 🐾 Paw-Badge auf hochgeladenen Dokumenten
- Sieht nur Tiere/Daten, die der Besitzer freigibt

### **3. Authority (Behörde)**
- Automatisch berechtigt (kein Verifikationsprozess)
- Blaues 🐾 Paw-Badge auf hochgeladenen Dokumenten
- Sieht nur freigegebene Daten

### **4. Admin**
- Vollzugriff auf Admin-Panel
- Verwaltet Accounts und Rollen
- Genehmigt/lehnt Vet-Verifikationen ab
- Sieht komplettes Audit-Log

---

## 📖 Feature-Übersicht & Workflows

### **Workflow 1: Normaler User — Tier registrieren + Dokument hochladen**

**Im Browser (http://localhost:5173):**

1. **Login** mit deinen Credentials
2. **ScanPage** (Startseite):
   - 📷 **Barcode scannen** — QR-Code lesen
   - Oder 📡 **NFC lesen** — NFC-Tag auslesen
   - Oder ⌨️ **ID manuell** — Text eingeben
3. **Tier nicht gefunden?** → Neues Tier anlegen:
   - Name, Tierart, Rasse (optional), Geburtsdatum (optional)
   - ✅ **Tier anlegen** klicken
4. **AnimalPage** (Tierprofil):
   - Tier-Info anzeigen
   - 🏷 **Tags verwalten** — neue Barcodes/NFC hinzufügen
   - 🔐 **Freigaben** — einstellen wer was sieht
   - 📷 **Dokument scannen** — Impfpass fotografieren
5. **DocumentScanPage**:
   - Foto hochladen
   - Live-Status während OCR-Analyse
   - JSON-Ergebnis anzeigen

### **Workflow 2: Admin — Vet-Verifikation**

**Im Admin-Panel (http://localhost:5173/admin):**

1. Tab **✓ Verifikationen** aufrufen
2. Pending-Anfrage sehen (z.B. "Dr. Schmidt")
3. **Genehmigen** oder **Ablehnen** klicken
4. ✅ Vet ist nun verifiziert → grüne 🐾 Badges auf seinen Uploads

### **Workflow 3: Admin — Account-Rollen verwalten**

**Im Admin-Panel:**

1. Tab **👥 Accounts** aufrufen
2. Einen Account klicken
3. Rolle via Dropdown ändern: user → vet → authority → admin
4. ✅ Änderung sofort aktiv

### **Workflow 4: Owner — Freigaben einstellen**

**Im Browser:**

1. Eigenes Tier öffnen
2. **🔐 Freigaben** klicken
3. Pro Rolle (Lesezugriff, Behörde, Tierarzt):
   - ☑️ Impfungen
   - ☑️ Medikamente
   - ☑️ Sonstige Dokumente
   - ☑️ Kontaktdaten (dein Name + Email)
   - ☑️ Rasse
   - ☑️ Geburtsdatum
4. ✅ Sofort gespeichert

### **Workflow 5: Dokument-Detail & Reminder**

1. Tier öffnen → Dokument in der Liste antippen
2. **DocumentDetailPage** zeigt:
   - OCR-Text (vollständig lesbar)
   - OCR-Provider Badge (Gemini Vision / Tesseract.js)
   - Tierarzt- oder Behörden-Badge
3. Bei Impfung/Medikament: **📅 Reminder erstellen** klicken
4. Datum + Titel eingeben → **📥 Datei downloaden** → Gerät öffnet Kalender-App

### **Workflow 6: Eigener Gemini API-Schlüssel**

1. Bottom Nav → **👤 Profil**
2. Unter "Gemini Vision API" → API-Schlüssel (`AIza...`) eingeben
3. **Speichern** → ab sofort werden Uploads mit deinem persönlichen Key analysiert
4. Server fällt auf Tesseract zurück, wenn kein Key gesetzt ist

> ⚠️ Mit eigenem Gemini-Schlüssel werden Dokumentbilder an Google gesendet — Datenschutz beachten.

---

## 🔐 Sicherheit & Datenfluss

### **Login-Token (JWT)**
- Beim Login erhälst du einen **Bearer Token**
- Token wird in `localStorage` gespeichert
- Enthält: accountId, name, email, **role**, **verified**

### **Datenisolation**
- Jeder User sieht NUR seine eigenen Tiere
- Vets/Behörden sehen nur Tiere, die ihnen freigebeben wurden
- Feldweise Filterung (z.B. nur Impfungen, nicht Medikamente)

### **Audit-Log**
- JEDE Änderung wird protokolliert:
  - Wer (account_id + role)
  - Wann (timestamp)
  - Was (action: create_animal, add_tag, update_sharing, etc.)
  - Details (JSON mit before/after)
- Abrufbar im Admin-Panel → 📋 **Audit-Log**

---

## 📱 Android App (optional)

### **In Android Studio öffnen:**

```bash
cd android
# Dann in Android Studio: File → Open → android/
```

### **Server-URL eintragen:**

1. App starten
2. LoginScreen
3. **Server-URL** eingeben:

| Gerät | URL |
|---|---|
| **Emulator** | `http://10.0.2.2:3000/api/` |
| **USB-Debugging** | `http://localhost:3000/api/` (nach `adb reverse tcp:3000 tcp:3000`) |
| **LAN-Gerät** | `http://192.168.X.X:3000/api/` (IP des Servers) |

4. Login mit denselben Credentials wie PWA

**Features:**
- 📷 Barcode-Scanner (ML Kit)
- 📡 NFC-Reader
- 🐕 Tierverwaltung
- 📸 Dokument-Upload
- 🐾 Paw-Badges auf Dokumenten

---

## 🐛 Häufige Probleme

### **Problem: "Tag nicht gefunden"**
→ Der Barcode/NFC-Tag existiert noch nicht im System
→ App bietet an, neues Tier anzulegen

### **Problem: "Kein Zugriff auf diese Tierdaten"**
→ Du bist ein Vet/Authority, aber der Besitzer hat dir keine Daten freigegeben
→ Besitzer muss Freigaben einstellen: `🔐 Freigaben`

### **Problem: JWT-Token abgelaufen**
→ Du wirst automatisch zu `/login` weitergeleitet
→ Einfach erneut einloggen

### **Problem: ML Kit Barcode funktioniert nicht (Android)**
→ Prüfe, dass die Kamera-Permission gewährt ist
→ In `AndroidManifest.xml` sind bereits Permissions konfiguriert

### **Problem: Gemini OCR funktioniert nicht**
→ `GEMINI_API_KEY` in `.env` leer?
→ Server fällt automatisch auf Tesseract.js zurück
→ Funktioniert, aber weniger akkurat

---

## 🔧 Konfiguration (.env)

```bash
# server/.env

# Server
PORT=3000

# JWT
JWT_SECRET=changeme_to_something_secure

# OCR Provider
GEMINI_API_KEY=                          # Leer = Tesseract fallback

# Database
DB_PATH=./paw.db                         # SQLite Datei
UPLOADS_DIR=./uploads                    # Dokumentbilder speichern

# Admin Bootstrap
ADMIN_EMAIL=admin@example.com            # Optional: beim Start admin setzen
```

---

## 📊 Admin-Panel Tabs erklärt

### **📊 Statistiken**
Zeigt 4 Kennzahlen:
- **Accounts:** Gesamtanzahl registrierter User
- **Tiere:** Alle Tiere im System
- **Dokumente:** Alle hochgeladenen Dokumente
- **Audit-Einträge:** Log-Größe

### **👥 Accounts**
- Liste aller User
- Pro User:
  - Name, Email
  - **Rolle ändern** via Dropdown
  - **Verifiziert** Checkbox (manuell setzen)

### **✓ Verifikationen**
- Pending-Anfragen von Tierärzten
- Pro Anfrage:
  - Name, Email
  - **Genehmigen** (grüner Button) → verifiziert, bekommt grünes 🐾
  - **Ablehnen** (roter Button) → rejected, kein Badge

### **📋 Audit-Log**
- Paginierte Liste aller Aktionen
- Columns: Action, Account, Resource, IP, Timestamp
- Filterbar nach:
  - Resource (animal, tag, document, account, sharing)
  - Account-ID
- **Seiten-Navigation:** ← Zurück / Weiter →

---

## ✨ Tipps & Tricks

### **1. Mehrere Accounts testen**
```bash
# Terminal 2: PWA lädt automatisch neu
# Öffne: http://localhost:5173
# Registriere: user1@test.com
# Logout → Registriere: user2@test.com
# Beide lokal speichern
```

### **2. QR-Code zum Testen generieren**
Online-Tool: https://qr-code-generator.com
- Text eingeben: `TEST-BARCODE-12345`
- QR downloaden
- Mit Barcode-Scanner in App einscannen

### **3. NFC-Tag simulieren (Android Emulator)**
```bash
adb emu gsm send-nfc-test-event nfc_data
# oder: Android Studio → Extended controls → NFC → "Tap tag"
```

### **4. Passwort vergessen?**
→ Leider nicht implementiert (wäre Schritt 3 in realer App)
→ Workaround: Neuer Account mit anderer Email

### **5. Datenbank zurücksetzen**
```bash
rm server/paw.db
# Server neu starten → neue Datenbank wird erstellt
```

---

## 🎯 Checkliste: Erste Schritte

- [ ] Server starten (`npm run dev` in `server/`)
- [ ] PWA starten (`npm run dev` in `pwa/`)
- [ ] PWA öffnen: http://localhost:5173
- [ ] Registrieren mit Email + Passwort
- [ ] Admin-Rolle zuweisen (ADMIN_EMAIL in .env oder SQLite)
- [ ] Admin-Panel öffnen: http://localhost:5173/admin
- [ ] Statistiken anschauen
- [ ] Logout → Login mit neuem Account
- [ ] Barcode scannen / Tier anlegen
- [ ] Dokument hochladen
- [ ] Freigaben einstellen
- [ ] Audit-Log ansehen

---

## 🐳 Podman / Container-Deployment

Für Produktion oder einfaches Setup ohne manuelle Node.js-Installation.

### **Voraussetzungen**

```bash
# Podman + podman-compose installieren
# Arch/Manjaro:
sudo pacman -S podman podman-compose

# Fedora/RHEL:
sudo dnf install podman podman-compose

# Ubuntu:
sudo apt install podman podman-compose
```

### **Schritt 1: `.env` im Projekt-Root erstellen**

```bash
cd /files/FHJoanneum/2026SS/paw.oxs.at

cat > .env << 'EOF'
JWT_SECRET=ein_langer_zufallsstring_hier
GEMINI_API_KEY=                    # optional
ADMIN_EMAIL=deine@email.com
EOF
```

> ⚠️ `JWT_SECRET` in Produktion mindestens 32 Zeichen Zufallsstring!

### **Schritt 2: Container bauen & starten**

```bash
podman compose up --build
```

Beim ersten Start wird alles gebaut (~2-3 Minuten). Danach:

```text
✅ paw-server  läuft auf Port 3000 (intern)
✅ paw-web     läuft auf http://localhost:80
```

### **Schritt 3: PWA aufrufen**

| Gerät | URL |
| --- | --- |
| **Lokal** | `http://localhost` |
| **Handy im LAN** | `http://192.168.x.x` (IP des Rechners) |

### **Nützliche Befehle**

```bash
# Starten (im Hintergrund)
podman compose up -d

# Stoppen
podman compose down

# Logs anzeigen
podman compose logs -f

# Nur Server-Logs
podman compose logs -f paw-server

# Neu bauen (nach Code-Änderungen)
podman compose up --build

# Daten-Volume anzeigen (SQLite + Uploads)
podman volume inspect paw_paw-data
```

### **Daten & Persistenz**

Alle Daten (SQLite-Datenbank + hochgeladene Dokumente) liegen im Volume `paw_paw-data`.

```bash
# Volume-Pfad auf dem Host finden
podman volume inspect paw_paw-data --format '{{.Mountpoint}}'

# Datenbank direkt öffnen
sqlite3 $(podman volume inspect paw_paw-data --format '{{.Mountpoint}}')/paw.db
```

### **Hosting bei einem Cloud-Provider**

| Thema | Empfehlung |
| --- | --- |
| **HTTPS** | Nginx + Let's Encrypt (Certbot) vor die Container schalten |
| **Reverse Proxy** | `nginx.conf` bereits konfiguriert für `/api/`, `/ws`, `/uploads/` |
| **Port** | Container lauscht auf Port 80 → Provider-Firewall Port 80/443 öffnen |
| **Uploads** | Volume `paw-data` regelmäßig sichern (enthält SQLite + Bilder) |
| **Ressourcen** | Tesseract OCR ist CPU-intensiv: min. 1 vCPU + 1 GB RAM empfohlen |
| **Skalierung** | SQLite ist single-writer → für hohe Last auf PostgreSQL migrieren |

### **DSGVO-Checkliste für Produktion**

- ✅ `DELETE /api/accounts/me` löscht alle Userdaten (Löschrecht Art. 17)
- ⚠️ Gemini API Key: Dokumente gehen an Google → AVV mit Google Cloud abschließen
- ⚠️ Audit-Log enthält IP-Adressen → Aufbewahrungsfrist 90 Tage empfohlen
- ⚠️ SQLite-Volume in Produktion verschlüsseln (LUKS oder Cloud-Volume-Encryption)
- ⚠️ `JWT_SECRET` niemals in Git committen (`.env` ist in `.gitignore`)

---

## 📞 Support

**Fehler im Server?** → `server/.env` prüfen
**Fehler in PWA?** → Browser-Console öffnen (F12)
**Fehler in Android?** → Logcat in Android Studio
**Datenbank Probleme?** → `rm server/paw.db` und neu starten

---

**Viel Erfolg! 🚀🐾**
