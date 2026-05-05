# PAW Container Units (Systemd Quadlets)

Diese Quadlets ersetzen `podman-compose.yml` und integrieren sich direkt mit systemd für besseres Management in rootless Podman.

## Dateien

- **postgres.container**: PostgreSQL 16-alpine Datenbankserver
- **paw-api.container**: Node.js API Server (depends on postgres)
- **paw-pwa.container**: React/Vite PWA Frontend (depends on paw-api)

## Installation

Quadlets müssen in `~/.config/containers/systemd/` für jeweils den ausführenden User installiert werden.

### Für paw-api User (PostgreSQL + API):

```bash
mkdir -p ~/.config/containers/systemd
cp postgres.container ~/.config/containers/systemd/
cp paw-api.container ~/.config/containers/systemd/
systemctl --user daemon-reload
```

### Für paw-pwa User (PWA):

```bash
mkdir -p ~/.config/containers/systemd
cp paw-pwa.container ~/.config/containers/systemd/
systemctl --user daemon-reload
```

## Verwendung

### Services starten

```bash
# PostgreSQL
systemctl --user start postgres.service

# API (wartet auf postgres.service healthy)
systemctl --user start paw-api.service

# PWA (wartet auf paw-api.service healthy)
systemctl --user start paw-pwa.service
```

### Alle starten

```bash
systemctl --user start postgres paw-api paw-pwa
```

### Status pruefen

```bash
systemctl --user status postgres paw-api paw-pwa
```

### Logs lesen

```bash
journalctl --user -u postgres.service -f
journalctl --user -u paw-api.service -f
journalctl --user -u paw-pwa.service -f
```

### Autostart aktivieren (optional)

```bash
systemctl --user enable postgres paw-api paw-pwa
```

## Umgebungsvariablen

Die Quadlets erwarten folgende Variablen in der Umgebung:

- `DB_PASSWORD`: PostgreSQL Passwort (für `POSTGRES_PASSWORD` und `DATABASE_URL`)
- `JWT_SECRET`: JWT Secret für API (paw-api.container)
- `GEMINI_API_KEY`: Google Gemini API Key (paw-api.container, optional)

Diese können gesetzt werden mit:

```bash
export DB_PASSWORD=$(grep DB_PASSWORD /git/pawvax/.env.podman | cut -d= -f2)
export JWT_SECRET=$(grep JWT_SECRET /git/pawvax/.env.podman | cut -d= -f2)
```

Oder persistent in `~/.bash_profile`:

```bash
export DB_PASSWORD="..."
export JWT_SECRET="..."
```

## Voraussetzungen

- rootless podman >= 4.0
- systemd User Session aktiviert (`systemctl --user` funktioniert)
- `/run/user/$UID` existent (automatisch mit podman rootless)
- Images lokal gebaut:
  - `localhost/paw-api:latest`
  - `localhost/paw-pwa:latest`
  - `docker.io/postgres:16-alpine` (wird automatisch gepullt)

## Healthchecks

Alle Services haben Healthchecks konfiguriert:

- **postgres**: `pg_isready -U pawvax`
- **paw-api**: HTTP `GET /health` auf Port 3000
- **paw-pwa**: (implizit durch Port-Bindung)

Systemd wartet auf "healthy" Status, bevor Dependent-Services starten.

## Unterschied zu podman-compose

| Feature | podman-compose | Quadlets |
|---------|---|---|
| Config-Ort | ./compose.yml (Repo) | ~/.config/containers/systemd/ (per User) |
| Integration | separate Container-Runtime | native systemd |
| Autostart | Manual | systemctl --user enable |
| Logging | podman logs | journalctl --user |
| Dependencies | compose depends_on | systemd After= / Requires= |
| Cgroup mgmt | podman-managed | systemd-managed |
| Rootless | mit Workarounds | native support |

## Fehlerbehebung

### "Cannot connect to namespace"

```bash
systemctl --user start user-runtime-dir@$(id -u).service
```

### "XDG_RUNTIME_DIR not found"

Stellen Sie sicher dass der User rootless podman initialisiert hat:

```bash
podman info
```

### "Connection refused"

Container läuft, aber Port nicht erreichbar:

```bash
podman ps  # Check container status
podman logs <container-name>
systemctl --user status <service>
```

## Weitere Infos

- [Podman Quadlets Documentation](https://docs.podman.io/en/latest/markdown/podman-systemd.unit.5.html)
- [Systemd Unit Documentation](https://www.freedesktop.org/software/systemd/man/latest/systemd.unit.html)
- PAW Deployment: siehe [UPDATE.md](../documentation/UPDATE.md)
