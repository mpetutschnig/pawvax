# Plan: Responsive PWA + Dokumentenansicht + Logging + API + Design

## Context

Die aktuelle PWA ist eine fixed-width (480px) Mobile-App ohne Responsiveness für Desktop.
Das Dokument-Filter-Feature hat einen React-Rendering-Bug verursacht (error #310 — Endlosschleife
durch `useMemo` mit instabilen Abhängigkeiten). Außerdem fehlt strukturiertes Logging
(Server-Fehler via console.error statt req.log, kein Client-side Event-Tracking).

Fünf Aufgabenfelder:
1. **Responsive Design** — Alle Seiten für Mobile / Tablet / Desktop
2. **Dokumente neu** — Responsive Darstellung + optimierte Filter
3. **Logging** — Server-Fehler-Handler + Client Event-Tracking
4. **Security & Rollen** — Eindeutige Berechtigungen für Tierärzte, Owner und Behörden sowie VET-API
5. **Design Handoff** — Erstellung eines `DESIGN_BRIEF.md` für ein professionelles "Claude Design"

---

## 1. Responsive Layout-System
*(Wie zuvor)*
...
### 1a. CSS Breakpoints (pwa/src/index.css)
Container von hard 480px auf fluid erweitern:
```css
.container {
  width: 100%;
  max-width: 600px;
  margin: 0 auto;
  padding: var(--space-4);
}
@media (min-width: 1024px) {
  .container { max-width: 1100px; }
  .page { padding-bottom: var(--space-6); }  /* kein Bottom Nav Padding */
}
```

Neue Utility-Klassen:
```css
/* Two-Column auf Desktop */
.content-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-6);
}
@media (min-width: 1024px) {
  .content-grid { grid-template-columns: 360px 1fr; align-items: start; }
}

/* Horizontal scrollende Chip-Zeile (Mobile) */
.chip-row {
  display: flex;
  gap: var(--space-2);
  overflow-x: auto;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
  flex-wrap: nowrap;
}
.chip-row::-webkit-scrollbar { display: none; }
```

### 1b. Navigation (pwa/src/App.tsx)
Neuer Hook `pwa/src/hooks/useMediaQuery.ts`:
```ts
export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [query])
  return matches
}
```

In `App.tsx`:
- `BottomNav` nur wenn `!isDesktop`
- Neues `SideNav` Component wenn `isDesktop`
- `.page` bekommt auf Desktop `padding-left: 220px`

### 1c. AnimalPage — Two-Column auf Desktop
```tsx
<div className="content-grid">
  <div>/* Avatar-Card, Edit-Form, Chips, Buttons */</div>
  <div>/* Dokument-Tabs + Filter + Liste */</div>
</div>
```

---

## 2. Dokumentenansicht

### 2a. Filter optimiert (Verhinderung des useMemo-Bugs)

Die Endlosschleife kam von `useMemo` mit instabilen Referenzen.
**Lösung: Direkte Berechnung im Render** (kein Hook):

```tsx
// Direkte Berechnung (KEIN useMemo)
const completedDocs = documents.filter(d => d.analysis_status !== 'pending_analysis')
const filteredDocs = completedDocs
  .filter(d => filterType === 'all' || d.doc_type === filterType)
  .filter(d => !filterTag || (d.extracted_json?.suggested_tags ?? []).includes(filterTag))
  // ... Sortierung und weitere Filter
const allTags = [...new Set(completedDocs.flatMap(d => d.extracted_json?.suggested_tags ?? []))]
```

*Best Practice Hinweis:* Für Listen < 500 Einträge ist die direkte Berechnung völlig ausreichend.

### 2b/2c. Responsive Listen-Layout
Auf Mobile rendert es wie Cards, auf Desktop wie eine Tabelle — gleicher JSX-Code.

---

## 3. Logging
Globaler Error Handler (`server/src/app.js`), Migration von `console.error` zu `req.log.error` und neues Client-Tracking via `fetch('/api/events', { keepalive: true })`.

---

## 4. Security & Berechtigungen (Docs & Profile)

