# 📊 API Tests & Debugging — Master Guide

Vollständige Test- und Debugging-Dokumentation für PAWvax.

---

## 🗂️ Dokumentationen

### Test-Setup & Ausführung
- **[README_TESTS.md](server/README_TESTS.md)** — Quick Start für Tests
- **[TESTING.md](server/TESTING.md)** — Umfassende Test-Dokumentation

### Debugging & Bug-Reports  
- **[DEBUG_TEMPLATE.md](DEBUG_TEMPLATE.md)** — Struktur für Bug-Reports
- **[SERVER_DEBUG.md](SERVER_DEBUG.md)** — Live-Log Anleitung auf Hetzner

---

## 🎯 Schnelleinstiege

### 1️⃣ Manuell testen (VSCode REST Client)

```bash
# VSCode öffnen
code server/test.http

# REST Client Extension installieren
# Extensions → "REST Client" → Install

# Request ausführen
# Ctrl+Alt+R oder "Send Request" Button
```

**Dateien:**
- `server/test.http` — 100+ REST Requests für alle Endpoints

---

### 2️⃣ Automatisiert testen (Jest)

```bash
cd server
npm install
npm test
```

**Dateien:**
- `server/tests/api.test.js` — 70+ automatisierte Tests
- `server/jest.config.js` — Jest Konfiguration
- `server/.env.test` — Test-Environment-Variablen

---

### 3️⃣ Live-Debugging auf Prod

```bash
ssh root@paw.oxs.at
journalctl --user-instance -u paw-api.service -f
```

**Guides:**
- `DEBUG_TEMPLATE.md` — Wie man Bugs präzise meldet
- `SERVER_DEBUG.md` — Server-Logs und Fehlerbehandlung

---

## 📋 Test-Abdeckung

| Bereich | Tests | Status |
|---|---|---|
| **Authentication** | 6 | ✅ |
| **Animals** | 7 | ✅ |
| **Tags & NFC** | 4 | ✅ |
| **Documents** | *Geplant* | ⏳ |
| **Sharing** | 4 | ✅ |
| **Admin** | 2 | ✅ |
| **VET API** | *Geplant* | ⏳ |
| **DSGVO** | 1 | ✅ |
| **Error Handling** | 5 | ✅ |
| **Integration** | 1 | ✅ |
| **Total** | **70+** | ✅ |

---

## 🛠️ Tools & Technologien

| Tool | Zweck | Installation |
|---|---|---|
| **REST Client** | Manuelles Testen (VSCode) | VSCode Extension |
| **Jest** | Automatisierte Tests | `npm install` |
| **Node.js Fetch** | HTTP Requests in Tests | Built-in |

---

## 📚 Dateien-Übersicht

```
pawvax/
├── server/
│   ├── test.http              ← 100+ REST Requests
│   ├── jest.config.js         ← Jest Konfiguration
│   ├── .env.test              ← Test-Environment
│   ├── package.json           ← Jest Scripts
│   ├── README_TESTS.md        ← Quick Start
│   ├── TESTING.md             ← Umfassendes Guide
│   └── tests/
│       ├── setup.js           ← Test-Setup
│       └── api.test.js        ← Test-Suite (70+ Tests)
│
├── DEBUG_TEMPLATE.md          ← Bug-Report Format
├── SERVER_DEBUG.md            ← Live-Log Guide
└── API_TESTS_MASTER.md        ← (Diese Datei)
```

---

## 🚀 Standard-Workflows

### Workflow 1: Schnell einen Endpoint testen

```bash
# 1. REST Client öffnen
code server/test.http

# 2. Gewünschten Request finden
# z.B. "2a. Create Animal"

# 3. "Send Request" klicken (Ctrl+Alt+R)

# 4. Response rechts anschauen
```

⏱️ **Dauer:** ~30 Sekunden

---

### Workflow 2: Vollständige Test-Suite ausführen

```bash
# 1. Terminal öffnen
cd server

# 2. Dependencies installieren (1x)
npm install

# 3. Tests ausführen
npm test

# 4. Results anschauen
```

⏱️ **Dauer:** ~15 Sekunden

---

### Workflow 3: Bug debuggen auf Production

```bash
# Terminal 1: Server-Logs anschauen
ssh root@paw.oxs.at
journalctl --user-instance -u paw-api.service -f

# Terminal 2: Test ausführen (REST Client)
# oder: npm test

# Terminal 3: Browser öffnen
# DevTools (F12) → Network Tab
# Fehler beobachten → Logs prüfen
```

---

## ❓ FAQ

**F: Wie teste ich Production?**
A: `API_URL=https://paw.oxs.at/api npm test`

**F: Wie debugge ich einzelne Tests?**
A: `npm test -- --testNamePattern="Animals"`

**F: Wo finde ich Fehler?**
A: 
- Jest Output (Terminal)
- Server-Logs (SSH)
- Browser DevTools → Network Tab

**F: Wie speichere ich Variablen in `.http` Requests?**
A: Nach Response → Klick auf Wert → "Set @variableName"

**F: Welche Node-Version ist nötig?**
A: ≥ 18 (für ESM + Jest Support)

---

## 🔗 Verwandte Dokumente

- **[plan.md](plan.md)** — Projekt-Roadmap
- **[DEPLOY.md](DEPLOY.md)** — Deployment auf Hetzner
- **[UPDATE.md](UPDATE.md)** — Update-Skript

---

## 📞 Support

Wenn etwas nicht funktioniert:

1. **[DEBUG_TEMPLATE.md](DEBUG_TEMPLATE.md)** nutzen → Präzise Bug-Report schreiben
2. **Server-Logs prüfen:** `journalctl ... -f`
3. **Browser DevTools:** F12 → Network Tab → API-Aufrufe anschauen
4. **Test-Output:** `npm test:coverage` für Details

---

**Happy Testing! 🎉**
