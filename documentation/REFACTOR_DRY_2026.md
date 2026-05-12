# Plan: DRY-Refaktorierung & einheitlicher Dokument-Flow

**Branch:** `refactor/comprehensive-cleanup`  
**Ziel:** Code-Qualität erhöhen, DRY-Verstösse beheben, einheitlicher Scan-Flow für alle Rollen

---

## Entschiedene Design-Fragen

| Thema | Entscheidung |
|---|---|
| System-KI Kosten | Sofort zeigen (bevor Provider/Modell-Auswahl) |
| Modell-Auswahl | Dropdowns behalten, günstigstes Modell als Default |
| Sichtbarkeit-Checkboxen | Nach Upload in Dokument-Detail (nicht im Capture-Screen) |
| vet_report Prompt | Spezieller Prompt (Laborbefunde, Diagnosen, Symptome) |

---

## Phase 1: Backend – DRY & Code-Qualität

### P1.1 — ocr.js aufteilen (1589 Zeilen)
**Status:** `[x] erledigt`

Zieldateien:
- `server/src/services/ocr/imageUtils.js` — loadImageAsBase64, detectMimeType, parseStructuredModelResponse, sanitize*, normalizeDate*, normalizeConfidence*, normalizeModelMetadata
- `server/src/services/ocr/prompts.js` — PROMPTS object, getPromptForDocumentType, withConfidenceInstructions, normalizeDocumentType, normalizeRequestedDocumentType
- `server/src/services/ocr/providers.js` — **merged** analyzeImageWithProvider(provider, key, model, ...), classifyImageWithProvider(provider, key, ...) – ersetzt 6 separate Funktionen
- `server/src/services/ocr/analysis.js` — analyzeDocument, classifyDocumentType, buildExtractedDocumentData, evaluateExtractionQuality, isVaccinationLikeDocument, inferSuggestedType, collectListRecords, collectTextFragments, firstNonEmptyArray, etc.
- `server/src/services/ocr/mock.js` — analyzeWithMockOcr
- `server/src/services/ocr/index.js` — re-exportiert alles was bisher direkt aus ocr.js importiert wird

Zu entfernende Duplikate:
- Mime-Type-Erkennung (6x `if (base64.startsWith('/9j/')...)` → 1x `detectMimeType()`)
- Image-Loading (6x `readFileSync + toString('base64')` → 1x `loadImageAsBase64()`)
- `analyzeWithGemini`, `analyzeWithClaude`, `analyzeWithOpenAI` → 1x `analyzeImageWithProvider(provider, key, model, imagePath, prompt, onProgress)`
- `classifyWithGemini`, `classifyWithClaude`, `classifyWithOpenAI` → 1x `classifyImageWithProvider(provider, key, imagePath, prompt)`

### P1.2 — vet_report Prompt
**Status:** `[x] erledigt`

- DE + EN Prompt für Tierarztbefunde (Diagnose, Symptome, Labor, Medikamente, Tierarzt-Info)
- In `server/src/services/ocr/prompts.js` (oder altes ocr.js wenn P1.1 noch nicht fertig)

### P1.3 — Günstigstes Modell als Default
**Status:** `[x] erledigt`

Änderungen:
- `server/src/utils/aiModels.js`: anthropic default `claude-3-5-sonnet-20241022` → `claude-3-5-haiku-20241022`
- `pwa/src/utils/documentAnalysis.ts`: gleiche Änderung
- Preisinformation als Kommentar bei den Modell-Optionen ergänzen (damit klar ist welches günstig ist)

---

## Phase 2: Frontend – Einheitlicher Scan-Flow

### P2.1 — `useAiConfig` Hook extrahieren
**Status:** `[x] erledigt`

Neue Datei: `pwa/src/hooks/useAiConfig.ts`

Kapselt:
- `getMe()` Aufruf → `hasGemini`, `hasAnthropic`, `hasOpenai`, `hasSystemAi`, `systemFallbackEnabled`
- `getBillingMe()` Aufruf → `billingConsentAccepted`, `billingPricePerPage`
- `/api/ai/models` Aufruf → `availableModels`
- `retryProvider`, `retryModel` State mit handleProviderChange
- `hasOwnKey`, `usingFallback` computed values

Ersetzt ~30 useState + useEffect Zeilen in DocumentScanPage.

### P2.2 — Sichtbarkeits-Checkboxen aus Capture-Screen entfernen
**Status:** `[x] erledigt`

- `DocumentScanPage`: `allowedRoles` State entfernen, immer mit `['vet', 'authority']` als Default uploaden
- `DocumentDetailPage`: Sichtbarkeits-Editor mit PATCH-Aufruf hinzufügen (Checkboxen vet/authority/guest)
- Backend `PATCH /api/documents/:id/visibility` Route prüfen (sollte bereits existieren)

