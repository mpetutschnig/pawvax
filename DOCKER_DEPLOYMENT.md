# PAW Docker/Podman Deployment auf Hetzner

Production-Ready Setup mit Podman/Docker für Hetzner Server.

## Dateien

- **docker-compose.yml** — Main Compose-Datei mit Server + PWA Services
- **server/Dockerfile** — Node.js Alpine Container für Fastify Server
- **pwa/Dockerfile** — Multi-stage Build: Node.js Builder + Nginx Production
- **pwa/nginx.conf** — Nginx Konfiguration mit Proxy, Caching, Security Headers
- **.env.docker** — Environment-Variable Vorlage

## Voraussetzungen

- Podman oder Docker installiert
- Podman Compose oder Docker Compose
- SSH-Zugriff auf Hetzner Server

## Installation auf Hetzner

### 1. Repository clonen

```bash
ssh root@your-hetzner-server
cd /opt
git clone https://github.com/your-repo/paw.oxs.at.git
cd paw.oxs.at
```

### 2. Environment konfigurieren

```bash
cp .env.docker .env
nano .env  # Bearbeite JWT_SECRET und andere Variablen
```

**Wichtig:** 
- `JWT_SECRET` muss sicher sein (z.B. `openssl rand -base64 32`)
- Optional: `GEMINI_API_KEY` für bessere OCR eintragen

### 3. Mit Podman starten

```bash
# Installation (wenn noch nicht vorhanden)
sudo apt update && sudo apt install -y podman podman-compose

# Starten
podman-compose up -d

# Status überprüfen
podman-compose ps
podman-compose logs server
podman-compose logs pwa
```

### 4. Mit Docker Compose starten (falls Podman nicht verfügbar)

```bash
# Installation
sudo apt install docker.io docker-compose

# Starten
sudo docker-compose up -d

# Status
sudo docker-compose ps
```

## Verwendung

### Container starten/stoppen

```bash
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

### Datenbankn zugreifen

```bash
# In den Server-Container gehen
podman exec -it paw-server sh

# SQLite öffnen
sqlite3 /app/data/paw.db

# Beispiel: Admin-Benutzer erstellen
sqlite3 /app/data/paw.db "UPDATE accounts SET role='admin', verified=1 WHERE email='admin@example.com'"
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

### Mit Certbot

```bash
# Installation
sudo apt install certbot python3-certbot-nginx

# Zertifikat beantragen
sudo certbot certonly --standalone -d your-domain.com

# Pfade in nginx.conf eintragen (ca. Zeile 115-130)
# ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem
# ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem

# SSL im nginx.conf uncomment (siehe pwa/nginx.conf)
# Dann Container neu starten
podman-compose up -d
```

### Mit Certbot + Auto-Renewal

```bash
# Auto-Renewal testen
sudo certbot renew --dry-run

# Crontab für automatische Erneuerung
sudo crontab -e
# Eintrag: 0 12 * * * /usr/bin/certbot renew --quiet && podman-compose -f /opt/paw.oxs.at/docker-compose.yml up -d
```

## Backup & Datensicherung

### Volumes sichern

```bash
# Backup der Datenbank + Uploads
podman run --rm -v paw-oxs-at_db_data:/data -v $(pwd):/backup \
  alpine tar czf /backup/db_backup_$(date +%Y%m%d_%H%M%S).tar.gz -C /data .

podman run --rm -v paw-oxs-at_uploads_data:/data -v $(pwd):/backup \
  alpine tar czf /backup/uploads_backup_$(date +%Y%m%d_%H%M%S).tar.gz -C /data .

# Cron für tägliche Backups
0 2 * * * /opt/paw.oxs.at/backup.sh
```

### backup.sh erstellen

```bash
#!/bin/bash
BACKUP_DIR="/opt/backups"
mkdir -p $BACKUP_DIR

# DB Backup
podman run --rm -v paw-oxs-at_db_data:/data -v $BACKUP_DIR:/backup \
  alpine tar czf /backup/db_$(date +\%Y\%m\%d_\%H\%M\%S).tar.gz -C /data .

# Uploads Backup
podman run --rm -v paw-oxs-at_uploads_data:/data -v $BACKUP_DIR:/backup \
  alpine tar czf /backup/uploads_$(date +\%Y\%m\%d_\%H\%M\%S).tar.gz -C /data .

# Alte Backups löschen (älter als 30 Tage)
find $BACKUP_DIR -type f -mtime +30 -delete
```

## Performance & Skalierung

### Nginx caching aktivieren

Nginx ist bereits konfiguriert für:
- Gzip Kompression
- Static File Caching (365 Tage)
- Service Worker ohne Cache (für Updates)

### Memory Limits setzen

In `docker-compose.yml` (optional):

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

## Troubleshooting

### Port 3000 / 80 / 443 bereits in Verwendung

```bash
# Aktuell laufende Prozesse anzeigen
lsof -i :3000
lsof -i :80
lsof -i :443

# Oder mit netstat
ss -tlnp | grep -E ":3000|:80|:443"

# Container stoppen
podman-compose down
```

### Container startet nicht

```bash
# Logs detailliert
podman-compose logs server --tail=50

# Container interaktiv debuggen
podman run -it --rm -v $(pwd)/server:/app server:latest sh
```

### WebSocket Probleme

- Nginx WebSocket Proxy ist konfiguriert (pwa/nginx.conf)
- Connection wird upgegradet mit `Upgrade` Header
- Timeout ist auf 86400 Sekunden (24h) gesetzt

Wenn WebSocket nicht funktioniert:
```bash
# Server-Logs prüfen
podman logs paw-server | grep -i websocket

# Firewall prüfen (Hetzner Cloud)
# Port 80/443 sollten offen sein
```

### Datenbank korrupt

```bash
# Backup erstellen
podman exec paw-server cp /app/data/paw.db /app/data/paw.db.backup

# Datenbank prüfen
podman exec paw-server sqlite3 /app/data/paw.db "PRAGMA integrity_check;"

# Im Notfall: Datenbank neu initialisieren (VORSICHT: Alle Daten weg!)
podman exec paw-server rm /app/data/paw.db
podman-compose restart server
```

## Updates

### Code-Updates deployieren

```bash
# Repository aktualisieren
cd /opt/paw.oxs.at
git pull

# Images neu bauen + Container starten
podman-compose up -d --build

# Alte Images aufräumen (optional)
podman image prune -a --force
```

## Monitoring

### Health Checks

Server und PWA haben Health Checks konfiguriert:

```bash
# Container Status
podman-compose ps

# Manuell Health Check
curl http://your-hetzner-ip/health           # Server
curl http://your-hetzner-ip/index.html       # PWA
```

### Disk Space monitoring

```bash
# Volumes Größe
podman exec paw-server du -sh /app/data /app/uploads

# Logs rotieren (optional)
podman logs paw-server --since 24h > /tmp/server_24h.log
```

## Sicherheit

✅ Bereits implementiert:
- Nginx Security Headers (HSTS, X-Frame-Options, CSP etc.)
- CORS konfiguriert im Server
- JWT Authentication für alle API-Routen
- Rate Limiting im Server
- Client-side Input-Validierung

⚠️ Zu konfigurieren:
- SSL/TLS Zertifikate (siehe Let's Encrypt Sektion)
- Firewall-Regeln auf Hetzner (nur Port 80/443 öffnen)
- JWT_SECRET ändern (✅ vor dem ersten Deploy)
- GEMINI_API_KEY sicher verwalten (nicht in Git!)

## Support

Für Probleme: Check Server-Logs, Firewall-Regeln, und Environment-Variablen.
