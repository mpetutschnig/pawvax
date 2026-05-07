import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '../components/PageHeader'
import { User, Shield, Code, ChevronDown, ChevronUp } from 'lucide-react'

type DocTab = 'user' | 'admin' | 'dev'

interface Section {
  id: string
  title: string
  summary: string
  content: string
}

const userSections: Section[] = [
  {
    id: 'scan',
    title: 'Tier scannen (NFC / QR)',
    summary: 'Öffne ein Tierprofil direkt per Chip oder QR-Code.',
    content: `Tippe auf der Startseite auf „Chip / Barcode scannen". Die App aktiviert die Kamera und liest NFC-Chips oder QR-/Barcodes aus.

Nach erfolgreichem Scan wird das zugehörige Tierprofil sofort geöffnet. Gescannte Tiere erscheinen unter „Zuletzt gescannt" auf der Tierübersicht.

Voraussetzung: Das Tier muss bereits in der App registriert und mit einem Tag (NFC oder QR) verknüpft sein. Tags können unter Einstellungen → Tags verwaltet werden.`,
  },
  {
    id: 'document',
    title: 'Dokument hinzufügen (OCR-Scan)',
    summary: 'Fotografiere Dokumente – die KI liest Daten automatisch aus.',
    content: `Öffne ein Tierprofil und tippe oben auf „Dokument hinzufügen". Wähle einen Dokumenttyp (z.B. Impfung, Behandlung, Heimtierausweis) und fotografiere das Dokument.

Die KI analysiert das Bild und extrahiert automatisch relevante Felder wie Impfstoffname, Datum, Tierarzt-Adresse usw. Das Ergebnis wird als strukturierter Eintrag gespeichert.

Solange die Analyse läuft, erscheint das Dokument im Tab „Ausstehend". Nach Abschluss wandert es automatisch in die entsprechende Tabelle (Impfungen, Behandlungen, …).

Unterstützte Dokumenttypen: Impfung, Behandlung, Heimtierausweis, Medizinisches Produkt, Stammbaum, Hundeführerschein, Sonstiges.`,
  },
  {
    id: 'vaccinations',
    title: 'Impfungen',
    summary: 'Alle Impfungen eines Tieres im Überblick.',
    content: `Auf der Tierseite zeigt die Tabelle „Impfungen" alle erfassten Impfungen mit Impfstoffname, Datum, Gültigkeitsdatum und Chargennummer.

Impfungen können manuell per „Eintragen"-Button eingetragen oder automatisch aus einem gescannten Dokument übernommen werden.

Als Besitzer kannst du für jeden Eintrag einstellen, wer ihn sehen darf (Tierarzt, Behörde, Gast). Tippe auf eine Zeile, um die Freigaben zu ändern.`,
  },
  {
    id: 'treatments',
    title: 'Behandlungen',
    summary: 'Medizinische Behandlungen verfolgen.',
    content: `Die Behandlungstabelle listet alle Medikamentengaben und Behandlungen mit Substanz, Datum, Dosierung und nächstem Fälligkeitstermin.

Einträge entstehen automatisch aus gescannten Behandlungsdokumenten oder werden manuell eingetragen. Wie bei Impfungen lässt sich die Sichtbarkeit pro Eintrag steuern.`,
  },
  {
    id: 'passport',
    title: 'Heimtierausweis',
    summary: 'EU-Heimtierausweis digital verwalten.',
    content: `Scanne deinen offiziellen EU-Heimtierausweis. Die KI liest Passnummer, Chip-Code, Aussteller, Tierbeschreibung und Eigentümerdaten aus.

Die Einträge werden in der Tabelle „Heimtierausweis" angezeigt und können nach Rolle freigegeben werden.`,
  },
  {
    id: 'medical',
    title: 'Medizinische Produkte',
    summary: 'Medikamente und Präparate dokumentieren.',
    content: `Fotografiere Packungsbeilagen oder Verschreibungen. Die KI extrahiert Produktname, Wirkstoff, Chargennummer und Datum.

Diese Einträge sind nützlich für Nachweise gegenüber Tierärzten oder Behörden.`,
  },
  {
    id: 'pedigree',
    title: 'Stammbaum & Hundeführerschein',
    summary: 'Zuchtdokumente und Prüfungsnachweise.',
    content: `Stammbaum-Dokumente und Hundeführerscheine werden in eigenen Tabellen auf der Tierseite angezeigt. Die KI liest Titel, Datum und Ergebnis (beim Führerschein) aus.`,
  },
  {
    id: 'roles',
    title: 'Freigaben & Rollen',
    summary: 'Steuere, wer welche Daten sehen darf.',
    content: `Jeder Eintrag (Impfung, Behandlung, …) kann für drei Rollen freigegeben werden:
• Tierarzt (vet): Zugreifende Person mit Tierarzt-Rolle
• Behörde (authority): Offizielle Kontrollstellen
• Gast (guest): Jeder mit dem Teillink

Als Besitzer tippst du auf eine Tabellenzeile und setzt die Häkchen entsprechend. Nicht freigegebene Einträge sind für diese Rollen unsichtbar.`,
  },
  {
    id: 'archive',
    title: 'Archivierung',
    summary: 'Nicht mehr aktive Tiere archivieren.',
    content: `Unter Tier bearbeiten kannst du ein Tier archivieren (verstorben, verloren, verkauft, abgegeben, sonstiges). Archivierte Tiere erscheinen grau in der Übersicht und können nicht mehr bearbeitet werden. Die Archivierung ist reversibel.`,
  },
  {
    id: 'reminders',
    title: 'Erinnerungen (ICS-Export)',
    summary: 'Termine in deinen Kalender exportieren.',
    content: `Für Behandlungen mit einem „Nächste Fälligkeit"-Datum kann ein Kalender-Eintrag als .ics-Datei exportiert werden. Diese Datei lässt sich in Google Calendar, Apple Calendar, Outlook u.a. importieren.`,
  },
  {
    id: 'tags',
    title: 'QR / NFC Tags',
    summary: 'Physische Tags für schnellen Zugriff.',
    content: `Unter dem Menüpunkt „Tags" (Tierseite) kannst du NFC-Chips oder QR-Codes mit deinem Tier verknüpfen. Einmal verknüpft, öffnet das Scannen des Tags sofort das Tierprofil – auch ohne App-Login (öffentliche Ansicht).`,
  },
  {
    id: 'share',
    title: 'Teilen per Link',
    summary: 'Profil mit Tierarzt oder Behörde teilen.',
    content: `Unter dem Menüpunkt „Teilen" (Tierseite) kannst du einen Zugriffslink für Tierärzte, Behörden oder Gäste generieren. Der Link gibt nur die Daten frei, die für die jeweilige Rolle freigegeben sind.`,
  },
  {
    id: 'install',
    title: 'App installieren (PWA)',
    summary: 'PAW als App auf deinem Homescreen speichern.',
    content: `PAW ist eine Progressive Web App (PWA). Du kannst sie wie eine native App installieren:
• iOS (Safari): Teilen → „Zum Home-Bildschirm"
• Android (Chrome): Menü → „App installieren"
• Desktop (Chrome/Edge): Adressleiste → Installations-Icon

Die App funktioniert dann offline für bereits geladene Daten.`,
  },
  {
    id: 'language',
    title: 'Sprache',
    summary: 'Deutsch / Englisch wechseln.',
    content: `Die Sprache kann in den Profil-Einstellungen zwischen Deutsch und Englisch gewechselt werden. Das Gerät-Standardspracheinstellung wird beim ersten Start berücksichtigt.`,
  },
]

