# PAW Podman Deployment auf Hetzner

Production-Ready Setup mit **Podman & systemd User Services** für Hetzner Server.

**Benutzer:** `pawvax` (Lingering User)  
**Container-Runtime:** Podman (Rootless!)  
**Orchestrierung:** podman-compose  
**Systemd Ziel:** User Services (kein Root!)

## Dateien

- **podman-compose.yml** — Compose-Datei mit Server + PWA Services
- **server/Dockerfile** — Node.js Alpine Container für Fastify Server
- **pwa/Dockerfile** — Multi-stage Build: Node.js Builder + Nginx Production
- **pwa/nginx.conf** — Nginx Konfiguration mit Proxy, Caching, Security Headers
- **.env.podman** — Environment-Variable Vorlage
- **systemd/paw.service** — Systemd User Service (autostarten)

## Voraussetzungen

- **Podman** installiert (Rootless Mode)
- **podman-compose** installiert
- User `pawvax` existiert (Lingering User)
- SSH-Zugriff auf Hetzner Server

## Installation auf Hetzner (Schritt-für-Schritt)

### 1. SSH auf Server, wechsel zu `pawvax`

```bash
ssh root@your-hetzner-server

# Zu pawvax wechseln
su - pawvax

# Oder direkt SSH als pawvax
ssh pawvax@your-hetzner-server
```

### 2. Repository clonen

```bash
# Im Home von pawvax
cd ~/
git clone https://github.com/your-repo/paw.oxs.at.git
cd paw.oxs.at
```

### 3. Podman User-Namespace einrichten (einmalig)

```bash
# Als root auf dem Server:
ssh root@your-hetzner-server

# User-Namespace für pawvax aktivieren (falls noch nicht done)
usermod --add-subuids 100000-165535 pawvax
usermod --add-subgids 100000-165535 pawvax

# Lingering aktivieren (damit Services ohne Login laufen)
loginctl enable-linger pawvax
loginctl show-user pawvax | grep Linger  # Sollte "Linger=yes" anzeigen

# Podman Rootless konfigurieren (optional, aber empfohlen)
# Das wurde normalerweise bei Podman Installation gemacht
```

### 4. Als `pawvax`: Environment konfigurieren

```bash
cd ~/paw.oxs.at

# .env erstellen mit sicheren Werten
cp .env.podman .env

# JWT_SECRET generieren (wichtig!)
openssl rand -base64 32

# .env Datei bearbeiten
nano .env
```

**Beispiel .env:**
```ini
JWT_SECRET=your-generated-secure-secret-here
GEMINI_API_KEY=
NODE_ENV=production
```

### 5. Podman Compose starten (manuell testen)

```bash
# Als pawvax in ~/paw.oxs.at/
podman-compose up -d

# Status prüfen
podman-compose ps
podman-compose logs server
podman-compose logs pwa
```

**Falls Fehler:** `podman-compose logs` anschauen. Häufige Probleme:
- Port 80/443 bereits in Verwendung
- Podman Socket nicht erreichbar → `systemctl --user status podman`
- Datenbank-Permissions → `podman-compose down` und nochmal `up -d`

### 6. Systemd User Service einrichten (autostarten)

```bash
# Als pawvax in ~/.config/systemd/user/
mkdir -p ~/.config/systemd/user/

# Service-Datei erstellen
cat > ~/.config/systemd/user/paw.service << 'EOF'
[Unit]
Description=PAW - Digitaler Tierimpfpass
After=podman.service
Wants=podman.service

[Service]
Type=simple
WorkingDirectory=%h/paw.oxs.at
ExecStart=/usr/bin/podman-compose -f podman-compose.yml up
ExecStop=/usr/bin/podman-compose -f podman-compose.yml down
Restart=on-failure
RestartSec=10

# Umgebung
Environment="PODMAN_USERNS=auto"
EnvironmentFile=%h/paw.oxs.at/.env

[Install]
WantedBy=default.target
EOF

# Service laden und aktivieren
systemctl --user daemon-reload
systemctl --user enable paw
systemctl --user start paw

# Status prüfen
systemctl --user status paw
systemctl --user logs paw -f  # Live Logs
```

**Service Management als `pawvax`:**