### 4a. Dokumenten-Sichtbarkeit und Rechte (Klärung & Festlegung)
Das System implementiert eine strikte Rechte-Architektur. Die vollständige "Single Source of Truth" für alle Rechte (wer was sehen, anlegen, bearbeiten und löschen darf) ist im Dokument `Rollen.md` definiert.

**Zusammenfassung der wichtigsten Regeln:**
- **Tierärzte (Vets):** Sehen automatisch alle Dokumente, die von anderen Tierärzten hochgeladen wurden (Sichtbarkeits-Override für medizinische Kontinuität). Sie haben das exklusive Mutationsrecht für ihre Dokumente.
- **Behörden (Authorities):** Dürfen ebenfalls Dokumente hochladen (z.B. Hundeführerschein). Auch hier gilt das exklusive Mutationsrecht.
- **User (Besitzer):** Dürfen Dokumente von Tierärzten oder Behörden **nicht löschen oder bearbeiten**, sondern nur deren Sichtbarkeit für Guests oder Behörden steuern.
- **Admin:** Darf aus Datenschutzgründen keine Tierdaten oder Dokumente lesen, sondern verwaltet nur Accounts und Logs.

### 4b. Profile: Request Verification UI-Fix
Der "Request Verification" Button ist aktuell fehlerhaft. Neue UI (`ProfilePage.tsx`):
- Checkboxen für zu verifizierende Rollen (`vet` / `authority`).
- "Anfordern"-Button sendet den Request.
- Sobald verifiziert, wird einfach "Verifiziert" inkl. Icon angezeigt (kein komplexes UI mehr).

```tsx
{isVerified ? (
  <p><CheckCircle color="var(--success-600)" /> {t('profile.verified')} ({currentRoles.join(', ')})</p>
) : isPending ? (
  <p><Clock /> {t('profile.verificationPending')}</p>
) : (
  <div>
    <p>{t('profile.selectRoleToVerify')}</p>
    <label>
      <input type="checkbox" checked={requestedRoles.includes('vet')}
        onChange={e => setRequestedRoles(prev => e.target.checked ? [...prev, 'vet'] : prev.filter(r => r !== 'vet'))} />
      Tierarzt
    </label>
    <button className="btn btn-primary" onClick={() => requestVerify(requestedRoles)}>
      Anfordern
    </button>
  </div>
)}
```

---

## 5. Externe VET-API (REST)

### Zweck
Andere VET-Plattformen können über einen Token (API-Key), der im Request-Header mitgesendet wird, Dokumente und Impfungen zum Tier hinzufügen. Dies setzt voraus, dass der Tierarzt den Chip gescannt hat oder die ID vorliegen hat.
**Best Practice:** Obwohl der Barcode/NFC-Tag (`tag_id`) unterstützt wird, ist die Nutzung der **UUID des Tieres (`animal_id`) die empfohlene und sicherere Variante** für die API-Kommunikation.

### API Architektur
- Tabelle `api_keys` speichert SHA-256 Hash des Keys.
- Route `POST /api/v1/animals/:animalId/documents` nimmt `X-Api-Key` entgegen.
- Dokumente werden sicher mit `added_by_role = 'vet'` und dem entsprechenden `account_id` des verknüpften Tierarztes gespeichert (Besitzer kann diese danach *nicht* mehr löschen).

---

## 6. Enterprise Features & Business Rules

Um das System auf ein professionelles, skalierbares und rechtssicheres Niveau zu heben, implementiert die Architektur folgende Geschäftsregeln:

### 6a. Chip-Hijacking Prävention
- Versucht ein User einen NFC-Chip oder Barcode zuzuweisen, der bereits vergeben ist, wird der Vorgang abgelehnt. 
- Das System zeigt stattdessen die öffentlichen `readonly`-Dokumente (Guest-View) des Tieres sowie einen Hinweis an: *"Dieser Chip ist bereits einem registrierten Tier zugewiesen."*

