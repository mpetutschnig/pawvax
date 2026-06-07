# PAWvax Security Audit & Red Team Action Plan

**Datum:** 08. Mai 2026 (aktualisiert Juni 2026)
**Fokus:** Adversarial Audit (Frontend, Backend, Authentifizierung, DB, Infrastruktur, AI-Integration)
**Zielumgebung:** Hostile Environment (Öffentliches Internet, motivierte Angreifer)

Dieses Dokument listet alle identifizierten Schwachstellen und Architekturbedenken auf, geordnet nach Kritikalität.

---

## Kritische Risiken (Sofortiges Handeln erforderlich)

### 1. Malicious File Uploads (RCE / Stored XSS)
**Vektor:** Der WebSocket-Upload (`wsDocumentUpload.js`) nimmt binäre Chunks entgegen und speichert sie. Der Dateiname wird zwar über `uuid()_filename.replace(...)` bereinigt, aber es gibt **keine Validierung des Datei-Inhalts (Magic Bytes)**.
- **Angriff:** Ein Angreifer lädt eine `.html` oder `.svg` Datei hoch, die als `image/jpeg` deklariert wird, aber bösartiges JavaScript enthält. Wenn Caddy diese Datei ohne `Content-Disposition: attachment` ausliefert, entsteht Stored XSS.
- **Tasks:**
    - [ ] Magic Bytes-Prüfung (z.B. `file-type` Library) serverseitig vor dem finalen Speichern.
    - [ ] Beim Ausliefern aus `/uploads/`: `X-Content-Type-Options: nosniff` Header erzwingen.
    - [ ] Dateiendung komplett durch die aus den Magic Bytes ermittelte Endung ersetzen.

### 2. AI Prompt Injection & Poisoning
**Vektor:** Benutzer können Bilder hochladen, auf denen manipulierter Text steht.
- **Angriff:** Das extrahierte JSON fließt direkt in die Datenbank (`extracted_json`) und wird im Frontend gerendert.
- **Tasks:**
    - [ ] Serverseitige Schema-Validierung (z.B. Zod oder Ajv) auf das von der KI zurückgegebene JSON. Alle unerwarteten Felder verwerfen.
    - [ ] Strikte Sanitization der extrahierten String-Werte vor DB-Speicherung.

### 3. Broken Access Control (IDOR) bei Re-Analyse
**Vektor:** In `documents.js` (`POST /api/documents/:id/retry-analysis` und `re-analyze`).
- **Angriff:** Ein Vet kann Re-Analyse anstoßen und damit AI-Budget des Owners belasten.
- **Tasks:**
    - [ ] Prüfen, auf wessen Kontingent die Re-Analyse abgerechnet wird. Sicherstellen, dass User niemals AI-Kosten eines anderen Users erhöhen können.

---

## Hohe Priorität

### 4. Rate Limiting & Denial of Wallet (DoW) am WebSocket
**Vektor:** `/ws` erfordert Auth, aber keine expliziten Upload-Frequenzlimits.
- **Tasks:**
    - [ ] Rate-Limiting für `/ws` (z.B. max. 5 parallele Uploads pro User).
    - [ ] Festes Limit für Gesamtanzahl hochladbarer Dokumente pro Tier/Account.

### 5. API-Key Verschlüsselung (Encryption at Rest)
**Vektor:** User können eigene Gemini/Claude/OpenAI Keys hinterlegen.
- **Tasks:**
    - [ ] Sicherstellen, dass `ENCRYPTION_KEY` kryptografisch stark ist (AES-256-GCM) und nicht hardcodiert liegt.
    - [ ] Sicherstellen, dass der Initialisierungsvektor (IV) bei jeder Verschlüsselung neu generiert wird.

### 6. JWT Invalidierung (Logout & Account Deletion)
**Vektor:** JWTs sind stateless; gelöschte User könnten Token weiterverwenden.
- **Tasks:**
    - [ ] Überprüfen: Wird bei **jedem** API-Aufruf die Existenz und Rolle des Users in der DB validiert? (Zero-Trust)
    - [ ] JWT-Ablaufzeit kurz halten (15-30 Minuten) und `/auth/refresh` Flow sicherstellen.

---

## Mittlere Priorität

### 7. Serverseitige Request Forgery (SSRF) via Webhooks/URLs
**Vektor:** Falls externe Bild-URLs oder Webhooks für VET-API akzeptiert werden.
- **Tasks:**
    - [ ] Keine direkten HTTP-Calls an User-kontrollierte URLs ohne IP-Range-Prüfung (Localhost, 10.x.x.x, 169.254.169.254).

### 8. Audit-Log Manipulation
**Vektor:** Audit-Log in PostgreSQL kann bei Admin-Zugriff manipuliert werden.
- **Tasks:**
    - [ ] Audit-Logs als Append-Only konfigurieren (PostgreSQL-Trigger der UPDATE/DELETE auf `audit_log` blockiert, außer Retention-Cronjob).

### 9. Passwort-Richtlinien & Brute-Force
**Vektor:** Login- und Registrierungs-Endpunkte.
- **Tasks:**
    - [ ] Account-Lockouts nach fehlgeschlagenen Login-Versuchen (z.B. 5 Versuche → 15 Minuten Sperre).
    - [ ] Rate-Limiting spezifisch für `/auth/login` und `/auth/forgot-password` auf IP-Ebene.

---

## Geringe Priorität / Hardening

### 10. Content Security Policy (CSP) & Security Headers
**Vektor:** PWA Auslieferung über Caddy.
- **Tasks:**
    - [ ] HTTP-Security-Header in Caddy erzwingen:
      - `Strict-Transport-Security: max-age=31536000; includeSubDomains`
      - `X-Frame-Options: DENY`
      - `Content-Security-Policy: default-src 'self'; img-src 'self' data: blob:; connect-src 'self' wss://pawapi.oxs.at;`

### 11. CORS-Konfiguration (Cross-Origin Resource Sharing)
**Vektor:** Die VET-API soll von Dritten konsumiert werden.
- **Tasks:**
    - [ ] Keine Wildcard `Access-Control-Allow-Origin: *` für authentifizierte Routen. Für Public-Scan API ist `*` in Ordnung.

### 12. Datenbank-Zugriffsrechte — ERLEDIGT
**Vektor:** PostgreSQL Container (`paw-postgres`).
- [x] App läuft als Benutzer `pawvax` (nicht als `postgres` Superuser). Konfiguriert in `podman/postgres.container` und `paw-api.container`.

---

## Checkliste für den nächsten Release-Zyklus

- [ ] Magic Bytes Prüfung für Uploads integrieren.
- [ ] Rate-Limiting für WebSockets und Auth-Routen aktivieren.
- [ ] JSON Schema Validator für OCR-Ergebnisse einbauen.
- [ ] `@fastify/helmet` im Server integrieren für Standard-Security-Header.
- [ ] Abhängigkeiten mit `npm audit` prüfen und patchen.
- [x] Datenbank läuft als dedizierter User (`pawvax`), nicht als Superuser.