```bash
# Service starten/stoppen/neustarten
systemctl --user start paw
systemctl --user stop paw
systemctl --user restart paw

# Status
systemctl --user status paw

# Logs anschauen
journalctl --user -u paw -f          # Live
journalctl --user -u paw --since 1h  # Letzte Stunde
```

## Verwendung

### Container starten/stoppen (manuell)

```bash
# Als pawvax in ~/paw.oxs.at/
cd ~/paw.oxs.at

# Starten
podman-compose up -d

# Logs anschauen
podman-compose logs -f server      # Server-Logs
podman-compose logs -f pwa         # Nginx-Logs

# Stoppen
podman-compose down

# Neubau + Start (nach Code-Änderungen)
podman-compose up -d --build
```

### Mit systemd (empfohlen)

```bash
# Starten/Stoppen über Service
systemctl --user start/stop/restart paw

# Logs
journalctl --user -u paw -f
```

### Datenbank zugreifen

```bash
# Als pawvax in ~/paw.oxs.at/

# In den Server-Container gehen
podman-compose exec server sh

# SQLite öffnen (Datenbank ist unter /app/data/ im Container)
sqlite3 /app/data/paw.db

# Beispiel: Admin-Benutzer erstellen
sqlite3 /app/data/paw.db "UPDATE accounts SET role='admin', verified=1 WHERE email='admin@example.com'"

# Oder direkt vom Host aus:
sqlite3 ~/.local/share/containers/storage/volumes/paw_oxs_at_db_data/_data/paw.db "SELECT * FROM accounts LIMIT 5;"
```

### Logs

```bash
# Alle Logs
podman-compose logs -f

# Nur Fehler
podman-compose logs | grep -i error

# Server-Logs persistent speichern
podman-compose logs server > server.log
```

## URLs

Nach dem Start verfügbar unter:

- **App**: http://your-hetzner-ip/ oder https://your-domain.com
- **Admin**: http://your-hetzner-ip/admin
- **API**: http://your-hetzner-ip/api/

## SSL/HTTPS mit Let's Encrypt

### Mit Certbot (als `root` oder mit `sudo`)

```bash
# Installation (als root)
sudo apt install certbot

# Zertifikat beantragen (standalone = kein Webserver nötig)
sudo certbot certonly --standalone -d your-domain.com

# Zertifikate kopieren in pawvax-Verzeichnis
sudo mkdir -p /home/pawvax/paw.oxs.at/ssl
sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem /home/pawvax/paw.oxs.at/ssl/cert.pem
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem /home/pawvax/paw.oxs.at/ssl/key.pem
sudo chown pawvax:pawvax /home/pawvax/paw.oxs.at/ssl/*.pem
```

### nginx.conf für SSL aktivieren

```bash
# Als pawvax, nginx.conf bearbeiten:
nano ~/paw.oxs.at/pwa/nginx.conf

# Uncomment die HTTPS-Sektion (ca. Zeile 115-130) und setze domain:
# server {
#     listen 443 ssl http2;
#     ...
#     ssl_certificate /etc/nginx/ssl/cert.pem;
#     ssl_certificate_key /etc/nginx/ssl/key.pem;
# }

# Container neu starten
cd ~/paw.oxs.at
podman-compose up -d
```

### Auto-Renewal mit systemd Timer (empfohlen)

```bash
# Als root: Systemd Timer für Renewal
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer

# Oder manuell mit Cron (as pawvax):
crontab -e

# Eintrag hinzufügen:
0 3 * * * sudo certbot renew --quiet && /home/pawvax/paw.oxs.at/ssl_refresh.sh
```

### ssl_refresh.sh für Zertifikat-Updates

```bash
#!/bin/bash
# Als pawvax: ~/paw.oxs.at/ssl_refresh.sh

sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem /home/pawvax/paw.oxs.at/ssl/cert.pem
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem /home/pawvax/paw.oxs.at/ssl/key.pem
sudo chown pawvax:pawvax /home/pawvax/paw.oxs.at/ssl/*.pem

# Container neuladen (SIGHUP für Nginx)
cd /home/pawvax/paw.oxs.at
podman-compose exec pwa nginx -s reload

echo "[$(date)] SSL Certificate aktualisiert" >> /home/pawvax/paw.oxs.at/backup_logs/ssl_renewal.log
```

