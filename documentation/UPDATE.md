# PAW - Deployment & Update Runbook (Single-Pod Rootless Podman + PostgreSQL)

Dieses Dokument ist ein **Top-to-Bottom Runbook** für:
- **Initiales Deployment** auf Hetzner (Alma Linux 10, ARM64)
- **Updates** von laufenden Produktionssystemen
- **Rollback** und Debugging

Alle Befehle laufen als `root` auf dem Hetzner-Server.


## 🎯 ARCHITEKTUR-ÜBERBLICK

```
Single Pod (paw-stack) mit 5 Containern:
├── PostgreSQL 16 (Port 5432 intern)
├── Node.js API / Fastify (Port 3000 intern)
├── Nginx PWA (Port 8080 intern)
├── Caddy Reverse Proxy (Port 80/443 extern)
└── [optional: Postgres Backup, Log Aggregation, etc.]

Persistent Volumes:
/home/paw-app/data/
├── postgres/        → PostgreSQL data directory
├── uploads/         → API uploads
├── pwa/             → PWA static files & nginx config
└── proxy/ssl/       → TLS certificates
```

---

## 🔧 VORBEREITUNG (Einmalig beim ersten Deployment)

### Schritt 1: Hetzner-Server Zugriff & Basis-Setup

```bash
ssh root@alma.oxs.at
```

Basis-Pakete aktualisieren:

```bash
dnf update -y
dnf install -y git podman podman-compose openssl curl wget
```

Git User erstellen (für `git pull` Operationen):

```bash
useradd -m -s /bin/bash paw-git
```

Repository klonen (mit `paw-git` User):

```bash
mkdir -p /git
chown paw-git:paw-git /git
su -s /bin/bash paw-git -c "cd /git && git clone https://github.com/mpetutschnig/pawvax.git"
```

Repository-Berechtigungen korrigieren (für später Docker Builds):

```bash
chmod -R a+rX /git/pawvax
chmod -R a+w /git/pawvax/server /git/pawvax/pwa /git/pawvax/podman
```

### Schritt 2: Environment-Datei vorbereiten

`.env.podman` im Repository-Root erstellen mit Secrets:

```bash
cat > /git/pawvax/.env.podman << 'EOF'
DB_PASSWORD=<YOUR_RANDOM_PASSWORD>
JWT_SECRET=<YOUR_RANDOM_SECRET>
EOF

chmod 600 /git/pawvax/.env.podman
```

Sichere diese Secrets separat auf (nicht in Git!)

### Schritt 3: Automatisches Setup ausführen

Das Skript `scripts/setup-rootless-podman.sh` kümmert sich um den Rest:

```bash
cd /git/pawvax
bash scripts/setup-rootless-podman.sh prepare
```

Was dieses Skript macht:
- ✅ Erstellt User `paw-app`
- ✅ Aktiviert systemd linger für `paw-app`
- ✅ Erstellt Verzeichnisstruktur unter `/home/paw-app/data/`
- ✅ Kopiert Config-Dateien
- ✅ Generiert self-signed TLS Certificates
- ✅ Setzt Berechtigungen korrekt

Überprüf den Status:

```bash
su -s /bin/bash paw-app -c "ls -la /home/paw-app/"
su -s /bin/bash paw-app -c "ls -la /home/paw-app/data/"
```

---

## 🚀 INITIAL DEPLOYMENT

### Schritt 4: Pod mit allen Containern starten

Das Deployment-Skript baut Images und startet den Pod:

```bash
cd /git/pawvax
bash scripts/setup-rootless-podman.sh deploy
```

