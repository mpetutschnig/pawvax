# PAW Deployment mit Podman Quadlets (Alma Linux 10)

Interaktives Deployment-Dokument. Jeder Befehl = eigener Code-Block.
**User führt aus** → gibt Status zurück → **wir halten das Dokument aktuell**.
Am Ende enthält dieses Dokument nur die Commands, die wirklich funktioniert haben.

---

## Vorbedingungen

- Root-Zugang auf Alma Linux 10 Server
- Domain `paw.oxs.at` zeigt auf Server-IP (DNS-A-Record nötig für Let's Encrypt)
- Server ist im Internet erreichbar (Firewall Port 80 + 443 offen)

---

## 1. System vorbereiten

```bash
dnf update -y
```

```bash
dnf install -y podman git
```

```bash
podman --version
```

```bash
echo 'net.ipv4.ip_unprivileged_port_start=80' > /etc/sysctl.d/99-podman-rootless.conf
```

```bash
sysctl --system
```

---

## 2. Firewall öffnen (Hetzner Cloud Portal)

**Keine Shell-Commands nötig — im Hetzner Cloud Portal konfigurieren:**

1. [console.hetzner.cloud](https://console.hetzner.cloud) → Projekt öffnen
2. **Firewalls** → Firewall anlegen (oder bestehende bearbeiten)
3. **Inbound-Regeln** hinzufügen:

| Protokoll | Port | Quelle |
|---|---|---|
| TCP | 80 | 0.0.0.0/0, ::/0 |
| TCP | 443 | 0.0.0.0/0, ::/0 |
| TCP | 22 | 0.0.0.0/0 (SSH — bereits vorhanden) |

4. Firewall dem Server zuweisen (falls noch nicht geschehen)

⚠️ Port 3000 und 8080 **nicht** freigeben — die sind nur intern für Caddy.

---

## 3. /git Verzeichnis anlegen

```bash
mkdir /git
```

```bash
chmod 755 /git
```

---

## 4. System-User anlegen

Mit `/bin/bash` als Shell (für rootless Podman + su-Befehle nötig):

```bash
useradd -r -m -d /home/paw-git -s /bin/bash paw-git
```

```bash
chown paw-git:paw-git /git
```

```bash
useradd -r -m -d /home/paw-api -s /bin/bash paw-api
```

```bash
useradd -r -m -d /home/paw-pwa -s /bin/bash paw-pwa
```

```bash
useradd -r -m -d /home/paw-proxy -s /bin/bash paw-proxy
```

---

## 4.5 Subuid/Subgid für rootless Podman zuweisen

Rootless Podman braucht UID/GID-Ranges. Für jeden User:

```bash
usermod --add-subuids 100000-165535 paw-api
```

```bash
usermod --add-subgids 100000-165535 paw-api
```

```bash
usermod --add-subuids 165536-231071 paw-pwa
```

```bash
usermod --add-subgids 165536-231071 paw-pwa
```

```bash
usermod --add-subuids 231072-296607 paw-proxy
```

```bash
usermod --add-subgids 231072-296607 paw-proxy
```

Verifikation:

```bash
cat /etc/subuid
```

```bash
cat /etc/subgid
```

---

## 5. Linger aktivieren

Ermöglicht dass Services auch nach Logout weiter laufen (via systemd --user):

```bash
loginctl enable-linger paw-api
```

```bash
loginctl enable-linger paw-pwa
```

```bash
loginctl enable-linger paw-proxy
```

---

## 6. Git Repository klonen

```bash
su -s /bin/bash paw-git -c "cd /tmp && git clone https://github.com/mpetutschnig/pawvax /git/pawvax"
```

```bash
chmod -R a+rX /git/pawvax
```

---

## 7. Podman Images bauen

### 7a. paw-api (Node.js API Server)

```bash
PAW_API_UID=$(id -u paw-api) && XDG_RUNTIME_DIR=/run/user/$PAW_API_UID su -s /bin/bash paw-api -c "cd /tmp && podman --cgroup-manager=cgroupfs build -t paw-api:latest -f /git/pawvax/server/Dockerfile /git/pawvax/server"
```

### 7b. paw-pwa (React + nginx Frontend)

```bash
PAW_PWA_UID=$(id -u paw-pwa) && XDG_RUNTIME_DIR=/run/user/$PAW_PWA_UID su -s /bin/bash paw-pwa -c "cd /tmp && podman --cgroup-manager=cgroupfs build -t paw-pwa:latest -f /git/pawvax/pwa/Containerfile /git/pawvax/pwa"
```

---

## 8. Daten-Verzeichnisse anlegen

```bash
mkdir -p /home/paw-api/data /home/paw-api/uploads
```

```bash
chown -R paw-api:paw-api /home/paw-api/data /home/paw-api/uploads
```

```bash
mkdir -p /home/paw-proxy/caddy-data /home/paw-proxy/caddy-config
```

```bash
chown -R paw-proxy:paw-proxy /home/paw-proxy/caddy-data /home/paw-proxy/caddy-config
```

---

## 9. Konfigurationsdateien schreiben

### 9a. JWT_SECRET als Podman Secret speichern

Podman Secrets sind sicherer als plaintext in .env. Das Secret wird beim Container-Start injiziert.

⚠️ **Nur erstellen wenn es noch nicht existiert** — sonst werden alle JWT-Tokens ungültig:

```bash
PAW_API_UID=$(id -u paw-api) && XDG_RUNTIME_DIR=/run/user/$PAW_API_UID su -s /bin/bash paw-api -c "podman secret ls | grep -q jwt-secret"
```

**Falls das Secret NICHT existiert** (Exit-Code 1):

```bash
openssl rand -hex 32 > /tmp/jwt-secret.txt
```

```bash
PAW_API_UID=$(id -u paw-api) && XDG_RUNTIME_DIR=/run/user/$PAW_API_UID su -s /bin/bash paw-api -c "podman secret create jwt-secret /tmp/jwt-secret.txt"
```

```bash
rm /tmp/jwt-secret.txt
```

Verifikation:

```bash
PAW_API_UID=$(id -u paw-api) && XDG_RUNTIME_DIR=/run/user/$PAW_API_UID su -s /bin/bash paw-api -c "cd /tmp && podman secret ls"
```

### 9b. .env für paw-api (OHNE JWT_SECRET)

JWT_SECRET kommt via Podman Secret, nicht aus dieser Datei:

```bash
cat > /home/paw-api/.env << 'EOF'
PORT=3000
NODE_ENV=production
DB_PATH=/app/data/paw.db
UPLOADS_DIR=/app/uploads
EOF
```

```bash
chown paw-api:paw-api /home/paw-api/.env
```

```bash
chmod 600 /home/paw-api/.env
```

### 9c. Caddyfile für paw-proxy

```bash
cat > /home/paw-proxy/Caddyfile << 'EOF'
paw.oxs.at {
    handle /api/* {
        reverse_proxy localhost:3000
    }
    handle /ws* {
        reverse_proxy localhost:3000
    }
    handle /uploads/* {
        reverse_proxy localhost:3000
    }
    handle /documentation* {
        reverse_proxy localhost:3000
    }
    handle {
        reverse_proxy localhost:8080
    }
}
EOF
```

```bash
chown paw-proxy:paw-proxy /home/paw-proxy/Caddyfile
```

---

## 10. Quadlet Dateien erstellen

Quadlets sind systemd-Unit Files für rootless Container. Sie liegen unter `~/.config/containers/systemd/`.

### 10a. paw-api Quadlet

```bash
mkdir -p /home/paw-api/.config/containers/systemd
```

```bash
cat > /home/paw-api/.config/containers/systemd/paw-api.container << 'EOF'
[Unit]
Description=PAW API Server
After=network-online.target

[Container]
Image=localhost/paw-api:latest
Network=host
EnvironmentFile=/home/paw-api/.env
Secret=jwt-secret,type=env,target=JWT_SECRET
Volume=/home/paw-api/data:/app/data:Z
Volume=/home/paw-api/uploads:/app/uploads:Z

[Service]
Restart=always

[Install]
WantedBy=default.target
EOF
```

```bash
chown -R paw-api:paw-api /home/paw-api/.config
```

### 10b. paw-pwa Quadlet

```bash
mkdir -p /home/paw-pwa/.config/containers/systemd
```

```bash
cat > /home/paw-pwa/.config/containers/systemd/paw-pwa.container << 'EOF'
[Unit]
Description=PAW PWA Frontend
After=network-online.target

[Container]
Image=localhost/paw-pwa:latest
Network=host

[Service]
Restart=always

[Install]
WantedBy=default.target
EOF
```

```bash
chown -R paw-pwa:paw-pwa /home/paw-pwa/.config
```

### 10c. paw-proxy Quadlet (Caddy)

```bash
mkdir -p /home/paw-proxy/.config/containers/systemd
```

```bash
cat > /home/paw-proxy/.config/containers/systemd/paw-proxy.container << 'EOF'
[Unit]
Description=PAW Caddy Reverse Proxy
After=network-online.target

[Container]
Image=docker.io/caddy:alpine
Network=host
Volume=/home/paw-proxy/Caddyfile:/etc/caddy/Caddyfile:Z
Volume=/home/paw-proxy/caddy-data:/data:Z
Volume=/home/paw-proxy/caddy-config:/config:Z

[Service]
Restart=always

[Install]
WantedBy=default.target
EOF
```

```bash
chown -R paw-proxy:paw-proxy /home/paw-proxy/.config
```

---

## 11. Services starten

### 11a. paw-api starten

```bash
PAW_API_UID=$(id -u paw-api) && su -s /bin/bash paw-api -c "cd /tmp && XDG_RUNTIME_DIR=/run/user/$PAW_API_UID DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$PAW_API_UID/bus systemctl --user daemon-reload"
```

```bash
PAW_API_UID=$(id -u paw-api) && su -s /bin/bash paw-api -c "cd /tmp && XDG_RUNTIME_DIR=/run/user/$PAW_API_UID DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$PAW_API_UID/bus systemctl --user start paw-api"
```

### 11b. paw-pwa starten

```bash
PAW_PWA_UID=$(id -u paw-pwa) && su -s /bin/bash paw-pwa -c "cd /tmp && XDG_RUNTIME_DIR=/run/user/$PAW_PWA_UID DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$PAW_PWA_UID/bus systemctl --user daemon-reload"
```

```bash
PAW_PWA_UID=$(id -u paw-pwa) && su -s /bin/bash paw-pwa -c "cd /tmp && XDG_RUNTIME_DIR=/run/user/$PAW_PWA_UID DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$PAW_PWA_UID/bus systemctl --user start paw-pwa"
```

### 11c. paw-proxy starten

```bash
PAW_PROXY_UID=$(id -u paw-proxy) && su -s /bin/bash paw-proxy -c "cd /tmp && XDG_RUNTIME_DIR=/run/user/$PAW_PROXY_UID DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$PAW_PROXY_UID/bus systemctl --user daemon-reload"
```

```bash
PAW_PROXY_UID=$(id -u paw-proxy) && su -s /bin/bash paw-proxy -c "cd /tmp && XDG_RUNTIME_DIR=/run/user/$PAW_PROXY_UID DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$PAW_PROXY_UID/bus systemctl --user start paw-proxy"
```

---

## 12. Status und Verifikation

### 12a. Service-Status prüfen

```bash
PAW_API_UID=$(id -u paw-api) && su -s /bin/bash paw-api -c "cd /tmp && XDG_RUNTIME_DIR=/run/user/$PAW_API_UID systemctl --user status paw-api --no-pager"
```

```bash
PAW_PWA_UID=$(id -u paw-pwa) && su -s /bin/bash paw-pwa -c "cd /tmp && XDG_RUNTIME_DIR=/run/user/$PAW_PWA_UID systemctl --user status paw-pwa --no-pager"
```

```bash
PAW_PROXY_UID=$(id -u paw-proxy) && su -s /bin/bash paw-proxy -c "cd /tmp && XDG_RUNTIME_DIR=/run/user/$PAW_PROXY_UID systemctl --user status paw-proxy --no-pager"
```

### 12b. Container laufen?

```bash
podman ps --all
```

### 12c. API Server antwortet?

```bash
curl -s http://localhost:3000/api/health || echo "health endpoint nicht definiert — aber server läuft?"
```

### 12d. PWA antwortet?

```bash
curl -s http://localhost:8080/ | head -20
```

### 12e. Caddy + TLS funktioniert?

```bash
curl -I https://paw.oxs.at/
```

Erwartet: HTTP 200, TLS-Zertifikat von Let's Encrypt, Redirect zur PWA

---

## 13. Erste Admin-Rolle erstellen

Nach dem Deployment muss mindestens ein Admin-Account eingerichtet werden (ähnlich wie JWT_SECRET — nur einmal).

⚠️ **Nur beim ersten Deployment nötig**:

### 13.0 sqlite3 installieren (falls noch nicht vorhanden)

```bash
dnf install -y sqlite
```

### 13a. Admin-Email prüfen (ist bereits im System registriert?)

```bash
sqlite3 /home/paw-api/data/paw.db "SELECT id, email, role FROM accounts WHERE email='mpetutschnig@gmail.com';"
```

Falls nichts angezeigt → Account existiert noch nicht, zuerst in der App registrieren!

### 13b. Account zur Admin-Rolle hochstufen

```bash
sqlite3 /home/paw-api/data/paw.db "UPDATE accounts SET role='admin', verified=1 WHERE email='mpetutschnig@gmail.com';"
```

### 13c. Verifikation

```bash
sqlite3 /home/paw-api/data/paw.db "SELECT id, email, role, verified FROM accounts WHERE email='mpetutschnig@gmail.com';"
```

Sollte anzeigen: `role='admin'` und `verified=1`

Jetzt im Admin-Panel einloggen: `https://paw.oxs.at/admin`

---

## Anhang: Update-Workflow

**Wichtig:** Wenn die Shells auf `/sbin/nologin` gesetzt sind (siehe "Optional" unten), müssen sie erst auf `/bin/bash` gewechselt werden:

```bash
usermod -s /bin/bash paw-git
usermod -s /bin/bash paw-api
usermod -s /bin/bash paw-pwa
```

Dann: Git pull und Images bauen:

```bash
su -s /bin/bash paw-git -c "cd /tmp && git -C /git/pawvax pull"
```

```bash
chmod -R a+rX /git/pawvax
```

```bash
PAW_API_UID=$(id -u paw-api) && XDG_RUNTIME_DIR=/run/user/$PAW_API_UID su -s /bin/bash paw-api -c "cd /tmp && podman --cgroup-manager=cgroupfs build -t paw-api:latest -f /git/pawvax/server/Dockerfile /git/pawvax/server"
```

```bash
PAW_PWA_UID=$(id -u paw-pwa) && XDG_RUNTIME_DIR=/run/user/$PAW_PWA_UID su -s /bin/bash paw-pwa -c "cd /tmp && podman --cgroup-manager=cgroupfs build -t paw-pwa:latest -f /git/pawvax/pwa/Containerfile /git/pawvax/pwa"
```

```bash
PAW_API_UID=$(id -u paw-api) && su -s /bin/bash paw-api -c "cd /tmp && XDG_RUNTIME_DIR=/run/user/$PAW_API_UID DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$PAW_API_UID/bus systemctl --user restart paw-api"
```

```bash
PAW_PWA_UID=$(id -u paw-pwa) && su -s /bin/bash paw-pwa -c "cd /tmp && XDG_RUNTIME_DIR=/run/user/$PAW_PWA_UID DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$PAW_PWA_UID/bus systemctl --user restart paw-pwa"
```

Logs prüfen:

```bash
PAW_API_UID=$(id -u paw-api) && su -s /bin/bash paw-api -c "cd /tmp && XDG_RUNTIME_DIR=/run/user/$PAW_API_UID journalctl --user -xef -u paw-api"
```

```bash
PAW_PWA_UID=$(id -u paw-pwa) && su -s /bin/bash paw-pwa -c "cd /tmp && XDG_RUNTIME_DIR=/run/user/$PAW_PWA_UID journalctl --user -xef -u paw-pwa"
```

**Danach:** Shells zurück zu `/sbin/nologin`:

```bash
usermod -s /sbin/nologin paw-git
usermod -s /sbin/nologin paw-api
usermod -s /sbin/nologin paw-pwa
```

---

## Oder: Gesamtes Update in einem Code-Block

Falls ihr alles auf einmal ausführen wollt (Shells müssen `/bin/bash` sein):

```bash
# 1. Git pull
su -s /bin/bash paw-git -c "cd /tmp && git -C /git/pawvax pull"

# 2. Permissions
chmod -R a+rX /git/pawvax

# 3. Build paw-api
PAW_API_UID=$(id -u paw-api) && XDG_RUNTIME_DIR=/run/user/$PAW_API_UID su -s /bin/bash paw-api -c "cd /tmp && podman --cgroup-manager=cgroupfs build -t paw-api:latest -f /git/pawvax/server/Dockerfile /git/pawvax/server"

# 4. Build paw-pwa
PAW_PWA_UID=$(id -u paw-pwa) && XDG_RUNTIME_DIR=/run/user/$PAW_PWA_UID su -s /bin/bash paw-pwa -c "cd /tmp && podman --cgroup-manager=cgroupfs build -t paw-pwa:latest -f /git/pawvax/pwa/Containerfile /git/pawvax/pwa"

# 5. Restart paw-api
PAW_API_UID=$(id -u paw-api) && su -s /bin/bash paw-api -c "cd /tmp && XDG_RUNTIME_DIR=/run/user/$PAW_API_UID DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$PAW_API_UID/bus systemctl --user restart paw-api"

# 6. Restart paw-pwa
PAW_PWA_UID=$(id -u paw-pwa) && su -s /bin/bash paw-pwa -c "cd /tmp && XDG_RUNTIME_DIR=/run/user/$PAW_PWA_UID DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$PAW_PWA_UID/bus systemctl --user restart paw-pwa"

# 7. Check paw-api status
PAW_API_UID=$(id -u paw-api) && su -s /bin/bash paw-api -c "cd /tmp && XDG_RUNTIME_DIR=/run/user/$PAW_API_UID systemctl --user status paw-api --no-pager"

# 8. Check paw-pwa status
PAW_PWA_UID=$(id -u paw-pwa) && su -s /bin/bash paw-pwa -c "cd /tmp && XDG_RUNTIME_DIR=/run/user/$PAW_PWA_UID systemctl --user status paw-pwa --no-pager"
```

---

## Optional: Shells zurück zu /sbin/nologin (für Security)

Nach dem Deployment können die User-Shells für zusätzliche Sicherheit auf `/sbin/nologin` zurückgesetzt werden:

```bash
usermod -s /sbin/nologin paw-git
```

```bash
usermod -s /sbin/nologin paw-api
```

```bash
usermod -s /sbin/nologin paw-pwa
```

```bash
usermod -s /sbin/nologin paw-proxy
```

Die Services laufen trotzdem weiter via systemd. Für zukünftige Updates/Wartung braucht man dann wieder die XDG_RUNTIME_DIR Workarounds.

---

## Dienste neustarten (wenn Shells auf /sbin/nologin)

Wenn die Shells bereits auf `/sbin/nologin` gesetzt sind (Security-Hardening), müssen sie für den Neustart temporär auf `/bin/bash` gewechselt werden:

### Schritt 1: Shells zu /bin/bash wechseln

```bash
usermod -s /bin/bash paw-api
usermod -s /bin/bash paw-pwa
usermod -s /bin/bash paw-proxy
```

### Schritt 2: Services neustarten

```bash
PAW_API_UID=$(id -u paw-api) && su -s /bin/bash paw-api -c "cd /tmp && XDG_RUNTIME_DIR=/run/user/$PAW_API_UID DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$PAW_API_UID/bus systemctl --user restart paw-api"
```

```bash
PAW_PWA_UID=$(id -u paw-pwa) && su -s /bin/bash paw-pwa -c "cd /tmp && XDG_RUNTIME_DIR=/run/user/$PAW_PWA_UID DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$PAW_PWA_UID/bus systemctl --user restart paw-pwa"
```

```bash
PAW_PROXY_UID=$(id -u paw-proxy) && su -s /bin/bash paw-proxy -c "cd /tmp && XDG_RUNTIME_DIR=/run/user/$PAW_PROXY_UID DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$PAW_PROXY_UID/bus systemctl --user restart paw-proxy"
```

### Schritt 3: Status prüfen

```bash
PAW_API_UID=$(id -u paw-api) && su -s /bin/bash paw-api -c "cd /tmp && XDG_RUNTIME_DIR=/run/user/$PAW_API_UID systemctl --user status paw-api --no-pager"
```

```bash
PAW_PWA_UID=$(id -u paw-pwa) && su -s /bin/bash paw-pwa -c "cd /tmp && XDG_RUNTIME_DIR=/run/user/$PAW_PWA_UID systemctl --user status paw-pwa --no-pager"
```

```bash
PAW_PROXY_UID=$(id -u paw-proxy) && su -s /bin/bash paw-proxy -c "cd /tmp && XDG_RUNTIME_DIR=/run/user/$PAW_PROXY_UID systemctl --user status paw-proxy --no-pager"
```

### Schritt 4: Shells zurück zu /sbin/nologin

```bash
usermod -s /sbin/nologin paw-api
usermod -s /sbin/nologin paw-pwa
usermod -s /sbin/nologin paw-proxy
```

---

## Troubleshooting

| Problem | Lösung |
|---|---|
| Container startet nicht | `podman logs <container>` um Fehler zu sehen |
| Port 80 in Benutzung | `ss -tlnp \| grep :80` → Prozess killen |
| Quadlet wird nicht gelesen | `systemctl --user daemon-reload` ausgeführt? |
| TLS-Zertifikat-Fehler | Firewall Port 80 offen? Domain zeigt auf richtige IP? |
| "Connection refused" auf localhost:3000 | `podman ps` — läuft der API-Container? |

---

**Status:** [USER FILLS IN AS THEY PROGRESS]
