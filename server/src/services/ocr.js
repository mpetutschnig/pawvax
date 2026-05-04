import { createWorker } from 'tesseract.js'
import { readFileSync, existsSync } from 'fs'
import { basename, resolve } from 'path'

// Module-level logger — replaced by setOcrLogger() on startup
let _log = {
  debug: () => {},
  info: () => {},
  warn: (data, msg) => process.stderr.write(JSON.stringify({ level: 'warn', name: 'ocr', ...data, msg }) + '\n'),
  error: (data, msg) => process.stderr.write(JSON.stringify({ level: 'error', name: 'ocr', ...data, msg }) + '\n'),
}
export function setOcrLogger(log) { _log = log }

// Document type-specific extraction prompts
const CLASSIFICATION_PROMPT = `
Du bist ein Veterinär-Dokumentenanalyst. Analysiere das folgende Tierdokument und klassifiziere es genau.

DOKUMENTTYPEN (exakte Beschreibung):

1. "vaccination" — Impfpass, Impfbescheinigung, Impfprotokoll, Impftabellen, Impfaufkleber
   - Zeigt: Impfstoff(e), Impfdatum(e), Chargennummer, Gültig bis Datum, Tierarzt-Stempel/Unterschrift
   - Erkennungsmerkmale:
     * Tabellenformat mit Spalten wie "Impfstoff", "Datum", "Chargennummer", "Gültig bis", "Stempel/Unterschrift"
     * ODER: Impfstoff-Aufkleber (Stickers) mit Namen wie "Nobivac", "Eurican", "Virbagen", "Hexadog" etc.
     * ODER: Seitentitel "Impfpass", "Sonstige Impfungen", "Nachimpfungen", "IX. Sonstige Impfungen"
     * ODER: Impfstoff-Namen + Daten/Chargennummern/Hersteller erkennbar
   - Schlüsselwörter: Impfpass, Impfung, Impfstoff, Tollwut, Staupe, Parvo, Leptospirose, Zwingerhusten, Nobivac, Eurican, Virbagen, MSD, Boehringer, Virbac, Chargennummer, Gültig
   - NICHT: allgemeine Gesundheitsberichte, Medikamentenrechnungen, Behandlungsberichte ohne strukturierte Impfeinträge

2. "pedigree" — Stammbaum, Urkunde, Zuchtdokument, Registrierung
   - Zeigt: Zuchtverband-Logo, Pedigree-/Stammbaum-Grafik, Eltern/Vorfahren, Registrierungsnummer, Zuchtqualifikationen
   - NICHT: einfache Geburtsurkunden ohne Zuchtverbandsstempel, Impfpässe

3. "dog_certificate" — Hundeführerschein, Sachkundenachweis, Prüfzertifikat
   - Zeigt: "Hundeführerschein" oder "Sachkundenachweis" Titel, Prüfbewertung, Bestätigung absolviert, Ausstellungsdatum
   - NICHT: Zuchtdokumente, Impfpässe, allgemeine Gesundheitsdokumente

4. "medical_product" — Medikamentenbeschreibung, Packungsbeilage, Produktdatenblatt
   - Zeigt: Medikamentename, Wirkstoff, Dosierung/Einheit, Packungsgröße, Anwendungshinweise, Hersteller/Chargennummer
   - NICHT: Impfbescheinigungen, Veterinärbehandlungsberichte, Verschreibungen ohne Produktdetails

5. "general" — allgemeines Tierdokument, Gesundheitsbericht, Behandlung, Laborbefund
   - Zeigt: Text und Informationen zum Tier, die keinem anderen Typ genau entsprechen

Antworte NUR mit dem Dokumenttyp (z.B. "vaccination"), KEINE anderen Worte.
`.trim()

