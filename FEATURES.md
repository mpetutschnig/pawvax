# PAW — Digitaler Tierimpfpass — Feature-Liste

> Übersicht der implementierten Features. Abgeleitet aus Backend-Routen
> (`server/src/routes/`), Frontend-Pages (`pwa/src/pages/`) und Services
> (`server/src/services/`).

## Tiere & Pass
- Tiere anlegen, bearbeiten, archivieren/entarchivieren, löschen
- Avatar setzen
- Impfungen & Behandlungen erfassen
- Tier-Statistiken
- Tier-Transfer (Besitzerwechsel) mit Annahme-Flow
- NFC-/QR-Tags: Tag-Verwaltung pro Tier, öffentlicher Scan via `/t/:tagId`
- Scan-Tracking: kürzlich gescannte Tiere, Scan-Verlauf

## Dokumente
- Dokumenten-Upload & -Verwaltung pro Tier
- KI-Analyse von Dokumenten (Analyse-Pipeline), Retry & Re-Analyse
- Pending-Dokumente, Datensatz-Bearbeitung, Versions-/Historie-Ansicht
- Dedup-Service (Duplikaterkennung)

## Voice Memos
- Sprachnotizen pro Tier aufnehmen, abrufen, bearbeiten, löschen
- Transkription (Gladia), KI-Analyse, Retry/Reanalyze, Audio-Abruf

## KI
- Modell-Auswahl (`/api/ai/models`)
- Analyse-Pipeline für Dokumente & Memos

## Teilen
- Dauerhaftes & temporäres Sharing pro Tier
- Öffentliche Share-Links `/share/:shareId`
- Sharing-Einstellungen, Share-Verwaltung/-Widerruf

## Auth & Konto
- Register, E-Mail-Verifizierung, Login/Logout, Token-Refresh
- Passwort vergessen/zurücksetzen
- OAuth-Provider + Supabase-Auth (Login, Passwort, Reset)
- Konto: Profil ansehen/ändern/löschen, DSGVO-Datenexport
- Persönliche API-Keys
- Pending-Tasks, Verifizierungsanträge

## Organisationen / Tierärzte
- Orgs anlegen, Mitglieder, Einladungen, Beitritt, Mitglied entfernen
- Vet-API v1: Tier/Dokumente abrufen via Tag, Dokumente/Impfungen/
  Behandlungen anlegen (API-Key-Zugang)

## Reminders
- Erinnerungen anlegen, auflisten, abweisen

## Billing
- Abrechnungsstatus, Consent, Einstellungen
- Admin-Billing-Übersicht

## Admin
- Accounts verwalten, Pending-Verifizierungen, verifizieren/freischalten
- Tierarzt-Verifizierungen genehmigen/ablehnen
- Audit-Log-Ansicht, Stats, Tiere/Dokumente verwalten
- Orphan-Cleanup, Tag-Löschung
- API-Keys, Test-Results/Test-Runs
- Multi-Tenancy: Tenants + Custom-Domains
- Settings inkl. Mail-Konfiguration & Test-Mail

## Querschnitt
- Audit-Logging aller sensiblen Aktionen (`logAudit`)
- i18n (de/en)
- PWA, Light-Theme als Default
- `/pow` — statische USP-Pitch-Deck-Präsentation
- Öffentliche Seiten: Welcome, ToS, Public-Scan
