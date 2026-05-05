# PAW - Update-Ablauf (PostgreSQL Edition)

Dieses Dokument ist als Runbook gedacht: von oben nach unten ausfuehren, ohne Schritte zu mischen.

Wichtig:
- Die Befehle fuer `stop`, `persist`, `cleanup` und `start` getrennt nacheinander ausfuehren.
- Den API-Container nicht vor dem Persistieren der Testergebnisse wieder starten.
- Bei rootless Podman immer als passender User arbeiten.
- Ab dieser Version: PostgreSQL statt SQLite (bessere Datenpersistenz in rootless Podman).

---

## Schritt 1: Code lokal pushen

Auf dem lokalen Entwicklungsrechner:


```bash
usermod -s /bin/bash paw-git
usermod -s /bin/bash paw-api
usermod -s /bin/bash paw-pwa

su -s /bin/bash paw-git -c "cd /tmp && git -C /git/pawvax pull"
chmod -R a+rX /git/pawvax
chmod -R a+w /git/pawvax/server /git/pawvax/pwa
```

---

## Schritt 3: PostgreSQL-Container starten (einmalig beim ersten Deployment)

Einmalig nach Update auf PostgreSQL-Version: PostgreSQL-Container mit Volumen starten.

```bash
PAW_API_UID=$(id -u paw-api)
XDG_RUNTIME_DIR=/run/user/$PAW_API_UID su -s /bin/bash paw-api -c "cd /git/pawvax && podman-compose up -d postgres"
sleep 5
echo "PostgreSQL-Container ist aktiv."
```

---

## Schritt 4: SQLite → PostgreSQL Datenmigration (einmalig beim ersten Deployment)

Wenn altes SQLite-Backup vorhanden ist, Daten migrieren:

```bash
PAW_API_UID=$(id -u paw-api)
XDG_RUNTIME_DIR=/run/user/$PAW_API_UID su -s /bin/bash paw-api -c "cd /git/pawvax && DATABASE_URL='postgresql://pawvax:${DB_PASSWORD}@localhost:5432/pawvax' node server/src/db/migrate-sqlite-to-pg.js /home/paw-api/data/paw.db"
```

Wenn kein altes Backup existiert, DB bleibt leer (neue Installation).

---

## Schritt 5: Images bauen

Backend-Image bauen:

```bash
PAW_API_UID=$(id -u paw-api)
XDG_RUNTIME_DIR=/run/user/$PAW_API_UID su -s /bin/bash paw-api -c "cd /tmp && podman --cgroup-manager=cgroupfs build --no-cache --progress=plain -t paw-api:latest -f /git/pawvax/server/Dockerfile /git/pawvax/server"
```

Frontend-Image bauen:

```bash
PAW_PWA_UID=$(id -u paw-pwa)
XDG_RUNTIME_DIR=/run/user/$PAW_PWA_UID su -s /bin/bash paw-pwa -c "cd /git/pawvax/pwa && podman --cgroup-manager=cgroupfs build -f Containerfile -t localhost/paw-pwa:latest ."
```

---

## Schritt 6: Services neu starten

PostgreSQL, API und PWA neu starten:

```bash
# PostgreSQL Container sicherstellen
PAW_API_UID=$(id -u paw-api)
XDG_RUNTIME_DIR=/run/user/$PAW_API_UID su -s /bin/bash paw-api -c "cd /git/pawvax && podman-compose up -d postgres"
sleep 3

# API neustarten
su -s /bin/bash paw-api -c "cd /tmp && XDG_RUNTIME_DIR=/run/user/$PAW_API_UID DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$PAW_API_UID/bus systemctl --user restart paw-api"

# PWA neustarten
PAW_PWA_UID=$(id -u paw-pwa)
su -s /bin/bash paw-pwa -c "cd /tmp && XDG_RUNTIME_DIR=/run/user/$PAW_PWA_UID DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$PAW_PWA_UID/bus systemctl --user restart paw-pwa"
```

Status pruefen:

```bash
PAW_API_UID=$(id -u paw-api)
su -s /bin/bash paw-api -c "cd /tmp && XDG_RUNTIME_DIR=/run/user/$PAW_API_UID DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$PAW_API_UID/bus systemctl --user status paw-api --no-pager"

PAW_PWA_UID=$(id -u paw-pwa)
su -s /bin/bash paw-pwa -c "cd /tmp && XDG_RUNTIME_DIR=/run/user/$PAW_PWA_UID DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$PAW_PWA_UID/bus systemctl --user status paw-pwa --no-pager"
```

Optional rootless Container pruefen:

```bash
su - paw-api -c "podman ps"
su - paw-pwa -c "podman ps"
```

---

