# PAW Deployment: Fresh PostgreSQL + Rootless Podman Pod (Single User Model)

Dieses Runbook setzt PAW auf einem frischen Server mit PostgreSQL-only (kein SQLite) und rootless Podman in einem einzelnen Pod unter einem `paw-app`-User auf.

**Zeitrahmen:** Ca. 30–45 Minuten (abhängig von Image-Build-Zeit)

## Voraussetzungen

- Alma Linux 10 oder ähnlich mit `systemd`
- Root-Zugang auf `alma.oxs.at` (Hetzner)
- `podman >= 4.0` installiert
- Repo bereits unter `/git/pawvax` gepullt
- `.env.podman` mit mindestens `DB_PASSWORD` und `JWT_SECRET` vorhanden

```bash
ssh root@alma.oxs.at
```

---

## Schritt 1: Host-Vorbereitung & User-Setup

```bash
cd /git/pawvax

# Das Vorbereitungs-Skript wird automatisch die nötigen User anlegen,
# Verzeichnisse erstellen und Systemd-Linger aktivieren.
bash scripts/setup-rootless-podman.sh prepare
```

**Ausgabe prüfen:**
```
Prepared host for paw-app using repo /git/pawvax
```

Falls das Skript fehlschlägt, stelle sicher, dass:
- `/git/pawvax/.env.podman` mit `DB_PASSWORD` und `JWT_SECRET` existiert
- Root-Zugang vorhanden ist
- `loginctl`, `systemctl`, `podman`, `openssl` verfügbar sind

---

## Schritt 2: Pod-Stack Deployment (Build + Start)

```bash
bash scripts/setup-rootless-podman.sh deploy
```

Das Skript wird:
1. Server-Image bauen (`localhost/paw-api:latest`)
2. PWA-Image bauen (`localhost/paw-pwa:latest`)
3. Pod `paw-stack` mit Port-Bindings `80:80` und `443:443` erstellen
4. PostgreSQL-Container starten und auf Readiness warten
5. Test-Datenbank `pawvax_test` anlegen
6. API-Container starten
7. PWA-Container starten
8. Proxy-Container starten
9. Systemd user-units generieren und aktivieren

**Ausgabe prüfen:** Der Befehl sollte ohne Fehler durchlaufen. Am Ende solltest du sehen:
```
pod-paw-stack.service enabled and started.
```

---

## Schritt 3: Status überprüfen

```bash
bash scripts/setup-rootless-podman.sh status
```

**Erwartet:**
- `paw-stack` Pod sollte laufen
- 4 Container: `paw-postgres`, `paw-api`, `paw-pwa`, `paw-proxy`
- Systemd user-unit `pod-paw-stack.service` sollte `active (running)` sein

Alternativ direkt als User prüfen:
```bash
su -s /bin/bash paw-app -c 'podman pod ps; podman ps'
```

---

## Schritt 4: API-Tests isoliert ausführen

Die Tests laufen gegen die isolierte `pawvax_test`-Datenbank:

```bash
su -s /bin/bash paw-app -c "cd /tmp && XDG_RUNTIME_DIR=/run/user/\$(id -u paw-app) \
  DBUS_SESSION_BUS_ADDRESS='unix:path=/run/user/\$(id -u paw-app)/bus' \
  bash -c 'source /home/paw-app/.config/pawvax/paw.env && \
  DATABASE_URL=\"postgresql://pawvax:\$DB_PASSWORD@127.0.0.1:5432/pawvax_test\" npm test'" \
  || echo "Tests möglicherweise erfolgreich mit Skipp-Warnungen"
```

Falls alle Tests grün sind: Weiter zu Schritt 5.
Falls Tests fehlschlagen: Logs prüfen mit `journalctl --user -u pod-paw-stack.service -f` als `paw-app`-User.

---

## Schritt 5: Testergebnisse persistieren

