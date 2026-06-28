# 05 - Security & RBAC

## Authentication
- **JWT**: Issued upon login. Payload includes `id`, `email`, and `role`.
- **Expiry**: 7 days.
- **Blacklist**: Stored in DB to handle logout/revocation.

## Role-Based Access Control (RBAC)
- **Guest (Public Scan)**: Unauthenticated access to a limited basic status view via a URL containing a `shareToken`.
- **User**: Manage own pets, upload documents, view health history.
- **Vet**: (Verified) Can verify vaccinations of any pet, add professional stamps/entries.
- **Authority (Deep Scan)**: View-only access to specific health records (e.g., Rabies batch numbers). This unlocks deeper medical history using the same `shareToken` scan interaction, provided the scanning user is authenticated and holds the `authority` role.
- **Admin**: System configuration, user management, audit review.

## Data Isolation
- Every request to `/api/pets` or `/api/vaccinations` MUST be filtered by `owner_id` (except for Vets/Admins).
- Cross-tenant access is strictly prohibited.

## Infrastructure Hardening (Absolutely Rootless)

### 1. Rootless Podman Execution
- The Podman socket and all container processes MUST run under a dedicated, non-privileged host user (e.g., `paw-service`).
- No process shall ever have real UID 0 on the host.

### 2. Per-Container User Isolation
- **Inside the Container**: Every `Containerfile` MUST define a specific non-root `USER` (e.g., `node`, `postgres`, `caddy`). Running as "root" inside the container is strictly forbidden, even in a rootless environment.
- **User Namespaces**: Each Pod/Container should utilize separate User Namespaces (`UserNS`) where possible to map the container-root to an unprivileged range, further isolating containers from each other.

### 3. Filesystem Permissions
- Volumes must be mounted with the correct UID/GID mapping (using `:U` flag in Podman) to ensure the container's non-root user has access without requiring wide permissions.
