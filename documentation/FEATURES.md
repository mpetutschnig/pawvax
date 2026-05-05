# Vetzsucht — Digital Pet Health Passport
## Feature Overview & Unique Value Propositions

---

## What Makes Vetzsucht Different

Vetzsucht is the only self-hosted, privacy-first digital pet health platform that combines instant physical tag scanning, AI-powered document intelligence, and a granular sharing system — giving pet owners, veterinarians, and authorities a single source of truth for every animal's health history.

No subscriptions. No cloud lock-in. Full data sovereignty.

---

## Core Features

---

### 🔍 Instant Animal Identification — Three Ways to Scan

**NFC Tag Support**
Hold any NFC-enabled smartphone near a tag attached to the animal's collar, carrier, or cage — the app instantly retrieves the animal's profile. No app installation required for the person scanning. Works with any NFC215 or NFC213 tag (€0.10–€0.50 per tag).

**Barcode / QR Code Scanning**
Camera-based scanning via the browser — no native app required. Scan printed QR labels on carriers, kennels, vet intake forms, or cage cards. Supports all common 1D/2D formats.

**Microchip / Manual ID Lookup**
Enter any ISO chip number, tag ID, or custom identifier manually. The system resolves the animal regardless of the input channel.

**USP:** Any person — logged in or not — can scan an animal and immediately see what the owner has chosen to share. No app download. No account. Just scan.

---

### 🌐 Public Scan — Zero-Friction Access Without Login

When an animal is found or handed over to a shelter, border control, or a vet, they simply scan the tag. The public scan view displays:

- Animal name, species, breed, and photo
- Vaccination status (if the owner has enabled sharing)
- Emergency contact / owner information (if permitted)
- Official vet-entered health documents (with verified badge)

**USP:** No account required for the person scanning. Works in emergency situations where time matters and the animal cannot speak for itself.

---

### 🔐 Role-Based Sharing with Time-Limited Links

Vetzsucht's permission system lets owners decide exactly what each party can see — per animal, per role.

