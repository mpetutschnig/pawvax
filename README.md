# PAW — Digital Animal Health Passport

> A secure, AI-powered Progressive Web App for managing veterinary records, vaccination passports, and animal health data — for pet owners, veterinarians, and authorities.

---

## What is PAW?

PAW replaces the physical pet health booklet with a structured, role-aware digital health record. Pet owners upload vaccination certificates and medical documents via their phone camera. Veterinarians add clinical notes and voice memos directly at the examination table. Authorities verify vaccination status by tapping an NFC chip — without installing an app.

All parties share a single source of truth, filtered by role. No paper. No copies. No shared logins.

---

## Why PAW? USPs, Market Potential & Competition

### The Problem

Every pet owner in the EU carries a physical vaccination booklet. It gets lost, forgotten at home, damaged, or left at the vet. There is no standardized digital equivalent. Vets, border authorities, kennels, and groomers all need to see some of the same data — but different parts of it, under different trust levels.

### Existing Alternatives — and Their Gaps

| Alternative | What it does | What it lacks |
|-------------|-------------|---------------|
| **Physical EU pet passport** | Paper-based EU vaccination proof | Lost/damaged, no digital access, manual |
| **TASSO / FINDEFIX (DE/AT)** | Microchip registration databases | Read-only lookup, no documents, no vet records |
| **PetDesk / Vetster** | Appointment & reminder apps | No document storage, no AI analysis, no public sharing |
| **VetCloud / easyVET** | Practice management software | Vet-side only, owners get limited read-only portal |
| **Generic cloud storage (Drive, Dropbox)** | File storage | No domain model, no roles, no analysis, no NFC |
| **Country vaccination databases (VETIDATA AT)** | Government registers | Government-controlled, no owner access, no sharing |

**None of them combine**: structured document storage + AI analysis + role-based sharing + public NFC access + tamper-proof vet records + DSGVO-compliant self-service.

### What PAW Does Better

1. **AI-powered structured extraction** — Upload a photo of a paper vaccination certificate, get structured data (vaccine name, batch number, expiry, vet name) automatically. No typing.
2. **Field-level role-based sharing** — The vet sees clinical records. The kennel sees vaccination status only. The border authority sees the rabies certificate. All from the same record, filtered by role. No all-or-nothing sharing.
3. **Public NFC tap → instant verification** — Tap the pet's chip tag with any NFC-capable phone. No app install, no login. Vaccination status displayed immediately.
4. **Tamper-proof vet records** — Documents uploaded by a verified vet cannot be deleted by the owner. Clinical integrity without a central authority.
5. **Multi-AI provider flexibility** — Users choose their own AI provider (Gemini, Claude, OpenAI) or use the system fallback. No single vendor dependency. Users with their own API key pay nothing extra.
6. **Voice memo → structured clinical note** — Vets dictate in the exam room. Gladia transcribes, AI structures the finding into diagnosis, medication, next appointment. No typing during consultation.
7. **Self-hostable, data-sovereign** — Deploy on your own server. Full data export (ZIP) at any time. Account deletion with full cascade. No SaaS dependency.
8. **Multi-tenant ready** — Organizations, vet networks, and insurance providers can run isolated branded instances.

### Market Potential

- **180 million pets** in the EU (cats, dogs, small animals)
- **EU Pet Travel Regulation** requires standardized vaccination proof for cross-border travel — creating a legal driver for digitization
- **Veterinary digitization** is an underserved market: most practices still use paper records for owner copies
- **B2B2C opportunity**: vet practices, kennels, pet insurers, and animal shelters all need verified vaccination data — and currently have no interoperable way to access it
- **Government adoption**: border authorities and animal welfare agencies benefit from instant NFC verification without building their own infrastructure

---

## Feature Overview

### Animal Management
- Create and manage profiles (species, breed, birthdate, sex, microchip ID, owner name, pedigree name)
- Upload and crop profile avatars
- Archive animals with reason (deceased, lost, sold, rehomed, other)
- Ownership transfer via 6-character code (24-hour expiry)

### ID Tags & Animal Lookup
- Register NFC chips and barcodes to animals
- Multiple tags per animal (chip, barcode, QR)
- Global NFC listener — tap a tag from anywhere in the app to navigate to the animal
- Public tag lookup — any NFC reader returns the animal's public profile (no login required)

