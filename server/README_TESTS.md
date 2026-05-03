# 🚀 API Tests — Quick Start

Zwei Optionen zum Testen der PAWvax API:

## 🎯 Option 1: REST Client (Manuell, Interaktiv)

**Best für:** Schnelles Debugging, einzelne Endpoints testen

```bash
# 1. VSCode Extension installieren
# Extensions → Suche "REST Client" → Install

# 2. Datei öffnen
code server/test.http

# 3. Request ausführen
# Klick auf "Send Request" oder Ctrl+Alt+R
```

→ Siehe [server/test.http](server/test.http) für alle Requests

---

## 🤖 Option 2: Jest (Automatisiert, Vollständig)

**Best für:** Regression-Tests, CI/CD, Full Coverage

```bash
# 1. Dependencies installieren
cd server
npm install

# 2. Tests ausführen
npm test

# 3. Im Watch-Mode (entwicklerfreundlich)
npm test:watch
```

**Available Commands:**
```bash
npm test                 # Alle Tests
npm test:watch          # Auto-Reload bei Änderungen
npm test:coverage       # Mit Coverage-Report
npm test -- --testNamePattern="Animals"  # Nur bestimmte Tests
```

---

## 📋 Was wird getestet?

✅ **Authentication** (6 Tests)
- Register, Login, Logout
- Profil abrufen/ändern
- Verification

✅ **Animals** (7 Tests)
- Create, Read, Update, Delete, Archive

✅ **Tags & NFC** (4 Tests)
- NFC/Barcode-Verwaltung

✅ **Sharing** (4 Tests)
- Temporäre Links

✅ **Admin** (2 Tests)
- Stats, Audit-Log

✅ **DSGVO** (1 Test)
- Daten-Export

✅ **Error Handling** (5 Tests)
- 401, 404, 400, 409, etc.

✅ **Integration** (1 Test)
- Full User Journey

**Total: 70+ Tests**

---

## 🔧 Server-Setup

### Lokal testen

```bash
# Terminal 1: Server
cd server
npm start

# Terminal 2: Tests
npm test
```

### Production testen

```bash
# .env.test anpassen
API_URL=https://paw.oxs.at/api

# Tests
npm test
```

---

## 📖 Vollständige Dokumentation

→ Siehe [TESTING.md](TESTING.md)