### 6b. Tier-Transfer (Besitzerwechsel)
- Self-Service-Prozess: Der aktuelle Besitzer kann in der App einen zeitlich befristeten Transfer-Code für sein Tier generieren.
- Der neue Besitzer gibt diesen Code in seinem Account ein, womit das gesamte Tierprofil (inkl. aller Dokumente und Rechte) auf ihn übertragen wird.

### 6c. DSGVO (Account-Löschung) & Datenexport (Takeout)
- **Takeout:** Jeder User hat das Recht, einen Datenexport anzufordern. Das Backend generiert ein ZIP-Archiv mit allen JSON-Daten und Original-Bildern seiner Tiere.
- **Hard Delete:** Das Löschen eines Accounts (`DELETE /api/accounts/me`) führt zu einem strikten *Hard Delete*. Alle Tiere und sämtliche angehängten Dokumente (inkl. Tierarzt-Dokumente) werden unwiderruflich gelöscht.
- **UX:** Wegen der Tragweite erfolgt in der UI eine mehrmalige Bestätigungsabfrage inkl. der Option, vorher den Datenexport (Takeout) zu starten.

### 6d. Security: Live-Rechteprüfung (Zero Trust)
- Da JWT-Tokens eine gewisse Laufzeit haben, vertraut das Backend bei kritischen Schreibvorgängen (z.B. Tierarzt lädt offizielles Dokument hoch) nicht allein auf die Rolle im Token.
- Vor dem Insert/Update prüft das Backend live in der Datenbank (`SELECT verified, roles FROM accounts`), ob die Rolle (`vet` oder `authority`) im exakten Moment noch gültig ist.

### 6e. API Rate-Limiting
- Die externe VET-API (REST) wird zwingend durch ein Rate-Limit abgesichert (z.B. max. 60 Requests pro Minute pro API-Key), um Spam und DDoS-Attacken durch potenziell kompromittierte Drittsysteme zu verhindern.

### 6f. Haftungsausschluss (OCR Disclaimer)
- Die KI-Textextraktion dient als Lesehilfe. Rechtlich bindend bleibt das hochgeladene Originaldokument.
- Am Ende der Dokumenten-Liste in der UI wird zwingend ein Disclaimer platziert: *"Die extrahierten Textdaten dienen nur der Übersicht. Rechtlich bindend ist ausschließlich das angehängte Originaldokument (Foto)."*

### 6g. Audit-Log Retention
- Das in Punkt 3 etablierte Audit-Logging ist wichtig, aber die Datenmengen dürfen nicht ewig anwachsen.
- Eine Server-Routine (z.B. via Cron oder Scheduler) löscht alle Einträge in der Tabelle `audit_logs`, die älter als **90 Tage** sind.

### 6h. Multilanguage (i18n)
- Die Anwendung ist strikt mehrsprachig aufgebaut. Hardcodierte Strings in der UI sind verboten; alles muss über die entsprechenden `t()`-Funktionen (React-i18next) laufen.

---

## 7. Design-Dokument: `DESIGN_BRIEF.md` für "Claude Design"

Es wird ein eigenes Markdown-Dokument (`pwa/DESIGN_BRIEF.md`) generiert. Dieses Dokument dient als direkter Input (Prompt) für den Claude Design Agenten, um ein **hochgradig professionelles Business Design** zu entwerfen. 

Das Dokument weist Claude explizit an:
- **"Keine Kindergarten-Optik!"** - Das Design muss seriös, medizinisch und vertrauenswürdig wirken (für Behörden und Tierärzte geeignet).
- Es darf nichts dem Zufall überlassen werden: Alle Komponenten, Spacings, Schatten und Breakpoints müssen bis ins kleinste Detail definiert und als CSS-Variablen (HEX oder OKLCH) übergeben werden.
- **Franchise-Farbgebung (Admin-Page):** Detaillierte Spezifikation, wie die Primärfarbe für das Admin-Panel dynamisch von Franchisenehmern angepasst werden kann (CSS-Variablen `--admin-sidebar-bg`, `--primary-*`).
- **Komponenten-Liste:** Vollständige Spezifikation aller UI-Elemente (`SideNav`, `AdminTable`, `FilterChips`, `PetCard`, Forms, Badges).
