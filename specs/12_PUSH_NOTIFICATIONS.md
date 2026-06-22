# Spec 12 — Web-Push für Standortmeldungen (Besitzer-Benachrichtigung)

Status: PLANNED (noch nicht umgesetzt) · Autor: Marco · Datum: 2026-06-22

## 1. Ziel

Wenn jemand den Standort eines Tieres meldet (Feature „Tier gefunden", Endpoint
`POST /api/public/animals/:animalId/location` in `server/src/routes/animals.js`), soll der
**Besitzer eine Push-Benachrichtigung** aufs Gerät bekommen — auch wenn die PWA gerade nicht
offen ist.

Heute: Standortmeldung wird gespeichert + per In-App-Badge (`unseen_count`) angezeigt.
Geplant: zusätzlich **Web-Push** an alle registrierten Geräte des Besitzers.

## 2. Warum Web-Push

- PWA hat bereits Service-Worker via `vite-plugin-pwa` (`registerType: 'autoUpdate'`).
- Kein App-Store nötig (iOS 16.4+ unterstützt Web-Push für installierte PWAs).
- Standard: VAPID (Voluntary Application Server Identification), Lib `web-push` (npm).

## 3. Architektur

```
Finder → POST /location → DB insert → für jedes push_subscription des Besitzers:
  web-push.sendNotification(subscription, payload)  → Push-Service (FCM/APNs/Mozilla)
  → Service-Worker 'push'-Event → self.registration.showNotification(...)
  → Klick → openWindow(/animals/:id)
```

## 4. Datenmodell

Neue Tabelle (idempotente Migration in `server/src/db/index.js`, Muster wie
`animal_location_reports`):

```sql
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          TEXT PRIMARY KEY,
  account_id  TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  endpoint    TEXT NOT NULL UNIQUE,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  user_agent  TEXT,
  created_at  TEXT DEFAULT (CURRENT_TIMESTAMP),
  last_used_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_push_subs_account ON push_subscriptions(account_id);
```

## 5. Konfiguration (VAPID)

- VAPID-Keypair einmalig generieren (`npx web-push generate-vapid-keys`).
- Server-Env (paw.env): `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT=mailto:vetzsucht@oxs.at`.
- Public Key dem Frontend bereitstellen: Endpoint `GET /api/push/vapid-public-key` (oder als
  Build-Arg `VITE_VAPID_PUBLIC_KEY` baken — analog `VITE_SENTRY_DSN`).
- Feature ist **no-op wenn VAPID nicht gesetzt** (wie Sentry-Pattern).

## 6. Backend (Touch-Liste)

| # | Datei | Änderung |
|---|-------|----------|
| B1 | `package.json` | dep `web-push` |
| B2 | `db/schema.sql` + `db/index.js` | Tabelle `push_subscriptions` + Migration |
| B3 | neue `routes/push.js` | `POST /api/push/subscribe` (auth, speichert Subscription), `POST /api/push/unsubscribe`, `GET /api/push/vapid-public-key` |
| B4 | neue `services/pushService.js` | `sendToAccount(accountId, payload)`: lädt Subscriptions, `web-push.sendNotification`; bei `410 Gone`/`404` Subscription löschen (abgelaufen) |
| B5 | `routes/animals.js` (`POST .../location`) | nach DB-Insert: `pushService.sendToAccount(animal.account_id, { title, body, url:/animals/:id })` — fire-and-forget, Fehler nur loggen |
| B6 | `app.js` | `web-push.setVapidDetails(...)` beim Start, wenn Env gesetzt |

## 7. Frontend (Touch-Liste)

| # | Datei | Änderung |
|---|-------|----------|
| F1 | `vite.config.*` | Bei `vite-plugin-pwa` von `registerType:'autoUpdate'` ggf. auf `injectManifest`/Custom-SW wechseln, ODER `workbox.importScripts` für den Push-Handler — siehe §8 (SW-Strategie) |
| F2 | Custom SW-Teil | `self.addEventListener('push', …showNotification)` + `notificationclick` → `clients.openWindow('/animals/:id')` |
| F3 | neue `hooks/usePushSubscription.ts` | Permission anfragen, `registration.pushManager.subscribe({ userVisibleOnly:true, applicationServerKey })`, an `/api/push/subscribe` senden |
| F4 | `ProfilePage.tsx` | Toggle „Benachrichtigungen aktivieren" (Opt-in, mit Status/Widerruf) |
| F5 | `locales/de.json`+`en.json` | Strings (Deutsch primär) |

## 8. Service-Worker-Strategie (Achtung)

`vite-plugin-pwa` mit `registerType:'autoUpdate'` nutzt Workbox `generateSW` — eigener
`push`-Handler nicht direkt möglich. Optionen:
- **A)** `workbox: { importScripts: ['/push-sw.js'] }` — eigenes `push-sw.js` mit den Handlern,
  von Workbox importiert. Wenigster Umbau.
- **B)** Auf `strategies:'injectManifest'` + custom `src/sw.ts` umstellen — volle Kontrolle, aber
  Precache-Logik selbst pflegen.
Empfehlung: **A** (importScripts) — geringeres Risiko für das bestehende PWA-Caching.

## 9. Sicherheit & Datenschutz

- Subscribe nur für eingeloggte Besitzer (auth). Subscription an `account_id` gebunden.
- Push-Payload **minimal**: Tiername + „Neue Standortmeldung" + Deep-Link. **Keine** GPS-Koordinaten
  im Payload (landet bei Drittanbieter-Push-Services) — Details erst in der App nach Login.
- Opt-in, jederzeit widerrufbar (unsubscribe + DB-Eintrag löschen).
- Abgelaufene Subscriptions (410/404) automatisch entfernen.
- VAPID-Private-Key nur server-seitig (paw.env, nie im Client).

## 10. Throttling / Edge-Cases

- Mehrere Geräte pro Besitzer → an alle senden.
- Rate-Limit der Standortmeldung greift bereits (5/h IP, 20/24h Tier) → begrenzt Push-Flut.
- Optional Zusammenfassung bei vielen Meldungen kurz hintereinander (analog Mail-Throttle 1/10min).
- iOS: Push nur wenn PWA zum Homescreen hinzugefügt (installiert). UI-Hinweis einplanen.

## 11. Akzeptanzkriterien

1. Besitzer kann im Profil Push aktivieren (Permission-Flow), Subscription landet in DB.
2. Bei neuer Standortmeldung erhalten alle Geräte des Besitzers eine Push-Notification.
3. Klick öffnet die Tierseite `/animals/:id`.
4. Kein GPS im Push-Payload.
5. Abgelaufene Subscriptions werden serverseitig bereinigt.
6. Ohne VAPID-Env: Feature inaktiv, kein Fehler.
7. Bestehendes PWA-Caching unverändert funktionsfähig.

## 12. Aufwand (grob)

- Backend (B1–B6): ~0,5–1 Tag.
- Frontend SW + Subscribe + Profil-Toggle (F1–F5): ~1–1,5 Tage (SW-Strategie ist der knifflige Teil).
- Tests + Geräte-Verifikation (Android/iOS-PWA/Desktop): ~0,5 Tag.
- **Summe ~2–3 Tage.**

## 13. Offene Entscheidungen

- [ ] VAPID-Public-Key per Endpoint oder Build-Arg?
- [ ] SW-Strategie A (importScripts) vs. B (injectManifest)?
- [ ] Auch andere Events pushen (z.B. Tierarzt fügt Dokument hinzu)? Vorerst nur Standortmeldung.
- [ ] In-App-Badge + Push parallel, oder Push nur wenn App geschlossen?