Was passiert:
1. Baut alle 5 Container-Images
2. Erstellt `paw-stack` Pod mit Port-Bindungen (80, 443)
3. Startet alle Container in korrekter Reihenfolge:
   - PostgreSQL (mit Health-Check)
   - Node.js API (wartet auf PostgreSQL)
   - PWA (Nginx static files)
   - Caddy (Let's Encrypt SSL termination)
4. Generiert systemd User-Units für Auto-Start

Auf Fehler prüfen:

```bash
bash scripts/setup-rootless-podman.sh status
```

Output sollte zeigen:
```
Container Status:
  paw-postgres    HEALTHY  (health status)
  paw-api         Up       (Fastify API)
  paw-pwa         Up       (Nginx PWA)
  paw-caddy       Up       (Caddy reverse proxy)
```

### Schritt 5: Funktionalität verifizieren

Health-Endpoints testen:

```bash
# Via localhost (Self-Signed)
curl -k https://localhost/api/health
# Response: {"status":"ok"}

# Database Check
curl -k https://localhost/api/health/db
# Response: {"status":"ok","database":"connected"}
```

**Wichtig:** Caddy braucht 30-120 Sekunden, um Let's Encrypt Cert zu provisionen. Logs überwachen:

```bash
su -s /bin/bash paw-app -c "XDG_RUNTIME_DIR=/run/user/$(id -u paw-app) podman logs paw-caddy -f"
```

Auf folgende Zeilen warten:
```
[INFO] [paw.oxs.at] certificate obtained successfully
[INFO] [paw.oxs.at] Deploying certificate
```

### Schritt 6: Tests ausführen

API-Tests gegen die laufende Instanz:

```bash
cd /git/pawvax/server
npm test
```

Falls Tests fehlschlagen:
- Caddy Logs prüfen (siehe oben)
- API Logs: `podman logs paw-api`
- PostgreSQL Logs: `podman logs paw-postgres`

---

## 🔄 UPDATES (Nach Code-Änderungen)

Folge diese Reihenfolge strikt:

### Schritt 1: Code auf Hetzner pullen

```bash
su -s /bin/bash paw-git -c "cd /git/pawvax && git pull"
```

Überprüf Version Bumps in beiden `package.json`:

```bash
grep '"version"' /git/pawvax/server/package.json /git/pawvax/pwa/package.json
```

Sollte Format `YYYY-MM-DD_HHmm` sein (z.B. `2026-05-05_1752`)

### Schritt 2: Pod rebuilden

Das Skript erkennt automatisch neue Images und startet Container neu:

```bash
cd /git/pawvax
bash scripts/setup-rootless-podman.sh deploy
```

Das dauert ~2-5 Minuten je nach Image-Größe.

### Schritt 3: Tests direkt gegen Produktivinstanz

```bash
cd /git/pawvax/server
npm test
```

Oder gegen spezifische Test-Datenbank:

```bash
cd /git/pawvax
API_URL="https://localhost/api" npm test
```

### Schritt 4: Health & Status überprüfen

```bash
bash scripts/setup-rootless-podman.sh status
curl -k https://localhost/api/health
curl -k https://paw.oxs.at/api/health  # Nach DNS/Let's Encrypt Propagation
```

---

## 🛠️ DEBUGGING & TROUBLESHOOTING

### Container-Logs anschauen

```bash
# API Logs
su -s /bin/bash paw-app -c "XDG_RUNTIME_DIR=/run/user/$(id -u paw-app) podman logs paw-api -f"

# PostgreSQL Logs
su -s /bin/bash paw-app -c "XDG_RUNTIME_DIR=/run/user/$(id -u paw-app) podman logs paw-postgres"

# Caddy (Let's Encrypt) Logs
su -s /bin/bash paw-app -c "XDG_RUNTIME_DIR=/run/user/$(id -u paw-app) podman logs paw-caddy"

# PWA Logs
su -s /bin/bash paw-app -c "XDG_RUNTIME_DIR=/run/user/$(id -u paw-app) podman logs paw-pwa"
```

### Container in einen Pod starten

Manueller Test eines einzelnen Containers:

```bash
su -s /bin/bash paw-app -c "cd /git/pawvax && \
  XDG_RUNTIME_DIR=/run/user/\$(id -u paw-app) \
  podman run -it --rm --pod paw-stack \
  localhost/paw-api:latest \
  /bin/sh"
```

### Datenbank-Zugriff

Direkt in PostgreSQL-Container gehen:

```bash
su -s /bin/bash paw-app -c "XDG_RUNTIME_DIR=/run/user/\$(id -u paw-app) \
  podman exec -it paw-postgres psql -U pawvax -d pawvax"
```

### Pod/systemd status

Systemd User-Unit Status:

```bash
su -s /bin/bash paw-app -c "XDG_RUNTIME_DIR=/run/user/\$(id -u paw-app) \
  systemctl --user status pod-paw-stack.service"
```

Auto-Start überprüfen:

```bash
su -s /bin/bash paw-app -c "XDG_RUNTIME_DIR=/run/user/\$(id -u paw-app) \
  systemctl --user is-enabled pod-paw-stack.service"
```

---

## 📋 WARTUNG & CLEANUP

### Pod neu starten (ohne neue Images zu bauen)

```bash
su -s /bin/bash paw-app -c "XDG_RUNTIME_DIR=/run/user/\$(id -u paw-app) \
  systemctl --user restart pod-paw-stack.service"
```

### Alte Images & Layer löschen

```bash
bash scripts/setup-rootless-podman.sh cleanup
```

Danach muß `deploy` erneut laufen, um neuen Pod zu erstellen.

### PostgreSQL Daten backup

```bash
su -s /bin/bash paw-app -c "XDG_RUNTIME_DIR=/run/user/\$(id -u paw-app) \
  podman exec paw-postgres pg_dump -U pawvax pawvax > /home/paw-app/data/pawvax-backup-\$(date +%Y%m%d-%H%M%S).sql"
```

### Pod komplett entfernen (für Clean-Slate Reset)

```bash
bash scripts/setup-rootless-podman.sh cleanup
rm -rf /home/paw-app/data
bash scripts/setup-rootless-podman.sh deploy
```

⚠️ Achtung: Alle Daten werden gelöscht!

---

## 📊 MONITORING & LOGS

### Realtime Pod-Status

```bash
watch -n 2 'bash scripts/setup-rootless-podman.sh status'
```

### Journalctl für systemd User-Unit

```bash
journalctl --user -u pod-paw-stack.service -f
```

### HTTP-Traffic Logging (Caddy)

Caddy loggt in JSON-Format auf stdout:

```bash
su -s /bin/bash paw-app -c "XDG_RUNTIME_DIR=/run/user/\$(id -u paw-app) \
  podman logs paw-caddy | jq '.request.uri' 2>/dev/null | tail -20"
```

---

## 🔐 SSL/TLS Certificates

### Self-Signed (Localhost/HTTPS)

Automatisch generiert in `/home/paw-app/data/proxy/ssl/`:
- `fullchain.pem` - Self-signed cert
- `privkey.pem` - Private key
- Gültig für 365 Tage

### Let's Encrypt (paw.oxs.at)

Caddy verwaltet automatisch:
- Zertifikat wird von Let's Encrypt provisioned
- Auto-Renewal 30 Tage vor Ablauf
- Stored in Caddy's cache directory

Caddy Logs überwachen:

```bash
su -s /bin/bash paw-app -c "XDG_RUNTIME_DIR=/run/user/\$(id -u paw-app) \
  podman logs paw-caddy | grep -i 'certificate\|acme'"
```

---

## 📝 CHECKLISTE FÜR PRODUKTIVES DEPLOYMENT

- [ ] `.env.podman` mit sicheren Secrets erstellt
- [ ] `scripts/setup-rootless-podman.sh prepare` erfolgreich gelaufen
- [ ] `scripts/setup-rootless-podman.sh deploy` erfolgreich gelaufen
- [ ] `curl -k https://localhost/api/health` returnt `{"status":"ok"}`
- [ ] Caddy-Logs zeigen: `certificate obtained successfully`
- [ ] `npm test` läuft erfolgreich
- [ ] `systemctl --user status pod-paw-stack.service` zeigt: active (running)
- [ ] DNS `paw.oxs.at` pointet auf Server IP
- [ ] `curl https://paw.oxs.at/api/health` returnt `{"status":"ok"}`

---

## 🆘 NOTFALL-KONTAKTE & BEFEHLE

**Pod komplett neustarten:**
```bash
su -s /bin/bash paw-app -c "XDG_RUNTIME_DIR=/run/user/\$(id -u paw-app) \
  systemctl --user restart pod-paw-stack.service"
sleep 5
bash scripts/setup-rootless-podman.sh status
```

**API Logs live anschauen:**
```bash
su -s /bin/bash paw-app -c "XDG_RUNTIME_DIR=/run/user/\$(id -u paw-app) \
  podman logs -f paw-api 2>&1 | head -50"
```

**Schneller health check:**
```bash
curl -k https://localhost/api/health 2>/dev/null | jq . && \
  curl -k https://paw.oxs.at/api/health 2>/dev/null | jq .
```

---

**Letzte Aktualisierung:** 2026-05-05  
**Version Format:** `YYYY-MM-DD_HHmm` (beide package.json)  
**Autor:** Deployment Automation Script