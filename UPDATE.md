# PAW - Automatisches Update-Skript

Dieses Dokument beschreibt den Update-Prozess.

### Schritt 1: Code lokal hochladen

Führe diese Befehle auf deinem **lokalen Entwicklungsrechner** aus:

```bash
git add .
git commit -m "Update"
git push

ssh hetzner
su -s /bin/bash paw-git -c "cd /tmp && git -C /git/pawvax pull"

```

### Schritt 2: Update-Skript auf dem Server ausführen

Kopiere den gesamten unteren Code-Block und füge ihn als `root` in dein **Hetzner Server-Terminal** ein. Das Skript führt alle notwendigen Update-Schritte aus und pausiert nach jedem Kommando für 3 Sekunden, damit du die Ausgabe auf eventuelle Fehler prüfen kannst.

```bash
echo "1/11: Schalte Shells temporär auf /bin/bash (für rootless podman)..."
usermod -s /bin/bash paw-git
usermod -s /bin/bash paw-api
usermod -s /bin/bash paw-pwa
sleep 3

echo "2/11: Ziehe neusten Code via Git Pull..."
su -s /bin/bash paw-git -c "cd /tmp && git -C /git/pawvax pull"
sleep 3

echo "3/11: Setze korrekte Dateiberechtigungen..."
chmod -R a+rX /git/pawvax
sleep 3

echo "4/11: Baue neues Container-Image für paw-api (Backend)..."
PAW_API_UID=$(id -u paw-api) && XDG_RUNTIME_DIR=/run/user/$PAW_API_UID su -s /bin/bash paw-api -c "cd /tmp && podman --cgroup-manager=cgroupfs build -t paw-api:latest -f /git/pawvax/server/Dockerfile /git/pawvax/server"
sleep 3

echo "5/11: Baue neues Container-Image für paw-pwa (Frontend)..."
PAW_PWA_UID=$(id -u paw-pwa) && XDG_RUNTIME_DIR=/run/user/$PAW_PWA_UID su -s /bin/bash paw-pwa -c "cd /tmp && podman --cgroup-manager=cgroupfs build -t paw-pwa:latest -f /git/pawvax/pwa/Containerfile /git/pawvax/pwa"
sleep 3

echo "6/11: Starte paw-api Service neu..."
PAW_API_UID=$(id -u paw-api) && su -s /bin/bash paw-api -c "cd /tmp && XDG_RUNTIME_DIR=/run/user/$PAW_API_UID DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$PAW_API_UID/bus systemctl --user restart paw-api"
sleep 3

echo "7/11: Starte paw-pwa Service neu..."
PAW_PWA_UID=$(id -u paw-pwa) && su -s /bin/bash paw-pwa -c "cd /tmp && XDG_RUNTIME_DIR=/run/user/$PAW_PWA_UID DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$PAW_PWA_UID/bus systemctl --user restart paw-pwa"
sleep 3

echo "8/11: Prüfe Status von paw-api..."
PAW_API_UID=$(id -u paw-api) && su -s /bin/bash paw-api -c "cd /tmp && XDG_RUNTIME_DIR=/run/user/$PAW_API_UID systemctl --user status paw-api --no-pager"
sleep 3

echo "9/11: Prüfe Status von paw-pwa..."
PAW_PWA_UID=$(id -u paw-pwa) && su -s /bin/bash paw-pwa -c "cd /tmp && XDG_RUNTIME_DIR=/run/user/$PAW_PWA_UID systemctl --user status paw-pwa --no-pager"
sleep 3

echo "10/11: Schalte Shells aus Sicherheitsgründen wieder auf /sbin/nologin..."
usermod -s /sbin/nologin paw-git
usermod -s /sbin/nologin paw-api
usermod -s /sbin/nologin paw-pwa
sleep 3

echo "11/11: 🚀 PAW Update erfolgreich abgeschlossen!"
```

*Tipp: Du kannst dir diesen Block auch direkt auf dem Server in eine Datei (z.B. `update.sh`) speichern und sie in Zukunft einfach mit `bash update.sh` ausführen.*