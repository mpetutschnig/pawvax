# Spec 11 — Standortmeldungen ("Tier gefunden" / GPS-Report)

Status: IMPLEMENTED · Autor: Marco · Datum: 2026-06-20

## 1. Ziel

Jede Person — auch **ohne Login** (Finder eines entlaufenen Tiers) und jede Rolle —
kann beim öffentlichen Scannen/Öffnen eines Tiers dessen **GPS-Standort senden**. Das löst aus:

1. **Speicherung** als Eintrag in einem Standort-Log am Tier.
2. **Benachrichtigung** des Besitzers (Phase 1: E-Mail; Phase 2: In-App / Web-Push).
3. Besitzer sieht das Log (mit Karten-Link) auf der Tierseite, kann Einträge als
   gesehen markieren / löschen.

Use-Case: Tier entlaufen → Finder scannt Chip/QR (`/t/<tag>`) → tippt „Standort senden" →
Besitzer bekommt Position + optional Kontakt des Finders.

## 2. Hintergrund / verankerte Fakten

- Öffentliche Endpoints liegen unter `/api/public/*`; der Auth-Hook wird dort übersprungen
  (`server/src/routes/animals.js:253` `if (req.url.startsWith('/api/public/')) return`).
  Bestehend: `GET /api/public/tag/:tagId`, `GET /api/public/share/:shareId`.
- Finder-Einstieg: Route `/t/:tagId` → `PublicScanPage` (Result-Phase zeigt Tierinfos).
- Mail: `sendAuthEmail({ type, to, name, token, fastify, req })` in
  `server/src/services/authMail.js` — template-basiert nach `type`. Neuer Typ
  `pet-found-location` ergänzbar.
- **Keine** Push/Web-Push/FCM-Infra vorhanden. Service-Worker existiert (vite-plugin-pwa,
  `sw.js`), aber ohne Push-Handler. → Web-Push ist Phase 2.
- Migrationen: idempotent in `server/src/db/index.js` (`CREATE TABLE IF NOT EXISTS`,
  `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`). Muster-Tabellen: `animal_scans`, `reminders`.
- Audit: `logAudit(db, {...})` aus `server/src/services/audit.js`.
- Besitzer-Mail: `animals.account_id` → `accounts.email`.

## 3. Datenmodell

Neue Tabelle `animal_location_reports`:

```sql
CREATE TABLE IF NOT EXISTS animal_location_reports (
  id            TEXT PRIMARY KEY,
  animal_id     TEXT NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
  lat           REAL NOT NULL,
  lng           REAL NOT NULL,
  accuracy_m    REAL,                 -- Geolocation accuracy in Metern
  note          TEXT,                 -- optionale Nachricht des Finders
  reporter_name TEXT,                 -- optional
  reporter_contact TEXT,              -- optional (Tel/E-Mail des Finders)
  reporter_account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL, -- falls eingeloggt
  source        TEXT NOT NULL DEFAULT 'public',  -- 'public' | 'auth'
  ip            TEXT,                 -- für Missbrauchs-Tracing, nicht angezeigt
  user_agent    TEXT,
  owner_seen_at TEXT,                 -- vom Besitzer als gesehen markiert
  created_at    TEXT DEFAULT (CURRENT_TIMESTAMP)
);
CREATE INDEX IF NOT EXISTS idx_loc_reports_animal ON animal_location_reports(animal_id);
```

**ENTSCHIEDEN:** Button ist **immer** verfügbar (kein `is_lost`-Gating). `is_lost`-Flag
optional in einer späteren Spec, nur zur prominenteren Darstellung — nicht in diesem Scope.

## 4. API

| Methode | Pfad | Auth | Zweck |
|---|---|---|---|
| POST | `/api/public/tag/:tagId/location` | **keine** | Finder sendet Standort (keyed by Tag, nicht animal-id) |
| GET | `/api/animals/:id/location-reports` | Besitzer/Vet | Log abrufen |
| PATCH | `/api/animals/:id/location-reports/:reportId` | Besitzer | `owner_seen_at` setzen |
| DELETE | `/api/animals/:id/location-reports/:reportId` | Besitzer | Eintrag löschen |

**POST-Body:** `{ lat, lng, accuracy_m?, note?, reporter_name?, reporter_contact? }`
- Per Tag (nicht animal-id), damit die interne ID nicht im öffentlichen Aufruf nötig ist;
  Tag-Auflösung wie bei `GET /api/public/tag/:tagId`.
- Eingeloggter Nutzer (optionales JWT): `reporter_account_id` + `source='auth'` setzen.
- Antwort: minimal `{ success: true }` — **keine** Besitzer-/Tierdaten zurückgeben.

## 5. Sicherheit & Datenschutz (kritisch — öffentlicher Write-Endpoint)

- **Rate-Limiting** zwingend: pro IP und pro Tag (z.B. max 5/Stunde/IP, 20/Tag/Tier).
  Projekt hat `default_rate_limit_per_min` Setting — Mechanismus prüfen/wiederverwenden.
- **Eingabevalidierung:** `lat` ∈ [-90,90], `lng` ∈ [-180,180], `accuracy_m` ≥ 0;
  `note`/`reporter_*` Längen begrenzen (z.B. 500/120 Zeichen); Strings escapen (kein HTML
  in E-Mail-Template ohne Escaping).
- **Kein Datenleck:** Endpoint bestätigt nur; gibt keine Tier-/Besitzerinfos preis. Existenz
  eines Tags nicht über Fehlercodes unterscheidbar machen (immer generisch antworten, auch
  bei unbekanntem Tag → `{ success: true }`, intern verwerfen).
