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

```bash
apt update && apt upgrade -y
```

### 1.3 Podman installieren (nicht Docker!)

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

```bash
# Install shadow-utils (für newuidmap/newgidmap)
apt install -y shadow-utils

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

### 2.2 Benutzer erstellen

```bash
# API User
useradd -m -s /bin/bash -d /pawvax/api paw_api

# PWA User  
useradd -m -s /bin/bash -d /pawvax/pwa paw_pwa

# Caddy/Proxy User
useradd -m -s /bin/bash -d /pawvax/proxy paw_proxy
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

## 3. Verzeichnisstruktur

```bash
# Hauptverzeichnis erstellen
mkdir -p /pawvax
cd /pawvax

# Struktur:
# /pawvax/
# ├── api/
# │   ├── src/
# │   ├── package*.json
# │   ├── Dockerfile
# │   ├── .env
# │   ├── data/          (Datenbank, Uploads - Volume)
# │   └── logs/
# ├── pwa/
# │   ├── src/
# │   ├── package*.json
# │   ├── Dockerfile
# │   ├── vite.config.ts
# │   ├── nginx.conf
# │   └── logs/
# ├── proxy/
# │   ├── Caddyfile
# │   ├── data/         (Caddy Zertifikate)
# │   └── logs/
# └── docker-compose.yml

# Kopiere Quellcode vom lokalen repo nach /pawvax
# (Annahme: Code ist bereits auf dem Server oder wird hochgeladen)
mkdir -p /pawvax/api /pawvax/pwa /pawvax/proxy
```

---

## 4. Caddy Konfiguration (Reverse Proxy + Let's Encrypt)

### 4.1 Caddy installieren

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

Erstelle `/pawvax/proxy/Caddyfile`:

```bash
cat > /pawvax/proxy/Caddyfile << 'EOF'
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
caddy validate --config /pawvax/proxy/Caddyfile

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

Die Dockerfiles sind bereits vorhanden. Baue die Images:

### 5.1 API Container bauen

```bash
cd /pawvax/api

# Als root (oder mit sudo):
podman build -t paw-api:latest .
```

### 5.2 PWA Container bauen

```bash
cd /pawvax/pwa

podman build -t paw-pwa:latest .
```

**Verifizieren:**
```bash
podman images | grep paw
```

---

## 6. Umgebungsvariablen (.env)

### 6.1 API .env Datei

Erstelle `/pawvax/api/.env`:

```bash
cat > /pawvax/api/.env << 'EOF'
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
chmod 600 /pawvax/api/.env
```

**Wichtige Secrets generieren:**

```bash
# Neuen JWT_SECRET generieren
openssl rand -base64 32

# In .env ersetzen
nano /pawvax/api/.env
```

### 6.2 Verzeichnisse für Daten vorbereiten

```bash
# Für API
mkdir -p /pawvax/api/data
mkdir -p /pawvax/api/uploads

# Permissions setzen (für paw_api user)
chown -R 100000:100000 /pawvax/api/data /pawvax/api/uploads
chmod 755 /pawvax/api/data /pawvax/api/uploads
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
  -v /pawvax/api/data:/app/data \
  -v /pawvax/api/uploads:/app/uploads \
  -e PORT=3000 \
  -e JWT_SECRET="$(cat /pawvax/api/.env | grep JWT_SECRET | cut -d= -f2)" \
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

## 9. Docker Compose (Alternative zu podman run)

### 9.1 docker-compose.yml erstellen

Erstelle `/pawvax/docker-compose.yml`:

```yaml
version: '3.8'

services:
  paw-api:
    image: paw-api:latest
    container_name: paw-api
    restart: always
    network_mode: host
    ports:
      - "3000:3000"
    volumes:
      - /pawvax/api/data:/app/data
      - /pawvax/api/uploads:/app/uploads
    environment:
      PORT: 3000
      NODE_ENV: production
      JWT_SECRET: ${JWT_SECRET}
      DB_PATH: /app/data/paw.db
      UPLOADS_DIR: /app/uploads
      GEMINI_API_KEY: ${GEMINI_API_KEY}
      ADMIN_EMAIL: ${ADMIN_EMAIL}
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:3000/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"]
      interval: 10s
      timeout: 5s
      retries: 3

  paw-pwa:
    image: paw-pwa:latest
    container_name: paw-pwa
    restart: always
    network_mode: host
    ports:
      - "8080:80"
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost/index.html"]
      interval: 10s
      timeout: 5s
      retries: 3

networks:
  default:
    name: pawvax-net
    external: true
```

### 9.2 .env für docker-compose

Erstelle `/pawvax/.env`:

```bash
JWT_SECRET=your-secret-from-api-env
GEMINI_API_KEY=
ADMIN_EMAIL=admin@example.com
```

### 9.3 Container mit docker-compose starten

```bash
cd /pawvax

# Netzwerk erstellen (falls noch nicht vorhanden)
podman network create pawvax-net || true

# Container starten
podman-compose up -d

# Logs prüfen
podman-compose logs -f
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
  -v /pawvax/api/data:/app/data \
  -v /pawvax/api/uploads:/app/uploads \
  -e PORT=3000 \
  -e JWT_SECRET="$(cat /pawvax/api/.env | grep JWT_SECRET | cut -d= -f2)" \
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
caddy reload --config /pawvax/proxy/Caddyfile
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
caddy validate --config /pawvax/proxy/Caddyfile

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
ls -la /pawvax/api/data/
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
du -sh /pawvax/api/data/
du -sh /pawvax/api/uploads/

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

## 16. Hetzner Cloud Firewall Setup

Da du die **Hetzner Cloud Firewall** nutzt, sind keine lokalen `ufw`/`iptables` Befehle nötig.

### 16.1 Firewall im Cloud Console konfigurieren

1. **Melde dich an:** https://console.hetzner.cloud
2. **Gehe zu:** Dein Projekt → Firewalls
3. **Erstelle eine neue Firewall** oder nutze eine existierende
4. **Konfiguriere Inbound-Regeln:**

| Protokoll | Port | Quelle | Zweck |
|-----------|------|--------|-------|
| TCP | 22 | Überall (0.0.0.0/0, ::/0) | SSH |
| TCP | 80 | Überall (0.0.0.0/0, ::/0) | HTTP → Caddy |
| TCP | 443 | Überall (0.0.0.0/0, ::/0) | HTTPS → Caddy |
| TCP | 3000 | Überall ODER spezifisches Netzwerk | API (optional) |
| TCP | 8080 | Überall ODER spezifisches Netzwerk | PWA (optional) |

5. **Outbound-Regeln:** Erlaube alles (default)
   ```
   Protokoll: TCP/UDP
   Port: Alle (0-65535)
   Ziel: Überall
   ```

6. **Firewall zum Server zuweisen:**
   - Wähle die Firewall aus
   - Klicke "Server hinzufügen"
   - Wähle deinen Server

### 16.2 Prüfung

```bash
# Teste von extern ob Ports offen sind
curl -I https://pawapi.oxs.at
curl -I https://paw.oxs.at

# oder mit nc/nmap
nmap -p 22,80,443 pawapi.oxs.at
```

**Wichtig:** Die Firewall arbeitet auf Server-Ebene bei Hetzner, nicht auf dem Server selbst. Du brauchst keine lokalen Firewall-Commands!

---

## 17. Weitere Befehle

### Stoppen

```bash
podman-compose down
# oder
systemctl stop paw-api paw-pwa
```

### Neu bauen

```bash
podman build --no-cache -t paw-api:latest /pawvax/api
podman build --no-cache -t paw-pwa:latest /pawvax/pwa
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
