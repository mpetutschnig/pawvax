# PAW — Deployment Guide für Hetzner Server (Rootless Podman)

Anleitung zur Bereitstellung von API und PWA mit Rootless Podman und Caddy (Let's Encrypt) auf einem Hetzner Server.

**Zieldomains:**
- API: `pawapi.oxs.at` (Port 3000 intern)
- PWA: `paw.oxs.at` (Port 80 intern, nginx)
- Caddy Reverse Proxy: Port 80, 443 (Host)

---

## 1. Vorbereitung

### 1.1 SSH zum Server verbinden

```bash
ssh root@your-hetzner-ip
```

### 1.2 Systemupdate

**Fedora:**
```bash
dnf upgrade -y
```

**Debian/Ubuntu:**
```bash
apt update && apt upgrade -y
```

### 1.3 Podman installieren (nicht Docker!)

**Fedora:**
```bash
dnf install -y podman podman-compose curl wget
```

**Debian/Ubuntu:**
```bash
apt install -y podman podman-compose curl wget
```

Verifizieren:
```bash
podman --version
```

---

## 2. Rootless Podman Setup

Rootless Podman ermöglicht es unprivilegierten Benutzern, Container zu verwalten.

### 2.1 subuid/subgid Konfiguration

Systemweit aktivieren (einmalig):

**Fedora:**
```bash
# shadow-utils sollte bereits installiert sein
# Prüfe ob /etc/subuid existiert, falls nicht:
touch /etc/subuid /etc/subgid

# Für jeden Benutzer (paw_api, paw_pwa, paw_proxy) Einträge hinzufügen
echo "paw_api:100000:65536" >> /etc/subuid
echo "paw_api:100000:65536" >> /etc/subgid

echo "paw_pwa:165536:65536" >> /etc/subuid
echo "paw_pwa:165536:65536" >> /etc/subgid

echo "paw_proxy:231072:65536" >> /etc/subuid
echo "paw_proxy:231072:65536" >> /etc/subgid

# Verifizieren
cat /etc/subuid
cat /etc/subgid
```

**Debian/Ubuntu:**
```bash
# Install shadow-utils (für newuidmap/newgidmap)
apt install -y shadow-utils

# Dann wie oben...
echo "paw_api:100000:65536" >> /etc/subuid
echo "paw_api:100000:65536" >> /etc/subgid
# etc.
```

### 2.2 Benutzer erstellen

```bash
# API User
useradd -m -s /bin/bash -d /git/pawvax/api paw_api

# PWA User  
useradd -m -s /bin/bash -d /git/pawvax/pwa paw_pwa

# Caddy/Proxy User
useradd -m -s /bin/bash -d /git/pawvax/proxy paw_proxy
```

### 2.3 Podman-Socket für jeden Benutzer aktivieren

```bash
# Für jeden Benutzer einen systemd user service starten
loginctl enable-linger paw_api
loginctl enable-linger paw_pwa
loginctl enable-linger paw_proxy

# Verifizieren
loginctl list-users
```

---

## 3. Repository klonen

### 3.1 Repository von GitHub klonen

```bash
# Wechsel in den Zielordner
cd /git/pawvax

# Klone das Repository
git clone git@github.com:mpetutschnig/git/pawvax.git .

# Falls SSH-Keys noch nicht eingerichtet, mit HTTPS:
# git clone https://github.com/mpetutschnig/git/pawvax.git .

# Überprüfe die Struktur
ls -la
# Sollte zeigen: server/, pwa/, .git/, etc.
```

### 3.2 Verzeichnisstruktur nach Clone

Nach `git clone` sollte die Struktur so aussehen:

```
/git/pawvax/
├── server/              # ← API (Fastify)
│   ├── src/
│   ├── package*.json
│   ├── Dockerfile
│   ├── .env.example
│   └── ...
├── pwa/                 # ← PWA (React + Vite)
│   ├── src/
│   ├── package*.json
│   ├── Dockerfile
│   ├── vite.config.ts
│   ├── nginx.conf
│   └── ...
├── android/             # ← Android App (optional)
├── proxy/               # ← Caddy Config (manuell erstellen)
│   ├── Caddyfile
│   └── ...
└── .git/
```

### 3.3 Neue Verzeichnisse erstellen

```bash
cd /git/pawvax

# Datenverzeichnisse für Volumes
mkdir -p proxy
mkdir -p server/data
mkdir -p server/uploads

# Logs-Verzeichnisse (optional)
mkdir -p logs/{api,pwa,caddy}
```

---

## 4. Caddy Konfiguration (Reverse Proxy + Let's Encrypt)

### 4.1 Caddy installieren

**Fedora:**
```bash
# Als root installieren (braucht Port 80, 443)
dnf install -y caddy
```

**Debian/Ubuntu:**
```bash
# Als root installieren (braucht Port 80, 443)
apt install -y caddy
```

### 4.2 Podman-Netzwerk für Container erstellen

Damit die Container untereinander kommunizieren können:

```bash
# Als root (für Caddy Host-Port-Zugriff)
podman network create pawvax-net || true
```

### 4.3 Caddyfile für Reverse Proxy

Erstelle `/git/pawvax/proxy/Caddyfile`:

```bash
cat > /git/pawvax/proxy/Caddyfile << 'EOF'
# Caddy Configuration for PAW

# API Backend
pawapi.oxs.at {
    reverse_proxy localhost:3000 {
        header_up X-Forwarded-Proto {scheme}
        header_up X-Forwarded-Host {host}
        header_up X-Real-IP {remote_addr}
    }
}

# PWA Frontend
paw.oxs.at {
    reverse_proxy localhost:8080 {
        header_up X-Forwarded-Proto {scheme}
        header_up X-Forwarded-Host {host}
        header_up X-Real-IP {remote_addr}
    }
}
EOF
```

**Deine Domänen sind bereits konfiguriert:**
- `pawapi.oxs.at` → API Backend
- `paw.oxs.at` → PWA Frontend

### 4.4 Caddy systemd service starten

```bash
# Verifiziere Caddyfile
caddy validate --config /git/pawvax/proxy/Caddyfile

# Starte Caddy
systemctl restart caddy
systemctl enable caddy
systemctl status caddy

# Logs prüfen
journalctl -u caddy -n 50 -f
```

Caddy lädt automatisch Let's Encrypt Zertifikate herunter! 🎉

---

## 5. Container bauen

Die Dockerfiles sind im Repository. Stelle sicher, dass du zuerst das Repository geklont hast!

### 5.1 Repository überprüfen

```bash
# Prüfe ob Code vorhanden ist
ls -la /git/pawvax/

# Falls leer oder nicht vorhanden:
cd /git/pawvax
git clone git@github.com:mpetutschnig/pawvax.git .

# oder mit HTTPS (falls SSH nicht eingerichtet):
git clone https://github.com/mpetutschnig/pawvax.git .

# Überprüfe die Struktur
ls -la
# Sollte zeigen: server/, pwa/, android/, ...
```

### 5.2 API Container bauen

```bash
podman build -t paw-api:latest /git/pawvax/server
```

### 5.3 PWA Container bauen

```bash
podman build -t paw-pwa:latest /git/pawvax/pwa
```

**Verifizieren:**
```bash
podman images | grep paw
# Sollte zeigen: paw-api:latest und paw-pwa:latest
```

---

## 6. Umgebungsvariablen (.env)

### 6.1 API .env Datei

Erstelle `/git/pawvax/api/.env`:

```bash
cat > /git/pawvax/api/.env << 'EOF'
# Server
PORT=3000
NODE_ENV=production

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production-$(date +%s | sha256sum | head -c 32)

# Database
DB_PATH=/app/data/paw.db
UPLOADS_DIR=/app/uploads

# Optional: Gemini Vision API für OCR (falls vorhanden)
GEMINI_API_KEY=

# Optional: Admin user (first run)
ADMIN_EMAIL=admin@example.com
EOF

# Permissions
chmod 600 /git/pawvax/api/.env
```

**Wichtige Secrets generieren:**

```bash
# Neuen JWT_SECRET generieren
openssl rand -base64 32

# In .env ersetzen
nano /git/pawvax/api/.env
```

### 6.2 Verzeichnisse für Daten vorbereiten

```bash
# Für API
mkdir -p /git/pawvax/api/data
mkdir -p /git/pawvax/api/uploads

# Permissions setzen (für paw_api user)
chown -R 100000:100000 /git/pawvax/api/data /git/pawvax/api/uploads
chmod 755 /git/pawvax/api/data /git/pawvax/api/uploads
```

---

## 7. Podman Container Networking

### 7.1 Port-Forwarding vom Host zu Containern

Da Caddy auf dem Host läuft (Port 80, 443) und zu Containers reverse-proxied:

```bash
# API: Host Port 3000 → Container Port 3000
# PWA: Host Port 8080 → Container Port 80

# Das wird in der podman run oder docker-compose.yml Befehl konfiguriert
```

---

## 8. Container starten (podman run)

### 8.1 API Container starten

```bash
podman run -d \
  --name paw-api \
  --network host \
  -p 3000:3000 \
  -v /git/pawvax/api/data:/app/data \
  -v /git/pawvax/api/uploads:/app/uploads \
  -e PORT=3000 \
  -e JWT_SECRET="$(cat /git/pawvax/api/.env | grep JWT_SECRET | cut -d= -f2)" \
  -e DB_PATH=/app/data/paw.db \
  -e UPLOADS_DIR=/app/uploads \
  paw-api:latest

# Prüfen
podman logs paw-api
podman ps | grep paw-api
```

### 8.2 PWA Container starten

```bash
podman run -d \
  --name paw-pwa \
  --network host \
  -p 8080:80 \
  paw-pwa:latest

# Prüfen
podman logs paw-pwa
podman ps | grep paw-pwa
```

**Alternativ: Docker Compose verwenden** (siehe Abschnitt 9)

---

## 9. Systemd Services für Container (Fedora 40+)

Quadlets sind systemd-Unit-Dateien für Podman-Container. Viel eleganter als docker-compose!

### 9.1 Quadlet-Verzeichnisse erstellen

```bash
# Für rootless Podman (als paw_api, paw_pwa, paw_proxy Benutzer)
mkdir -p ~/.config/containers/systemd

# ODER für system-wide (als root)
mkdir -p /etc/containers/systemd
```

Da wir **rootless Podman** verwenden, arbeiten wir im User-Verzeichnis:

```bash
# Als root
mkdir -p /etc/containers/systemd
```

### 9.2 Network Quadlet

Erstelle `/etc/containers/systemd/pawvax.network`:

```ini
[Network]
NetworkName=pawvax-net
```

Starte das Netzwerk:
```bash
systemctl enable --now podman-pawvax.network
```

### 9.3 API Container Quadlet

Erstelle `/etc/containers/systemd/paw-api.container`:

```ini
[Unit]
Description=PAW API Container
After=podman-pawvax.network.service

[Container]
Image=paw-api:latest
ContainerName=paw-api
Restart=always
PublishPort=3000:3000
Volume=/git/pawvax/api/data:/app/data:Z
Volume=/git/pawvax/api/uploads:/app/uploads:Z
Network=pawvax-net

Environment=PORT=3000
Environment=NODE_ENV=production
Environment=JWT_SECRET=your-super-secret-jwt-key-change-this
Environment=DB_PATH=/app/data/paw.db
Environment=UPLOADS_DIR=/app/uploads
Environment=GEMINI_API_KEY=
Environment=ADMIN_EMAIL=admin@example.com

HealthCmd=node -e "require('http').get('http://localhost:3000/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"
HealthInterval=10s
HealthTimeout=5s
HealthRetries=3

[Service]
Restart=always
RestartSec=10
```

**Wichtig:** JWT_SECRET anpassen!

### 9.4 PWA Container Quadlet

Erstelle `/etc/containers/systemd/paw-pwa.container`:

```ini
[Unit]
Description=PAW PWA Container
After=podman-pawvax.network.service

[Container]
Image=paw-pwa:latest
ContainerName=paw-pwa
Restart=always
PublishPort=8080:80
Network=pawvax-net

HealthCmd=wget --quiet --tries=1 --spider http://localhost/index.html
HealthInterval=10s
HealthTimeout=5s
HealthRetries=3

[Service]
Restart=always
RestartSec=10
```

### 9.5 Quadlets aktivieren und starten

**WICHTIG:** Stelle sicher dass die Quadlet-Dateien in `/etc/containers/systemd/` existieren!

```bash
# Prüfe Quadlet-Dateien
ls -la /etc/containers/systemd/
# Sollte zeigen: pawvax.network, paw-api.container, paw-pwa.container
```

Falls Dateien fehlen, erstelle sie (siehe 9.2-9.4):

```bash
# Systemd Konfiguration neu laden (WICHTIG!)
systemctl daemon-reload

# Überprüfe ob Quadlets erkannt wurden
systemctl list-units --type=service | grep paw

# Services starten
systemctl start podman-pawvax.network
systemctl start paw-api.service paw-pwa.service

# Automatisch beim Boot starten
systemctl enable podman-pawvax.network
systemctl enable paw-api.service paw-pwa.service

# Status prüfen
systemctl status paw-api.service
systemctl status paw-pwa.service

# Logs
journalctl -u paw-api -f
journalctl -u paw-pwa -f
```

**Falls Fehler "Unit does not exist":**
```bash
# 1. Überprüfe Dateinamen (keine Typos!)
ls -la /etc/containers/systemd/

# 2. Systemd neu laden
systemctl daemon-reload

# 3. Erneut prüfen
systemctl list-units --type=service | grep paw
```

### 9.6 Container prüfen

```bash
podman ps
podman network ls
podman logs paw-api
podman logs paw-pwa
```

### 9.7 Quadlets bearbeiten

Falls du eine Quadlet änderst:

```bash
# Z.B. paw-api.container ändern
nano /etc/containers/systemd/paw-api.container

# Neuladen und neu starten
systemctl daemon-reload
systemctl restart paw-api.service
```

---

## 10. Systemd Services (Auto-Start beim Reboot)

Damit Container automatisch starten, wenn der Server bootet.

### 10.1 Für root-basierte Container

Erstelle `/etc/systemd/system/paw-api.service`:

```ini
[Unit]
Description=PAW API Container
Requires=podman.service
After=podman.service

[Service]
Type=simple
Restart=always
RestartSec=10
ExecStart=/usr/bin/podman run --rm \
  --name paw-api \
  --network host \
  -p 3000:3000 \
  -v /git/pawvax/api/data:/app/data \
  -v /git/pawvax/api/uploads:/app/uploads \
  -e PORT=3000 \
  -e JWT_SECRET="$(cat /git/pawvax/api/.env | grep JWT_SECRET | cut -d= -f2)" \
  -e DB_PATH=/app/data/paw.db \
  -e UPLOADS_DIR=/app/uploads \
  paw-api:latest

ExecStop=/usr/bin/podman stop paw-api

[Install]
WantedBy=multi-user.target
```

Erstelle `/etc/systemd/system/paw-pwa.service`:

```ini
[Unit]
Description=PAW PWA Container
Requires=podman.service
After=podman.service

[Service]
Type=simple
Restart=always
RestartSec=10
ExecStart=/usr/bin/podman run --rm \
  --name paw-pwa \
  --network host \
  -p 8080:80 \
  paw-pwa:latest

ExecStop=/usr/bin/podman stop paw-pwa

[Install]
WantedBy=multi-user.target
```

### 10.2 Services aktivieren

```bash
systemctl daemon-reload
systemctl enable paw-api.service paw-pwa.service
systemctl start paw-api.service paw-pwa.service

# Status prüfen
systemctl status paw-api.service
systemctl status paw-pwa.service

# Logs
journalctl -u paw-api -n 50 -f
journalctl -u paw-pwa -n 50 -f
```

---

## 11. Caddy + Let's Encrypt Zertifikate

Caddy verwaltet Zertifikate **automatisch**! 

### 11.1 Zertifikate prüfen

```bash
caddy list-certificates

# Details
certbot certificates
```

### 11.2 Caddyfile Reload bei Änderungen

```bash
# Wenn du Caddyfile änderst:
caddy reload --config /git/pawvax/proxy/Caddyfile
```

### 11.3 Zertifikate Speichert unter

```bash
# Caddy speichert Certs im XDG_CACHE_HOME
ls -la ~/.cache/caddy/certificates/acme/acme-v02.api.letsencrypt.org-directory/
```

---

## 12. Zugriff testen

### 12.1 HTTP/HTTPS Test

```bash
# Von extern
curl -I https://pawapi.oxs.at/health
curl -I https://paw.oxs.at/

# Von dem Server selbst:
curl -I http://localhost:3000/health
curl -I http://localhost:8080/
```

### 12.2 Browser-Zugriff

- PWA: https://paw.oxs.at
- API Health: https://pawapi.oxs.at/health
- Admin (wenn vorhanden): https://paw.oxs.at/admin

### 12.3 Zertifikat prüfen

```bash
# Von extern
openssl s_client -connect pawapi.oxs.at:443 -servername pawapi.oxs.at

# Ablaufdatum
echo | openssl s_client -servername pawapi.oxs.at -connect pawapi.oxs.at:443 2>/dev/null | \
  openssl x509 -noout -dates
```

---

## 13. Troubleshooting

### 13.1 Container startet nicht

```bash
# Logs prüfen
podman logs paw-api
podman logs paw-pwa

# Container-Status
podman ps -a

# Manuelle Start-Versuche
podman run -it paw-api:latest bash
```

### 13.2 Caddy zeigt 502 Bad Gateway

```bash
# Prüfe ob Container laufen
podman ps | grep paw-

# Prüfe Caddy-Logs
journalctl -u caddy -n 100 -f

# Port-Mapping prüfen
netstat -tulpn | grep 3000
netstat -tulpn | grep 8080
```

### 13.3 Let's Encrypt Certificate Error

```bash
# Caddy Logs
journalctl -u caddy -n 200 -f | grep -i acme

# Caddyfile Syntax überprüfen
caddy validate --config /git/pawvax/proxy/Caddyfile

# Firewall Port 80, 443 freigeben (falls nötig)
ufw allow 80/tcp
ufw allow 443/tcp
ufw reload
```

### 13.4 Datenbank-Initialisierung

Beim ersten Start erstellt der Server die Datenbank automatisch. Falls Probleme:

```bash
# In den Container gehen
podman exec -it paw-api sh

# Oder neu starten
podman restart paw-api

# Datenbank-Datei prüfen
ls -la /git/pawvax/api/data/
```

### 13.5 Firewall Check

Falls die Ports nicht erreichbar sind, überprüfe die **Hetzner Cloud Firewall** im Cloud Console:

```bash
# Teste ob Ports offen sind
telnet pawapi.oxs.at 80
telnet pawapi.oxs.at 443
telnet pawapi.oxs.at 22

# oder mit curl
curl -v https://pawapi.oxs.at 2>&1 | head -20
```

Die Hetzner Cloud Firewall ist eine **Cloud-Firewall auf Server-Ebene**, nicht lokal auf dem Server selbst!

### 13.6 Port 80/443 bereits belegt

**Fehler:** `address already in use: listen tcp :80: bind`

Das bedeutet, dass etwas anderes bereits Port 80 oder 443 nutzt:

```bash
# Finde was Port 80 belegt
lsof -i :80
netstat -tulpn | grep :80

# Oder Port 443
lsof -i :443
netstat -tulpn | grep :443

# Falls alte Caddy-Instance läuft
pkill -9 caddy

# Überprüfe ob Port frei ist
netstat -tulpn | grep -E ':80|:443'

# Starte Caddy neu
systemctl restart caddy
systemctl status caddy
```

### 13.7 Quadlet-Services nicht erkannt

**Fehler:** `Failed to enable unit: Unit paw-api.service does not exist`

Das passiert, wenn `systemctl daemon-reload` vergessen wurde:

```bash
# Überprüfe ob Quadlet-Dateien existieren
ls -la /etc/containers/systemd/
# Muss zeigen: pawvax.network, paw-api.container, paw-pwa.container

# Systemd MUSS neu geladen werden!
systemctl daemon-reload

# Überprüfe ob Quadlets erkannt wurden
systemctl list-units --type=service | grep paw

# Jetzt sollte enable funktionieren
systemctl enable paw-api.service paw-pwa.service
systemctl start paw-api.service paw-pwa.service

# Status
systemctl status paw-api.service
```

**Wichtig:** Nach jeder Änderung an Quadlet-Dateien → `systemctl daemon-reload`!

---

## 14. Wartung und Monitoring

### 14.1 Container-Status überwachen

```bash
# Echtzeit-Monitoring
watch -n 2 "podman ps && echo '---' && systemctl status paw-api paw-pwa"

# Logs folgen
podman-compose logs -f
```

### 14.2 Systemd Service-Health

```bash
# Automatische Restarts überprüfen
journalctl -u paw-api --since="1 hour ago" | grep -i "restart"
journalctl -u paw-pwa --since="1 hour ago" | grep -i "restart"
```

### 14.3 Disk-Space überwachen

```bash
# Datenbank-Größe prüfen
du -sh /git/pawvax/api/data/
du -sh /git/pawvax/api/uploads/

# Caddy Zertifikate
du -sh ~/.cache/caddy/
```

### 14.4 Logs rotieren (optional)

```bash
# journalctl automatisch komprimieren nach 30 Tagen
echo 'MaxRetentionSec=30days' >> /etc/systemd/journald.conf
systemctl restart systemd-journald
```

---

## 15. Checkliste vor Production

- [ ] DNS A-Records + AAAA-Records auf Hetzner-IPs zeigen (bereits konfiguriert)
  - `pawapi.oxs.at` → Hetzner IPv4 & IPv6 ✅
  - `paw.oxs.at` → Hetzner IPv4 & IPv6 ✅

- [ ] Hetzner Cloud Firewall konfigurieren (siehe Abschnitt 16)

- [ ] JWT_SECRET in `.env` geändert

- [ ] Datenbank Initial-Setup (erste Admin erstellen)
  ```bash
  podman exec paw-api sqlite3 /app/data/paw.db "UPDATE accounts SET role='admin' WHERE email='admin@example.com'"
  ```

- [ ] Caddy systemd service läuft
  ```bash
  systemctl status caddy
  ```

- [ ] Zertifikate gültig
  ```bash
  curl -vI https://pawapi.oxs.at
  curl -vI https://paw.oxs.at
  ```

- [ ] Health-Checks grün
  ```bash
  curl https://pawapi.oxs.at/health
  curl https://paw.oxs.at/
  ```

---

## 16. Hetzner Cloud Firewall + Caddy Reverse Proxy

**Hetzner Cloud Firewall** sperrt externe Verbindungen - keine lokalen `ufw`/`iptables` Befehle nötig.

### 16.1 Hetzner Cloud Firewall konfigurieren

1. **Melde dich an:** https://console.hetzner.cloud
2. **Gehe zu:** Dein Projekt → Firewalls
3. **Erstelle eine neue Firewall**
4. **Inbound-Regeln:**

| Protokoll | Port | Quelle | Zweck |
|-----------|------|--------|-------|
| TCP | 22 | Überall | SSH |
| TCP | 80 | Überall | HTTP (Caddy) |
| TCP | 443 | Überall | HTTPS (Caddy + Let's Encrypt) |

5. **Outbound:** Erlaube alles (default)
6. **Firewall zum Server zuweisen**

### 16.2 Caddy Reverse Proxy Konfiguration

Caddy läuft auf dem **Host** (nicht im Container) und proxied zu den Containern.

**Wichtig:** `/etc/caddy/Caddyfile` muss auf korrektem Ort sein:

```bash
cat > /etc/caddy/Caddyfile << 'EOF'
# API Backend (nur API-Requests)
pawapi.oxs.at {
	reverse_proxy localhost:3000
}

# PWA Frontend + API Proxy
paw.oxs.at {
	# Statische PWA Dateien
	reverse_proxy localhost:8080
	
	# API Requests auch hier zulassen
	handle /api* {
		reverse_proxy localhost:3000
	}
	
	# WebSocket für Live-Updates
	handle /ws {
		reverse_proxy localhost:3000
	}
}
EOF

# Validiere
caddy validate --config /etc/caddy/Caddyfile

# Restart
systemctl restart caddy
```

**Warum zwei Domains?**
- `pawapi.oxs.at` → nur API, ohne PWA UI
- `paw.oxs.at` → PWA + API-Proxy, für Frontend-Requests

**Caddy Zertifikate:**
- Automatisch von Let's Encrypt
- Gespeichert in: `/var/lib/caddy/.local/share/caddy/`
- Automatische Erneuerung ✅

### 16.3 Prüfung

```bash
# Teste HTTP/HTTPS
curl -I https://pawapi.oxs.at/health
curl -I https://paw.oxs.at

# API Test
curl -X POST https://paw.oxs.at/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123","name":"Test"}'

# Caddy Status
systemctl status caddy
journalctl -u caddy -n 10
```

---

## 17. Häufige Probleme & Lösungen

### 17.1 "Connection refused" auf Port 443

**Problem:** `curl https://pawapi.oxs.at` → Connection refused

**Ursachen:**
1. Caddy läuft nicht
2. Caddyfile verwendet falsche Pfade
3. Container nicht erreichbar

**Lösung:**
```bash
# Prüfe Caddy
systemctl status caddy
journalctl -u caddy -n 50

# Prüfe Caddyfile
cat /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile

# Prüfe Ports
ss -tulpn | grep -E ':(80|443|3000|8080)'

# Restart
systemctl restart caddy
sleep 2
curl -vI https://pawapi.oxs.at/health
```

### 17.2 "404 Not Found" beim API-Request

**Problem:** `curl https://paw.oxs.at/api/auth/register` → 404

**Ursache:** Caddy proxied nicht zu API für `/api` Requests

**Lösung:** Überprüfe Caddyfile auf `paw.oxs.at` Block:

```bash
grep -A 10 "paw.oxs.at" /etc/caddy/Caddyfile
# Sollte zeigen:
# handle /api* {
#   reverse_proxy localhost:3000
# }
```

Falls fehlend, aktualisiere Caddyfile und restart.

### 17.3 Container starten nicht

**Problem:** `systemctl status paw-api` → Failed to start

**Lösung:**
```bash
# Logs prüfen
journalctl -u paw-api -n 20

# Manuell starten um Fehler zu sehen
/usr/bin/podman run --name paw-api --network pawvax-net -p 3000:3000 \
  -v /git/pawvax/api/data:/app/data:Z \
  -v /git/pawvax/api/uploads:/app/uploads:Z \
  -e PORT=3000 \
  -e NODE_ENV=production \
  -e JWT_SECRET=$(cat /git/pawvax/.jwt_secret) \
  -e DB_PATH=/app/data/paw.db \
  -e UPLOADS_DIR=/app/uploads \
  paw-api:latest

# Container aufräumen
podman rm -f paw-api paw-pwa 2>/dev/null || true
```

### 17.4 PWA lädt, aber API-Requests schlagen fehl

**Problem:** PWA öffnet sich, aber Login/Register fehlgeschlagen

**Ursachen:**
1. Caddyfile proxied nicht `/api` Requests
2. CORS-Fehler (falche Header)
3. Network-Fehler

**Lösung:**
```bash
# Browser DevTools → Network Tab
# Sieh dir fehlgeschlagene API-Requests an

# Test lokal
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123","name":"Test"}'
# Sollte 201 zurückgeben

# Test über Caddy
curl -X POST https://paw.oxs.at/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123","name":"Test"}'
# Sollte auch 201 zurückgeben
```

### 17.5 JWT_SECRET fehlerhaft

**Problem:** API startet nicht wegen JWT_SECRET

**Lösung:**
```bash
# Generiere neu
JWT=$(openssl rand -base64 32)
echo "$JWT" > /git/pawvax/.jwt_secret

# Update systemd unit
nano /etc/systemd/system/paw-api.service
# Ersetze JWT_SECRET=$JWT oder hart-kodiert

systemctl daemon-reload
systemctl restart paw-api.service
```

## 18. Code Updates auf dem Server

Wie du neue Versionen / Bugfixes auf den Live-Server deployst.

### 18.1 Update-Prozess (Schritt für Schritt)

```bash
# 1. SSH zum Server
ssh root@your-hetzner-ip
cd /git/pawvax

# 2. Git Pull (neuesten Code laden)
git pull origin main

# 3. API Container neu bauen
podman build -t paw-api:latest /git/pawvax/server

# 4. PWA Container neu bauen
podman build -t paw-pwa:latest /git/pawvax/pwa

# 5. Container neu starten
systemctl restart paw-api.service paw-pwa.service

# 6. Warten und prüfen
sleep 3
podman ps
systemctl status paw-api.service paw-pwa.service

# 7. Tests durchführen
curl https://pawapi.oxs.at/health
curl https://paw.oxs.at

# 8. Logs überprüfen
journalctl -u paw-api -n 20
journalctl -u paw-pwa -n 20
```

### 18.2 Zero-Downtime Update (mit Service-Swap)

Falls du Downtime vermeiden möchtest:

```bash
cd /git/pawvax

# 1. Code Update
git pull origin main

# 2. Neue Images bauen (mit neuem Tag)
podman build -t paw-api:v2 /git/pawvax/server
podman build -t paw-pwa:v2 /git/pawvax/pwa

# 3. Neue Unit-Dateien mit neuem Image-Tag erstellen
# (Optional: wenn du v1 und v2 parallel laufen lassen möchtest)

# 4. Alte Container stoppen und neue starten
podman stop paw-api paw-pwa
podman rm paw-api paw-pwa

# 5. Alte Images als Backup behalten
podman tag paw-api:latest paw-api:old
podman tag paw-pwa:latest paw-pwa:old

# 6. Neue Images als latest markieren
podman tag paw-api:v2 paw-api:latest
podman tag paw-pwa:v2 paw-pwa:latest

# 7. Services neu starten (mit neuen Images)
systemctl restart paw-api.service paw-pwa.service

# 8. Testen
sleep 3
curl https://pawapi.oxs.at/health
```

### 18.3 Quick Update Script

Erstelle ein Update-Script für schnelle Deploys:

```bash
cat > /usr/local/bin/paw-update.sh << 'SCRIPT'
#!/bin/bash
set -e

echo "🔄 PAW Update Starting..."
cd /git/pawvax

echo "📥 Git Pull..."
git pull origin main

echo "🔨 Building API Container..."
podman build -t paw-api:latest /git/pawvax/server

echo "🔨 Building PWA Container..."
podman build -t paw-pwa:latest /git/pawvax/pwa

echo "🔄 Restarting Services..."
systemctl restart paw-api.service paw-pwa.service

echo "⏳ Waiting for services..."
sleep 3

echo "✅ Health Checks:"
curl -s https://pawapi.oxs.at/health | head -20 && echo "✓ API OK" || echo "✗ API Failed"
curl -s https://paw.oxs.at/ | head -5 && echo "✓ PWA OK" || echo "✗ PWA Failed"

echo "📝 Recent Logs:"
echo "=== API ==="
journalctl -u paw-api -n 5 --no-pager
echo "=== PWA ==="
journalctl -u paw-pwa -n 5 --no-pager

echo "✨ Update Complete!"
SCRIPT

chmod +x /usr/local/bin/paw-update.sh

# Dann jederzeit aufrufen:
paw-update.sh
```

### 18.4 Rollback bei Fehlern

Falls nach Update Fehler auftreten:

```bash
# 1. Alte Container-Images wiederherstellen
podman tag paw-api:old paw-api:latest || podman tag paw-api:$(podman images --format '{{.Tag}}' paw-api | grep -v latest | head -1) paw-api:latest
podman tag paw-pwa:old paw-pwa:latest || podman tag paw-pwa:$(podman images --format '{{.Tag}}' paw-pwa | grep -v latest | head -1) paw-pwa:latest

# 2. Services neu starten mit altem Image
systemctl restart paw-api.service paw-pwa.service

# 3. Prüfen
sleep 2
curl https://pawapi.oxs.at/health

# 4. Git zu vorherigem Commit zurückrollen (optional)
git log --oneline -n 5
git revert HEAD  # oder git reset --hard <commit-hash>
```

### 18.5 Datenbank-Updates

Falls Migrations nötig sind:

```bash
# 1. Backup vor Update
cp /git/pawvax/api/data/paw.db /git/pawvax/api/data/paw.db.backup.$(date +%Y%m%d_%H%M%S)

# 2. Update durchführen
paw-update.sh

# 3. Falls Schema-Änderungen (z.B. neue Tabellen):
# - API sollte Migrations automatisch handlen
# - Falls nicht: manuell in Container:
podman exec paw-api sqlite3 /app/data/paw.db < migrations.sql

# 4. Datenbank-Status prüfen
podman exec paw-api sqlite3 /app/data/paw.db ".tables"
podman exec paw-api sqlite3 /app/data/paw.db ".schema accounts" # Beispiel
```

### 18.6 Monitoring während Update

```bash
# In separatem Terminal: Live-Logs während Update
watch -n 1 "podman ps && echo && systemctl status paw-api paw-pwa --no-pager"

# Oder detaillierte Logs
journalctl -u paw-api -f &
journalctl -u paw-pwa -f &
journalctl -u caddy -f &

# Dann paw-update.sh in anderem Terminal starten
```

### 18.7 Sicherheits-Best-Practices

```bash
# 1. Immer Backup vor Update
cp -r /git/pawvax/api/data /git/pawvax/api/data.backup.$(date +%Y%m%d)

# 2. Nur von trusted Branches deployen
git branch -a
git pull origin main  # nicht andere Branches!

# 3. Commits vor Deployment überprüfen
git log --oneline -n 5
git diff HEAD~1..HEAD

# 4. In Dev/Staging testen vor Production
# (Falls vorhanden)

# 5. Nach Deployment: Health-Checks + Monitoring
watch -n 5 "curl -s https://pawapi.oxs.at/health | jq ."
```

## 19. Weitere Befehle

### Stoppen

```bash
podman-compose down
# oder
systemctl stop paw-api paw-pwa
```

### Neu bauen

```bash
podman build --no-cache -t paw-api:latest /git/pawvax/api
podman build --no-cache -t paw-pwa:latest /git/pawvax/pwa
podman-compose restart
```

### Logs exportieren

```bash
podman logs paw-api > /tmp/paw-api.log 2>&1
podman logs paw-pwa > /tmp/paw-pwa.log 2>&1
```

---

## Schnell-Referenz

**Deine Domains (bereits konfiguriert):**
1. API: `pawapi.oxs.at` (Caddyfile, Zeile 3)
2. PWA: `paw.oxs.at` (Caddyfile, Zeile 8)
3. DNS bei Hetzner: A-Records + AAAA-Records bereits eingetragen ✅

**Standard-Ports:**
- Caddy/Proxy: 80 (HTTP), 443 (HTTPS) [Host]
- API: 3000 [Host] → 3000 [Container]
- PWA: 8080 [Host] → 80 [Container]

**Wichtigste Commands:**

```bash
# Starten
systemctl start paw-api paw-pwa
podman-compose up -d

# Status
podman ps
systemctl status paw-*

# Logs
journalctl -u paw-api -f
podman logs paw-api -f

# Stoppen
systemctl stop paw-api paw-pwa
podman-compose down
```

---

## Support

Falls Probleme auftreten:

1. **Logs prüfen** (journalctl, podman logs)
2. **Caddy Syntax überprüfen** (caddy validate)
3. **Port-Konflikte prüfen** (netstat -tulpn)
4. **DNS propagation prüfen** (nslookup pawapi.oxs.at && nslookup paw.oxs.at)
5. **Firewall-Regeln überprüfen** (ufw status)

Viel Erfolg beim Deployment! 🚀