- **GPS = personenbezogenes Datum des Finders.** Browser-Geolocation nur nach explizitem
  Tap + Permission. Datenschutzhinweis anzeigen. DSGVO: Zweckbindung (Wiederfinden),
  Datenminimierung, Löschmöglichkeit (DELETE-Endpoint + TTL-Option z.B. 90 Tage).
- **IP/User-Agent** nur intern (Missbrauch), nicht im UI anzeigen, im Audit maskieren.
- Alle Schreibvorgänge via `logAudit` (`action: 'location_report_created'` etc.).
- Bot/Spam: optional einfaches Honeypot-Feld oder Captcha bei hoher Frequenz (Phase 2).

## 6. Benachrichtigung  (ENTSCHIEDEN: E-Mail + In-App-Badge)

**E-Mail (Infra vorhanden):**
- Neuer Typ in `authMail.js`: `pet-found-location`.
- Inhalt: Tiername, Zeitpunkt, **Karten-Link** (`https://www.google.com/maps?q=<lat>,<lng>`),
  Genauigkeit, optionale Finder-Nachricht + Kontakt. Alles escaped.
- Nur senden, wenn `mail_enabled` (siehe `getMailTransportConfig`); sonst still loggen.
- Throttle: max 1 Mail / 10 min / Tier; weitere Reports nur ins Log (In-App-Badge zeigt sie
  trotzdem an).

**In-App-Badge:**
- Ungelesene Reports = `owner_seen_at IS NULL`. Count pro Tier.
- Anzeige: Badge auf der Tierseite (Sektion „Standortmeldungen") **und** auf der Tier-Kachel
  in `AnimalsPage` (Übersicht), damit der Besitzer ohne E-Mail sieht, dass es Meldungen gibt.
- Endpoint `GET /api/animals/:id/location-reports` liefert auch `unseen_count`; optional ein
  leichter Sammel-Endpoint `GET /api/animals/location-reports/unseen-counts` für die
  Übersicht (eine Query über alle eigenen Tiere).
- „Als gesehen" (PATCH) setzt `owner_seen_at` → Badge verschwindet.

**Web-Push: NICHT in diesem Scope** (Phase 2, separate Spec): VAPID + Push-Handler im
Service-Worker + `push_subscriptions`-Tabelle.

## 7. Frontend

- **PublicScanPage** (Result-Phase) + **PublicSharePage:** Button „📍 Standort senden".
  Tap → `navigator.geolocation.getCurrentPosition` → optionales Formular (Nachricht, Name,
  Kontakt) → POST. Erfolgsbestätigung. Datenschutzhinweis.
- Sichtbar für **alle** (auch nicht eingeloggt, jede Rolle) — Kernanforderung.
- **AnimalPage (Besitzer):** neue Sektion „Standortmeldungen" — Liste mit Zeit, Karten-Link/
  Mini-Map, Finder-Nachricht/Kontakt, „als gesehen" + löschen. Ungelesene hervorgehoben.
- i18n: neue Keys in `de.json`/`en.json`.

## 8. Touch-Liste (bei Umsetzung)

**Backend**
1. `db/schema.sql` + `db/index.js` — Tabelle + Migration.
2. `routes/animals.js` (oder neue `routes/locationReports.js`) — 4 Endpoints, Rate-Limit,
   Validierung, Audit.
3. `services/authMail.js` — Typ `pet-found-location` + Template.
4. ggf. `services/locationReports.js` — Logik (Throttle, Mailversand).

**Frontend**
5. `api/rest.ts` — `sendLocationReport(tagId, body)`, `getLocationReports(animalId)`, patch/delete.
6. `pages/PublicScanPage.tsx` + `pages/PublicSharePage.tsx` — Button + Geolocation + Formular.
7. `pages/AnimalPage.tsx` — Log-Sektion.
8. `locales/de.json` + `en.json`.

## 9. Akzeptanzkriterien

1. Nicht eingeloggter Finder kann via `/t/<tag>` Standort senden; Eintrag landet im Log.
2. Besitzer erhält E-Mail mit Karten-Link (wenn Mail aktiv).
3. Besitzer sieht Log auf der Tierseite, kann als gesehen markieren + löschen.
4. Endpoint gibt keine Tier-/Besitzerdaten preis; unbekannter Tag → generische Antwort.
5. Rate-Limit greift; ungültige Koordinaten → 400.
6. Alle Schreibvorgänge im Audit-Log.
7. Funktioniert für jede Rolle inkl. Gast, **immer** (kein vermisst-Flag nötig).
8. Ungelesene Meldungen erzeugen ein Badge auf Tierseite + Tier-Übersicht; „als gesehen"
   entfernt es.

## 10. Entscheidungen

- ✅ Benachrichtigung: **E-Mail + In-App-Badge** (Web-Push später).
- ✅ Button **immer** verfügbar (kein `is_lost`-Gating); `is_lost` später optional.
- ✅ POST **tag-basiert** (`/api/public/tag/:tagId/location`), weniger ID-Leak.

Noch offen (vor/ bei Bau klären):
- [ ] Rate-Limit-Werte (Vorschlag: 5/h/IP, 20/Tag/Tier) + ob Captcha nötig.
- [ ] TTL/Auto-Löschung alter Reports DSGVO (Vorschlag: 90 Tage, per Cron/Cleanup).
- [ ] Finder-Formular: Pflicht-/Optionalfelder (Vorschlag: alles optional außer GPS).