### Document Upload & AI Analysis
- Upload multi-page documents (PDF, photo, camera scan)
- Supported document types: vaccination records, vet reports, lab results, medication prescriptions, pedigrees, EU pet passports, dog certificates, general
- Real-time analysis via WebSocket — status streamed to client
- AI provider support (configurable priority per user):
  - **Google Gemini** (default)
  - **Anthropic Claude**
  - **OpenAI GPT-4 Vision**
- Structured data extraction: vaccines, dosages, expiry dates, diagnoses, medications, next appointments
- Duplicate detection via content hash
- Analysis history — re-analyze with a different provider at any time
- Per-document tags and role-based visibility

### Voice Memos
- In-app audio recording
- Transcription via Gladia (German and English)
- AI structuring: diagnosis, findings, procedures, medications, next appointments
- Audio playback in detail view
- Per-memo sharing permissions

### NFC & Public Access
- Register NFC/barcode tags to animals
- Tap any registered tag → navigate directly to that animal (when logged in)
- **No-login public scan**: NFC tap or QR scan shows public profile (vaccination status, emergency contact) — no app install required on the reader side

### Document Sharing & Permissions
- Per-document `allowed_roles` (guest, vet, authority, owner)
- Per-animal sharing presets
- Temporary share links (14-day expiry)
- Public profile toggle (opt-in)

### Reminders
- Create reminders linked to documents or animals
- Calendar export as `.ics` file (client-side)
- Email reminders (when SMTP configured)

### Profile & User Settings
- Personal AI provider configuration (own API keys, model selection)
- AI provider priority ordering
- Budget cap for system AI usage
- Personal API key generation (for external integrations)
- DSGVO: full data export as ZIP, account self-deletion with cascade

### Admin Panel
- User management (role assignment, verification, deletion)
- Pending vet/authority verification review
- Audit log: paginated, filterable, full action history with before/after state
- System settings: app name, logo, theme color, SMTP, OAuth2 providers, system AI keys, price per page
- Statistics dashboard
- Database cleanup (orphaned records)
- Billing overview for all users
- API test run history
- Multi-tenant (organization) management

---

## Roles & Access Control

### Role Overview

| Role | Description | How Granted |
|------|-------------|-------------|
| `user` | Standard pet owner | Self-registration |
| `vet` | Verified veterinarian | Admin approval after verification request |
| `authority` | Government / organization inspector | Admin approval after verification request |
| `admin` | System administrator | Direct assignment |
| `guest` | Unauthenticated / public | Default, no login required |

### Capability Matrix

| Capability | guest | user | vet | authority | admin |
|-----------|:-----:|:----:|:---:|:---------:|:-----:|
| View public animal profile | ✅ | ✅ | ✅ | ✅ | ✅ |
| Login & manage own animals | ❌ | ✅ | ✅ | ✅ | ✅ |
| Upload docs to own animals | ❌ | ✅ | ✅ | ✅ | ✅ |
| Add docs to **other** animals | ❌ | ❌ | ✅ | ✅ | ✅ |
| Delete own uploads | ❌ | ✅ | ✅ | ✅ | ✅ |
| Delete vet-uploaded docs | ❌ | ❌ | own only | ❌ | ✅ |
| See vet-visible documents | ❌ | ❌ | ✅ | ❌ | ✅ |
| See authority-visible docs | ❌ | ❌ | ❌ | ✅ | ✅ |
| Add voice memos to any animal | ❌ | own | ✅ | ✅ | ✅ |
| Manage system settings | ❌ | ❌ | ❌ | ❌ | ✅ |

### Vet / Authority Verification Process

1. User registers as a standard account
2. Requests verification in Profile → optionally uploads supporting document
3. Admin reviews request under Admin → Verifications
4. Admin approves or rejects (with optional written reason)
5. On approval: role badge active, vet/authority permissions enabled

**Tamper protection:** Documents uploaded by a verified vet are flagged `added_by_role='vet'`. The animal's owner cannot delete these — only the uploading vet or an admin can. This creates an immutable clinical record without central authority.

### Document Visibility Model

Each document carries an `allowed_roles` field (e.g. `["guest", "vet"]`):

```
Owner      → always full access
Vet        → access if "vet" ∈ allowed_roles
Authority  → access if "authority" ∈ allowed_roles
Guest/pub  → access if "guest" ∈ allowed_roles
Unauth.    → public animal profile only (no document content)
```

