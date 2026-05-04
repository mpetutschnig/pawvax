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
```

```bash
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

```bash
PAW_API_UID=$(id -u paw-api)
XDG_RUNTIME_DIR=/run/user/$PAW_API_UID su -s /bin/bash paw-api -c "cd /tmp && podman --cgroup-manager=cgroupfs build --progress=plain -t paw-api:latest -f /git/pawvax/server/Dockerfile /git/pawvax/server"
```

### 5 — Frontend-Image bauen (paw-pwa)

```bash
PAW_PWA_UID=$(id -u paw-pwa)
XDG_RUNTIME_DIR=/run/user/$PAW_PWA_UID su -s /bin/bash paw-pwa -c "cd /tmp && podman --cgroup-manager=cgroupfs build --progress=plain -t paw-pwa:latest -f /git/pawvax/pwa/Containerfile /git/pawvax/pwa"
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
XDG_RUNTIME_DIR=/run/user/$PAW_API_UID su -s /bin/bash paw-api -c "podman run --rm --network=host --cgroup-manager=cgroupfs --security-opt label=disable -v /git/pawvax/server/tests:/app/tests -v /tmp:/tmp -e API_URL=http://127.0.0.1:3000/api -e NODE_OPTIONS=--experimental-vm-modules localhost/paw-api:latest npx jest --passWithNoTests --forceExit --testTimeout=20000 --json --outputFile=/tmp/paw-test-results.json"
```

Test-Details in DB speichern:

```bash
su -s /bin/bash paw-api -c "
  cat > /tmp/save_tests.sql <<'EOSQL'
INSERT OR REPLACE INTO settings (key, value)
SELECT 'last_test_run_details', readfile('/tmp/paw-test-results.json')
WHERE readfile('/tmp/paw-test-results.json') IS NOT NULL;
EOSQL
  sqlite3 /home/paw-api/data/paw.db < /tmp/save_tests.sql
  rm /tmp/save_tests.sql
"
```

---

## Schritt 4: Test-Accounts aufräumen

```bash
su -s /bin/bash paw-api -c "sqlite3 /home/paw-api/data/paw.db \
  \"DELETE FROM accounts WHERE email LIKE 'test%@example.com' OR email LIKE 'journey%@test.com';\""
echo "Test-Accounts bereinigt."
```