// Type-specific extraction prompts
const PROMPTS_BY_TYPE = {
  vaccination: `
Du bist ein Veterinär-Dokumentenanalyst. Analysiere diesen Impfpass gründlich und extrahiere JEDEN Impfeintrag als separates Objekt.

KRITISCHE REGELN:
1. OUTPUT: Ein JSON-Objekt mit EINEM Array von Impfeinträgen in der "vaccinations" Property
2. Wenn 5 Impfungen auf der Seite stehen, dann 5 separate Objekte im vaccinations[] Array
3. Für JEDEN Impfeintrag extrahieren (englische Feldnamen, Daten in YYYY-MM-DD):
   - administration_date: Impfdatum in Format YYYY-MM-DD (z.B. "2021-09-06", "2021-10-05")
     * Konvertiere: "06.09.2021" → "2021-09-06", "5.10.2021" → "2021-10-05"
   - vaccine_name: Vollständiger Name des Impfstoffs (z.B. "Nobivac SHPPI", "Eurican DAPPI-Lmulti", "Virbagen canis SHAPPi/L")
   - manufacturer: Vollständiger Herstellername (z.B. "MSD Animal Health", "Boehringer Ingelheim", "Virbac")
   - batch_number: Chargennummer / LOT-Nummer (z.B. "A628B01", "L482640", "8KMF")
   - valid_until: Gültig bis Datum in Format YYYY-MM-DD (z.B. "2022-11-30" für "11-2022", "2022-08-06" für "08/06/2022")
     * Wenn nur MM-YYYY: interpretiere als letzter Tag des Monats (z.B. "11-2022" → "2022-11-30")
     * Konvertiere alle Formate zu YYYY-MM-DD
   - active_substances: Array mit DETAILLIERTEN Wirkstoffdescriptionen (English + German mixture if necessary)
     * Mit Abkürzungen in Klammern: ["Canine Distemper Virus (CDV)", "Canine Adenovirus Type 2 (CAV2)", "Canine Parvovirus (CPV)"]
     * Bei Kombinationen: Alle einzelnen Komponenten auflisten ODER vereinfachte Form wenn zu komplex
     * Beispiel: ["Leptospira interrogans (Canicola, Icterohaemorrhagiae, Grippotyphosa)"]
   - vet_name: Name und Adresse des Tierarztes (z.B. "Mag. med. vet. Klaus FISCHL, 7563 Königsdorf")
   - target_disease: Optional - die Zielkrankheit/Erreger (z.B. "Staupe, Parvo, Tollwut, Leptospirose")
   - notes: Optional - nur wenn explizit Anmerkungen angegeben (z.B. "Booster", "Preliminary", "Due for revision")

4. Zusätzlich im Hauptobjekt:
   - type: "vaccination"
   - title: Kurzer Titel (z.B. "Vaccination Record - Max")
   - document_date: Erstes/Hauptimpfdatum in YYYY-MM-DD Format
   - summary: 1-2 Sätze zusammenfassung (English or German)
   - animal: Objekt mit name, species (dog/cat/other), breed, birthdate (YYYY-MM-DD) — oder null wenn nicht lesbar

DATEN-NORMALISIERUNG:
- ALLE Daten MÜSSEN im YYYY-MM-DD Format sein
- Beispiele:
  * "06.09.2021" → "2021-09-06"
  * "5.10.2021" → "2021-10-05"
  * "11-2022" → "2022-11-30" (letzter Tag des Monats)
  * "08/06/2022" → "2022-08-06"
- Unlesbare/fehlende Daten → null (NICHT "n.a." oder "")
- Whitespace trimmen

AUSGABE-FORMAT (WICHTIG):
- Gib ein JSON-Objekt mit diesen Properties zurück:
  {
    "type": "vaccination",
    "title": "...",
    "document_date": "YYYY-MM-DD",
    "summary": "...",
    "animal": { "name": "...", "species": "...", "breed": "...", "birthdate": "YYYY-MM-DD" },
    "vaccinations": [ { IMPFEINTRAG }, { IMPFEINTRAG }, ... ],
    "suggested_tags": ["tag1", "tag2", ...]
  }

BEISPIEL STRUKTUR (GENAU DIESES FORMAT):
{
  "type": "vaccination",
  "title": "Vaccination Record - Rex",
  "document_date": "2021-09-06",
  "summary": "Multiple vaccinations from September 2021 to December 2025. Mix of Nobivac and Eurican products.",
  "animal": {
    "name": "Rex",
    "species": "dog",
    "breed": "German Shepherd",
    "birthdate": "2019-03-15"
  },
  "vaccinations": [
    {
      "vaccine_name": "Nobivac SHPPI",
      "administration_date": "2021-09-06",
      "valid_until": "2022-11-30",
      "batch_number": "A628B01",
      "manufacturer": "MSD Animal Health",
      "active_substances": [
        "Canine Distemper Virus (CDV)",
        "Canine Adenovirus Type 2 (CAV2)",
        "Canine Parvovirus (CPV)",
        "Canine Parainfluenzavirus (CPiV)"
      ],
      "vet_name": "Mag. med. vet. Klaus FISCHL, 7563 Königsdorf",
      "target_disease": "Distemper, Hepatitis, Leptospirosis, Parvovirus, Parainfluenza"
    },
    {
      "vaccine_name": "Eurican DAPPI-Lmulti",
      "administration_date": "2021-10-05",
      "valid_until": "2022-08-06",
      "batch_number": "L482640",
      "manufacturer": "Boehringer Ingelheim",
      "active_substances": [
        "Canine Distemper Virus (CDV)",
        "Canine Adenovirus Type 2 (CAV2)",
        "Canine Parvovirus Type 2 (CPV)",
        "Canine Parainfluenzavirus (CPiV)",
        "Leptospira interrogans (Canicola, Icterohaemorrhagiae, Grippotyphosa)"
      ],
      "vet_name": "Dr. med. vet. Angela Wulschnig, 9546 Bad Kleinkirchheim",
      "target_disease": "Distemper, Hepatitis, Leptospirosis, Parvovirus, Parainfluenza"
    },
    {
      "vaccine_name": "Eurican L4",
      "administration_date": "2025-12-02",
      "valid_until": "2026-10-29",
      "batch_number": "H09350",
      "manufacturer": "Boehringer Ingelheim",
      "active_substances": [
        "Leptospira interrogans (Canicola, Icterohaemorrhagiae, Grippotyphosa, Australis)"
      ],
      "vet_name": "Dr. med. vet. Angela Wulschnig, 9546 Bad Kleinkirchheim",
      "notes": "Booster"
    }
  ],
  "suggested_tags": ["Vaccination", "Distemper", "Leptospirosis", "Boehringer", "MSD", "Nobivac", "Eurican"]
}

Gib NUR gültiges JSON aus (keine Erklärungen, keine Markdown-Code-Blöcke, kein Text davor/danach).
`.trim(),

  treatment: `
Du bist ein Veterinär-Dokumentenanalyst. Analysiere dieses Behandlungsdokument und extrahiere JEDE Behandlung einzeln.

KRITISCHE REGELN:
1. EINE BEHANDLUNG = EIN OBJEKT in treatments[]
2. Wenn 3 Behandlungen dokumentiert sind, dann 3 separate Objekte
3. ALLE Datumsangaben MÜSSEN YYYY-MM-DD Format sein
4. Extrahiere für JEDEN Eintrag:
   - substance (Wirkstoff/Medikament, z.B. "Entwurmung", "Milbemax", "Droncit", "Antiparasitär")
   - administered_at (Behandlungsdatum, YYYY-MM-DD)
   - dosage (Dosierung, z.B. "1 Tablette", "0.5 ml/kg", "eine Spritze")
   - vet_name (Name des Tierarztes)
   - next_due (Nächste Behandlung fällig, YYYY-MM-DD, oder null)
   - notes (optionale Notizen, z.B. "Prophylaxe", "Allergie dokumentiert")
5. Tierinfos: name, species, breed, birthdate (YYYY-MM-DD)
6. document_date = frühestes oder Hauptbehandlungsdatum
7. Tags basierend auf Substanzen: ["Entwurmung", "Antiparasitär", "Milbemax", etc.]

DATEN-NORMALISIERUNG:
- Alle Daten müssen YYYY-MM-DD sein
- Unlesbare/fehlende Daten → null

BEISPIEL STRUKTUR:
{
  "type": "treatment",
  "title": "Behandlungsprotokoll - Entwurmung & Antiparasitär",
  "document_date": "2024-03-15",
  "summary": "2 Behandlungseinträge dokumentiert",
  "animal": { 
    "name": "Max", 
    "species": "dog", 
    "breed": "Labrador", 
    "birthdate": "2019-03-15" 
  },
  "treatments": [
    {
      "substance": "Milbemax (Entwurmung)",
      "administered_at": "2024-03-15",
      "dosage": "1 Tablette",
      "vet_name": "Dr. Schmidt",
      "next_due": "2024-06-15",
      "notes": "Prophylaxe gegen Rund- und Bandwürmer"
    },
    {
      "substance": "Prazitel (Antiparasitär)",
      "administered_at": "2024-03-15",
      "dosage": "per Schleimhaut",
      "vet_name": "Dr. Schmidt",
      "next_due": null,
      "notes": "Zusätzliche Maßnahme gegen Parasiten"
    }
  ],
  "suggested_tags": ["Entwurmung", "Milbemax", "Prophylaxe"]
}

Gib NUR gültiges JSON aus (keine Erklärungen).
`.trim(),

  pedigree: `
Du bist ein Veterinär-Dokumentenanalyst. Analysiere dieses Zuchtdokument/Stammbaum und gib strukturierte JSON-Daten zurück.

WICHTIGE REGELN:
1. Extrahiere Registrierungsnummer und Zuchtverband (z.B. FCI, Züchterverein).
2. Lies Tier-Identität: Name, Rasse, Geburtsdatum, Farbe/Markierungen.
3. Lies Stammbauminfos: Vater, Mutter, Großeltern (falls sichtbar).
4. "document_date": Ausstellungsdatum des Stammbaums im Format YYYY-MM-DD.
5. "title": z.B. "FCI Stammbaum - Max der Labrador".

Gib EXAKT diese JSON-Struktur zurück (nur valide JSON, kein Text davor/danach):
{
  "type": "pedigree",
  "title": "...",
  "document_date": "YYYY-MM-DD",
  "summary": "...",
  "animal": { "name": "...", "species": "...", "breed": "...", "birthdate": "YYYY-MM-DD" },
  "pedigree": { "registration_number": "...", "federation": "...", "sire": "...", "dam": "..." },
  "suggested_tags": ["Zucht", "Stammbaum", "FCI"]
}
`.trim(),

  dog_certificate: `
Du bist ein Veterinär-Dokumentenanalyst. Analysiere dieses Hundeführerschein-/Sachkundenachweis-Dokument und gib strukturierte JSON-Daten zurück.

WICHTIGE REGELN:
1. Extrahiere Halter-Name und Hundeinfos (Name, Rasse, Chip-Nummer).
2. Lies Prüfbewertung, Ergebnis (bestanden/nicht bestanden), Prüfdatum.
3. "document_date": Ausstellungsdatum im Format YYYY-MM-DD.
4. "title": z.B. "Hundeführerschein 2024 - Max".
5. Tags: ["Hundeführerschein", "Sachkundenachweis", "Prüfung bestanden"].

Gib EXAKT diese JSON-Struktur zurück (nur valide JSON, kein Text davor/danach):
{
  "type": "dog_certificate",
  "title": "...",
  "document_date": "YYYY-MM-DD",
  "summary": "...",
  "animal": { "name": "...", "breed": "...", "chip_number": "..." },
  "certificate": { "holder_name": "...", "evaluation": "...", "passed": true/false },
  "suggested_tags": ["Hundeführerschein", "Sachkundenachweis"]
}
`.trim(),

  medical_product: `
Du bist ein Veterinär-Dokumentenanalyst. Analysiere diese Medikamenten-/Produktbeschreibung und gib strukturierte JSON-Daten zurück.

WICHTIGE REGELN:
1. Extrahiere: Produktname, Wirkstoff(e), Packungsgröße, Dosierung/Einheit, Anwendungsart.
2. Lies Hersteller, Chargennummer (falls vorhanden), Verfallsdatum.
3. Kurze Anwendungshinweise extrahieren.
4. "document_date": Datum auf dem Dokument oder Verfallsdatum im Format YYYY-MM-DD.
5. "title": z.B. "Amoxicillin 500mg - Packungsbeilage".

Gib EXAKT diese JSON-Struktur zurück (nur valide JSON, kein Text davor/danach):
{
  "type": "medical_product",
  "title": "...",
  "document_date": "YYYY-MM-DD",
  "summary": "...",
  "product": {
    "name": "...",
    "active_substance": "...",
    "dosage": "...",
    "package_size": "...",
    "manufacturer": "...",
    "expiry_date": "YYYY-MM-DD"
  },
  "usage": "...",
  "suggested_tags": ["Medikament", "Wirkstoff"]
}
`.trim(),

  general: `
Du bist ein Veterinär-Dokumentenanalyst. Analysiere dieses allgemeine Tierdokument und gib strukturierte JSON-Daten zurück.

WICHTIGE REGELN:
1. Extrahiere alle erkannten Informationen: Tiername, Tierart, Daten, Text.
2. "document_date": Hauptdatum auf dem Dokument im Format YYYY-MM-DD (Bericht-Datum, Rechnung-Datum, etc.).
3. "title": Kurze Zusammenfassung des Inhalts (z.B. "Untersuchungsbericht", "Laborergebnis", "Rechnung").
4. "summary": 1-2 Sätze über den Inhalt.
5. Tags basierend auf erkannten Schlüsselworten.

Gib EXAKT diese JSON-Struktur zurück (nur valide JSON, kein Text davor/danach):
{
  "type": "general",
  "title": "...",
  "document_date": "YYYY-MM-DD",
  "summary": "...",
  "raw_text": "...",
  "suggested_tags": ["tag1", "tag2"]
}
`.trim()
}

