# PAW - API Tests auf Hetzner ausführen

Kopiere den gewünschten Code-Block und füge ihn als `root` in dein Server-Terminal ein.

---

## Option A: Schneller Smoke-Test (empfohlen nach jedem Deploy)

Testet alle API-Endpunkte gegen die Live-API (`https://paw.oxs.at`).

```bash
PAW_API_UID=$(id -u paw-api) && XDG_RUNTIME_DIR=/run/user/$PAW_API_UID su -s /bin/bash paw-api -c "
  podman run --rm \
    -e API_URL=https://paw.oxs.at/api \
    -e TEST_TIMEOUT=20000 \
    paw-api:latest \
    npx jest --passWithNoTests --forceExit
"
```

---

## Option B: Tests mit Live-Logs (für Debugging)

Zeigt detaillierte Ausgabe + Server-Logs parallel.

```bash
# Terminal 1: Server-Logs mitverfolgen
PAW_API_UID=$(id -u paw-api) && su -s /bin/bash paw-api -c "
  XDG_RUNTIME_DIR=/run/user/$PAW_API_UID journalctl --user -u paw-api -f --no-pager
" &

# Terminal 2: Tests ausführen
PAW_API_UID=$(id -u paw-api) && XDG_RUNTIME_DIR=/run/user/$PAW_API_UID su -s /bin/bash paw-api -c "
  podman run --rm \
    -e API_URL=https://paw.oxs.at/api \
    -e TEST_TIMEOUT=20000 \
    paw-api:latest \
    npx jest --passWithNoTests --forceExit --verbose
"
```

---

## Option C: Einzelne Test-Suite ausführen

Nur eine bestimmte Gruppe testen (z.B. nur Auth oder nur Animals).

```bash
# Nur Auth-Tests
PAW_API_UID=$(id -u paw-api) && XDG_RUNTIME_DIR=/run/user/$PAW_API_UID su -s /bin/bash paw-api -c "
  podman run --rm \
    -e API_URL=https://paw.oxs.at/api \
    paw-api:latest \
    npx jest --testNamePattern='Auth' --passWithNoTests --forceExit
"
```

Verfügbare Test-Suites:
- `Auth` — Login, Register, Logout
- `Animals` — Tier erstellen, lesen, updaten
- `Tags` — NFC / Barcode Tags
- `Sharing` — Öffentliche Freigaben
- `Admin` — Admin-Funktionen
- `DSGVO` — Daten-Export
- `Errors` — Fehler-Handling

---

## Logs lesen (immer nützlich)

```bash
# Live-Logs des API-Servers
PAW_API_UID=$(id -u paw-api) && su -s /bin/bash paw-api -c "
  XDG_RUNTIME_DIR=/run/user/$PAW_API_UID journalctl --user -u paw-api -f --no-pager
"
```

```bash
# Letzte 100 Zeilen
PAW_API_UID=$(id -u paw-api) && su -s /bin/bash paw-api -c "
  XDG_RUNTIME_DIR=/run/user/$PAW_API_UID journalctl --user -u paw-api -n 100 --no-pager
"
```

```bash
# Nur Fehler anzeigen
PAW_API_UID=$(id -u paw-api) && su -s /bin/bash paw-api -c "
  XDG_RUNTIME_DIR=/run/user/$PAW_API_UID journalctl --user -u paw-api -p err --no-pager
"
```

---

## HTTP Status-Code Bedeutungen

| Code | Bedeutung | Typischer Grund |
|------|-----------|-----------------|
| 200 | OK | Alles gut |
| 201 | Created | Ressource erfolgreich erstellt |
| 400 | Bad Request | Fehlende oder ungültige Felder |
| 401 | Unauthorized | Kein oder ungültiger JWT Token |
| 403 | Forbidden | Keine Berechtigung |
| 404 | Not Found | Ressource existiert nicht |
| 409 | Conflict | E-Mail bereits registriert |
| 410 | Gone | Freigabe abgelaufen |
| 429 | Too Many Requests | Rate-Limit überschritten |
| 500 | Internal Server Error | Server-Fehler → Logs prüfen! |