Owner configures visibility per document after upload, or sets per-animal defaults.

### Temporary Share Links

- Created per animal, 14-day expiry
- Holder sees the animal's guest-visible fields (no login required)
- Owner can revoke at any time

---

## API

Interactive docs (Swagger UI): `GET /documentation`

All protected endpoints require `Authorization: Bearer <JWT>`.

### Authentication
```
POST /api/auth/register                 Register account
POST /api/auth/login                    Login → JWT (7-day)
POST /api/auth/refresh                  Refresh JWT
POST /api/auth/verify-email             Verify email token
POST /api/auth/request-password-reset   Request reset link
POST /api/auth/reset-password           Reset password
POST /api/auth/logout                   Invalidate token
GET  /api/auth/oauth/:provider          Initiate OAuth2 (google/github/microsoft)
GET  /api/auth/oauth/:provider/callback OAuth2 callback
```

### Animals
```
GET    /api/animals                       List own animals
POST   /api/animals                       Create animal
GET    /api/animals/:id                   Get animal + documents
PATCH  /api/animals/:id                   Update animal
DELETE /api/animals/:id                   Delete (cascade)
POST   /api/animals/:id/archive           Archive with reason
POST   /api/animals/:id/unarchive         Restore
POST   /api/animals/:id/transfer          Generate transfer code (24h)
POST   /api/animals/transfer/accept       Accept transfer by code
GET    /api/animals/recently-scanned      Last 20 scanned animals
POST   /api/animals/:id/track-scan        Record scan event
```

### Tags & NFC
```
GET    /api/animals/:id/tags              List tags
POST   /api/animals/:id/tags              Register tag (NFC/barcode)
PATCH  /api/animals/:id/tags/:tagId       Activate / deactivate
DELETE /api/animals/:id/tags/:tagId       Remove tag
GET    /api/animals/by-tag/:tagId         Look up animal by tag ID (auth)
GET    /api/public/tag/:tagId             Public tag lookup (no auth)
```

### Documents
```
GET    /api/animals/:id/documents         List animal's documents
GET    /api/documents/:id                 Get document + analysis
PATCH  /api/documents/:id                 Update tags, allowed_roles
DELETE /api/documents/:id                 Delete + pages
POST   /api/documents/:id/retry-analysis  Retry failed analysis
POST   /api/documents/:id/re-analyze      Re-analyze with new provider
GET    /api/documents/:id/history         Analysis history
```

**WebSocket upload** — `ws://<host>/ws?token=<JWT>`
```
1. Client → {type:"upload_start", animalId, filename, mimeType, allowedRoles}
2. Server → {type:"ready"}
3. Client → binary chunks (max 64 KB each)
4. Client → {type:"upload_end"}
5. Server → {type:"status", message}   (real-time progress)
6. Server → {type:"done", document}    (final result)
```

### Sharing & Public Access
```
GET    /api/animals/:id/sharing           Get sharing config
PUT    /api/animals/:id/sharing           Update per-role visibility
POST   /api/animals/:id/public-share      Create share link
GET    /api/animals/:id/public-shares     List share links
DELETE /api/animals/:id/public-share/:id  Revoke link
GET    /api/share/:shareId                Access shared animal (no login)
```

### Voice Memos
```
POST   /api/animals/:id/voice-memos       Upload + transcribe recording
GET    /api/animals/:id/voice-memos       List memos
GET    /api/voice-memos/:id               Get memo + transcript + analysis
PATCH  /api/voice-memos/:id               Update
DELETE /api/voice-memos/:id               Delete
```

### Reminders & Billing
```
POST   /api/reminders                     Create reminder
GET    /api/reminders                     List active reminders
PATCH  /api/reminders/:id/dismiss         Mark as done
GET    /api/billing/me                    Own usage & costs
POST   /api/billing/consent               Accept system AI billing
```

### Account & Data
```
GET    /api/accounts/me                   Own profile
PATCH  /api/accounts/me                   Update (name, email, password, AI keys)
DELETE /api/accounts/me                   Delete account (DSGVO, cascade)
POST   /api/accounts/me/verify-request    Request vet/authority verification
GET    /api/accounts/me/api-keys          List personal API keys
POST   /api/accounts/me/api-keys          Generate API key (shown once)
DELETE /api/accounts/me/api-keys/:id      Revoke API key
GET    /api/accounts/me/export            Download data as ZIP (DSGVO Art. 20)
```

