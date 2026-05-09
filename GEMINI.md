# PAW — Project Context & Instructions

Digitaler Tierimpfpass (Digital Pet Vaccination Pass) with Gemini Vision AI integration, audit logging, role-based access control, and public sharing features.

## Project Overview

PAW is a distributed system consisting of a React-based Progressive Web App (PWA) and a Node.js Fastify backend. It enables pet owners to manage health records, veterinarians to verify documents, and authorities to access relevant data via QR/NFC scans.

### Core Technologies
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Shadcn UI, i18next, html5-qrcode.
- **Backend**: Node.js, Fastify, Better-SQLite3 (local) / PostgreSQL (production), JWT, WebSockets, Gemini Vision AI (3.1 Flash-Lite).
- **Infrastructure**: Podman/Docker Compose, Nginx/Caddy.

### Architecture
- **Modular Monolith**: The backend is organized into routes, services, and WebSocket handlers.
- **Hybrid Communication**: REST for transactional data; WebSockets for multi-page document uploads and live OCR status.
- **Data Model**: Relational schema (SQLite/PG) with flexible JSON payloads for OCR results.
- **Role Model**: `guest`, `user`, `vet` (verified), `authority`, `admin`.

---

## Getting Started

### Prerequisites
- Node.js (v20+)
- Podman or Docker (optional, for containerized deployment)

### Development Setup

1. **Backend**:
   ```bash
   cd server
   npm install
   cp .env.example .env
   # Set JWT_SECRET and GEMINI_API_KEY in .env
   npm run dev
   ```

2. **Frontend**:
   ```bash
   cd pwa
   npm install
   npm run dev
   ```

3. **Admin Setup**:
   - Register an account via the PWA.
   - Set `ADMIN_EMAIL` in `server/.env` to your email.
   - Restart the server to grant admin privileges.

---

## Key Commands

| Task | Command | Directory |
|---|---|---|
| **Server Dev** | `npm run dev` | `server/` |
| **Server Start** | `npm start` | `server/` |
| **Server Test** | `npm test` | `server/` |
| **PWA Dev** | `npm run dev` | `pwa/` |
| **PWA Build** | `npm run build` | `pwa/` |
| **Deploy (Podman)**| `podman compose up --build` | Root |

---

## Development Conventions

### Coding Style
- **Backend**: Standard JS (ES Modules). Uses Fastify's plugin system and hooks for cross-cutting concerns (audit, auth).
- **Frontend**: TypeScript + React. Functional components with hooks. Styling via Tailwind CSS and CSS variables (`index.css`).
- **Translations**: All UI text must be in `pwa/src/locales/` (de.json, en.json).

### Security
- **JWT**: Tokens expire in 7 days. Revocation via `jwt_blacklist`.
- **Audit Log**: Every sensitive action must be logged using the `logAudit` service.
- **Permissions**: Verify `req.user.role` and object ownership before allowing mutations.

### Document Upload & AI
- **WebSocket Flow**: Documents are uploaded as binary chunks via WebSocket (`server/src/ws/documentUpload.js`).
- **AI Analysis**: Gemini Vision AI extracts structured JSON. Prompts are defined in `server/src/services/ocr.js`.

---

## Directory Structure

- `pwa/`: Frontend source code.
- `server/`: Backend source code.
- `documentation/`: Detailed architecture, API, and feature docs.
- `podman/`: Container configuration files.
- `handoff/`: UI/UX design assets and Kotlin (Android) reference code.
- `scripts/`: Setup and utility scripts.

## Useful Links
- **API Docs**: `http://localhost:3000/documentation` (Swagger)
- **Health Check**: `http://localhost:3000/health`
