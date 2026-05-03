# 🧪 PAWvax API Testing Anleitung

## Überblick

Zwei Möglichkeiten zum Testen:

### 1. **Manuell** mit `.http` Datei (VSCode REST Client)
→ Für interaktives Debugging und schnelle Checks

### 2. **Automatisiert** mit Jest Test-Suite
→ Für CI/CD, Regression-Tests, Full-Coverage

---

## Option 1: Manuelles Testen mit `.http` Datei

### Installation: VSCode REST Client Extension

1. VSCode öffnen
2. Extensions → Suche: "REST Client" 
3. Installiere: *REST Client* von *Huachao Mao*
4. Oder verwende Humao: https://humao.rest-client.io

### Datei öffnen

```bash
cd server/
code test.http
```

### Requests ausführen

1. Klick auf **"Send Request"** Button (oben rechts im Editor)
   - Oder: **Tastenkombination: Ctrl+Alt+R** (VS Code)

2. Response wird rechts im Panel angezeigt

3. **Variablen nutzen:**
   ```
   @token = eyJhbGc...  # Nach Login gespeichert
   @animalId = uuid...  # Nach Create Animal gespeichert
   
   # In anderen Requests nutzen:
   GET @apiHost/animals/@animalId
   ```

### Beispiel: Kompletter Ablauf

1. **Request ausführen:** `1a. Register`
   - Kopiere den `token` aus der Response

2. **Variable setzen:**
   - Klick auf den Token in der Response
   - "Set @token" auswählen

3. **Request ausführen:** `1b. Login`
   - Verwendet automatisch `@token`

4. **Request ausführen:** `1c. Get Profile`
   - Zeigt dein Profil mit dem Token

---

## Option 2: Automatisierte Tests mit Jest

### Installation

```bash
cd server/
npm install  # Jest + @types/jest installieren
```

### Tests ausführen

**Alle Tests starten:**
```bash
npm test
```

**Nur eine Test-Suite:**
```bash
npm test -- --testNamePattern="1. Authentication"
```

**Mit Coverage Report:**
```bash
npm test:coverage
```

**Im Watch-Mode (automatisch bei Datei-Änderungen):**
```bash
npm test:watch
```

### Test-Suite Struktur

```
tests/
├── setup.js          # Setup vor allen Tests
└── api.test.js       # Haupttest-Suite (70+ Tests)
```

**Test-Kategorien:**

1. **Authentication (6 Tests)**
   - Register, Login, Logout
   - Profile abrufen/aktualisieren
   - Verification beantragen

2. **Animals (7 Tests)**
   - Create, Read, Update, Delete
   - Archive, Get All

3. **Tags & NFC (4 Tests)**
   - NFC-Tags, Barcode
   - Tag-Verwaltung

4. **Sharing (4 Tests)**
   - Sharing-Links erstellen
   - Öffentliche Links

5. **Admin (2 Tests)**
   - Stats, Audit-Log

6. **DSGVO (1 Test)**
   - Daten-Export

7. **Error Handling (5 Tests)**
   - 401 Unauthorized
   - 404 Not Found
   - 400 Bad Request
   - Validierungsfehler

8. **Integration (1 Test)**
   - Full User Journey

---

## API Server starten

### Lokal für Tests

```bash
# Terminal 1: Server starten
cd server/
npm start

# Terminal 2: Tests ausführen
npm test
```

**oder mit Node Watch-Mode:**

```bash
# Terminal 1
npm run dev

# Terminal 2
npm test:watch
```

### Auf Production testen

```bash
# .env.test ändern zu:
API_URL=https://paw.oxs.at/api

# Tests ausführen
npm test
```

---

## Test-Environment-Variablen

**Datei: `.env.test`**

```env
# Lokal
API_URL=http://localhost:3000/api

# Oder Production
API_URL=https://paw.oxs.at/api

TEST_TIMEOUT=15000
NODE_ENV=test
```

---

## Debugging von Fehlern

### Test schlägt fehl — Was tun?

**1. Logs anschauen:**
```bash
npm test -- --verbose
```

**2. Bestimmten Test debuggen:**
```bash
npm test -- --testNamePattern="2a. Create Animal"
```

**3. Server-Logs prüfen:**
```bash
# Im anderen Terminal
journalctl --user-instance -u paw-api.service -f
```