```bash
chmod +x ~/paw.oxs.at/ssl_refresh.sh
```

## Backup & Datensicherung

### Volumes sichern (als `pawvax`)

```bash
# Zielverzeichnis erstellen
mkdir -p ~/backups

# Backup der Datenbank
podman run --rm -v paw_oxs_at_db_data:/data -v ~/backups:/backup \
  alpine tar czf /backup/db_backup_$(date +%Y%m%d_%H%M%S).tar.gz -C /data .

# Backup der Uploads
podman run --rm -v paw_oxs_at_uploads_data:/data -v ~/backups:/backup \
  alpine tar czf /backup/uploads_backup_$(date +%Y%m%d_%H%M%S).tar.gz -C /data .

# Verzeichnis listen
ls -lh ~/backups/
```

### Automatische Backups mit Cron (als `pawvax`)

```bash
# Crontab editieren
crontab -e

# Einträge hinzufügen:
0 2 * * * /home/pawvax/paw.oxs.at/backup.sh
```

### backup.sh erstellen

```bash
#!/bin/bash
set -e

BACKUP_DIR="/home/pawvax/backups"
LOGS_DIR="/home/pawvax/paw.oxs.at/backup_logs"

mkdir -p "$BACKUP_DIR" "$LOGS_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="$LOGS_DIR/backup_$TIMESTAMP.log"

{
  echo "[$(date)] Starte Backup..."
  
  # DB Backup
  echo "[$(date)] DB Backup..."
  podman run --rm -v paw_oxs_at_db_data:/data -v $BACKUP_DIR:/backup \
    alpine tar czf /backup/db_$TIMESTAMP.tar.gz -C /data .
  
  # Uploads Backup
  echo "[$(date)] Uploads Backup..."
  podman run --rm -v paw_oxs_at_uploads_data:/data -v $BACKUP_DIR:/backup \
    alpine tar czf /backup/uploads_$TIMESTAMP.tar.gz -C /data .
  
  # Alte Backups löschen (älter als 30 Tage)
  echo "[$(date)] Lösche alte Backups..."
  find $BACKUP_DIR -type f -mtime +30 -delete
  
  # Größe anzeigen
  du -sh $BACKUP_DIR
  
  echo "[$(date)] Backup fertig!"
} | tee "$LOG_FILE"
```

### backup.sh ausführbar machen

```bash
chmod +x ~/paw.oxs.at/backup.sh

# Manuell testen
~/paw.oxs.at/backup.sh
```

## Performance & Skalierung

### Nginx caching aktivieren

Nginx ist bereits konfiguriert für:
- Gzip Kompression
- Static File Caching (365 Tage)
- Service Worker ohne Cache (für Updates)

### Memory/CPU Limits setzen (optional)

In `podman-compose.yml` als pawvax:

```yaml
services:
  server:
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 512M
        reservations:
          cpus: '0.5'
          memory: 256M

  pwa:
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 256M
```

Dann `podman-compose up -d` neustarten.

## Troubleshooting

### Port 3000 / 80 / 443 bereits in Verwendung (als `pawvax`)

```bash
# Prozesse anzeigen
ss -tlnp | grep -E ":3000|:80|:443"

# Oder mit lsof
lsof -i :3000
lsof -i :80
lsof -i :443

# Podman-Container stoppen
cd ~/paw.oxs.at
podman-compose down
```

### Container startet nicht

```bash
# Logs detailliert (als pawvax)
cd ~/paw.oxs.at
podman-compose logs server --tail=50
podman-compose logs pwa --tail=50

# Oder über Systemd
journalctl --user -u paw -n 100

# Container interaktiv debuggen
podman run -it --rm -v ~/paw.oxs.at/server:/app node:22-alpine sh
```

### WebSocket Probleme

- Nginx WebSocket Proxy ist konfiguriert (pwa/nginx.conf)
- Connection wird upgegradet mit `Upgrade` Header
- Timeout ist auf 86400 Sekunden (24h) gesetzt

