#!/usr/bin/env bash

set -euo pipefail

APP_USER="${APP_USER:-paw-app}"
GIT_USER="${GIT_USER:-paw-git}"
REPO_DIR="${REPO_DIR:-/git/pawvax}"
POD_NAME="${POD_NAME:-paw-stack}"
HTTP_PORT="${HTTP_PORT:-80}"
HTTPS_PORT="${HTTPS_PORT:-443}"
DB_NAME="${DB_NAME:-pawvax}"
DB_TEST_NAME="${DB_TEST_NAME:-pawvax_test}"
DB_USER="${DB_USER:-pawvax}"
TLS_HOSTNAME="${TLS_HOSTNAME:-localhost}"
ENV_SOURCE="${ENV_SOURCE:-$REPO_DIR/.env.podman}"
TEST_NODE_IMAGE="${TEST_NODE_IMAGE:-docker.io/node:22-alpine}"
TEST_TIMER_ON_CALENDAR="${TEST_TIMER_ON_CALENDAR:-hourly}"

usage() {
  cat <<EOF
Usage: $(basename "$0") <prepare|deploy|cleanup|status>

Commands:
  prepare  Create users, directories, env files and TLS placeholders for rootless operation.
  deploy   Build images, recreate the rootless pod, and generate user systemd units.
  test     Run the API test suite against the dedicated test database and persist the result into PostgreSQL.
  cleanup  Stop and remove the pod plus prune unused Podman resources for the app user.
  status   Show pod, container and systemd user-unit status for the app user.

Environment overrides:
  APP_USER, GIT_USER, REPO_DIR, POD_NAME, HTTP_PORT, HTTPS_PORT,
  DB_NAME, DB_TEST_NAME, DB_USER, TLS_HOSTNAME, ENV_SOURCE,
  TEST_NODE_IMAGE, TEST_TIMER_ON_CALENDAR
EOF
}

require_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    echo "This script must be run as root." >&2
    exit 1
  fi
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Required command not found: $1" >&2
    exit 1
  fi
}

ensure_user() {
  local user="$1"
  if ! id "$user" >/dev/null 2>&1; then
    useradd -m -s /sbin/nologin "$user"
  fi
}

app_uid() {
  id -u "$APP_USER"
}

app_home() {
  getent passwd "$APP_USER" | cut -d: -f6
}

run_as_app() {
  local app_home_dir
  local app_uid_value
  app_home_dir="$(app_home)"
  app_uid_value="$(app_uid)"

  su -s /bin/bash "$APP_USER" -c "set -euo pipefail; export HOME='$app_home_dir'; export XDG_RUNTIME_DIR='/run/user/$app_uid_value'; export DBUS_SESSION_BUS_ADDRESS='unix:path=/run/user/$app_uid_value/bus'; $*"
}

check_low_ports() {
  local port_floor
  port_floor="$(sysctl -n net.ipv4.ip_unprivileged_port_start 2>/dev/null || echo 1024)"
  local min_port="$HTTP_PORT"
  if (( HTTPS_PORT < min_port )); then
    min_port="$HTTPS_PORT"
  fi

  if (( min_port < port_floor )); then
    cat >&2 <<EOF
Rootless Podman cannot bind the requested host ports with the current sysctl.
Current net.ipv4.ip_unprivileged_port_start=$port_floor, requested ports=$HTTP_PORT/$HTTPS_PORT.

Choose one of these options before retrying deploy:
  1. Set higher ports, e.g. HTTP_PORT=8080 HTTPS_PORT=8443
  2. Lower the sysctl permanently for rootless 80/443, e.g.
     sysctl -w net.ipv4.ip_unprivileged_port_start=80
EOF
    exit 1
  fi
}