**4. Browser DevTools für .http Requests:**
- Öffne VSCode Output Panel (Ctrl+Shift+U)
- "REST Client" Tab anschauen

---

## Beispiel Test-Output

```
PASS  tests/api.test.js (12.5s)
  PAWvax API Tests
    1. Authentication (Auth)
      ✓ 1a. Register — Neuen Account erstellen (234ms)
      ✓ 1b. Get Profile — Eigenes Profil abrufen (145ms)
      ✓ 1c. Patch Profile — Profildaten aktualisieren (189ms)
      ✓ 1d. Login — Mit Credentials anmelden (156ms)
      ✓ 1e. Request Verification — Als Tierarzt anmelden (112ms)
      ✓ 1f. Logout — Abmelden (201ms)
    2. Animals
      ✓ 2a. Create Animal — Neues Tier hinzufügen (198ms)
      ✓ 2b. Get All Animals — Alle Tiere abrufen (87ms)
      ✓ 2c. Get Animal Detail — Tier im Detail abrufen (92ms)
      ✓ 2d. Update Animal — Tier aktualisieren (156ms)
      ✓ 2e. Archive Animal — Tier archivieren (143ms)
      ✓ 2f. Get Archived Animal — (124ms)
      ✓ 2g. Create Second Animal — (167ms)
    [... mehr Tests ...]

Test Suites: 1 passed, 1 total
Tests:       72 passed, 72 total
Duration:    12.8s
```

---

## CI/CD Integration

### GitHub Actions Example

```yaml
name: API Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      sqlite:
        image: nats
        
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - run: cd server && npm install
      - run: cd server && npm test
        env:
          API_URL: http://localhost:3000/api
          NODE_ENV: test
```

---

## Tipps & Tricks

### 1. Nur bestimmte Tests ausführen

```bash
# Nur Authentifizierung
npm test -- --testNamePattern="Authentication"

# Nur Error Handling
npm test -- --testNamePattern="Error Handling"

# Nur Tier-Tests
npm test -- --testNamePattern="Animals"
```

### 2. Test-Timeout erhöhen (langsamer Server)

In `jest.config.js`:
```js
testTimeout: 30000  // 30 Sekunden statt 10
```

### 3. Bestimmten Test debuggen

```bash
node --inspect-brk node_modules/jest/bin/jest.js --runInBand --testNamePattern="2a. Create Animal"
```

Dann in VSCode debuggen (Debug Tab öffnen).

### 4. Coverage Report anschauen

```bash
npm test:coverage

# HTML Report öffnen
open coverage/index.html
```

### 5. .http Requests mit Dateien

```http
### Upload Datei
POST @apiHost/animals/@animalId/documents
Authorization: Bearer @token
Content-Type: multipart/form-data; boundary=----Boundary

------Boundary
Content-Disposition: form-data; name="doc_type"

vaccination
------Boundary
Content-Disposition: form-data; name="file"; filename="test.jpg"
Content-Type: image/jpeg

< ./path/to/test.jpg
------Boundary--
```

---

## Troubleshooting

| Problem | Lösung |
|---|---|
| **ECONNREFUSED** (Server nicht erreichbar) | `npm start` in anderem Terminal ausführen |
| **401 Unauthorized** | Token ist abgelaufen, neu anmelden mit Login-Request |
| **404 Not Found** | API_URL in `.env.test` prüfen (lokal vs. prod) |
| **Jest: ESM Module Error** | Node-Version ≥ 18 notwendig, `node --version` prüfen |
| **Timeout bei Tests** | `testTimeout` in `jest.config.js` erhöhen |

---

## Best Practices

✅ **DO:**
- Tests nach jeder Feature-Änderung ausführen
- `.http` für Quick-Checks nutzen
- Jest für Regression-Tests vor Deployment
- Logs parallel mit Server laufen lassen
- Test-Output in CI/CD speichern

❌ **DON'T:**
- Tests in Production mit echten Daten ausführen
- Hardcoded Credentials in Test-Dateien
- Zu viele gleichzeitige Test-Instanzen (Race Conditions)
- Alte Test-Daten in DB lassen (cleanup!

)

---

**Viel Erfolg beim Testen! 🚀**