### P2.3 — DocumentScanPage Kern-Refaktor
**Status:** `[x] erledigt`

Aktuelles Problem: `DocumentAnalysisForm` wird 3x fast identisch gerendert.

Neuer einheitlicher Flow für ALLE Rollen:

```
PHASE capture:   Bild(er) aufnehmen / hochladen
PHASE configure: Dokumenttyp + Provider/Modell auswählen (+ Kostenanzeige wenn System-KI)
PHASE processing: Upload-Fortschritt + KI-Analyse-Spinner
PHASE error:     Fehlermeldung + Retry / Speichern
```

Bei Retry/Re-Analyse (documentId vorhanden): Direkt zu PHASE configure (kein capture).

Einzelner `<DocumentAnalysisForm>` Render, gesteuert durch `phase === 'configure'`.

Duplikate die entfernt werden:
- Batch-Modal (Zeilen 964-1026) identisch mit Full-Page (Zeilen 202-293) → zusammenführen
- Fehler-Block mit/ohne documentId (Zeilen 901-958) → einzelner Block
- `hasOwnKey` wird 4x lokal neu berechnet → aus Hook

### P2.4 — System-KI Kosten sofort zeigen (UX)
**Status:** `[x] erledigt`

Im configure-Screen: Wenn User keinen eigenen Key hat UND System-KI verfügbar:
- Wenn Consent noch nicht gegeben: Info-Card mit Kosten prominant OBEN in der Form
  - "System-KI kostet X Cent/Seite. Für N Seiten = Y Cent."
  - Checkbox "Ich stimme zu" muss aktiviert sein → dann Submit-Button aktiv
- Wenn Consent bereits gegeben: kleines Info-Banner "System-KI wird verwendet (X Cent/Seite)"
- Kein separates Modal mehr nötig (BillingConsentModal kann entfernt werden)

### P2.5 — Fehler-Anzeige vereinheitlichen
**Status:** `[x] erledigt`

Beide Fehler-Blöcke (mit/ohne documentId) in einen Block zusammenführen.
Einheitliche Buttons: "Erneut versuchen" (wenn Key vorhanden) + "Für später speichern"

---

## Phase 3: Rollen-Konsistenz

### P3.1 — Rollencheck in DocumentScanPage vereinfachen
**Status:** `[ ] offen`

Aktuell: `localStorage.getItem('role')` direkt im Component-Body (Code-Smell).
Besser: Custom Hook oder Kontext. Rollen aus JWT-Payload in Auth-Context speichern.

Vereinfachte Regel:
- `guest` → kein Zugriff auf Upload (Redirect oder Fehlermeldung)
- `user` / `vet` / `authority` / `admin` → Zugriff, gleicher Flow

`user` und `owner` sind bereits konsolidiert (Migration db87ea9).

### P3.2 — NFC/Barcode Scan (ScanPage.tsx)
**Status:** `[x] bereits korrekt implementiert`

ScanPage ist rollen-agnostisch: liest Tag → navigiert zu /animals/:id.
Kein Handlungsbedarf.

---

## Phase 4: Restliche Code Smells

### P4.1 — Deutsche Kommentare im Code → Englisch
**Status:** `[x] erledigt`

Betroffene Dateien: animals.js, auth.js, admin.js, documents.js, tenants.js, app.js, storage.js, documentUpload.js, analysisPipeline.js

### P4.2 — Inline Styles in DocumentScanPage reduzieren
**Status:** `[ ] offen`

Häufig wiederholte Inline-Styles in CSS-Klassen auslagern oder in Style-Objekte.

---

## Commit-Strategie

Jeder abgeschlossene Schritt → eigener Commit + Push.

Commit-Reihenfolge:
1. `refactor: split ocr.js into focused modules, extract DRY helpers` (P1.1)
2. `feat: add vet_report AI prompt (DE+EN)` (P1.2)
3. `fix: set cheapest model as default (haiku/flash-lite/gpt-4o-mini)` (P1.3)
4. `refactor: extract useAiConfig hook from DocumentScanPage` (P2.1)
5. `refactor: move visibility controls to DocumentDetailPage` (P2.2)
6. `refactor: unify DocumentScanPage into single-path flow` (P2.3 + P2.4 + P2.5)
7. `refactor: simplify role check in DocumentScanPage` (P3.1)
8. `chore: translate code comments to English` (P4.1)
9. `chore: versionbump YYYYMMDD_HHMM`

---

## Wiederaufnahme

Um den Plan fortzusetzen: Diese Datei lesen, Status-Checkboxen prüfen, mit nächstem `[ ] offen` weitermachen.
Kein Schritt wird doppelt ausgeführt — Status wird nach Abschluss auf `[x] erledigt` gesetzt.