prepare_env_file() {
  local app_home_dir
  app_home_dir="$(app_home)"
  mkdir -p "$app_home_dir/.config/pawvax"
  chown "$APP_USER:$APP_USER" "$app_home_dir/.config/pawvax"
  chmod 755 "$app_home_dir/.config/pawvax"

  if [[ ! -f "$ENV_SOURCE" ]]; then
    cat >&2 <<EOF
Environment source file missing: $ENV_SOURCE
Create it first with at least DB_PASSWORD and JWT_SECRET.
EOF
    exit 1
  fi

  cp "$ENV_SOURCE" "$app_home_dir/.config/pawvax/paw.env"
  chown "$APP_USER:$APP_USER" "$app_home_dir/.config/pawvax/paw.env"
  chmod 600 "$app_home_dir/.config/pawvax/paw.env"
}

create_test_runner_assets() {
  local app_home_dir
  app_home_dir="$(app_home)"

  mkdir -p "$app_home_dir/bin" "$app_home_dir/.config/systemd/user"
  chown -R "$APP_USER:$APP_USER" "$app_home_dir/bin" "$app_home_dir/.config/systemd"
  chmod 755 "$app_home_dir/bin" "$app_home_dir/.config" "$app_home_dir/.config/systemd" "$app_home_dir/.config/systemd/user"

  cat > "$app_home_dir/bin/run-paw-tests.sh" <<EOF
#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR}"
ENV_FILE="\$HOME/.config/pawvax/paw.env"
DB_NAME="${DB_NAME}"
DB_TEST_NAME="${DB_TEST_NAME}"
DB_USER="${DB_USER}"
TEST_NODE_IMAGE="${TEST_NODE_IMAGE}"

if [[ ! -f "\$ENV_FILE" ]]; then
  echo "Missing env file: \$ENV_FILE" >&2
  exit 1
fi

set -a
source "\$ENV_FILE"
set +a

mkdir -p "\$HOME/.cache/pawvax/npm-cache"

podman pull "\$TEST_NODE_IMAGE" >/dev/null 2>&1 || true

podman run --rm --pod "${POD_NAME}" --security-opt label=disable \
  -e DATABASE_URL="postgresql://\$DB_USER:\$DB_PASSWORD@127.0.0.1:5432/\$DB_TEST_NAME" \
  -e PERSIST_DATABASE_URL="postgresql://\$DB_USER:\$DB_PASSWORD@127.0.0.1:5432/\$DB_NAME" \
  -e PAW_MOCK_OCR=1 \
  -v "\$REPO_DIR:/workspace:ro" \
  -v "\$HOME/.cache/pawvax/npm-cache:/root/.npm" \
  "\$TEST_NODE_IMAGE" sh -lc '
    set -e
    rm -rf /tmp/pawvax-test-server
    mkdir -p /tmp/pawvax-test-server
    cp -a /workspace/server/. /tmp/pawvax-test-server/
    cd /tmp/pawvax-test-server
    npm ci
    test_exit=0
    node scripts/run-api-tests.js || test_exit=\$?
    if [ -f /tmp/jest-raw.json ]; then
      node scripts/persist-test-results.js /tmp/jest-raw.json "\$PERSIST_DATABASE_URL"
    fi
    exit "\$test_exit"
  '
EOF

  chmod 750 "$app_home_dir/bin/run-paw-tests.sh"
  chown "$APP_USER:$APP_USER" "$app_home_dir/bin/run-paw-tests.sh"

  cat > "$app_home_dir/.config/systemd/user/paw-run-tests.service" <<EOF
[Unit]
Description=Run PAW API regression tests and persist results
After=pod-${POD_NAME}.service
Requires=pod-${POD_NAME}.service

[Service]
Type=oneshot
ExecStart=%h/bin/run-paw-tests.sh

[Install]
WantedBy=default.target
EOF

  cat > "$app_home_dir/.config/systemd/user/paw-run-tests.timer" <<EOF
[Unit]
Description=Scheduled PAW API regression tests

[Timer]
OnCalendar=${TEST_TIMER_ON_CALENDAR}
Persistent=true
Unit=paw-run-tests.service

[Install]
WantedBy=timers.target
EOF

  chown "$APP_USER:$APP_USER" "$app_home_dir/.config/systemd/user/paw-run-tests.service" "$app_home_dir/.config/systemd/user/paw-run-tests.timer"
  chmod 644 "$app_home_dir/.config/systemd/user/paw-run-tests.service" "$app_home_dir/.config/systemd/user/paw-run-tests.timer"
}

