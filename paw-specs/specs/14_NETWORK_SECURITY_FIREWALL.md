# 14 - Network Security & Firewall

## Zero-Trust Architecture
PAW follows a strict network isolation policy. Only the absolute minimum of ports shall be exposed to the public internet.

## Host-Level Firewall (ufw / firewalld)
- **Rules**:
  - `ALLOW 80/tcp` (HTTP - for Caddy redirection).
  - `ALLOW 443/tcp` (HTTPS - Main application traffic).
  - `ALLOW 22/tcp` (SSH - limited to specific management IPs if possible).
  - `DENY` all other incoming traffic by default.

## Container Networking
1. **External Gateway**: Only the **Caddy Reverse Proxy** container is attached to the host's network ports (via Quadlet `PublishPort=80:80` and `443:443`).
2. **Internal Isolated Networks**:
   - `paw-net`: An internal Podman network.
   - The **Fastify API** and **PostgreSQL** containers MUST NOT expose ports to the host. They communicate exclusively via the `paw-net`.
   - The Database is only reachable by the API container, not by the public or other pods.

## TLS & Encryption
- Caddy manages automatic TLS certificates via Let's Encrypt / ZeroSSL.
- Internal communication between Proxy and API should use plain HTTP over the isolated `paw-net` (as it's within the trusted rootless namespace).

## Audit & Verification
- Periodic port scans (`nmap`) to ensure no DB or API ports were accidentally exposed.
- Firewall rules MUST be managed as code (e.g., via setup scripts in `scripts/`).
