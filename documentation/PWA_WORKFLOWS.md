# PAW — PWA Workflow Dokumentation

Diese Dokumentation beschreibt die zentralen fachlichen und technischen Abläufe der PAW Progressive Web App (PWA).

---

## 1. Einstieg & Authentifizierung

```mermaid
flowchart TD
  Start([Start]) --> Welcome{Erster Besuch?}
  Welcome -- Ja --> WelcomePage[Welcome Screen]
  Welcome -- Nein --> LoginPage[Login Screen]
  
  LoginPage --> Auth[JWT Auth via API]
  Auth --> RoleCheck{Rolle?}
  
  RoleCheck -- User/Vet/Admin --> AnimalsPage[Tier-Übersicht]
  RoleCheck -- Guest --> PublicScan[Eingeschränkte Sicht]
  
  AnimalsPage --> PetDetails[Tier-Profil]
  PetDetails --> DocScan[Dokument-Scan]
  PetDetails --> Sharing[Freigaben verwalten]
```

### Beschreibung
1.  **Welcome & Login**: Neue Benutzer werden begrüßt, bestehende loggen sich via JWT ein.
2.  **Rollen-Guard**: Das System prüft die Rolle (`user`, `vet`, `authority`, `guest`, `admin`) und schaltet entsprechende Menüpunkte frei.
3.  **Tier-Zentralisierung**: Der Hauptfokus liegt auf der Liste der Tiere (`AnimalsPage`), von der aus alle weiteren Aktionen (Scans, Details, Freigaben) starten.

---

## 2. Dokument-Upload & KI-Analyse

```mermaid
sequenceDiagram
    participant U as Benutzer
    participant WS as WebSocket
    participant OCR as Gemini AI
    participant DB as Datenbank
    participant FS as Dateisystem

    U->>U: Dokument erfassen
    U->>WS: Verbinden & Auth
    WS-->>U: auth_ok
    
    loop Pro Seite
        U->>WS: upload_start
        WS-->>U: ready
        U->>WS: Binär-Chunks
        WS->>FS: Speichern
        U->>WS: upload_end
        WS->>DB: Log Seite
    end
    
    WS->>OCR: Trigger Analyse
    Note over OCR: Klassifizierung & Extraktion
    OCR-->>WS: JSON Result
    WS->>DB: In documents speichern
    WS-->>U: Analyse fertig
```

### Prozess-Details
-   **Multi-Page Support**: Benutzer können mehrere Seiten fotografieren, die serverseitig zu einem Dokument zusammengefügt werden.
-   **Live-Feedback**: Der WebSocket überträgt Statusmeldungen direkt in die UI.
-   **Daten-Hybrid**: Die Ergebnisse landen als strukturiertes JSON in der Datenbank.

---

## 3. Notfall-Scan & Öffentliche Freigabe

```mermaid
flowchart LR
    Tag[Physischer Tag / QR] -- Scan --> URL[URL: /t/:tagId]
    URL --> PublicPage[PublicScanPage]
    
    PublicPage --> API[Backend Request]
    API --> CheckShare{Freigabe aktiv?}
    
    CheckShare -- Nein --> Error[Privat-Meldung]
    CheckShare -- Ja --> FetchData[Lade Tierdaten]
    
    FetchData --> Filter{Rollen-Filter}
    Filter --> Display[Anzeige: Name, Foto, Dokumente]
```

### Besonderheiten
-   **Zero Friction**: Kein Login erforderlich.
-   **Datenschutz**: Besitzer entscheidet über Zugriff pro Rolle.

---

## 4. Abrechnung (Billing) & KI-Zustimmung

```mermaid
flowchart TD
    Upload[Upload-Start] --> KeyCheck{Eigener KI-Key?}
    KeyCheck -- Ja --> Process[Verarbeiten]
    KeyCheck -- Nein --> Consent{Zustimmung?}
    
    Consent -- Nein --> Modal[Billing Modal]
    Modal -- Abbrechen --> Cancel([Ende])
    Modal -- Zustimmen --> SaveConsent[Zustimmung speichern]
    
    SaveConsent --> Process
    Process --> Charge[Guthaben belasten]
```

---

## 5. Rollen-Matrix
| Rolle | Sichtbarkeit | Schreibrechte |
| :--- | :--- | :--- |
| **Owner** | Alle eigenen Tiere/Docs | Vollzugriff |
| **Vet** | Freigegebene Daten | Kann verifizierte Docs erstellen |
| **Authority** | Impfstatus & Identität | Nur Lesezugriff |
| **Guest** | Basis-Infos (Notfall) | Keine Schreibrechte |
| **Admin** | Systemweit | Volle Konfiguration |