### Admin
```
GET    /api/admin/stats                   System statistics
GET    /api/admin/accounts                List all accounts
PATCH  /api/admin/accounts/:id            Change role/verification
GET    /api/admin/verifications           Pending vet/authority requests
POST   /api/admin/verifications/:id/approve
POST   /api/admin/verifications/:id/reject
GET    /api/admin/audit                   Audit log (paginated, filterable)
GET    /api/admin/settings                System settings
PATCH  /api/admin/settings                Update settings
POST   /api/admin/settings/test-mail      Test SMTP
GET    /api/admin/billing                 All users' usage & costs
GET    /api/admin/cleanup                 Detect orphaned records
DELETE /api/admin/cleanup                 Remove orphaned records
```

---

## Tech Stack

### Frontend
| Layer | Technology |
|-------|-----------|
| Framework | React 18 + TypeScript |
| Build | Vite 6 |
| Styling | Tailwind CSS 3 + Shadcn UI (Radix primitives) |
| Routing | React Router DOM 6 |
| HTTP | Axios |
| i18n | react-i18next (DE / EN) |
| PWA | vite-plugin-pwa (service worker, installable) |
| Scanning | html5-qrcode (read), qrcode.react (generate) |
| NFC | Web NFC API (Chrome Android 89+) |

### Backend
| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 18+ (ES Modules) |
| Framework | Fastify 5 |
| Auth | @fastify/jwt + bcrypt |
| Database | PostgreSQL 13+ |
| Image | Sharp (compression, rotation, EXIF strip) |
| Email | Nodemailer |
| OAuth2 | @fastify/oauth2 (Google, GitHub, Microsoft) |
| WebSocket | @fastify/websocket |
| API docs | Swagger UI (@fastify/swagger) |

### AI & External Services
| Service | Purpose |
|---------|---------|
| Google Gemini | Document OCR + structured extraction (default) |
| Anthropic Claude | Alternative document analysis |
| OpenAI GPT-4 Vision | Alternative document analysis |
| Gladia v2 | Voice transcription (DE/EN) |

### Infrastructure
| Component | Technology |
|-----------|-----------|
| Containers | Podman / Docker |
| Reverse proxy | Caddy (automatic TLS) |
| Static serving | Nginx |
| Orchestration | podman-compose / docker-compose |
| Database | PostgreSQL 13+ (persistent volume) |

---

## Installation & Local Development

### Prerequisites
- Node.js 18+
- PostgreSQL 13+ (or use the provided Docker/Podman setup)
- npm 9+

### Server
```bash
cd server
npm install
cp .env.example .env     # fill in values
npm run dev              # → http://localhost:3000
                         # Swagger: http://localhost:3000/documentation
```

### PWA
```bash
cd pwa
npm install
npm run dev              # → http://localhost:5173
```

### Minimal `.env` for local development
```env
PORT=3000
JWT_SECRET=change_me_to_a_random_32_char_string
DATABASE_URL=postgresql://paw:paw@localhost:5432/paw
CORS_ORIGINS=http://localhost:5173
```

---

## Production Deployment (Podman / Docker)

### Container Stack
```
paw-stack
├── paw-api     (Fastify REST API + WebSocket)
├── paw-pwa     (Nginx static serving)
├── paw-db      (PostgreSQL 13)
└── paw-caddy   (Caddy reverse proxy + automatic TLS)
```

### First Deploy
```bash
cp .env.podman .env      # edit: domain, secrets, API keys
podman-compose up --build -d
# or: docker compose up --build -d
```

### Update Running Deployment
```bash
sudo bash /git/pawvax/scripts/setup-rootless-podman.sh update
```

---

## Pre- and Post-Deployment Checklist

### Before First Deploy
- [ ] Generate JWT secret: `openssl rand -hex 32` → `JWT_SECRET`
- [ ] Set `CORS_ORIGINS` to your production domain
- [ ] Configure `DATABASE_URL` with production credentials
- [ ] Set `ADMIN_EMAIL` — first account with this email gets admin role
- [ ] Verify upload directory (`UPLOADS_DIR`) is on a persistent volume
- [ ] Point DNS to server IP
- [ ] (Optional) Add system AI keys (Gemini/Claude/OpenAI) for fallback analysis
- [ ] (Optional) Configure SMTP and test with Admin → Settings → Test Mail
- [ ] (Optional) Configure OAuth2 provider credentials

