# PAW - Update-Ablauf

Dieses Dokument ist als Runbook gedacht: von oben nach unten ausfuehren, ohne Schritte zu mischen.

Wichtig:
- Die Befehle fuer `stop`, `persist`, `cleanup` und `start` getrennt nacheinander ausfuehren.
- Den API-Container nicht vor dem Persistieren der Testergebnisse wieder starten.
- Bei rootless Podman immer als passender User arbeiten.

---

## Schritt 1: Code lokal pushen

Auf dem lokalen Entwicklungsrechner:

```bash
git add .
git commit -m "Deployment Update"
git push
```

Dann auf den Server verbinden:

```bash
ssh hetzner
```

---

## Schritt 2: Server vorbereiten

Temporär Login-Shells aktivieren:

```bash
usermod -s /bin/bash paw-git
usermod -s /bin/bash paw-api
usermod -s /bin/bash paw-pwa
```

Code aktualisieren und Rechte setzen:

```bash
su -s /bin/bash paw-git -c "cd /tmp && git -C /git/pawvax pull"
chmod -R a+rX /git/pawvax
chmod -R a+w /git/pawvax/server /git/pawvax/pwa
```

---

## Schritt 3: Rootless Podman aufraeumen

API-User:

```bash
PAW_API_UID=$(id -u paw-api)
XDG_RUNTIME_DIR=/run/user/$PAW_API_UID su -s /bin/bash paw-api -c "cd /tmp && podman --cgroup-manager=cgroupfs container prune -f && podman --cgroup-manager=cgroupfs image prune -af && podman --cgroup-manager=cgroupfs builder prune -af"
```

PWA-User:

```bash
PAW_PWA_UID=$(id -u paw-pwa)
XDG_RUNTIME_DIR=/run/user/$PAW_PWA_UID su -s /bin/bash paw-pwa -c "cd /tmp && podman --cgroup-manager=cgroupfs container prune -f && podman --cgroup-manager=cgroupfs image prune -af && podman --cgroup-manager=cgroupfs builder prune -af"
```

---

## Schritt 4: Images bauen

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

## Schritt 5: Services neu starten

API und PWA neu starten:

```bash
PAW_API_UID=$(id -u paw-api)
su -s /bin/bash paw-api -c "cd /tmp && XDG_RUNTIME_DIR=/run/user/$PAW_API_UID DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$PAW_API_UID/bus systemctl --user restart paw-api"

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

## Schritt 6: Isolierte API-Tests ausfuehren

Die Tests laufen isoliert im Container gegen den aktuellen Code und die produktive DB.

```bash
PAW_API_UID=$(id -u paw-api)
XDG_RUNTIME_DIR=/run/user/$PAW_API_UID su -s /bin/bash paw-api -c "cd /tmp && podman run --rm --cgroup-manager=cgroupfs --security-opt label=disable -v /git/pawvax/server:/app -v /home/paw-api/data:/data -v /tmp:/tmp -w /app docker.io/node:22-alpine sh -lc 'apk add --no-cache python3 make g++ cairo-dev jpeg-dev pango-dev giflib-dev && npm ci && npm test && echo \"Tests erfolgreich\"'"
```

Wenn hier alles gruen ist, dann erst die Testergebnisse persistieren.

---

## Schritt 7: Testergebnisse persistieren und Test-Accounts bereinigen

Wichtig:
- Diesen Abschnitt Block fuer Block ausfuehren.
- Nicht `start` vor `persist` ausfuehren.
- Die DB muss fuer `persist` und `sqlite3 cleanup` frei sein.

### 7.1 API-Service stoppen

```bash
PAW_API_UID=$(id -u paw-api)
su -s /bin/bash paw-api -c "cd /tmp && XDG_RUNTIME_DIR=/run/user/$PAW_API_UID DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$PAW_API_UID/bus systemctl --user stop paw-api"
sleep 2
```

Optional pruefen, dass kein API-Container mehr laeuft:

```bash
su - paw-api -c "podman ps"
```

### 7.2 Testergebnisse in DB speichern

```bash
PAW_API_UID=$(id -u paw-api)
XDG_RUNTIME_DIR=/run/user/$PAW_API_UID su -s /bin/bash paw-api -c "cd /tmp && podman --cgroup-manager=cgroupfs run --rm --security-opt label=disable -v /git/pawvax/server:/app -v /home/paw-api/data:/data -v /tmp:/tmp -w /app docker.io/node:22-alpine sh -c 'node scripts/persist-test-results.js /tmp/jest-raw.json /data/paw.db'"
```

Erwartete Erfolgsmeldung:

```bash
Persisted deploy test results (passed, 115/115 passed)
```

### 7.3 Test-Accounts aufraeumen

```bash
PAW_API_UID=$(id -u paw-api)
XDG_RUNTIME_DIR=/run/user/$PAW_API_UID su -s /bin/bash paw-api -c "cd /tmp && podman --cgroup-manager=cgroupfs run --rm --security-opt label=disable -v /git/pawvax/server:/app -v /home/paw-api/data:/data -w /app docker.io/node:22-alpine sh -c 'node scripts/cleanup-test-data.js /data/paw.db'"
```

Das Script loescht bekannte Test-Accounts mit aktivierten Foreign Keys und raeumt zusaetzlich bereits vorhandene Orphans auf, die durch fruehere direkte `sqlite3 DELETE`-Befehle entstanden sind.

### 7.4 API-Service wieder starten

```bash
PAW_API_UID=$(id -u paw-api)
su -s /bin/bash paw-api -c "cd /tmp && XDG_RUNTIME_DIR=/run/user/$PAW_API_UID DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$PAW_API_UID/bus systemctl --user start paw-api"
su -s /bin/bash paw-api -c "cd /tmp && XDG_RUNTIME_DIR=/run/user/$PAW_API_UID DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$PAW_API_UID/bus systemctl --user status paw-api --no-pager"
```

### 7.5 Ergebnis pruefen

Im Admin-Dashboard sollte jetzt sichtbar sein:
- Teststatus: erfolgreich
- Testdetails: `115/115`
- Admin-Version: aktuelle deployte Version

---

## Schritt 8: PWA im Browser aktualisieren

Nach einem Frontend-Deploy muss die PWA im Browser hart aktualisiert werden:

1. DevTools oeffnen.
2. Application -> Service Workers -> Unregister.
3. Application -> Storage -> Clear site data.
4. Hard Reload mit `Ctrl+Shift+R`.

---

## Schritt 9: Funktional pruefen

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

## Schritt 10: Shells wieder sperren

```bash
usermod -s /sbin/nologin paw-git
usermod -s /sbin/nologin paw-api
usermod -s /sbin/nologin paw-pwa
echo "PAW Update erfolgreich abgeschlossen."
```