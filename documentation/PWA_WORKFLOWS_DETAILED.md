# PAW — Detaillierte Workflow-Architektur

Diese Dokumentation bietet einen vollständigen Überblick über alle technischen und fachlichen Prozesse des PAW-Systems.

---

## 1. Benutzer-Lifecycle & Zugriffskontrolle

Der Einstieg erfolgt über die PWA, die je nach Authentifizierungsstatus und Rolle unterschiedliche Funktionen freischaltet.

```mermaid
flowchart TD
  Start([App Start]) --> CheckJWT{JWT vorhanden?}
  CheckJWT -- Nein --> Welcome[Welcome / Landing Page]
  Welcome --> Login[Login / Registrierung]
  Login --> AuthOk[JWT in LocalStorage]
  
  CheckJWT -- Ja --> Refresh[Token Refresh /api/auth/refresh]
  Refresh --> RoleGuard{Rolle?}
  
  RoleGuard -- Owner/User --> Animals[Meine Tiere Liste]
  RoleCheck -- Vet --> Animals
  RoleCheck -- Authority --> Animals
  RoleCheck -- Guest --> Restricted[Eingeschränkter Modus]
  
  Animals --> PetDetails[Tier-Detailansicht]
```

### Rollen-Matrix & Berechtigungen
- **Owner**: Volle Kontrolle über eigene Tiere und Dokumente.
- **Vet**: Kann Dokumente für gescannte Tiere hinzufügen (Verified Badge).
- **Authority**: Lesezugriff auf Gesundheitsdaten für Kontrollen.
- **Admin**: Systemkonfiguration, User-Verifizierung und Billing-Management.

---

## 2. Tier-Management (CRUD & Transfer)

Besitzer können Tiere anlegen, verwalten und sicher an andere Benutzer übertragen.

```mermaid
flowchart TD
  Create[Tier anlegen] --> DB_Insert[(Datenbank)]
  PetDetail[Detailansicht] --> Edit[Profil bearbeiten]
  PetDetail --> Archive[Archivieren / Verstorben]
  PetDetail --> Transfer[Transfer-Code generieren]
  
  Transfer --> Code[6-stelliger Code]
  Code -- Übergabe --> Recipient[Neuer Besitzer]
  Recipient --> Accept[Code eingeben /api/animals/transfer/accept]
  Accept --> OwnershipChange[account_id Update]
```

---

## 3. Identifikation: NFC, QR & Chip

Die Identifikation erfolgt über drei Kanäle, die physische Tags mit digitalen Profilen verknüpfen.

```mermaid
flowchart LR
    Scan[Scan / NFC / QR] --> Normalize[Tag-ID normalisieren]
    Normalize --> Lookup{DB Lookup}
    
    Lookup -- Gefunden --> Profile[Tierprofil laden]
    Lookup -- Neu --> Link[Tag mit Tier verknüpfen]
    
    Profile --> RoleFilter{Sichtbarkeit?}
    RoleFilter --> View[Anzeige der freigegebenen Daten]
```

### Tag-Typen
- **NFC**: Native Browser-NFC API (NDEF) zum Lesen und Beschreiben.
- **Barcode/QR**: Kamera-basiertes Scanning (html5-qrcode).
- **Chip**: Manuelle Eingabe oder Extraktion aus dem Heimtierausweis via KI.

---

## 4. Dokumenten-Pipeline & KI-Analyse

Der technisch anspruchsvollste Prozess: Upload über WebSockets mit Live-KI-Feedback.

```mermaid
flowchart TD
  Capture[Kamera / Galerie] --> WS_Connect[WS Verbindung + Auth]
  WS_Connect --> MultiPage{Mehrere Seiten?}
  
  MultiPage -- Ja --> ChunkUpload[Binär-Chunks senden]
  ChunkUpload --> Merge[Serverseitiger Merge]
  
  Merge --> AI_Trigger[Analyse Pipeline]
  AI_Trigger --> Classify[Typ-Klassifizierung]
  Classify --> Extract[Feld-Extraktion]
  Extract --> History[Analyse-Historie speichern]
  
  History --> Result[Ergebnis an PWA senden]
```

### KI-Features
- **Multi-Provider**: Wahl zwischen Gemini, Claude und OpenAI.
- **Re-Analyze**: Bestehende Dokumente mit neuen Modellen/Prompts neu auswerten.
- **Versioning**: Jede Analyse wird historisiert (`analysis_history`).

---

## 5. Privacy-Engine & Granulare Freigaben

PAW nutzt ein mehrstufiges Freigabesystem: Global (per Rolle) und Pro Dokument.

```mermaid
flowchart TD
  Owner[Besitzer] --> GlobalSettings[Globale Rollen-Rechte]
  GlobalSettings --> Role_Guest[Was sieht ein Fremder?]
  GlobalSettings --> Role_Vet[Was sieht ein Tierarzt?]
  
  Owner --> DocSettings[Dokument-Sichtbarkeit]
  DocSettings --> AllowedRoles[allowed_roles JSON]
  
  Owner --> RecordSettings[Einzel-Feld Freigabe]
  RecordSettings --> FieldPerms[record_permissions JSON]
```

---

## 6. Smart Reminders (Erinnerungen)

Erinnerungen werden entweder manuell erstellt oder direkt aus KI-Ergebnissen abgeleitet.

```mermaid
flowchart LR
    AI_Result[KI-Ergebnis] -- "Nächste Impfung: Datum" --> Suggest[Vorschlag in UI]
    Suggest --> Create[Reminder anlegen]
    
    Manual[Manuelle Eingabe] --> Create
    
    Create --> List[Reminders Dashboard]
    List --> Dismiss[Erledigt / Archivieren]
```

---

## 7. Veterinary API (VET-API)

Schnittstelle für externe Klinik-Systeme zum automatisierten Datenaustausch.

```mermaid
flowchart LR
    External[Klinik-Software] -- "X-Api-Key" --> Auth[API-Key Auth]
    Auth --> RateLimit[Rate Limiting]
    
    RateLimit --> Action{Aktion?}
    Action -- POST /documents --> PushDoc[Dokument + KI Trigger]
    Action -- GET /animals --> PullHistory[Historie abrufen]
    Action -- POST /vaccinations --> Structured[Strukturierte Daten]
```

---

## 8. Billing & Ressourcen-Management

Verwaltung der KI-Kosten und System-Budgets.

```mermaid
flowchart TD
  Request[Analyse Request] --> KeyCheck{Eigener Key?}
  KeyCheck -- Nein --> BudgetCheck{Budget vorhanden?}
  BudgetCheck -- Ja --> Fallback[System-Fallback nutzen]
  BudgetCheck -- Nein --> Error[Budget exceeded]
  
  Fallback --> UsageLog[Eintrag in usage_logs]
  UsageLog --> Charge[Abrechnung]
```

---

## 9. Audit & Nachvollziehbarkeit

Jede sicherheitsrelevante Aktion wird unveränderlich protokolliert.

```mermaid
flowchart LR
  Action[User Aktion] --> AuditLog[logAudit Service]
  AuditLog --> DB[(audit_log Tabelle)]
  DB --> AdminView[Admin Audit Dashboard]
```

**Protokollierte Aktionen:**
- Logins / Fehlschläge
- Dokument-Uploads & Löschungen
- Freigabe-Änderungen
- Admin-Eingriffe
- API-Zugriffe