const GEMINI_PROMPT = PROMPTS_BY_TYPE.general

function getPromptForDocumentType(documentType) {
  return PROMPTS_BY_TYPE[normalizeDocumentType(documentType)] || PROMPTS_BY_TYPE.general
}

// Helper: Parse and normalize date to YYYY-MM-DD
function normalizeDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null
  
  const trimmed = dateStr.trim()
  if (!trimmed) return null
  
  // Already in YYYY-MM-DD format
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed
  
  // Try parsing German/Austrian formats: dd.mm.yyyy, dd. MMM. yyyy, etc.
  const germanMonths = {
    'januar': '01', 'jan': '01', 'january': '01',
    'februar': '02', 'feb': '02', 'february': '02',
    'märz': '03', 'mär': '03', 'maerz': '03', 'march': '03',
    'april': '04', 'apr': '04',
    'mai': '05', 'may': '05',
    'juni': '06', 'jun': '06', 'june': '06',
    'juli': '07', 'jul': '07', 'july': '07',
    'august': '08', 'aug': '08',
    'september': '09', 'sep': '09', 'sept': '09',
    'oktober': '10', 'okt': '10', 'october': '10',
    'november': '11', 'nov': '11',
    'dezember': '12', 'dez': '12', 'december': '12'
  }
  
  // dd.mm.yyyy
  const match1 = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (match1) {
    const [, day, month, year] = match1
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }
  
  // dd. MMM. yyyy (e.g., "06. SEP. 2021", "09. NOV. 2021")
  const match2 = trimmed.match(/^(\d{1,2})\.\s*([a-zA-Z]+)\.\s*(\d{4})$/)
  if (match2) {
    const [, day, monthStr, year] = match2
    const monthNum = germanMonths[monthStr.toLowerCase()]
    if (monthNum) {
      return `${year}-${monthNum}-${String(day).padStart(2, '0')}`
    }
  }
  
  // mm/yyyy or mm-yyyy (Month/Year)
  const match3 = trimmed.match(/^(\d{1,2})[\/\-](\d{4})$/)
  if (match3) {
    const [, month, year] = match3
    return `${year}-${String(month).padStart(2, '0')}-01`
  }
  
  // mm/dd/yyyy (US format, less common but possible)
  const match4 = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (match4) {
    const [, month, day, year] = match4
    // Heuristic: if month > 12, assume European dd/mm/yyyy
    const m = parseInt(month)
    const d = parseInt(day)
    if (m > 12 && d <= 12) {
      return `${year}-${String(d).padStart(2, '0')}-${String(m).padStart(2, '0')}`
    }
    return `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }
  
  return null
}

// Post-process extracted JSON to normalize all date fields
function normalizeDateFields(obj) {
  if (!obj || typeof obj !== 'object') return obj
  
  if (Array.isArray(obj)) {
    return obj.map(item => normalizeDateFields(item))
  }
  
  const dateFieldNames = [
    'date', 'datum', 'administration_date', 'administered_at', 'valid_until', 'gueltig_bis',
    'document_date', 'birthdate', 'nextDue', 'next_due', 'expires_at', 'expiry_date',
    'next_due_at'
  ]
  
  const normalized = { ...obj }
  
  for (const key in normalized) {
    if (dateFieldNames.includes(key) && typeof normalized[key] === 'string') {
      normalized[key] = normalizeDate(normalized[key])
    } else if (typeof normalized[key] === 'object' && normalized[key] !== null) {
      normalized[key] = normalizeDateFields(normalized[key])
    }
  }
  
  return normalized
}

export async function analyzeDocument(imagePath, userGeminiKey = null, model = null, onProgress = null, userAnthropicKey = null, claudeModel = null, userOpenAiKey = null, openAiModel = null, priority = ['google', 'anthropic', 'openai']) {
  if (onProgress) onProgress(`Initialisiere OCR-Analyse...`)

  // Check if file exists before attempting analysis
  const absolutePath = resolve(imagePath)
  if (!existsSync(absolutePath)) {
    throw new Error(`Dokumentdatei nicht gefunden: ${imagePath}`)
  }

  if (process.env.NODE_ENV === 'test' && process.env.PAW_MOCK_OCR === '1') {
    return analyzeWithMockOcr(imagePath, onProgress)
  }

  try {
    const documentType = await classifyDocumentType(imagePath, userGeminiKey, userAnthropicKey, userOpenAiKey, priority)
    const prompt = getPromptForDocumentType(documentType)

    for (const provider of priority) {
      if (provider === 'google' && userGeminiKey) {
        const effectiveModel = model || 'gemini-1.5-flash'
        _log.info({ provider: 'gemini', model: effectiveModel, documentType }, 'OCR analysis starting')
        return await analyzeWithGemini(imagePath, userGeminiKey, effectiveModel, onProgress, prompt, documentType)
      }
      if (provider === 'anthropic' && userAnthropicKey) {
        const effectiveModel = claudeModel || 'claude-3-5-sonnet-20241022'
        _log.info({ provider: 'claude', model: effectiveModel, documentType }, 'OCR analysis starting')
        return await analyzeWithClaude(imagePath, userAnthropicKey, effectiveModel, onProgress, prompt, documentType)
      }
      if (provider === 'openai' && userOpenAiKey) {
        const effectiveModel = openAiModel || 'gpt-4o-mini'
        _log.info({ provider: 'openai', model: effectiveModel, documentType }, 'OCR analysis starting')
        return await analyzeWithOpenAI(imagePath, userOpenAiKey, effectiveModel, onProgress, prompt, documentType)
      }
    }

    // Fallback falls die Priorisierung keine Treffer ergab, aber Keys existieren
    if (userGeminiKey) return await analyzeWithGemini(imagePath, userGeminiKey, model || 'gemini-1.5-flash', onProgress, prompt, documentType)
    if (userAnthropicKey) return await analyzeWithClaude(imagePath, userAnthropicKey, claudeModel || 'claude-3-5-sonnet-20241022', onProgress, prompt, documentType)
    if (userOpenAiKey) return await analyzeWithOpenAI(imagePath, userOpenAiKey, openAiModel || 'gpt-4o-mini', onProgress, prompt, documentType)

    throw new Error('Analyse nicht möglich. Keine Tokens hinterlegt.')
  } catch (err) {
    _log.error({ err: { message: err.message, stack: err.stack } }, 'OCR fehlgeschlagen')
    throw err // Throw error to be handled by caller (will trigger pending_analysis status)
  }
}

function analyzeWithMockOcr(imagePath, onProgress) {
  if (onProgress) onProgress('Nutze testweises Mock-OCR...')

  const file = basename(imagePath).toLowerCase()

  if (file.includes('treatment') || file.includes('behandlung') || file.includes('wurm')) {
    return Promise.resolve({
      provider: 'mock-ocr',
      data: {
        type: 'treatment',
        title: 'Behandlungsprotokoll - Entwurmung',
        document_date: '2024-03-15',
        summary: '2 Behandlungseintraege aus Tabelle erkannt',
        raw_text: 'Entwurmung 15.03.2024 Milbemax 1 Tablette',
        animal: { name: 'Mocky', species: 'dog', breed: 'Mixed', birthdate: '2020-01-10' },
        treatments: [
          {
            substance: 'Milbemax',
            administered_at: '2024-03-15',
            dosage: '1 Tablette',
            vet_name: 'Dr. Mock',
            next_due: '2024-06-15',
            notes: 'Tabelle Zeile 1'
          },
          {
            substance: 'Droncit',
            administered_at: '2024-03-15',
            dosage: '0.5 Tablette',
            vet_name: 'Dr. Mock',
            next_due: null,
            notes: 'Tabelle Zeile 2'
          }
        ],
        suggested_tags: ['Entwurmung', 'Milbemax']
      }
    })
  }

  if (file.includes('vaccination') || file.includes('impf') || file.includes('vax')) {
    return Promise.resolve({
      provider: 'mock-ocr',
      data: {
        type: 'vaccination',
        title: 'Impfpass - Mocky',
        document_date: '2021-09-06',
        summary: '2 Impfungen aus Tabelle erkannt',
        raw_text: 'Impfstoff Datum Gueltig bis Charge',
        animal: { name: 'Mocky', species: 'dog', breed: 'Mixed', birthdate: '2020-01-10' },
        vaccinations: [
          {
            vaccine_name: 'DHLPPi',
            administration_date: '2021-09-06',
            valid_until: '2024-09-06',
            batch_number: 'BATCH-001',
            manufacturer: 'Boehringer',
            active_substances: ['Staupevirus', 'Parvovirus'],
            vet_name: 'Dr. Mock',
            target_disease: 'Staupe, Parvo'
          },
          {
            vaccine_name: 'Tollwut',
            administration_date: '2021-09-06',
            valid_until: '2024-09-06',
            batch_number: 'BATCH-002',
            manufacturer: 'MSD',
            active_substances: ['Tollwutvirus'],
            vet_name: 'Dr. Mock',
            target_disease: 'Tollwut'
          }
        ],
        suggested_tags: ['DHLPPi', 'Tollwut']
      }
    })
  }

  return Promise.resolve({
    provider: 'mock-ocr',
    data: {
      type: 'general',
      title: 'Mock Dokument',
      document_date: '2024-01-01',
      summary: 'Mock OCR Ergebnis',
      raw_text: 'Mock OCR Text',
      suggested_tags: ['Mock']
    }
  })
}

async function analyzeWithClaude(imagePath, anthropicKey, model, onProgress, prompt = GEMINI_PROMPT, documentType = 'general') {
  if (onProgress) onProgress('Bild wird für Claude API verarbeitet...')
  const imageData = readFileSync(imagePath)
  const base64 = imageData.toString('base64')
  let mimeType = imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg'

  // Magic Bytes Check: Erkennt den wahren Dateityp, unabhängig von der Dateiendung
  if (base64.startsWith('/9j/')) mimeType = 'image/jpeg'
  else if (base64.startsWith('iVBORw')) mimeType = 'image/png'
  else if (base64.startsWith('UklGRg')) mimeType = 'image/webp'

  if (onProgress) onProgress(`Sende POST Request an Claude ${model} API...`)
  const url = 'https://api.anthropic.com/v1/messages'

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mimeType,
              data: base64
            }
          },
          {
            type: 'text',
            text: prompt
          }
        ]
      }]
    })
  })

  if (!response.ok) {
    const errorText = await response.text()
    _log.error({ provider: 'claude', statusCode: response.status, err: errorText }, 'Claude API error')
    throw new Error(`Claude API Fehler (${response.status}): ${errorText}`)
  }

  if (onProgress) onProgress('Anmeldung bei Claude API erfolgreich! Verarbeite JSON-Antwort...')
  const result = await response.json()
  const text = result.content?.[0]?.text || ''

  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Kein JSON in Claude-Antwort')

  const parsed = { type: normalizeDocumentType(documentType), ...JSON.parse(jsonMatch[0]) }
  return { provider: 'claude', data: normalizeDateFields(parsed) }
}

async function analyzeWithGemini(imagePath, geminiKey, model, onProgress, prompt = GEMINI_PROMPT, documentType = 'general') {
  if (onProgress) onProgress('Bild wird für Gemini API verarbeitet...')
  const imageData = readFileSync(imagePath)
  const base64 = imageData.toString('base64')
  let mimeType = imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg'

  if (base64.startsWith('/9j/')) mimeType = 'image/jpeg'
  else if (base64.startsWith('iVBORw')) mimeType = 'image/png'
  else if (base64.startsWith('UklGRg')) mimeType = 'image/webp'

  if (onProgress) onProgress(`Sende POST Request an ${model} API...`)
  // Note: URL intentionally not logged to avoid exposing API key
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType: mimeType,
              data: base64
            }
          }
        ]
      }]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    _log.error({ provider: 'gemini', statusCode: response.status, err: errorText }, 'Gemini API error')

    if (response.status === 429) {
      throw new Error('Gemini API Quota überschritten - bitte später erneut versuchen')
    }

    throw new Error(`API Auth/Request fehlgeschlagen (${response.status}): ${errorText}`);
  }

  if (onProgress) onProgress('Anmeldung bei Google API erfolgreich! Verarbeite JSON-Antwort...')
  const result = await response.json();
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
  
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Kein JSON in Gemini-Antwort')

  const parsed = { type: normalizeDocumentType(documentType), ...JSON.parse(jsonMatch[0]) }
  return { provider: 'gemini', data: normalizeDateFields(parsed) }
}

async function analyzeWithTesseract(imagePath, onProgress) {
  const worker = await createWorker('deu+eng', 1, {
    logger: m => {
      if (onProgress && m.status === 'recognizing text') {
        onProgress(`Tesseract liest Text... ${Math.round(m.progress * 100)}%`)
      } else if (onProgress) {
        onProgress(`Tesseract: ${m.status}`)
      }
    }
  })
  try {
    const { data: { text } } = await worker.recognize(imagePath)
    const parsed = parseTesseractText(text)
    return { provider: 'tesseract', data: parsed }
  } finally {
    await worker.terminate()
  }
}

// Normalize document type from various sources to canonical types
export function normalizeDocumentType(typeInput) {
  const normalized = (typeInput || '').toLowerCase().trim()
  
  // Handle legacy and variant type names
  const mapping = {
    'vaccination': 'vaccination',
    'vaccin': 'vaccination',
    'vaccine': 'vaccination',
    'impf': 'vaccination',
    'impfpass': 'vaccination',
    'pedigree': 'pedigree',
    'stammbaum': 'pedigree',
    'zucht': 'pedigree',
    'dog_certificate': 'dog_certificate',
    'hundeführerschein': 'dog_certificate',
    'sachkundenachweis': 'dog_certificate',
    'medical_product': 'medical_product',
    'medication': 'medical_product',
    'medikament': 'medical_product',
    'product': 'medical_product',
    'treatment': 'treatment',
    'behandlung': 'treatment',
    'entwurmung': 'treatment',
    'wurmkur': 'treatment',
    'antiparasitär': 'treatment',
    'antiparasitaer': 'treatment',
    'vet_report': 'general',
    'report': 'general',
    'microchip': 'general',
    'passport': 'general',
    'other': 'general',
    'allgemein': 'general',
    '': 'general'
  }
  
  return mapping[normalized] || 'general'
}

function firstDefined(...values) {
  return values.find(value => value !== undefined && value !== null && value !== '')
}

function uniqueStrings(values = []) {
  return [...new Set(values.filter(value => typeof value === 'string' && value.trim().length > 0))]
}

function collectListRecords(pageResults, primaryKey, fallbackKey = primaryKey) {
  return pageResults.flatMap((page) => {
    // Handle case where page itself is an array (new direct array format)
    if (Array.isArray(page)) {
      return page
    }
    const payload = page?.payload || {}
    return payload[primaryKey] || page?.[primaryKey] || payload[fallbackKey] || page?.[fallbackKey] || []
  })
}

export function buildExtractedDocumentData({ combinedText, suggestedType, pageResults, pages }) {
  const firstPage = pageResults[0] || {}
  const animal = firstDefined(...pageResults.map(page => page?.animal).filter(Boolean))
  const title = firstDefined(...pageResults.map(page => page?.title), firstPage.title)
  const documentDate = firstDefined(...pageResults.map(page => page?.document_date), firstPage.document_date)
  const summary = firstDefined(...pageResults.map(page => page?.summary), firstPage.summary)
  const suggestedTags = uniqueStrings(pageResults.flatMap(page => page?.suggested_tags || page?.payload?.suggested_tags || []))

  const extracted = {
    type: suggestedType,
    text: combinedText,
    pages,
    page_results: pageResults,
    ...(title ? { title } : {}),
    ...(documentDate ? { document_date: documentDate } : {}),
    ...(summary ? { summary } : {}),
    ...(animal ? { animal } : {}),
    ...(suggestedTags.length ? { suggested_tags: suggestedTags } : {})
  }

  if (suggestedType === 'vaccination') {
    const vaccinations = collectListRecords(pageResults, 'vaccinations')
    return {
      ...extracted,
      vaccinations,
      payload: {
        type: suggestedType,
        ...(title ? { title } : {}),
        ...(documentDate ? { document_date: documentDate } : {}),
        ...(summary ? { summary } : {}),
        ...(animal ? { animal } : {}),
        ...(suggestedTags.length ? { suggested_tags: suggestedTags } : {}),
        vaccinations
      }
    }
  }

  if (suggestedType === 'treatment') {
    const treatments = collectListRecords(pageResults, 'treatments', 'treatment_log')
    return {
      ...extracted,
      treatments,
      payload: {
        type: suggestedType,
        ...(title ? { title } : {}),
        ...(documentDate ? { document_date: documentDate } : {}),
        ...(summary ? { summary } : {}),
        ...(animal ? { animal } : {}),
        ...(suggestedTags.length ? { suggested_tags: suggestedTags } : {}),
        treatments
      }
    }
  }

  return {
    ...firstPage,
    ...extracted,
    payload: {
      ...firstPage,
      ...(title ? { title } : {}),
      ...(documentDate ? { document_date: documentDate } : {}),
      ...(summary ? { summary } : {}),
      ...(animal ? { animal } : {}),
      ...(suggestedTags.length ? { suggested_tags: suggestedTags } : {})
    }
  }
}

// Two-step OCR: first classify document type, then extract with type-specific prompt
export async function classifyDocumentType(imagePath, userGeminiKey = null, userAnthropicKey = null, userOpenAiKey = null, priority = ['google', 'anthropic', 'openai']) {
  try {
    // First pass: classify the document type
    for (const provider of priority) {
      if (provider === 'google' && userGeminiKey) {
        return await classifyWithGemini(imagePath, userGeminiKey)
      }
      if (provider === 'anthropic' && userAnthropicKey) {
        return await classifyWithClaude(imagePath, userAnthropicKey)
      }
      if (provider === 'openai' && userOpenAiKey) {
        return await classifyWithOpenAI(imagePath, userOpenAiKey)
      }
    }
    return 'general'
  } catch (err) {
    _log.warn({ err: err.message }, 'Document classification failed, defaulting to general')
    return 'general'
  }
}

async function classifyWithGemini(imagePath, geminiKey) {
  const imageData = readFileSync(imagePath)
  const base64 = imageData.toString('base64')
  let mimeType = imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg'
  if (base64.startsWith('/9j/')) mimeType = 'image/jpeg'
  else if (base64.startsWith('iVBORw')) mimeType = 'image/png'
  else if (base64.startsWith('UklGRg')) mimeType = 'image/webp'

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: CLASSIFICATION_PROMPT },
          { inlineData: { mimeType, data: base64 } }
        ]
      }]
    })
  })

  if (!response.ok) throw new Error(`Gemini classification failed: ${response.status}`)
  const result = await response.json()
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text || ''
  const classified = normalizeDocumentType(text)
  _log.debug({ classified }, 'Document classified')
  return classified
}

async function classifyWithClaude(imagePath, anthropicKey) {
  const imageData = readFileSync(imagePath)
  const base64 = imageData.toString('base64')
  let mimeType = imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg'
  if (base64.startsWith('/9j/')) mimeType = 'image/jpeg'
  else if (base64.startsWith('iVBORw')) mimeType = 'image/png'
  else if (base64.startsWith('UklGRg')) mimeType = 'image/webp'

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 50,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
          { type: 'text', text: CLASSIFICATION_PROMPT }
        ]
      }]
    })
  })

  if (!response.ok) throw new Error(`Claude classification failed: ${response.status}`)
  const result = await response.json()
  const text = result.content?.[0]?.text || ''
  const classified = normalizeDocumentType(text)
  _log.debug({ classified }, 'Document classified')
  return classified
}

async function classifyWithOpenAI(imagePath, openAiKey) {
  const imageData = readFileSync(imagePath)
  const base64 = imageData.toString('base64')
  let mimeType = imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg'
  if (base64.startsWith('/9j/')) mimeType = 'image/jpeg'
  else if (base64.startsWith('iVBORw')) mimeType = 'image/png'
  else if (base64.startsWith('UklGRg')) mimeType = 'image/webp'

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openAiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 20,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: CLASSIFICATION_PROMPT },
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } }
        ]
      }]
    })
  })

  if (!response.ok) throw new Error(`OpenAI classification failed: ${response.status}`)
  const result = await response.json()
  const text = result.choices?.[0]?.message?.content || ''
  const classified = normalizeDocumentType(text)
  _log.debug({ classified }, 'Document classified')
  return classified
}

function parseTesseractText(text) {
  const lower = text.toLowerCase()
  const classified = normalizeDocumentType(
    (lower.includes('impf') || lower.includes('vaccin')) ? 'vaccination' :
    (lower.includes('stammbaum') || lower.includes('pedigree') || lower.includes('zucht')) ? 'pedigree' :
    (lower.includes('hundeführerschein') || lower.includes('sachkundenachweis')) ? 'dog_certificate' :
    (lower.includes('medikament') || lower.includes('tablette') || lower.includes('dosierung')) ? 'medical_product' :
    (lower.includes('entwurmung') || lower.includes('wurmkur') || lower.includes('antiparasitär') || lower.includes('antiparasitaer') || lower.includes('behandlung') && lower.includes('tierarzt')) ? 'treatment' :
    'general'
  )
  return { type: classified, rawText: text }
}

async function analyzeWithOpenAI(imagePath, openAiKey, model, onProgress, prompt = GEMINI_PROMPT, documentType = 'general') {
  if (onProgress) onProgress('Bild wird für OpenAI API verarbeitet...')
  const imageData = readFileSync(imagePath)
  const base64 = imageData.toString('base64')
  let mimeType = imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg'

  if (base64.startsWith('/9j/')) mimeType = 'image/jpeg'
  else if (base64.startsWith('iVBORw')) mimeType = 'image/png'
  else if (base64.startsWith('UklGRg')) mimeType = 'image/webp'

  if (onProgress) onProgress(`Sende POST Request an OpenAI ${model} API...`)
  const url = 'https://api.openai.com/v1/chat/completions'
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openAiKey}`
    },
    body: JSON.stringify({
      model: model,
      response_format: { type: "json_object" },
      messages: [
        {
          role: 'system',
          content: 'You are a veterinary document analyzer. Always return valid JSON.'
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64}`
              }
            }
          ]
        }
      ]
    })
  })

  if (!response.ok) {
    const errorText = await response.text()
    _log.error({ provider: 'openai', statusCode: response.status, err: errorText }, 'OpenAI API error')
    throw new Error(`OpenAI API Fehler (${response.status}): ${errorText}`)
  }

  if (onProgress) onProgress('Anmeldung bei OpenAI erfolgreich! Verarbeite JSON-Antwort...')
  const result = await response.json()
  const text = result.choices?.[0]?.message?.content || ''

  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Kein JSON in OpenAI-Antwort')

  const parsed = { type: normalizeDocumentType(documentType), ...JSON.parse(jsonMatch[0]) }
  return { provider: 'openai', data: normalizeDateFields(parsed) }
}