prepare_proxy_assets() {
  local app_home_dir
  app_home_dir="$(app_home)"
  
  # Create Podman cache and config directories with proper ownership
  mkdir -p "$app_home_dir/.cache" "$app_home_dir/.local/share"
  chown -R "$APP_USER:$APP_USER" "$app_home_dir/.cache" "$app_home_dir/.local"
  chmod 755 "$app_home_dir/.cache" "$app_home_dir/.local" "$app_home_dir/.local/share"

  # Create directories with proper ownership
  mkdir -p "$app_home_dir/data/proxy/ssl" "$app_home_dir/data/pwa" "$app_home_dir/data/caddy" "$app_home_dir/data/caddy-data" "$app_home_dir/data/caddy-config"
  chown -R "$APP_USER:$APP_USER" "$app_home_dir/data/proxy" "$app_home_dir/data/pwa" "$app_home_dir/data/caddy" "$app_home_dir/data/caddy-data" "$app_home_dir/data/caddy-config"
  chmod 755 "$app_home_dir/data/proxy" "$app_home_dir/data/proxy/ssl" "$app_home_dir/data/pwa" "$app_home_dir/data/caddy" "$app_home_dir/data/caddy-data" "$app_home_dir/data/caddy-config"

  # Copy config files with proper ownership
  cp "$REPO_DIR/podman/proxy.nginx.conf" "$app_home_dir/data/proxy/default.conf"
  cp "$REPO_DIR/pwa/nginx.pod.conf" "$app_home_dir/data/pwa/nginx.conf"
  cp "$REPO_DIR/Caddyfile" "$app_home_dir/data/caddy/Caddyfile"
  chown "$APP_USER:$APP_USER" "$app_home_dir/data/proxy/default.conf" "$app_home_dir/data/pwa/nginx.conf" "$app_home_dir/data/caddy/Caddyfile"
  chmod 644 "$app_home_dir/data/proxy/default.conf" "$app_home_dir/data/pwa/nginx.conf" "$app_home_dir/data/caddy/Caddyfile"

  if [[ ! -f "$app_home_dir/data/proxy/ssl/fullchain.pem" || ! -f "$app_home_dir/data/proxy/ssl/privkey.pem" ]]; then
    openssl req -x509 -nodes -newkey rsa:2048 -days 365 \
      -keyout "$app_home_dir/data/proxy/ssl/privkey.pem" \
      -out "$app_home_dir/data/proxy/ssl/fullchain.pem" \
      -subj "/CN=$TLS_HOSTNAME" >/dev/null 2>&1
    chown "$APP_USER:$APP_USER" "$app_home_dir/data/proxy/ssl/fullchain.pem" "$app_home_dir/data/proxy/ssl/privkey.pem"
    chmod 600 "$app_home_dir/data/proxy/ssl/privkey.pem"
    chmod 644 "$app_home_dir/data/proxy/ssl/fullchain.pem"
  fi
}

prepare_host() {
  require_root
  require_command loginctl
  require_command systemctl
  require_command podman
  require_command openssl

  ensure_user "$GIT_USER"
  ensure_user "$APP_USER"

  local app_home_dir
  local app_uid_value
  app_home_dir="$(app_home)"
  app_uid_value="$(app_uid)"

  mkdir -p "$app_home_dir/data/postgres" "$app_home_dir/data/uploads" "$app_home_dir/.config/systemd/user" "$app_home_dir/.local/share/containers"
  chown -R "$APP_USER:$APP_USER" "$app_home_dir/data" "$app_home_dir/.config" "$app_home_dir/.local"
  chmod 755 "$app_home_dir/data" "$app_home_dir/data/postgres" "$app_home_dir/data/uploads" "$app_home_dir/.config" "$app_home_dir/.local" "$app_home_dir/.local/share" "$app_home_dir/.local/share/containers"

  loginctl enable-linger "$APP_USER" 2>/dev/null || true
  systemctl start "user@$app_uid_value.service" 2>/dev/null || true
  sleep 1  # Wait for systemd user bus to initialize

  chown -R "$GIT_USER:$GIT_USER" "$REPO_DIR"
  chmod -R a+rX "$REPO_DIR"

  prepare_env_file
  create_test_runner_assets
  prepare_proxy_assets

  echo "Prepared host for $APP_USER using repo $REPO_DIR"
}

