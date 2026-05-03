# PAW - Automatisches Update-Skript

Dieses Dokument beschreibt den Update-Prozess.

### Schritt 1: Code lokal hochladen

Führe diese Befehle auf deinem **lokalen Entwicklungsrechner** aus:

```bash
git add .
git commit -m "Update"
git push

ssh hetzner
su -s /bin/bash paw-git -c "cd /tmp && git -C /git/pawvax pull"

```

### Schritt 2: Update-Skript auf dem Server ausführen

Kopiere den gesamten unteren Code-Block und füge ihn als `root` in dein **Hetzner Server-Terminal** ein. Das Skript führt alle notwendigen Update-Schritte aus und pausiert nach jedem Kommando für 3 Sekunden, damit du die Ausgabe auf eventuelle Fehler prüfen kannst.

```bash
echo "1/11: Schalte Shells temporär auf /bin/bash (für rootless podman)..."
usermod -s /bin/bash paw-git
usermod -s /bin/bash paw-api
usermod -s /bin/bash paw-pwa
sleep 3

echo "2/11: Ziehe neusten Code via Git Pull..."
su -s /bin/bash paw-git -c "cd /tmp && git -C /git/pawvax pull"
sleep 3

echo "3/11: Setze korrekte Dateiberechtigungen..."
chmod -R a+rX /git/pawvax
sleep 3

echo "4/11: Baue neues Container-Image für paw-api (Backend)..."
PAW_API_UID=$(id -u paw-api) && XDG_RUNTIME_DIR=/run/user/$PAW_API_UID su -s /bin/bash paw-api -c "cd /tmp && podman --cgroup-manager=cgroupfs build -t paw-api:latest -f /git/pawvax/server/Dockerfile /git/pawvax/server"
sleep 3

echo "5/11: Baue neues Container-Image für paw-pwa (Frontend)..."
PAW_PWA_UID=$(id -u paw-pwa) && XDG_RUNTIME_DIR=/run/user/$PAW_PWA_UID su -s /bin/bash paw-pwa -c "cd /tmp && podman --cgroup-manager=cgroupfs build -t paw-pwa:latest -f /git/pawvax/pwa/Containerfile /git/pawvax/pwa"
sleep 3

echo "6/11: Starte paw-api Service neu..."
PAW_API_UID=$(id -u paw-api) && su -s /bin/bash paw-api -c "cd /tmp && XDG_RUNTIME_DIR=/run/user/$PAW_API_UID DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$PAW_API_UID/bus systemctl --user restart paw-api"
sleep 3

echo "7/11: Starte paw-pwa Service neu..."
PAW_PWA_UID=$(id -u paw-pwa) && su -s /bin/bash paw-pwa -c "cd /tmp && XDG_RUNTIME_DIR=/run/user/$PAW_PWA_UID DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$PAW_PWA_UID/bus systemctl --user restart paw-pwa"
sleep 3

echo "8/11: Prüfe Status von paw-api..."
PAW_API_UID=$(id -u paw-api) && su -s /bin/bash paw-api -c "cd /tmp && XDG_RUNTIME_DIR=/run/user/$PAW_API_UID systemctl --user status paw-api --no-pager"
sleep 3

echo "9/11: Prüfe Status von paw-pwa..."
PAW_PWA_UID=$(id -u paw-pwa) && su -s /bin/bash paw-pwa -c "cd /tmp && XDG_RUNTIME_DIR=/run/user/$PAW_PWA_UID systemctl --user status paw-pwa --no-pager"
sleep 3

echo "10/11: Schalte Shells aus Sicherheitsgründen wieder auf /sbin/nologin..."
usermod -s /sbin/nologin paw-git
usermod -s /sbin/nologin paw-api
usermod -s /sbin/nologin paw-pwa
sleep 3

echo "11/11: 🚀 PAW Update erfolgreich abgeschlossen!"

echo "12/12: Führe API-Tests aus und speichere Ergebnis..."
PAW_API_UID=$(id -u paw-api)

set +e
XDG_RUNTIME_DIR=/run/user/$PAW_API_UID su -s /bin/bash paw-api -c "cd /tmp && podman run --rm --network=host --cgroup-manager=cgroupfs --security-opt label=disable -v /git/pawvax/server/tests:/app/tests -v /tmp:/tmp -e API_URL=http://127.0.0.1:3000/api -e NODE_OPTIONS=--experimental-vm-modules localhost/paw-api:latest npx jest --passWithNoTests --forceExit --testTimeout=20000 --json --outputFile=/tmp/paw-test-results.json"
TEST_EXIT_CODE=$?
set -e

if [ $TEST_EXIT_CODE -eq 0 ]; then
  TEST_STATUS="success"
  echo "✅ Tests erfolgreich! Ergebnis gespeichert."
else
  TEST_STATUS="failed"
  echo "❌ Tests fehlgeschlagen!"
fi

TEST_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
JSON_RESULT="{\"status\": \"$TEST_STATUS\", \"date\": \"$TEST_DATE\"}"

echo "INSERT OR REPLACE INTO settings (key, value) VALUES ('last_test_run', '$JSON_RESULT');" | su -s /bin/bash paw-api -c "sqlite3 /home/paw-api/data/paw.db"

if [ -f /tmp/paw-test-results.json ]; then
  DETAILS=$(cat /tmp/paw-test-results.json | tr '\n' ' ')
  echo "INSERT OR REPLACE INTO settings (key, value) VALUES ('last_test_run_details', '$DETAILS');" | su -s /bin/bash paw-api -c "sqlite3 /home/paw-api/data/paw.db"
  echo "Test-Details in DB gespeichert."
fi

echo "13/13: Räume Test-Accounts auf..."
su -s /bin/bash paw-api -c "sqlite3 /home/paw-api/data/paw.db \"DELETE FROM accounts WHERE email LIKE 'test%@example.com' OR email LIKE 'journey%@test.com';\""
echo "Aufräumen der Test-Accounts abgeschlossen."

```

*Tipp: Du kannst dir diesen Block auch direkt auf dem Server in eine Datei (z.B. `update.sh`) speichern und sie in Zukunft einfach mit `bash update.sh` ausführen.*