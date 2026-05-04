# 🚀 Server-Debugging auf Hetzner

## Live-Logs anschauen während du testest

Öffne **2 Terminals**:

### Terminal 1: API-Server Logs (Real-time)
```bash
ssh root@paw.oxs.at
journalctl --user-instance -u paw-api.service -f
```

**Output Beispiele:**
- `✓ Erfolg`: `200 GET /api/animals 45ms`
- `✗ Fehler`: `500 POST /api/animals {error: "..."}` 
- `⚠️ Warning`: `Retry analysis failed: {docId: "..."}`

---

### Terminal 2: Frontend / Testen
In deinem Browser oder mit `curl`:
```bash
# Beispiel: Tiere abrufen
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" https://paw.oxs.at/api/animals

# Beispiel: Tier hinzufügen
curl -X POST https://paw.oxs.at/api/animals \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Fluffy","species":"cat"}'
```

---

## Was bedeuten die Logs?

| Fehlermeldung | Ursache | Lösung |
|---|---|---|
| `401 Unauthorized` | JWT ungültig/abgelaufen | Neu anmelden |
| `404 Not Found` | Route/Tier existiert nicht | URL prüfen |
| `400 Bad Request` | Ungültige Daten (z.B. name fehlt) | Formular-Validierung prüfen |
| `422 Unprocessable Entity` | Validierungsfehler (Backend) | Erforderliche Felder prüfen |
| `500 Internal Server Error` | Unerwarteter Fehler | Logs detailliert lesen |

---

## Wichtige Überprüfungen

### 1. JWT Token sichtbar?
```bash
# Im Browser öffnen und DevTools → Application → localStorage suchen
localStorage.getItem('token')
```

### 2. API Server läuft?
```bash
curl https://paw.oxs.at/api/health
# Sollte 200 zurückgeben mit {"status":"ok"}
```

### 3. Database verbunden?
In den Logs sollte **kein `Error: database`** erscheinen.

---

## Wenn alles fehlschlägt: Neustart
```bash
ssh root@paw.oxs.at
systemctl --user restart paw-api paw-pwa
journalctl --user-instance -u paw-api.service -f
```

---

**Tipp:** Öffne **Browser DevTools (F12) → Network Tab** während du testest — sehe alle API-Aufrufe + Response-Status.