**Roles available:**
| Role | Access Level |
|---|---|
| `guest` | Public-facing info only (what you'd show a stranger) |
| `vet` | Full health documents, vaccination records, treatment history |
| `authority` | Official access for customs, border control, shelter intake |

**Temporary Share Links**
Generate a named, time-limited URL with a single tap. Send it via WhatsApp, email, or QR code. The link expires automatically. Revoke it at any time — even before expiry.

**Granular Field Control**
For each role, the owner can individually toggle:
- Contact details (name, phone)
- Breed information
- Date of birth
- Document access

**USP:** No other pet health platform offers per-role, per-field, per-link access control in a consumer-friendly interface. It's the Instagram of pet passports — you control exactly who sees what.

---

### 🤖 AI-Powered Document Analysis

Upload a photo of any veterinary document — vaccination certificate, lab result, treatment record, X-ray report, prescription — and Vetzsucht's AI engine extracts the structured data automatically.

**What the AI delivers:**
- Document type classification (vaccination / lab / treatment / prescription / other)
- Extracted key-value fields (vaccine name, batch number, date, next due date, findings, dosage)
- Multi-page document support — photograph each page separately, merged into one record
- Automatic reminder generation when a next-due date is detected
- Re-analysis on demand with selectable AI provider and model

**Multi-Provider Support**
Choose between AI providers per document — cost optimization for bulk imports, quality optimization for complex diagnostics.

**USP:** Most apps store PDFs. Vetzsucht reads them. The extracted data becomes queryable, shareable, and reminder-generating structured information — not a static file.

---

### ✅ Verified Veterinarian Badge

Documents uploaded by verified veterinary accounts are marked with a visual trust badge — similar to Instagram or Twitter's verified checkmark — displaying the vet's name alongside the record.

Pet owners, border inspectors, and shelter staff can immediately distinguish:
- Owner-uploaded records (unverified)
- Officially entered vet records (verified, badged)

**USP:** Fraud-resistant document provenance. The platform cryptographically ties each document to the uploading account and displays verification status visually in every view — including the public scan.

---

### 💉 Smart Vaccination Reminders

Vetzsucht extracts next-due dates from analyzed documents and creates reminders automatically. The reminders dashboard shows:

- Overdue vaccinations (highlighted in red)
- Due within 30 days (highlighted in amber)
- Upcoming (neutral)

Owners can dismiss reminders once acted upon. Vets can add reminders manually when adding a treatment record.

**USP:** The reminder system is document-driven — not manually entered. If the AI reads "next vaccination due: 2027-05-01" from the uploaded certificate, the reminder is created without any additional input.

---

### 🔌 Veterinary API — Third-Party Integration (Ingress / Egress)

Vetzsucht exposes a versioned REST API (`/api/v1/`) for clinic management systems, laboratory platforms, and government registries.

**Authentication:** API key (`X-Api-Key` header) — issued per verified vet account, scoped to specific permissions.

**Available endpoints:**

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/animals/:id` | Retrieve animal profile + linked tags |
| `GET` | `/api/v1/animals/by-tag/:tagId` | Resolve animal by NFC/barcode/chip ID |
| `GET` | `/api/v1/animals/:id/documents` | List all vet-visible documents with extracted data |
| `POST` | `/api/v1/animals/:id/documents` | Upload a document image + trigger AI analysis |

**Ingress:** Clinic software can push treatment records, lab results, and vaccination certificates directly into Vetzsucht — no manual scanning by the owner required.

**Egress:** Government registries or border control systems can pull verified health records on demand via API key — with full audit logging on every access.

**Rate Limiting:** Per-key rate limiting (configurable, default 60 req/min) protects against abuse without affecting legitimate integrations.

**Audit Trail:** Every API access is logged with timestamp, IP, key name, action, and resource — GDPR-compliant and tamper-evident.

**USP:** The only pet health platform with a production-ready, keyed, rate-limited veterinary API designed for real clinic software integration — not a demo webhook.

---

### 🛡️ Privacy by Design — Self-Hosted, Your Data

Vetzsucht runs entirely on your own infrastructure. There is no central Vetzsucht server that receives animal data.

- **Self-hostable** on any Linux server, VPS, or on-premise hardware
- **Containerized** via Podman/Docker — single-command deployment
- **PostgreSQL** backend — enterprise-grade, no proprietary formats
- **GDPR-compliant by architecture** — data never leaves your server
- **No telemetry, no analytics, no third-party tracking**

**USP:** Veterinary clinics, shelters, and government registries operating under strict data protection regulations can run Vetzsucht on their own hardware — not as a cloud tenant.

---

### 📱 Progressive Web App — No App Store Required

Vetzsucht installs directly from the browser on any device — iOS, Android, Windows, macOS.

- Works offline for recently viewed animals (cached locally)
- Add to Home Screen with native app feel
- Camera, NFC, and barcode access via browser APIs — no app store approval delays
- Automatic updates — users always run the latest version

---

### 🌍 Multilingual Interface

Vetzsucht ships with full German and English localizations. The public scan view auto-detects the visitor's browser language — a French tourist scanning a German dog's tag sees the UI in French.

Administrators can extend the language files for any additional locale.

---

## Summary — Why Vetzsucht

| Capability | Vetzsucht | Paper passport | Cloud pet app |
|---|---|---|---|
| NFC + Barcode scan | ✅ | ❌ | Rarely |
| No-login public scan | ✅ | ❌ | ❌ |
| AI document extraction | ✅ | ❌ | ❌ |
| Verified vet badge | ✅ | ❌ | ❌ |
| Granular role-based sharing | ✅ | ❌ | Basic |
| Time-limited share links | ✅ | ❌ | ❌ |
| Third-party API (ingress/egress) | ✅ | ❌ | ❌ |
| Self-hosted / GDPR native | ✅ | ✅ | ❌ |
| Smart vaccination reminders | ✅ | ❌ | Some |
| Audit log on every access | ✅ | ❌ | Rarely |

---

*Vetzsucht — Because your animal's health history should be as digital, secure, and accessible as your own medical records.*
