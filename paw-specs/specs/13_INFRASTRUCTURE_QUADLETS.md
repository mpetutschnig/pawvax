# 13 - Infrastructure: Podman Quadlets

## Overview
For a state-of-the-art single-server deployment, PAW utilizes **Podman Quadlets**. This moves away from `docker-compose` towards native `systemd` integration, allowing containers to be managed as first-class system services.

## Architecture
- **Single Server / Multi-Pod**: The application is split into logical units (Pods) to ensure isolation and resource management.
- **Rootless Podman**: For maximum security, all containers run in a rootless environment.
- **Systemd Integration**: Quadlets (`.container`, `.network`, `.volume`, `.pod` files) generate systemd unit files on the fly.

## Pod Definitions
1. **`paw-database.pod`**: Contains the PostgreSQL instance.
2. **`paw-app.pod`**: Contains the Fastify Backend and the Caddy/Nginx Reverse Proxy.
3. **`paw-frontend.pod`**: Serves the PWA static assets.

## Quadlet Best Practices
- **Auto-Updates**: Use the `io.containers.autoupdate` label for seamless image updates via `podman auto-update`.
- **Health Checks**: Every `.container` file must include a `HealthCmd` mapped to the application's `/health` endpoint.
- **Networking**: Use a dedicated `.network` Quadlet for inter-pod communication where necessary, otherwise keep pods isolated.
- **Volume Management**: Use `.volume` Quadlets to ensure persistent data (PostgreSQL data and Medical Document uploads) survives restarts.

## Absolute Rootless & User Isolation
- **UserNS**: Every `.container` Quadlet must explicitly define its user namespace mapping to ensure that even if a container is compromised, the attacker is trapped in a sub-UID range.
- **Dedicated Users**: 
  - `paw-api`: Runs as `USER node` (UID 1000).
  - `paw-db`: Runs as `USER postgres` (UID 999).
  - `paw-proxy`: Runs as `USER caddy` (UID 1000).
- **Security Context**: Use `ReadOnlyTmpfs=yes` and `NoNewPrivileges=yes` in Quadlets to further harden the runtime.

## Volume Hardening
- Persistent volumes for medical documents (`/uploads`) must be owned by the specific non-root UID of the backend container.
- Use Podman's `idmap` feature to maintain strict ownership between host and container.