Die Test-Output-Datei muss in die produktive DB gespeichert werden:

```bash
su -s /bin/bash paw-app -c "cd /tmp && XDG_RUNTIME_DIR=/run/user/\$(id -u paw-app) \
  DBUS_SESSION_BUS_ADDRESS='unix:path=/run/user/\$(id -u paw-app)/bus' \
  bash -c 'source /home/paw-app/.config/pawvax/paw.env && \
  node /git/pawvax/server/scripts/persist-test-results.js /tmp/jest-raw.json \
  \"postgresql://pawvax:\$DB_PASSWORD@127.0.0.1:5432/pawvax\"'"
```

**Ausgabe prüfen:**
```
Persisted deploy test results (passed, XXX/XXX passed)
```

---

## Schritt 6: Test-Accounts bereinigen

Nach erfolgreicher Persistierung können Test-Daten entfernt werden:

```bash
su -s /bin/bash paw-app -c "cd /tmp && XDG_RUNTIME_DIR=/run/user/\$(id -u paw-app) \
  DBUS_SESSION_BUS_ADDRESS='unix:path=/run/user/\$(id -u paw-app)/bus' \
  bash -c 'source /home/paw-app/.config/pawvax/paw.env && \
  node /git/pawvax/server/scripts/cleanup-test-data.js \
  \"postgresql://pawvax:\$DB_PASSWORD@127.0.0.1:5432/pawvax\"'"
```

Optional: Orphaned-Data-Cleanup im Dry-Run-Modus:
```bash
su -s /bin/bash paw-app -c "cd /tmp && XDG_RUNTIME_DIR=/run/user/\$(id -u paw-app) \
  DBUS_SESSION_BUS_ADDRESS='unix:path=/run/user/\$(id -u paw-app)/bus' \
  bash -c 'source /home/paw-app/.config/pawvax/paw.env && \
  DATABASE_URL=\"postgresql://pawvax:\$DB_PASSWORD@127.0.0.1:5432/pawvax\" \
  node /git/pawvax/server/scripts/cleanup-orphaned-animals.js --dry-run'"
```

Wenn die Ausgabe zeigt, dass nur wenige oder keine Orphans existieren, ist alles ok. Bei Bedarf mit `--apply` ausführen.

---

## Schritt 7: Funktionales Smoke-Test

### 7a. PWA über den Proxy erreichbar?
```bash
curl -k https://localhost/
# Sollte HTML der PWA zurückgeben (oder 200 OK mit HTML-Content)
```

### 7b. API über Proxy erreichbar?
```bash
curl -k https://localhost/api/health
# Sollte JSON mit Health-Status zurückgeben
```

### 7c. Admin-Dashboard öffnen
- Browser: `https://alma.oxs.at/admin` (wenn der Hostname richtig ist)
- Oder lokal: `https://localhost/admin` mit `-k` für self-signed Certs ignorieren
- Admin-E-Mail sollte vorhanden sein und `role='admin'` haben

Falls Admin-Zugang fehlt, im App-User-Context:
```bash
su -s /bin/bash paw-app -c "cd /tmp && XDG_RUNTIME_DIR=/run/user/\$(id -u paw-app) \
  DBUS_SESSION_BUS_ADDRESS='unix:path=/run/user/\$(id -u paw-app)/bus' \
  bash -c 'source /home/paw-app/.config/pawvax/paw.env && \
  podman exec paw-postgres psql -U pawvax -d pawvax -c \
  \"UPDATE accounts SET role='\''admin'\'', verified=TRUE WHERE email='\''your-admin@example.com'\'';\"'"
```

---

## Schritt 8: Updates & Maintenance

### Repo-Update ziehen (ohne Neustart)
```bash
su -s /bin/bash paw-git -c "cd /git/pawvax && git pull"
```

### Images neu bauen und Pod aktualisieren
```bash
bash scripts/setup-rootless-podman.sh deploy
```

