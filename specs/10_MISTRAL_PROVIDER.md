# Spec 10 — Mistral als AI-/OCR-Provider

Status: IMPLEMENTED · Autor: Marco · Datum: 2026-06-20

## 1. Ziel

Mistral als vierten AI-Provider neben `google`, `anthropic`, `openai` einführen — für
Impfpass-/Dokument-Erkennung (Vision) und Klassifikation. Konfigurierbar über die
Settings-UI **pro User** (Profile) **und system-weit** (Admin), exakt wie die bestehenden
Provider.

Nicht in Scope (separate Spec): dediziertes `mistral-ocr`-Modell als zweiter Pass.

## 2. Hintergrund / Entscheidungen

- Mistral **Le Chat Pro** (Abo) ≠ **API**. App-Integration braucht zwingend API-Key von
  `console.mistral.ai`, eigene Abrechnung, pay-per-use. Abo-„Tokens" nicht nutzbar.
- Mistral-API ist **OpenAI-kompatibel**: `POST https://api.mistral.ai/v1/chat/completions`,
  `Authorization: Bearer <key>`, unterstützt `response_format: { type: 'json_object' }` und
  `image_url`-Content. → Provider-Branch ≈ Kopie des OpenAI-Zweigs.
- Vision-Modelle (Stand 06/2026, $/M tokens in/out): Small 4 $0.10/$0.30 · Medium 3.5
  $1.50/$7.50 · Pixtral Large $2.00/$6.00. Kosten/Scan mit Small 4 ≈ $0.0004 → ~2500/$1.
- Provider-id im Code: **`mistral`**.

## 3. Modell-Liste

```js
mistral: [
  { id: 'mistral-small-latest',  name: 'Mistral Small 4 (günstig)' },
  { id: 'mistral-medium-latest', name: 'Mistral Medium 3.5' },
  { id: 'pixtral-large-latest',  name: 'Pixtral Large' }
]
```
Default-Modell: `mistral-small-latest` (billigste Vision-Option).

## 4. Touch-Liste (alle Änderungen)

### Backend

| # | Datei | Änderung |
|---|-------|----------|
| B1 | `server/src/utils/aiModels.js` | `mistral` in `AI_MODEL_OPTIONS`; `ALLOWED_MISTRAL_MODELS`; `DEFAULT_MODEL_BY_PROVIDER.mistral`; `isAllowedModel`-Branch (`p === 'mistral'`) |
| B2 | `server/src/services/ocr/providers.js` | `mistral`-Branch in `analyzeImageWithProvider` **und** `classifyImageWithProvider` (OpenAI-Zweig kopieren: URL → `https://api.mistral.ai/v1/chat/completions`, Auth Bearer, `response_format: json_object`, `image_url`) |
| B3 | `server/src/services/appSettings.js` | `system_mistral_token` + `system_mistral_model` in Settings-Keys, `SECRET_SETTINGS_KEYS`, status-flag `has_system_mistral_token`, `getSystemAiKeys` → `mistralKey` |
| B4 | `server/src/db/schema.sql` | Spalten `mistral_token TEXT`, `mistral_model TEXT DEFAULT 'mistral-small-latest'` in `accounts` |
| B5 | `server/src/db/index.js` | idempotente Migration: `ALTER TABLE accounts ADD COLUMN IF NOT EXISTS mistral_token TEXT` + `... mistral_model TEXT DEFAULT 'mistral-small-latest'`; analog System-Settings falls eigene Tabelle |
| B6 | `server/src/routes/auth.js` | `SELECT mistral_token`; `!!fullAccount?.mistral_token` → `has_mistral_token`; Update-Handler-Branch für `mistral_token` (encrypt) + `mistral_model` |
| B7 | `getSystemAiKeys`-Consumer (`documentUpload.js`, `analysisPipeline.js`, `memoAnalysis.js`, `ai.js`, `vet-api.js`) | Fallback-Kette um `mistral` ergänzen wo Provider durchgereicht wird |

### Frontend

| # | Datei | Änderung |
|---|-------|----------|
| F1 | `pwa/src/utils/documentAnalysis.ts` | `mistral`-Modelle + Default |
| F2 | `pwa/src/hooks/useAiConfig.ts` | `hasMistral` state aus `me.has_mistral_token`; auto-select-Kette (nach openai); `handleProviderChange`-Branch |
| F3 | Profile-Settings-UI (`ProfilePage.tsx`) | Provider-Option „Mistral" + Key-Input-Feld + Modell-Dropdown |
| F4 | Admin-Settings-UI (`AdminPage.tsx`) | System-Key-Feld + System-Modell-Dropdown |
| F5 | `pwa/src/locales/de.json` + `en.json` | Labels/Strings für Mistral |

### Tests

| # | Datei | Änderung |
|---|-------|----------|
| T1 | `server/tests/api.test.js` | `isAllowedModel('mistral', …)`, `resolveModel('mistral')`, Settings round-trip |
| T2 | `server/tests/analysis_regression.test.js` | mistral-Provider mock + parse-Pfad |

## 5. Provider-Branch (B2) — Referenz-Implementierung

```js
if (provider === 'mistral') {
  if (onProgress) onProgress(`Sending POST request to Mistral ${model} API...`)
  const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({
      model,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You are a veterinary document analyzer. Always return valid JSON.' },
        { role: 'user', content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: `data:${mimeType};base64,${base64}` }
        ] }
      ]
    })
  })
  if (!response.ok) {
    const errorText = await response.text()
    log.error({ provider: 'mistral', statusCode: response.status, err: errorText }, 'Mistral API error')
    throw Object.assign(new Error(`Mistral API error (${response.status}): ${errorText}`), { code: response.status })
  }
  const result = await response.json()
  const text = result.choices?.[0]?.message?.content || ''
  return { provider: 'mistral', data: parseStructuredModelResponse(text, 'Mistral', documentType, typeConfidence) }
}
```
⚠️ Verifizieren beim Bau: Mistral `image_url`-Form — manche Versionen erwarten
`{ image_url: { url: '...' } }` (wie OpenAI), andere `image_url: '...'` direkt. Mit echtem
Bild gegen API testen.

## 6. Sicherheit

- API-Key NUR server-seitig. Frontend bekommt nur `has_mistral_token` (boolean), nie den Key.
- Key verschlüsselt in DB (`encrypt`/`decrypt` wie bestehende Tokens; `mistral_token` in
  `SECRET_SETTINGS_KEYS`).
- Key-Set/Change als sensible Aktion via `logAudit` loggen (CLAUDE.md Hard Constraint).

## 7. Akzeptanzkriterien

1. User kann im Profil Mistral-Key + Modell setzen → `has_mistral_token=true`, Key nie im
   Client sichtbar.
2. Admin kann System-Mistral-Key + Modell setzen.
3. Impfpass-Scan mit Provider `mistral` liefert strukturiertes JSON wie google/anthropic/openai.
4. Klassifikation funktioniert mit `mistral`.
5. `isAllowedModel('mistral', 'mistral-small-latest') === true`; ungültiges Modell fällt auf
   Default zurück.
6. Bestehende Provider unverändert (keine Regression).
7. Version-Bump (beide package.json) + commit/push.

## 8. Offene Punkte

- [ ] `image_url`-Format gegen echte Mistral-API verifizieren (siehe §5).
- [ ] Auto-select-Reihenfolge: wo Mistral einreihen? (Vorschlag: nach google, da Small 4
      vergleichbar billig — oder ans Ende, um Default-Verhalten nicht zu ändern.)