prepare_postgres_permissions() {
  local app_home_dir
  app_home_dir="$(app_home)"

  # postgres:16-alpine runs as uid/gid 70 inside the container.
  # In rootless Podman, the host bind mount must be owned through the user namespace.
  run_as_app "podman unshare chown -R 70:70 '$app_home_dir/data/postgres'"
}

run_host_tests() {
  require_root
  local app_home_dir
  app_home_dir="$(app_home)"
  run_as_app "'$app_home_dir/bin/run-paw-tests.sh'"
}

deploy_stack() {
  require_root
  require_command podman
  check_low_ports

  local app_home_dir
  app_home_dir="$(app_home)"

  prepare_postgres_permissions

  run_as_app "cd '$REPO_DIR'; podman build --no-cache -t localhost/paw-api:latest -f server/Dockerfile server"
  run_as_app "cd '$REPO_DIR'; podman build --no-cache -t localhost/paw-pwa:latest -f pwa/Dockerfile pwa"
  run_as_app "cd '$REPO_DIR'; podman build --no-cache -t localhost/paw-caddy:latest -f podman/Dockerfile.caddy ."

  # Stop systemd service FIRST — otherwise it restarts the pod immediately after pod rm
  run_as_app "systemctl --user disable --now 'pod-$POD_NAME.service' 2>/dev/null || true"
  run_as_app "systemctl --user stop 'pod-$POD_NAME.service' 2>/dev/null || true"
  sleep 3

  # Remove stale PostgreSQL PID file that SIGKILL leaves behind (runs as root, has direct access)
  local pg_pid_file
  pg_pid_file="$(app_home)/data/postgres/postmaster.pid"
  [ -f "$pg_pid_file" ] && rm -f "$pg_pid_file" && echo "Removed stale PostgreSQL PID file" || true

  # Stop each container individually with grace period, then remove pod
  run_as_app "
    for c in paw-api paw-pwa paw-caddy paw-postgres; do
      podman stop --time 15 \$c 2>/dev/null || true
      podman rm -f \$c 2>/dev/null || true
    done
    podman pod rm -f '$POD_NAME' 2>/dev/null || true
    sleep 2
  "

  # Retry pod create until Podman state is fully cleared (exists check is unreliable)
  run_as_app "
    echo 'Creating pod $POD_NAME...'
    i=0
    until podman pod create --name '$POD_NAME' -p '$HTTP_PORT:80' -p '$HTTPS_PORT:443' 2>/dev/null; do
      i=\$((i+1))
      [ \$i -ge 15 ] && { echo 'ERROR: Could not create pod after 15 retries' >&2; exit 1; }
      echo \"Pod name still in use, retrying in 3s (attempt \$i/15)...\"
      sleep 3
    done
    echo 'Pod created successfully.'
  "

  run_as_app "source '$app_home_dir/.config/pawvax/paw.env'; podman run -d --replace --name paw-postgres --pod '$POD_NAME' \
    -e POSTGRES_DB='$DB_NAME' \
    -e POSTGRES_USER='$DB_USER' \
    -e POSTGRES_PASSWORD=\"\$DB_PASSWORD\" \
    -v '$app_home_dir/data/postgres:/var/lib/postgresql/data:Z,U' \
    --health-cmd 'pg_isready -U $DB_USER' --health-interval 10s --health-timeout 5s --health-retries 5 \
    docker.io/postgres:16-alpine"

  run_as_app "i=0; while [ \$i -lt 60 ]; do podman exec paw-postgres pg_isready -U '$DB_USER' >/dev/null 2>&1 && break; sleep 3; i=\$((i+1)); done; podman exec paw-postgres pg_isready -U '$DB_USER' || { echo 'PostgreSQL did not become ready in time.' >&2; exit 1; }"

  run_as_app "podman exec paw-postgres psql -U '$DB_USER' -d postgres -tc \"SELECT 1 FROM pg_database WHERE datname='$DB_NAME'\" | grep -q 1 || podman exec paw-postgres psql -U '$DB_USER' -d postgres -c \"CREATE DATABASE $DB_NAME OWNER $DB_USER\""
  run_as_app "podman exec paw-postgres psql -U '$DB_USER' -d postgres -tc \"SELECT 1 FROM pg_database WHERE datname='$DB_TEST_NAME'\" | grep -q 1 || podman exec paw-postgres psql -U '$DB_USER' -d postgres -c \"CREATE DATABASE $DB_TEST_NAME OWNER $DB_USER\""

  run_as_app "source '$app_home_dir/.config/pawvax/paw.env'; podman run -d --replace --name paw-api --pod '$POD_NAME' \
    --env-file '$app_home_dir/.config/pawvax/paw.env' \
    -e PORT=3000 \
    -e NODE_ENV=production \
    -e UPLOADS_DIR=/app/uploads \
    -e DATABASE_URL=\"postgresql://$DB_USER:\$DB_PASSWORD@127.0.0.1:5432/$DB_NAME\" \
    -v '$app_home_dir/data/uploads:/app/uploads:Z' \
    localhost/paw-api:latest"

  run_as_app "podman run -d --replace --name paw-pwa --pod '$POD_NAME' \
    -v '$app_home_dir/data/pwa/nginx.conf:/etc/nginx/nginx.conf:Z,ro' \
    localhost/paw-pwa:latest"

  run_as_app "podman run -d --replace --name paw-caddy --pod '$POD_NAME' \
    -v '$app_home_dir/data/caddy/Caddyfile:/etc/caddy/Caddyfile:ro' \
    -v '$app_home_dir/data/caddy-data:/data:Z,U' \
    -v '$app_home_dir/data/caddy-config:/config:Z,U' \
    localhost/paw-caddy:latest"

  run_as_app "rm -f '$app_home_dir/.config/systemd/user/pod-'*.service '$app_home_dir/.config/systemd/user/container-'*.service"
  run_as_app "cd '$app_home_dir/.config/systemd/user' && podman generate systemd --new --files --name '$POD_NAME' --restart-policy=always"
  run_as_app "systemctl --user daemon-reload"
  run_as_app "systemctl --user enable --now 'pod-$POD_NAME.service'"
  run_as_app "systemctl --user enable --now paw-run-tests.timer"
  run_host_tests
}

cleanup_stack() {
  require_root
  require_command podman

  run_as_app "systemctl --user disable --now 'pod-$POD_NAME.service' >/dev/null 2>&1 || true"
  run_as_app "podman pod exists '$POD_NAME' && podman pod rm -f '$POD_NAME' || true"
  run_as_app "podman container prune -f"
  run_as_app "podman image prune -af"
  run_as_app "podman builder prune -af"
}

status_stack() {
  require_root

  run_as_app "podman pod ps"
  run_as_app "podman ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"
  run_as_app "systemctl --user status 'pod-$POD_NAME.service' --no-pager || true"
}

main() {
  local command="${1:-}"
  case "$command" in
    prepare)
      prepare_host
      ;;
    deploy)
      prepare_host
      deploy_stack
      ;;
    test)
      prepare_host
      run_host_tests
      ;;
    cleanup)
      cleanup_stack
      ;;
    status)
      status_stack
      ;;
    *)
      usage
      exit 1
      ;;
  esac
}

main "$@"
