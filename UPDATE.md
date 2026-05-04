# PAW - Automatisches Update-Skript

Dieses Dokument beschreibt den Update-Prozess.

---

## Schritt 1: Code lokal hochladen

Führe diese Befehle auf deinem **lokalen Entwicklungsrechner** aus:

```bash
git add .
git commit -m "Update"
git push
```

Dann per SSH auf den Server verbinden und den Git-Pull als `paw-git` ausführen:

```bash
ssh hetzner
su -s /bin/bash paw-git -c "cd /tmp && git -C /git/pawvax pull"
```

---

## Schritt 2: Update auf dem Server ausführen

Führe die folgenden Blöcke nacheinander als `root` im **Hetzner Server-Terminal** aus. Prüfe nach jedem Block die Ausgabe auf Fehler.

### 1 — Shells temporär auf /bin/bash setzen

```bash
usermod -s /bin/bash paw-git
usermod -s /bin/bash paw-api
usermod -s /bin/bash paw-pwa
```

### 2 — Neusten Code ziehen

```bash
su -s /bin/bash paw-git -c "cd /tmp && git -C /git/pawvax pull"
```

### 3 — Dateiberechtigungen setzen

```bash
chmod -R a+rX /git/pawvax
```

### 4 — Backend-Image bauen (paw-api)

Bei einem Fehler werden die letzten 40 Zeilen des Build-Logs angezeigt.

```bash
PAW_API_UID=$(id -u paw-api)
set +e
XDG_RUNTIME_DIR=/run/user/$PAW_API_UID su -s /bin/bash paw-api -c \
  "cd /tmp && podman --cgroup-manager=cgroupfs build --progress=plain \
   -t paw-api:latest -f /git/pawvax/server/Dockerfile /git/pawvax/server" \
  2>&1 | tee /tmp/paw-api-build.log
BUILD_API_EXIT=${PIPESTATUS[0]}
set -e
if [ $BUILD_API_EXIT -ne 0 ]; then
  echo "❌ Build paw-api fehlgeschlagen! Letzte 40 Zeilen:"
  tail -40 /tmp/paw-api-build.log
  echo "--- Vollständiges Log: /tmp/paw-api-build.log ---"
  usermod -s /sbin/nologin paw-git
  usermod -s /sbin/nologin paw-api
  usermod -s /sbin/nologin paw-pwa
  exit 1
fi
```

### 5 — Frontend-Image bauen (paw-pwa)

Bei einem Fehler werden TypeScript-Fehler im Log sichtbar (Abschnitt `RUN npm run build`).

```bash
PAW_PWA_UID=$(id -u paw-pwa)
set +e
XDG_RUNTIME_DIR=/run/user/$PAW_PWA_UID su -s /bin/bash paw-pwa -c \
  "cd /tmp && podman --cgroup-manager=cgroupfs build --progress=plain \
   -t paw-pwa:latest -f /git/pawvax/pwa/Containerfile /git/pawvax/pwa" \
  2>&1 | tee /tmp/paw-pwa-build.log
BUILD_PWA_EXIT=${PIPESTATUS[0]}
set -e
if [ $BUILD_PWA_EXIT -ne 0 ]; then
  echo "❌ Build paw-pwa fehlgeschlagen! Letzte 40 Zeilen:"
  tail -40 /tmp/paw-pwa-build.log
  echo "--- Vollständiges Log: /tmp/paw-pwa-build.log ---"
  echo "Tipp: TypeScript-Fehler erscheinen im Log bei 'RUN npm run build'."
  usermod -s /sbin/nologin paw-git
  usermod -s /sbin/nologin paw-api
  usermod -s /sbin/nologin paw-pwa
  exit 1
fi
```

### 6 — paw-api Service neu starten

```bash
PAW_API_UID=$(id -u paw-api)
su -s /bin/bash paw-api -c "cd /tmp && XDG_RUNTIME_DIR=/run/user/$PAW_API_UID DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$PAW_API_UID/bus systemctl --user restart paw-api"
```

### 7 — paw-pwa Service neu starten

```bash
PAW_PWA_UID=$(id -u paw-pwa)
su -s /bin/bash paw-pwa -c "cd /tmp && XDG_RUNTIME_DIR=/run/user/$PAW_PWA_UID DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$PAW_PWA_UID/bus systemctl --user restart paw-pwa"
```

### 8 — Status paw-api prüfen

```bash
PAW_API_UID=$(id -u paw-api)
su -s /bin/bash paw-api -c "cd /tmp && XDG_RUNTIME_DIR=/run/user/$PAW_API_UID systemctl --user status paw-api --no-pager"
```

### 9 — Status paw-pwa prüfen

```bash
PAW_PWA_UID=$(id -u paw-pwa)
su -s /bin/bash paw-pwa -c "cd /tmp && XDG_RUNTIME_DIR=/run/user/$PAW_PWA_UID systemctl --user status paw-pwa --no-pager"
```

### 10 — Shells wieder auf /sbin/nologin setzen

```bash
usermod -s /sbin/nologin paw-git
usermod -s /sbin/nologin paw-api
usermod -s /sbin/nologin paw-pwa
echo "🚀 PAW Update erfolgreich abgeschlossen!"
```

---

## Schritt 3: API-Tests ausführen und Ergebnis speichern

```bash
PAW_API_UID=$(id -u paw-api)
set +e
XDG_RUNTIME_DIR=/run/user/$PAW_API_UID su -s /bin/bash paw-api -c \
  "cd /tmp && podman run --rm --network=host --cgroup-manager=cgroupfs \
   --security-opt label=disable \
   -v /git/pawvax/server/tests:/app/tests -v /tmp:/tmp \
   -e API_URL=http://127.0.0.1:3000/api \
   -e NODE_OPTIONS=--experimental-vm-modules \
   localhost/paw-api:latest npx jest --passWithNoTests --forceExit \
   --testTimeout=20000 --json --outputFile=/tmp/paw-test-results.json"
TEST_EXIT_CODE=$?
set -e

if [ $TEST_EXIT_CODE -eq 0 ]; then
  TEST_STATUS="success"
  echo "✅ Tests erfolgreich!"
else
  TEST_STATUS="failed"
  echo "❌ Tests fehlgeschlagen!"
fi

TEST_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
JSON_RESULT="{\"status\": \"$TEST_STATUS\", \"date\": \"$TEST_DATE\"}"
echo "INSERT OR REPLACE INTO settings (key, value) VALUES ('last_test_run', '$JSON_RESULT');" | \
  su -s /bin/bash paw-api -c "sqlite3 /home/paw-api/data/paw.db"
```

Test-Details in DB speichern (falls JSON vorhanden):

```bash
if [ -f /tmp/paw-test-results.json ]; then
  su -s /bin/bash paw-api -c "
    cat > /tmp/save_tests.sql <<'EOSQL'
INSERT OR REPLACE INTO settings (key, value)
SELECT 'last_test_run_details', readfile('/tmp/paw-test-results.json')
WHERE readfile('/tmp/paw-test-results.json') IS NOT NULL;
EOSQL
    sqlite3 /home/paw-api/data/paw.db < /tmp/save_tests.sql
    rm /tmp/save_tests.sql
  " || true
  echo "Test-Details in DB gespeichert."
fi
```

---

## Schritt 4: Test-Accounts aufräumen

```bash
su -s /bin/bash paw-api -c "sqlite3 /home/paw-api/data/paw.db \
  \"DELETE FROM accounts WHERE email LIKE 'test%@example.com' OR email LIKE 'journey%@test.com';\""
echo "Test-Accounts bereinigt."
```