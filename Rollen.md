# Rollen und Berechtigungskonzept

Dieses Dokument definiert als "Single Source of Truth" die Zugriffs- und Mutationsrechte aller Akteure in der PAW-App.

## 1. Read-Only / Guest
- **Zugriff:** Ohne Anmeldung (z.B. via NFC-Scan oder QR-Code).
- **Lesen:** Darf **ausschließlich** Dokumente und Tier-Metadaten lesen, die vom Besitzer explizit für die Rolle "Guest / Public" freigegeben wurden.
- **Schreiben:** Keine Rechte.

## 2. User (Tierbesitzer)
- **Eigentum:** Besitzt das Tier-Profil und verwaltet dessen Freigaben.
- **Lesen:** Voller Zugriff auf alle Daten und Dokumente seines Tieres.
- **Schreiben (Eigene Dokumente):** Kann eigene Dokumente hochladen, taggen, bearbeiten und löschen.
- **Schreiben (Fremde Dokumente):**
  - Dokumente, die von Tierärzten oder Behörden hochgeladen wurden, können vom Besitzer **weder bearbeitet noch gelöscht** werden.
  - Der Besitzer darf bei diesen Dokumenten **nur die Sichtbarkeit** (z.B. für Guests oder Behörden) ändern.
- **Freigaben:** Steuert die Sichtbarkeit von Metadaten (Name, Geburtsdatum, Rasse, Anschrift) und Dokumenten für andere Rollen.

## 3. Tierarzt (Vet)
- **Verifizierung:** Verifizierte Rolle (Zuweisung erfolgt manuell durch einen Admin nach Prüfung).
- **Lesen:** 
  - Sieht alle Dokumente, die der Guest sieht.
  - **Medizinische Kontinuität:** Sieht automatisch **alle Dokumente, die von irgendeinem Tierarzt** hochgeladen wurden, unabhängig von der Freigabe-Einstellung des Besitzers (Sichtbarkeits-Override für Vets).
- **Schreiben (Eigene Dokumente):**
  - Kann Dokumente (z.B. Impfungen, Befunde) scannen und dem Tier zuweisen.
  - **Exklusives Mutationsrecht:** Darf als Einziger seine selbst hochgeladenen Dokumente bearbeiten oder löschen.
- **Schreiben (Fremde Dokumente):** Darf keine Dokumente bearbeiten oder löschen, die von Besitzern, Behörden oder anderen Tierärzten hochgeladen wurden.
- **UI-Kennzeichnung:** Von Tierärzten hochgeladene Dokumente erhalten ein Verifizierungs-Badge (z.B. grüner Haken).

## 4. Behörde (Authority)
- **Verifizierung:** Verifizierte Rolle (Zuweisung erfolgt manuell durch einen Admin nach Prüfung).
- **Lesen:**
  - Sieht alle Dokumente, die der Guest sieht.
  - Sieht alle Dokumente, die explizit für die Rolle "Behörde" freigegeben wurden.
  - Sieht automatisch **alle von Behörden hochgeladenen Dokumente**.
- **Schreiben (Eigene Dokumente):**
  - Kann behördliche Dokumente (z.B. Hundeführerschein, Zertifikate, Ausbildungen) hochladen.
  - **Exklusives Mutationsrecht:** Darf als Einzige ihre selbst hochgeladenen Dokumente bearbeiten oder löschen (Besitzer kann diese nicht löschen).
- **Schreiben (Fremde Dokumente):** Darf keine Dokumente von Besitzern oder Tierärzten bearbeiten/löschen.

## 5. Admin
- **Zweck:** Technische und administrative Plattform-Verwaltung.
- **Account-Verwaltung:** Prüft Verifizierungsanfragen und vergibt die Rollen `vet` und `authority`.
- **System-Verwaltung:** Einsicht in Audit-Logs und Fehlerprotokolle.
- **Datenschutz:** Hat **keinen** inhaltlichen Lese- oder Schreibzugriff auf Tiere, medizinische Dokumente oder persönliche User-Zertifikate (striktes Need-to-know-Prinzip).