Wenn WebSocket nicht funktioniert:
```bash
# Als pawvax
cd ~/paw.oxs.at

# Server-Logs prüfen
podman-compose logs server | grep -i websocket

# Nginx-Konfiguration testen
podman-compose exec pwa nginx -t

# Firewall prüfen (Hetzner Cloud)
# Port 80/443 sollten offen sein
```

### Datenbank korrupt

```bash
# Als pawvax in ~/paw.oxs.at/
cd ~/paw.oxs.at

# Backup erstellen
podman-compose exec server cp /app/data/paw.db /app/data/paw.db.backup

# Datenbank prüfen
podman-compose exec server sqlite3 /app/data/paw.db "PRAGMA integrity_check;"

# Im Notfall: Datenbank neu initialisieren (VORSICHT: Alle Daten weg!)
podman-compose exec server rm /app/data/paw.db
podman-compose restart server
```

### Podman Socket nicht erreichbar

```bash
# Systemd User Socket starten
systemctl --user start podman.socket

# Oder neu starten
systemctl --user restart podman.socket

# Status prüfen
systemctl --user status podman.socket
```

### Container-Images bauen langsam

```bash
# Container-Storage cleanen (nur Zwischenergebnisse löschen)
podman system prune -a --force

# Dann neu bauen
cd ~/paw.oxs.at
podman-compose up -d --build
```

## Updates

### Code-Updates deployieren (als `pawvax`)

```bash
# Repository aktualisieren
cd ~/paw.oxs.at
git pull

# Images neu bauen + Container starten
podman-compose up -d --build

# Alte Images aufräumen
podman image prune -a --force

# Service neustarten (falls mit Systemd)
systemctl --user restart paw
```

## Monitoring

### Health Checks

Server und PWA haben Health Checks konfiguriert:

```bash
# Container Status (als pawvax)
cd ~/paw.oxs.at
podman-compose ps

# Manuell Health Check
curl http://your-hetzner-ip/index.html       # PWA
curl http://localhost/api/health             # Server (vom Host)
```

### Systemd Status monitoring

```bash
# Service Status
systemctl --user status paw

# Continuous logs
journalctl --user -u paw -f

# Statistiken
systemctl --user show paw
```

### Disk Space monitoring

```bash
# Volumes Größe (als pawvax)
cd ~/paw.oxs.at

# DB + Uploads
podman-compose exec server du -sh /app/data /app/uploads

# Backups
du -sh ~/backups/

# Gesamter Podman Storage
podman system df
```

## Sicherheit

✅ Bereits implementiert:
- Nginx Security Headers (HSTS, X-Frame-Options, CSP etc.)
- CORS konfiguriert im Server
- JWT Authentication für alle API-Routen
- Rate Limiting im Server
- Client-side Input-Validierung
- Rootless Podman (pawvax Benutzer, nicht root)
- Lingering User für Systemd Services

⚠️ Zu konfigurieren:
- SSL/TLS Zertifikate (siehe Let's Encrypt Sektion) ← **WICHTIG für Produktion**
- Firewall-Regeln auf Hetzner (nur Port 80/443 öffnen)
- JWT_SECRET ändern (✅ vor dem ersten Deploy)
- GEMINI_API_KEY sicher verwalten (nicht in Git!)
- Regelmäßige Backups (siehe Backup-Sektion)

### Sicherheits-Checkliste vor Produktion

- [ ] `JWT_SECRET` mit `openssl rand -base64 32` generiert
- [ ] HTTPS/SSL Zertifikat installiert (Let's Encrypt)
- [ ] Firewall: nur Port 80/443 offen
- [ ] Datenbank: Erstes Backup gemacht
- [ ] Cron Backup aktiviert
- [ ] Server: Regelmäßige Updates konfiguriert
- [ ] Logs: Monitoring und Rotation eingerichtet

## Support & Logs

```bash
# Systemd Logs anschauen (pawvax)
journalctl --user -u paw -f          # Live
journalctl --user -u paw --since 1h  # Letzte Stunde

# Container Logs direkt
podman-compose logs -f               # Alle
podman-compose logs -f server        # Nur Server
podman-compose logs -f pwa           # Nur PWA

# Detailliertes Debugging
podman-compose logs --timestamps server
```

Für Probleme: Check Systemd Logs, Container-Status, Firewall-Regeln, und Environment-Variablen.