const adminSections: Section[] = [
  {
    id: 'users',
    title: 'Benutzer verwalten',
    summary: 'Accounts einsehen, Rollen zuweisen, Zugänge sperren.',
    content: `Unter Admin → Benutzer siehst du alle registrierten Accounts. Du kannst:
• Rollen zuweisen (admin, vet, authority)
• E-Mail-Verifikation manuell bestätigen
• Accounts sperren oder löschen
• Tiere eines Benutzers einsehen`,
  },
  {
    id: 'email',
    title: 'E-Mail-Setup (SMTP / OAuth2)',
    summary: 'Transaktions-E-Mails für Registrierung und Einladungen konfigurieren.',
    content: `Unter Admin → Einstellungen → E-Mail konfigurierst du den ausgehenden Mailserver.

SMTP-Modus: Trage Host, Port, Sicherheitsmodus und Zugangsdaten ein. Der „Test-Mail senden"-Button prüft die Verbindung.

OAuth2-Modus (Gmail/Microsoft): Wähle den Anbieter, trage Client-ID, Client-Secret und Refresh-Token ein. Google-Refresh-Tokens erhältst du über die Google OAuth2-Playground: https://developers.google.com/oauthplayground`,
  },
  {
    id: 'oauth',
    title: 'OAuth Social Login (Google / GitHub / Microsoft)',
    summary: 'Social-Login-Provider über ENV-Variablen aktivieren.',
    content: `Social Login wird über Umgebungsvariablen auf dem Server konfiguriert – nicht über die Admin-Oberfläche.

Google: Erstelle eine OAuth-App unter https://console.cloud.google.com/apis/credentials
  ENV: OAUTH_GOOGLE_CLIENT_ID, OAUTH_GOOGLE_CLIENT_SECRET

GitHub: Erstelle eine OAuth-App unter https://github.com/settings/developers
  ENV: OAUTH_GITHUB_CLIENT_ID, OAUTH_GITHUB_CLIENT_SECRET

Microsoft: Registriere eine App unter https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade
  ENV: OAUTH_MICROSOFT_CLIENT_ID, OAUTH_MICROSOFT_CLIENT_SECRET, OAUTH_MICROSOFT_TENANT_ID

Die Redirect-URL für alle Provider lautet: {server_url}/api/auth/{provider}/callback

Aktivierte Provider werden auf der Login-Seite als Buttons angezeigt.`,
  },
  {
    id: 'supabase',
    title: 'Supabase Integration',
    summary: 'Login via Supabase-JWT-Token für externe Apps.',
    content: `PAW kann Supabase-JWT-Tokens akzeptieren. So wird ein User aus einer Supabase-App automatisch in PAW eingeloggt.

Setup-Schritte:
1. Supabase-Projekt anlegen auf https://supabase.com
2. JWT-Secret kopieren: Supabase Dashboard → Settings → API → JWT Secret
3. ENV-Variable auf dem PAW-Server setzen: SUPABASE_JWT_SECRET=<dein-secret>
4. In deiner externen App: Sende den Supabase-JWT als URL-Parameter beim Aufruf von PAW:
   {server_url}?token=<supabase_jwt>
   oder direkt an: {server_url}/api/auth/supabase

Der Status der Supabase-Verbindung wird unter Admin → Auth-Einstellungen angezeigt.`,
  },
  {
    id: 'stats',
    title: 'Statistiken',
    summary: 'Überblick über Tiere, Dokumente und Benutzer.',
    content: `Das Admin-Dashboard zeigt aggregierte Statistiken: Anzahl Benutzer, Tiere, Dokumente und ausstehende Analysen. Keine individuellen Daten sind sichtbar.`,
  },
  {
    id: 'cleanup',
    title: 'Bereinigung',
    summary: 'Verwaiste Bilder und Daten entfernen.',
    content: `Unter Admin → Bereinigung findest du verwaiste Dateien (Bilder ohne zugehöriges Dokument). Diese können selektiv oder vollständig gelöscht werden, um Speicherplatz freizugeben.`,
  },
]

