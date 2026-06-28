# 02 - Tech Stack Specification

## Frontend (PWA)
- **Framework**: React 18 (TypeScript)
- **Build Tool**: Vite
- **Styling**: Tailwind CSS + Shadcn UI (Radix UI primitives)
- **State Management**: React Hooks (Context API for global state like Auth/Theme)
- **Networking**: Axios (REST) + Native WebSockets
- **Internationalization**: i18next (DE/EN)
- **Scanner**: html5-qrcode
- **PWA Features**: Service Workers (Vite PWA Plugin), Web Manifest.

## Backend (API Server)
- **Runtime**: Node.js (v20+)
- **Framework**: Fastify (Performance & Schema-first)
- **Language**: JavaScript (ES Modules)
- **Database**: 
  - Development & Production: PostgreSQL (ensures strict Dev/Prod parity with Raw SQL)
- **ORM/Query Builder**: Raw SQL + Fastify Database Plugins
- **Authentication**: JWT (JSON Web Tokens) with 7-day expiry
- **AI Engine**: Google Generative AI SDK (Gemini 1.5 Flash-Lite)

## Infrastructure & DevOps
- **Containerization**: Podman (Rootless).
- **Orchestration**: **Podman Quadlets** (native systemd integration). No Docker Compose.
- **Web Server**: Caddy (integrated via Quadlet).
- **Deployment Target**: Single Server Linux (Ubuntu/Debian/Fedora).
