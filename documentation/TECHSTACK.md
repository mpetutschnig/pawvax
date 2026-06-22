# PAW — Tech-Stack

Vollständige Übersicht über npm-Module und Container im Projekt.

> Stand: 2026-06-22 · Versionen aus `server/package.json` & `pwa/package.json`.
> Host: Hetzner Alma Linux 10 (ARM64), rootless Podman.

---

## Backend — `server/`

Fastify + Node.js, **ES Modules, kein TypeScript** (Hard-Constraint).

### dependencies

| Modul | Version | Zweck |
|---|---|---|
| fastify | ^5.8.5 | HTTP-Framework |
| @fastify/cors | ^11.2.0 | CORS |
| @fastify/helmet | ^13.0.2 | Security-Header |
| @fastify/jwt | ^10.0.0 | JWT-Auth |
| @fastify/multipart | ^10.0.0 | File-Uploads |
| @fastify/oauth2 | ^8.2.0 | OAuth |
| @fastify/rate-limit | ^10.3.0 | Rate-Limiting |
| @fastify/static | ^9.1.3 | Static-Serving |
| @fastify/swagger | ^9.7.0 | OpenAPI-Spec |
| @fastify/swagger-ui | ^5.2.6 | API-Docs-UI |
| @fastify/websocket | ^11.2.0 | WebSockets |
| @sentry/node | ^8.55.2 | Error-Tracking / Tracing (GlitchTip) |
| pg | ^8.13.0 | PostgreSQL-Client |
| bcrypt | ^6.0.0 | Passwort-Hashing |
| nodemailer | ^6.10.0 | Mailversand |
| sharp | ^0.34.5 | Bildverarbeitung |
| archiver | ^7.0.1 | ZIP-Export |
| file-type | ^22.0.1 | MIME-/Dateityp-Erkennung |
| uuid | ^14.0.0 | ID-Generierung |
| dotenv | ^16.4.5 | Env-Konfiguration |
| better-sqlite3 | ^12.9.0 | ⚠️ Legacy — nur Einmal-Migrationsskript (siehe Hinweise) |

### devDependencies

| Modul | Version | Zweck |
|---|---|---|
| jest | ^29.7.0 | Tests |
| @types/jest | ^29.5.11 | Jest-Typen |

---

## Frontend — `pwa/`

React 18 + Vite + TypeScript + Tailwind CSS + Shadcn UI.

### dependencies

| Modul | Version | Zweck |
|---|---|---|
| react / react-dom | ^18.3.1 | UI-Library |
| react-router-dom | ^6.27.0 | Routing |
| axios | ^1.7.7 | HTTP-Client |
| @sentry/react | ^8.55.2 | Error-Tracking / Tracing |
| i18next | ^26.0.8 | i18n-Core |
| react-i18next | ^17.0.6 | i18n-React-Bindings |
| i18next-browser-languagedetector | ^8.2.1 | Sprach-Erkennung |
| lucide-react | ^1.11.0 | Icons |
| @radix-ui/react-accordion | ^1.2.12 | UI-Primitive (Shadcn) |
| @radix-ui/react-dialog | ^1.1.15 | UI-Primitive (Shadcn) |
| @radix-ui/react-popover | ^1.1.15 | UI-Primitive (Shadcn) |
| cmdk | ^1.1.1 | Command-Palette |
| sonner | ^2.0.7 | Toast-Notifications |
| class-variance-authority | ^0.7.1 | Variant-Styling |
| clsx | ^2.1.1 | Classname-Merge |
| tailwind-merge | ^3.5.0 | Tailwind-Klassen-Dedup |
| html5-qrcode | ^2.3.8 | QR-/Barcode-Scan |
| qrcode.react | ^4.2.0 | QR-Code-Generierung |
| react-image-crop | ^11.0.10 | Bild-Zuschnitt |

### devDependencies

| Modul | Version | Zweck |
|---|---|---|
| typescript | ^5.5.3 | TS-Compiler |
| vite | ^6.4.2 | Build-Tool / Dev-Server |
| @vitejs/plugin-react | ^4.7.0 | React-Plugin |
| vite-plugin-pwa | ^1.2.0 | PWA / Service-Worker |
| tailwindcss | ^3.4.19 | CSS-Framework |
| tailwindcss-animate | ^1.0.7 | Tailwind-Animationen |
| postcss | ^8.5.13 | CSS-Processing |
| autoprefixer | ^10.5.0 | CSS-Vendor-Prefixes |
| @types/react | ^18.3.11 | React-Typen |
| @types/react-dom | ^18.3.1 | React-DOM-Typen |

### overrides

| Modul | Version | Grund |
|---|---|---|
| serialize-javascript | ^7.0.5 | Transitive Security-Fix |

---

## Container — rootless Podman, Pod `paw-stack`

| Container | Image | Build |
|---|---|---|
| paw-postgres | `docker.io/postgres:16-alpine` | Upstream |
| paw-api | `docker.io/node:22-alpine` | `server/Dockerfile` |
| paw-pwa | Build `node:22-alpine` → Runtime `nginx:alpine` | `pwa/Containerfile` (multi-stage) |
| paw-caddy | `docker.io/caddy:2.8-alpine` | `podman/Dockerfile.caddy` — Reverse-Proxy, Let's Encrypt TLS |
| paw-stack-infra | Podman Pod-Infra (pause) | intern |

### Observability (selbst gehostet, gleicher Pod)

| Container | Image |
|---|---|
| glitchtip-web | `docker.io/glitchtip/glitchtip:latest` |
| glitchtip-worker | `docker.io/glitchtip/glitchtip:latest` |
| glitchtip-redis | `docker.io/redis:7-alpine` |

---

## Hinweise

- **better-sqlite3** läuft **nicht** im Produktivbetrieb. Produktiv-DB ist **PostgreSQL** (`pg`). Verwendet nur vom Einmal-Migrationsskript `server/src/db/migrate-sqlite-to-pg.js` (SQLite → PG) sowie einem JSDoc-Kommentar in `dedup.js`. Kann nach abgeschlossener Migration entfernt werden.
- **OCR / AI** (Gemini, Anthropic Claude, OpenAI, Mistral) wird per HTTP-API angesprochen — keine npm-SDKs, daher nicht in der Modulliste.
- **Datenpersistenz**: Host-Bind-Mounts unter `/home/paw-app/data/` (Postgres, Uploads, PWA-Assets, TLS) — überleben Container-Rebuilds.
- **Deployment**: `git pull` (paw-git) → `podman build --no-cache` (api/pwa einzeln oder voller Pod) → `systemctl --user restart`. Details: [UPDATE.md](./UPDATE.md).
