# Documentation Index

PAW (Digitaler Tierimpfpass) — comprehensive project documentation.

**Last Updated:** June 2026

---

## User Guides

| Document | Description | Audience |
|----------|-------------|----------|
| [PWA_FUNCTIONS_EN.md](PWA_FUNCTIONS_EN.md) | Feature guide — registration, animals, documents, sharing | Users |
| [PWA_FUNKTIONEN.md](PWA_FUNKTIONEN.md) | Funktionsübersicht (Deutsch) | Benutzer |
| [FEATURES.md](FEATURES.md) | Full feature matrix, USPs, comparison vs. paper passport | Decision makers |
| [Rollen.md](Rollen.md) | User roles & permission matrix (Guest, User, Vet, Authority, Admin) | All |

---

## Admin & Operations

| Document | Description | Audience |
|----------|-------------|----------|
| [UPDATE.md](UPDATE.md) | **Primary deployment & update runbook** (Hetzner, Podman quadlets) | Admins, Ops |
| [DEPLOY_FRESH_POSTGRES.md](DEPLOY_FRESH_POSTGRES.md) | Fresh install: rootless Podman + PostgreSQL step-by-step | Admins |
| [DATABASE_PERSISTENCE.md](DATABASE_PERSISTENCE.md) | Volume setup, idempotent migrations, data safety guarantees | Admins |
| [SERVER_DEBUG.md](SERVER_DEBUG.md) | Live log commands, health checks, error mapping on server | Admins |

---

## Architecture & Technical

| Document | Description | Audience |
|----------|-------------|----------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | System architecture: frontend, backend, DB, OCR, security, deployment | Developers |
| [PWA_WORKFLOWS_DETAILED.md](PWA_WORKFLOWS_DETAILED.md) | 9 detailed workflows (user lifecycle, NFC, documents, sharing, billing, audit) | Developers |
| [OCR_DOCUMENT_TYPES_TEMPLATE.md](OCR_DOCUMENT_TYPES_TEMPLATE.md) | OCR document type definitions, field mappings, prompt templates | Developers |
| [REFACTOR_DRY_2026.md](REFACTOR_DRY_2026.md) | DRY refactoring plan — all phases completed | Developers |

---

## Testing

| Document | Description | Audience |
|----------|-------------|----------|
| [API_TESTS_MASTER.md](API_TESTS_MASTER.md) | Complete API test suite reference, tools, standard workflows | QA, Developers |
| [TESTS.md](TESTS.md) | Smoke tests, test suites (Auth, Animals, Tags, Sharing), log parsing | QA, Developers |
| [DEBUG_TEMPLATE.md](DEBUG_TEMPLATE.md) | Bug report template with real examples, DevTools checklist | All |

---

## Security

| Document | Description | Audience |
|----------|-------------|----------|
| [security.md](security.md) | Red team audit — 10+ vulnerabilities ranked by severity, task list | Admins, Developers |

---

## Strategy & Business

| Document | Description | Audience |
|----------|-------------|----------|
| [MARKET_PLACEMENT_STRATEGY.md](MARKET_PLACEMENT_STRATEGY.md) | Market positioning, USPs, go-to-market strategy | Decision makers |
| [CHANGELOG_ANDROID_TODOS.md](CHANGELOG_ANDROID_TODOS.md) | Android Kotlin integration guide, recent backend fixes | Developers |
| [plan.md](plan.md) | Detailed project plan: responsive design, logging, API, design brief | All |
| [2m2m/](2m2m/) | Pitch materials, enterprise security roadmap, market analysis | Decision makers |

---

## Legal

| Document | Description | Audience |
|----------|-------------|----------|
| [../docs/TOS-de.md](../docs/TOS-de.md) | Nutzungsbedingungen (Deutsch) | Users, Legal |
| [../docs/TOS-en.md](../docs/TOS-en.md) | Terms of Service (English) | Users, Legal |

---

## Quick Reference

| Need | Document |
|------|----------|
| How is the system structured? | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Who can do what? | [Rollen.md](Rollen.md) |
| How do I use the app? | [PWA_FUNCTIONS_EN.md](PWA_FUNCTIONS_EN.md) |
| How do I deploy? | [UPDATE.md](UPDATE.md) |
| Fresh server install? | [DEPLOY_FRESH_POSTGRES.md](DEPLOY_FRESH_POSTGRES.md) |
| Something's broken? | [DEBUG_TEMPLATE.md](DEBUG_TEMPLATE.md) + [SERVER_DEBUG.md](SERVER_DEBUG.md) |
| Security issues? | [security.md](security.md) |
| Add document types? | [OCR_DOCUMENT_TYPES_TEMPLATE.md](OCR_DOCUMENT_TYPES_TEMPLATE.md) |
| What do users see? | [FEATURES.md](FEATURES.md) |

---

## Folder Structure

```
documentation/
├── README_DOCUMENTATION.md     ← this file
│
├── User Guides
│   ├── PWA_FUNCTIONS_EN.md
│   ├── PWA_FUNKTIONEN.md
│   ├── FEATURES.md
│   └── Rollen.md
│
├── Admin & Ops
│   ├── UPDATE.md               ← primary deploy runbook
│   ├── DEPLOY_FRESH_POSTGRES.md
│   ├── DATABASE_PERSISTENCE.md
│   └── SERVER_DEBUG.md
│
├── Architecture
│   ├── ARCHITECTURE.md
│   ├── PWA_WORKFLOWS_DETAILED.md
│   ├── OCR_DOCUMENT_TYPES_TEMPLATE.md
│   └── REFACTOR_DRY_2026.md
│
├── Testing
│   ├── API_TESTS_MASTER.md
│   ├── TESTS.md
│   └── DEBUG_TEMPLATE.md
│
├── Security
│   └── security.md
│
├── Strategy
│   ├── MARKET_PLACEMENT_STRATEGY.md
│   ├── CHANGELOG_ANDROID_TODOS.md
│   ├── plan.md
│   └── 2m2m/
│
└── PWA_FUNCTIONS_EN.pdf

docs/
├── TOS-de.md
└── TOS-en.md
```
