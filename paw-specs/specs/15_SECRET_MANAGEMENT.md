# 15 - Enterprise Secret Management

## Core Principles
Secrets (API Keys, JWT Secrets, DB Passwords) MUST NEVER be committed to the repository, hardcoded in source code, or baked into container images.

## Development Secret Management
- **Local Environment**: Use `.env` files (added to `.gitignore`).
- **Templates**: Provide `.env.example` with dummy values for all required keys.
- **Validation**: The Backend should check for the presence of required environment variables on startup and exit with a clear error message if any are missing.

## Production Secret Management (Podman Quadlets)
For our state-of-the-art Single-Server setup, we use **systemd credentials** or **Environment Files with restricted permissions**:

1. **Environment Files**: Secrets are stored in a file (e.g., `/etc/paw/secrets.env`) owned by `root:paw-service` with permissions `600`.
2. **Quadlet Integration**: The `.container` Quadlet uses `EnvironmentFile=/etc/paw/secrets.env` to inject secrets at runtime.
3. **Internal Secrets**: Utilize Podman's `Secret=` Quadlet option where appropriate to mount secrets as files within the container (e.g., in `/run/secrets/`).

## Required Secrets List
- `GEMINI_API_KEY`: Access to Google Vision AI.
- `JWT_SECRET`: For signing and verifying authentication tokens.
- `POSTGRES_PASSWORD`: For database access.
- `ADMIN_EMAIL`: Initial admin account identification.

## Audit & Prevention
- **Secret Scanning**: The `SECURITY_SPECIALIST` agent must check every commit/plan for hardcoded strings that look like keys.
- **Rotation Policy**: All secrets should be rotatable without requiring a rebuild of the application.