const devSections: Section[] = [
  {
    id: 'stack',
    title: 'Tech Stack',
    summary: 'Überblick der eingesetzten Technologien.',
    content: `Frontend: React + TypeScript + Vite (PWA via vite-plugin-pwa)
Backend: Node.js + Express
Datenbank: PostgreSQL (produktiv) / SQLite (Entwicklung)
Auth: JWT-basiert, optional OAuth (Google/GitHub/Microsoft) und Supabase-JWT
OCR/KI: OpenAI GPT-4o Vision oder kompatible Modelle (konfigurierbar)
Container: Docker / Podman + Docker Compose
Reverse Proxy: Caddy (Multi-Tenant via Subdomains)`,
  },
  {
    id: 'env',
    title: 'ENV-Variablen',
    summary: 'Konfiguration des Servers über Umgebungsvariablen.',
    content: `# Pflichtfelder
DATABASE_URL=             # PostgreSQL-Connection-String
JWT_SECRET=               # Mindestens 32 Zeichen

# KI / OCR
OPENAI_API_KEY=           # OpenAI API-Key für Dokumentenanalyse
OCR_MODEL=gpt-4o          # Optional: anderes kompatibles Modell

# E-Mail
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=

# OAuth Social Login (alle optional)
OAUTH_GOOGLE_CLIENT_ID=
OAUTH_GOOGLE_CLIENT_SECRET=
OAUTH_GITHUB_CLIENT_ID=
OAUTH_GITHUB_CLIENT_SECRET=
OAUTH_MICROSOFT_CLIENT_ID=
OAUTH_MICROSOFT_CLIENT_SECRET=
OAUTH_MICROSOFT_TENANT_ID=

# Supabase (optional)
SUPABASE_JWT_SECRET=

# Server
PORT=3000
SERVER_URL=https://mein-server.example.com`,
  },
  {
    id: 'api',
    title: 'REST API',
    summary: 'Überblick der wichtigsten API-Endpunkte.',
    content: `Authentifizierung: Bearer-Token im Authorization-Header
  Authorization: Bearer <jwt>

Wichtige Endpunkte:
  POST   /api/auth/login              – Login (E-Mail + Passwort)
  POST   /api/auth/register           – Registrierung
  GET    /api/auth/oauth/providers    – Aktivierte OAuth-Provider
  GET    /api/animals                 – Eigene Tiere
  POST   /api/animals                 – Tier anlegen
  GET    /api/animals/:id             – Tierprofil (inkl. Zugriffscheck)
  PATCH  /api/animals/:id             – Tier bearbeiten
  GET    /api/animals/:id/documents   – Dokumente eines Tieres
  POST   /api/animals/:id/documents   – Dokument hochladen (multipart)
  GET    /api/settings                – Öffentliche App-Einstellungen
  GET    /api/admin/settings          – Admin-Einstellungen (Admin-JWT)
  PATCH  /api/admin/settings          – Einstellungen aktualisieren`,
  },
  {
    id: 'docker',
    title: 'Docker / Podman Setup',
    summary: 'Lokale Entwicklungsumgebung starten.',
    content: `# Entwicklung starten
podman compose up -d

# Oder mit Docker
docker compose up -d

# Logs
podman compose logs -f server
podman compose logs -f pwa

# Datenbank-Migration (wird beim Start automatisch ausgeführt)
# Bei manueller Migration:
podman exec -it paw-server node src/db/migrate.js

# PWA-Build für Produktion
cd pwa && npm run build`,
  },
]