### Before Each Update
- [ ] Back up database: `pg_dump paw > backup_$(date +%Y%m%d).sql`
- [ ] Review migration notes / changelog
- [ ] Tag current container image as rollback reference

### After Each Deploy
- [ ] Health check: `GET https://your-domain/api/health`
- [ ] Log in as admin — confirm admin panel loads
- [ ] Upload a test document — confirm AI analysis completes
- [ ] Inspect Audit Log for the test actions
- [ ] Test public NFC/tag scan (no login)
- [ ] (If SMTP) Trigger password reset — confirm email arrives

---

## Billing Concept

PAW separates **user-provided AI** from **system AI**:

| Source | Cost to user |
|--------|-------------|
| User's own API key (Gemini/Claude/OpenAI) | User's own API quota — no PAW charge |
| System AI fallback | Configurable €/page — requires explicit consent |

**Flow:**
1. User configures preferred provider + own key → analyzed at their cost, PAW charges nothing
2. No key / quota exhausted → system fallback offered; user must accept billing consent
3. Each analyzed page creates a `usage_logs` entry (provider, cost, page count, timestamp)
4. Admin sets price per page in Admin → Settings
5. User can set an optional budget cap — analysis pauses when limit reached
6. Full history visible to user in Billing page; aggregate view for admin

**Revenue model options (for operators):**
- **Pay-per-use**: charge per page via system AI (metered)
- **Subscription**: flat monthly fee with included AI quota
- **White-label**: organizations license a branded tenant instance

---

## Market Positioning

### Target Markets

**B2C — Pet Owners**
Families and individuals who travel with pets or need to share health records with vets, boarders, and kennels. Entry point: free account with own AI key; upgrade to system AI for convenience.

**B2B — Veterinary Practices**
Clinics that want to issue tamper-proof digital records. Vet users add structured notes, owners receive a permanent shareable copy. Reduces paper, phone calls, and lost records.

**B2G — Government & Animal Authorities**
Border control, animal welfare agencies, hunting authorities. Instant NFC verification — no app install on the reader side, no login, no paper.

**B2B2C — Pet Services & Insurers**
Kennels, groomers, and insurers access share links or public NFC profiles without account creation. Insurers verify vaccination dates without manual document submission.

### Go-to-Market Path
1. **Direct B2C launch** in DACH region — EU pet travel regulation creates immediate demand
2. **Vet practice partnerships** — integrate as owner-facing record portal for existing practices
3. **White-label tenant licensing** — sell to vet networks, pet insurance providers, animal shelters
4. **Open API** for third-party services (kennels, travel apps) gated by share tokens

---

## Project Structure

```
paw.oxs.at/
├── server/                  # Fastify REST API + WebSocket
│   ├── src/
│   │   ├── app.js           # Server setup
│   │   ├── db/              # PostgreSQL queries, migrations
│   │   ├── routes/          # API endpoints by domain
│   │   ├── services/        # OCR, Gladia, audit, storage, analysis pipeline
│   │   ├── utils/           # Crypto, AI model lists, path helpers
│   │   └── ws/              # WebSocket upload handler
│   ├── tests/               # Integration tests (150+ tests)
│   └── .env.example
│
├── pwa/                     # React 18 + Vite PWA
│   ├── src/
│   │   ├── App.tsx          # Routing, layout
│   │   ├── pages/           # Route-level components
│   │   ├── components/      # Reusable UI
│   │   ├── hooks/           # useGlobalNfc, useTheme, useBarcode …
│   │   ├── api/rest.ts      # Axios wrapper + auth
│   │   └── locales/         # de.json, en.json
│   └── public/
│
├── docs/
│   ├── TOS-de.md            # Terms of Service (German)
│   └── TOS-en.md            # Terms of Service (English)
│
├── Containerfile.server
├── Containerfile.pwa
├── podman-compose.yml
├── Caddyfile
├── nginx.conf
└── .env.podman
```

---

## Legal

See [Terms of Service (German)](docs/TOS-de.md) | [Terms of Service (English)](docs/TOS-en.md)

PAW is not a certified medical device. AI-generated analysis is informational only and does not replace professional veterinary diagnosis.

---

*© PAW Project — All rights reserved*
