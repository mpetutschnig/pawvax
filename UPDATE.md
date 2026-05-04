# PAW - Automatisches Update-Skript

Dieses Dokument beschreibt den Update-Prozess.

---

## Schritt 1: Code lokal hochladen

Führe diese Befehle auf deinem **lokalen Entwicklungsrechner** aus:

```bash
git add .
git commit -m "Deployment Bug Fix"
git push
```

Dann per SSH auf den Server verbinden und den Git-Pull als `paw-git` ausführen:

```bash
ssh hetzner
```

```bash
su -s /bin/bash paw-git -c "cd /tmp && git -C /git/pawvax pull"

usermod -s /bin/bash paw-git
usermod -s /bin/bash paw-api
usermod -s /bin/bash paw-pwa

su -s /bin/bash paw-git -c "cd /tmp && git -C /git/pawvax pull"
chmod -R a+rX /git/pawvax
chmod -R a+w /git/pawvax/server /git/pawvax/pwa

PAW_API_UID=$(id -u paw-api)
XDG_RUNTIME_DIR=/run/user/$PAW_API_UID su -s /bin/bash paw-api -c "cd /tmp && podman --cgroup-manager=cgroupfs container prune -f && podman --cgroup-manager=cgroupfs image prune -af && podman --cgroup-manager=cgroupfs builder prune -af"

PAW_PWA_UID=$(id -u paw-pwa)
XDG_RUNTIME_DIR=/run/user/$PAW_PWA_UID su -s /bin/bash paw-pwa -c "cd /tmp && podman --cgroup-manager=cgroupfs container prune -f && podman --cgroup-manager=cgroupfs image prune -af && podman --cgroup-manager=cgroupfs builder prune -af"
```

### 5 — Backend-Image bauen (paw-api)

```bash
PAW_API_UID=$(id -u paw-api)
XDG_RUNTIME_DIR=/run/user/$PAW_API_UID su -s /bin/bash paw-api -c "cd /tmp && podman --cgroup-manager=cgroupfs build --no-cache --progress=plain -t paw-api:latest -f /git/pawvax/server/Dockerfile /git/pawvax/server"
```

### 6 — Frontend-Image bauen (paw-pwa)

```bash
PAW_PWA_UID=$(id -u paw-pwa)
XDG_RUNTIME_DIR=/run/user/$PAW_PWA_UID su -s /bin/bash paw-pwa -c "cd /tmp && podman --cgroup-manager=cgroupfs build --no-cache --progress=plain -t paw-pwa:latest -f /git/pawvax/pwa/Containerfile /git/pawvax/pwa"
```

### 7 — paw-api &  Service neu starten

```bash
PAW_API_UID=$(id -u paw-api)
su -s /bin/bash paw-api -c "cd /tmp && XDG_RUNTIME_DIR=/run/user/$PAW_API_UID DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$PAW_API_UID/bus systemctl --user restart paw-api"

PAW_PWA_UID=$(id -u paw-pwa)
su -s /bin/bash paw-pwa -c "cd /tmp && XDG_RUNTIME_DIR=/run/user/$PAW_PWA_UID DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$PAW_PWA_UID/bus systemctl --user restart paw-pwa"

PAW_API_UID=$(id -u paw-api)
su -s /bin/bash paw-api -c "cd /tmp && XDG_RUNTIME_DIR=/run/user/$PAW_API_UID systemctl --user status paw-api --no-pager"

PAW_PWA_UID=$(id -u paw-pwa)
su -s /bin/bash paw-pwa -c "cd /tmp && XDG_RUNTIME_DIR=/run/user/$PAW_PWA_UID systemctl --user status paw-pwa --no-pager"
```

### 11 — Shells wieder auf /sbin/nologin setzen

```bash
usermod -s /sbin/nologin paw-git
usermod -s /sbin/nologin paw-api
usermod -s /sbin/nologin paw-pwa
echo "🚀 PAW Update erfolgreich abgeschlossen!"
```

---

## Schritt 3: Isolierte API-Tests ausführen und Ergebnis speichern

```bash
PAW_API_UID=$(id -u paw-api)
XDG_RUNTIME_DIR=/run/user/$PAW_API_UID su -s /bin/bash paw-api -c "cd /tmp && podman run --rm --cgroup-manager=cgroupfs --security-opt label=disable --user=0 -v /git/pawvax/server:/app -v /home/paw-api/data:/data -v /tmp:/tmp -w /app docker.io/node:22-alpine sh -lc 'apk add --no-cache python3 make g++ cairo-dev jpeg-dev pango-dev giflib-dev && npm ci && npm test && echo \"Tests erfolgreich\"'" 
```

Wenn erfolgreich, speichere Ergebnisse in DB:

```bash
PAW_API_UID=$(id -u paw-api)
XDG_RUNTIME_DIR=/run/user/$PAW_API_UID su -s /bin/bash paw-api -c "podman run --rm --cgroup-manager=cgroupfs --security-opt label=disable --user=0 -v /git/pawvax/server:/app -v /home/paw-api/data:/data -v /tmp:/tmp -w /app docker.io/node:22-alpine sh -lc 'node scripts/persist-test-results.js /tmp/jest-raw.json /data/paw.db'"
echo "Test-Ergebnisse in DB gespeichert"
```

---

## Schritt 4: Test-Accounts aufräumen

```bash
su -s /bin/bash paw-api -c "sqlite3 /home/paw-api/data/paw.db \
  \"DELETE FROM accounts WHERE email LIKE 'test%@example.com' OR email LIKE 'journey%@test.com';\""
echo "Test-Accounts bereinigt."
```