function AccordionSection({ section, isOpen, onToggle }: {
  section: Section
  isOpen: boolean
  onToggle: () => void
}) {
  return (
    <div style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--space-3)',
          padding: 'var(--space-4) 0',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <div>
          <div style={{ fontWeight: 600, fontSize: 'var(--font-size-base)', color: 'var(--text-primary)' }}>
            {section.title}
          </div>
          {!isOpen && (
            <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', marginTop: 2 }}>
              {section.summary}
            </div>
          )}
        </div>
        {isOpen ? <ChevronUp size={18} color="var(--text-tertiary)" style={{ flexShrink: 0 }} /> : <ChevronDown size={18} color="var(--text-tertiary)" style={{ flexShrink: 0 }} />}
      </button>
      {isOpen && (
        <div style={{ paddingBottom: 'var(--space-4)' }}>
          <pre style={{
            whiteSpace: 'pre-wrap',
            fontFamily: 'inherit',
            fontSize: 'var(--font-size-sm)',
            color: 'var(--text-secondary)',
            lineHeight: 1.7,
            margin: 0,
          }}>
            {section.content}
          </pre>
        </div>
      )}
    </div>
  )
}

export default function DocumentationPage() {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<DocTab>('user')
  const [openSection, setOpenSection] = useState<string | null>(null)

  const sections = activeTab === 'user' ? userSections : activeTab === 'admin' ? adminSections : devSections

  const tabLabel: Record<DocTab, string> = {
    user: t('docs.tabUser') || 'Benutzer',
    admin: t('docs.tabAdmin') || 'Admin',
    dev: t('docs.tabDev') || 'Entwickler',
  }

  const tabTitle: Record<DocTab, string> = {
    user: 'Benutzer-Dokumentation',
    admin: 'Admin-Dokumentation',
    dev: 'Entwickler-Dokumentation',
  }

  const tabSubtitle: Record<DocTab, string> = {
    user: 'Alle Features im Überblick — tippe auf einen Eintrag für Details.',
    admin: 'Einrichtung und Verwaltung der PAW-Instanz.',
    dev: 'API, Konfiguration und Deployment.',
  }

  return (
    <div className="container page">
      <PageHeader title={t('docs.title') || 'Dokumentation'} backTo="/profile" showThemeToggle />

      <div className="card" style={{ padding: '0 0 var(--space-4) 0', overflow: 'hidden' }}>
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
          {(['user', 'admin', 'dev'] as DocTab[]).map(tab => (
            <button
              key={tab}
              onClick={() => { setActiveTab(tab); setOpenSection(null) }}
              style={{
                flex: 1,
                padding: 'var(--space-3)',
                background: 'none',
                border: 'none',
                borderBottom: activeTab === tab ? '2px solid var(--primary-500)' : '2px solid transparent',
                color: activeTab === tab ? 'var(--primary-600)' : 'var(--text-tertiary)',
                fontWeight: activeTab === tab ? 600 : 400,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              {tab === 'user' && <User size={16} />}
              {tab === 'admin' && <Shield size={16} />}
              {tab === 'dev' && <Code size={16} />}
              {tabLabel[tab]}
            </button>
          ))}
        </div>

        <div style={{ padding: 'var(--space-6) var(--space-4) 0 var(--space-4)' }} className="animate-fade-in">
          <h2 style={{ marginBottom: 'var(--space-2)', marginTop: 0 }}>{tabTitle[activeTab]}</h2>
          <p className="text-muted" style={{ marginBottom: 'var(--space-4)', fontSize: 'var(--font-size-sm)' }}>{tabSubtitle[activeTab]}</p>

          <div>
            {sections.map(section => (
              <AccordionSection
                key={section.id}
                section={section}
                isOpen={openSection === section.id}
                onToggle={() => setOpenSection(openSection === section.id ? null : section.id)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