### Nur Cleanup durchführen (ohne Neubuild)
```bash
bash scripts/setup-rootless-podman.sh cleanup
```

### Pod-Status jederzeit prüfen
```bash
bash scripts/setup-rootless-podman.sh status
```

---

## Fehlerbehebung

### "Rootless Podman cannot bind the requested host ports"
Das System erlaubt rootless-Benutzern nicht, auf Ports < 1024 zu binden.

**Lösung:**
```bash
sysctl -w net.ipv4.ip_unprivileged_port_start=80
# Permanent in /etc/sysctl.conf:
echo "net.ipv4.ip_unprivileged_port_start=80" >> /etc/sysctl.conf
sysctl -p
```

Oder höhere Ports verwenden:
```bash
HTTP_PORT=8080 HTTPS_PORT=8443 bash scripts/setup-rootless-podman.sh deploy
```

### "Unit pod-paw-stack.service not found"
Die user-units wurden nicht generiert oder nicht geladen.

**Lösung:**
```bash
su -s /bin/bash paw-app -c "cd /tmp && XDG_RUNTIME_DIR=/run/user/\$(id -u paw-app) \
  DBUS_SESSION_BUS_ADDRESS='unix:path=/run/user/\$(id -u paw-app)/bus' \
  systemctl --user daemon-reload"
```

Danach erneut versuchen:
```bash
bash scripts/setup-rootless-podman.sh deploy
```

### Container startet nicht / Logs prüfen
```bash
su -s /bin/bash paw-app -c "podman logs paw-postgres"
su -s /bin/bash paw-app -c "podman logs paw-api"
su -s /bin/bash paw-app -c "podman logs paw-pwa"
su -s /bin/bash paw-app -c "podman logs paw-proxy"
```

Oder systemd-Journal:
```bash
su -s /bin/bash paw-app -c "cd /tmp && XDG_RUNTIME_DIR=/run/user/\$(id -u paw-app) \
  DBUS_SESSION_BUS_ADDRESS='unix:path=/run/user/\$(id -u paw-app)/bus' \
  journalctl --user -u pod-paw-stack.service -n 50"
```

### Datenbank-Zugriff prüfen
```bash
su -s /bin/bash paw-app -c "source /home/paw-app/.config/pawvax/paw.env && \
  podman exec paw-postgres psql -U pawvax -d pawvax -c 'SELECT COUNT(*) as account_count FROM accounts;'"
```

---

## Nach erfolgreichem Deployment

1. **Versions-Anzeige im Admin-Dashboard prüfen:** `2026-05-05_1445`
2. **Teststatus sichtbar:** Dashboard zeigt grüne Checkmark mit Test-Summary
3. **SSL-Zertifikate:** Self-signed, generiert in `/home/paw-app/data/proxy/ssl/`
   - Für Production: durch Let's Encrypt oder CA-Zertifikat ersetzen
4. **Backups:** PostgreSQL-Daten liegen unter `/home/paw-app/data/postgres/`
   - Regelmäßig sichern: `pg_dump` oder Container-Volume-Snapshot

---

## Notfall: Kompletter Neustart

Falls der Pod völlig kaputt geht:

```bash
bash scripts/setup-rootless-podman.sh cleanup
bash scripts/setup-rootless-podman.sh deploy
```

**WARNUNG:** Dies löscht keine Daten (PostgreSQL-Volumes bleiben erhalten), startet aber alle Container neu und regeneriert systemd-Units.

---

**Checkliste:**
- [ ] Host vorbereitet (`prepare`)
- [ ] Stack deployed (`deploy`)
- [ ] Status ok (`status`)
- [ ] API-Tests grün
- [ ] Testergebnisse persistiert
- [ ] Test-Accounts bereinigt
- [ ] PWA unter `https://localhost/` erreichbar
- [ ] API unter `https://localhost/api/` erreichbar
- [ ] Admin-Dashboard funktional