## Schritt 7: Isolierte API-Tests ausfuehren

Die Tests laufen isoliert im Container gegen eine Test-PostgreSQL-Instanz.

```bash
PAW_API_UID=$(id -u paw-api)
DB_PASSWORD=test-pwd-change-in-prod XDG_RUNTIME_DIR=/run/user/$PAW_API_UID su -s /bin/bash paw-api -c "cd /git/pawvax && DATABASE_URL='postgresql://pawvax:test-pwd-change-in-prod@localhost:5432/pawvax_test' npm test"
```

Wenn hier alles gruen ist, dann erst die Testergebnisse persistieren.

---

## Schritt 8: Testergebnisse persistieren und Test-Accounts bereinigen

Wichtig:
- Diesen Abschnitt Block fuer Block ausfuehren.
- Nicht `start` vor `persist` ausfuehren.
- Die DB muss fuer `persist` und `cleanup` frei sein.

### 8.1 API-Service stoppen

```bash
PAW_API_UID=$(id -u paw-api)
su -s /bin/bash paw-api -c "cd /tmp && XDG_RUNTIME_DIR=/run/user/$PAW_API_UID DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$PAW_API_UID/bus systemctl --user stop paw-api"
sleep 2
```

Optional pruefen, dass kein API-Container mehr laeuft:

```bash
su - paw-api -c "podman ps"
```

### 8.2 Testergebnisse in DB speichern

```bash
PAW_API_UID=$(id -u paw-api)
DB_PASSWORD=$(grep DB_PASSWORD /git/pawvax/.env.podman | cut -d= -f2)
XDG_RUNTIME_DIR=/run/user/$PAW_API_UID su -s /bin/bash paw-api -c "cd /git/pawvax && DATABASE_URL='postgresql://pawvax:${DB_PASSWORD}@localhost:5432/pawvax' node server/scripts/persist-test-results.js /tmp/jest-raw.json"
```
### 8.3 Test-Accounts aufraeumen

```bash
PAW_API_UID=$(id -u paw-api)
DB_PASSWORD=$(grep DB_PASSWORD /git/pawvax/.env.podman | cut -d= -f2)
XDG_RUNTIME_DIR=/run/user/$PAW_API_UID su -s /bin/bash paw-api -c "cd /git/pawvax && DATABASE_URL='postgresql://pawvax:${DB_PASSWORD}@localhost:5432/pawvax' node server/scripts/cleanup-test-data.js"
```

Das Script loescht bekannte Test-Accounts mit aktivierten Foreign Keys und raeumt zusaetzlich bereits vorhandene Orphans auf.

### 8.4 API-Service wieder starten

```bash
PAW_API_UID=$(id -u paw-api)
su -s /bin/bash paw-api -c "cd /tmp && XDG_RUNTIME_DIR=/run/user/$PAW_API_UID DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$PAW_API_UID/bus systemctl --user start paw-api"
su -s /bin/bash paw-api -c "cd /tmp && XDG_RUNTIME_DIR=/run/user/$PAW_API_UID DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$PAW_API_UID/bus systemctl --user status paw-api --no-pager"
```

### 8.5 Ergebnis pruefen

Im Admin-Dashboard sollte jetzt sichtbar sein:
- Teststatus: erfolgreich
- Testdetails: `115/115`
- Admin-Version: aktuelle deployte Version

---

## Schritt 9: PWA im Browser aktualisieren

Nach einem Frontend-Deploy muss die PWA im Browser hart aktualisiert werden:

1. DevTools oeffnen.
2. Application -> Service Workers -> Unregister.
3. Application -> Storage -> Clear site data.
4. Hard Reload mit `Ctrl+Shift+R`.

---

## Schritt 10: Funktional pruefen

### Admin pruefen

- Dashboard zeigt Teststatus gruen.
- Testdetails zeigen `115/115`.
- Versionsanzeige in der Admin-Seite ist sichtbar.

### OCR / Dokumente pruefen

- Bereits falsch klassifizierte Impfpass-Dokumente einmal neu analysieren.
- Impfpass-Tabellen muessen danach als `vaccination` erscheinen.
- Die Impftabelle muss auf der Tierseite wieder sichtbar sein.

### EU Pet Passport pruefen

- Heimtierausweis hochladen.
- Dokumenttyp sollte als `pet_passport` erkannt werden.
- Chip-Code sollte automatisch als Tag angelegt werden.
- Die Detailseite muss Pass- und Chipdaten anzeigen.

---

## Schritt 11: Shells wieder sperren

```bash
usermod -s /sbin/nologin paw-git
usermod -s /sbin/nologin paw-api
usermod -s /sbin/nologin paw-pwa
echo "PAW Update erfolgreich abgeschlossen."
```