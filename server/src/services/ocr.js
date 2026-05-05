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

// ============================================================================
// MULTILINGUAL PROMPTS: German (de) and English (en)
// ============================================================================

const PROMPTS = {
  de: {
    classification: `
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

5. "pet_passport" — EU-Heimtierausweis, Besitzerdaten, Tierbeschreibung, Chip-/Transponder-Seite, Ausstellungsseite
  - Zeigt: Überschriften wie "Details of Ownership", "Description of Animal", "Identification of the Animal", "Issuing of the Passport", "Ausstellung des Ausweises"
  - Zeigt: Besitzerdaten, Züchter, Tiername/Rasse/Farbe/Geschlecht, Mikrochip-/Transpondernummer, ausstellende Tierarztpraxis
  - NICHT: reine Impf- oder Behandlungstabellen mit mehreren Einzelzeilen

6. "general" — allgemeines Tierdokument, Gesundheitsbericht, Behandlung, Laborbefund
   - Zeigt: Text und Informationen zum Tier, die keinem anderen Typ genau entsprechen

Antworte NUR mit dem Dokumenttyp (z.B. "vaccination"), KEINE anderen Worte.
`.trim(),

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
   - valid_from: Beginn der Gültigkeit in YYYY-MM-DD (z.B. auf Tollwut-Seiten "gültig ab")
   - valid_until: Gültig bis Datum in Format YYYY-MM-DD (z.B. "2022-11-30" für "11-2022", "2022-08-06" für "08/06/2022")
     * Wenn nur MM-YYYY: interpretiere als letzter Tag des Monats (z.B. "11-2022" → "2022-11-30")
     * Konvertiere alle Formate zu YYYY-MM-DD
   - expiry_date_of_vial: Verfallsdatum der Impfstoff-Ampulle/Charge in YYYY-MM-DD, oder null
   - components: Array mit Kürzeln/Komponenten (z.B. ["D", "A", "P", "Pi", "L4"])
   - active_substances: Array mit DETAILLIERTEN Wirkstoffdescriptionen (English + German mixture if necessary)
     * Mit Abkürzungen in Klammern: ["Canine Distemper Virus (CDV)", "Canine Adenovirus Type 2 (CAV2)", "Canine Parvovirus (CPV)"]
     * Bei Kombinationen: Alle einzelnen Komponenten auflisten ODER vereinfachte Form wenn zu komplex
     * Beispiel: ["Leptospira interrogans (Canicola, Icterohaemorrhagiae, Grippotyphosa)"]
   - vet_name: Name und Adresse des Tierarztes (z.B. "Mag. med. vet. Klaus FISCHL, 7563 Königsdorf")
  - veterinarian: Objekt mit { name, practice, address, phone } wenn trennbar lesbar, sonst null
   - target_disease: Optional - die Zielkrankheit/Erreger (z.B. "Staupe, Parvo, Tollwut, Leptospirose")
  - purpose: Optional - Zweck/Krankheitsliste als lesbarer String
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
  - veterinarian: Objekt mit { name, practice, address, phone } wenn lesbar
  - active_ingredient (z.B. "Milbemycin oxime / Praziquantel")
  - treatment_subtype ("echinococcus", "parasite", "general")
   - next_due (Nächste Behandlung fällig, YYYY-MM-DD, oder null)
   - notes (optionale Notizen, z.B. "Prophylaxe", "Allergie dokumentiert")
5. Tierinfos: name, species, breed, birthdate (YYYY-MM-DD)
6. document_date = frühestes oder Hauptbehandlungsdatum
7. Tags basierend auf Substanzen: ["Entwurmung", "Antiparasitär", "Milbemax", etc.]

DATEN-NORMALISIERUNG:
- Alle Daten müssen YYYY-MM-DD sein
- Unlesbare/fehlende Daten → null

Gib NUR gültiges JSON aus (keine Erklärungen).
`.trim(),

    pet_passport: `
Du bist ein spezialisierter Dokumenten-Extraktor für EU-Heimtierausweise.

AUFGABE:
1. Analysiere das hochgeladene Bild einer EU-Heimtierausweis-Seite.
2. Erkenne, welche Sektion sichtbar ist: Besitzerdetails, Tierbeschreibung, Identifikation/Transponder oder Ausstellung.
3. Gib NUR gültiges JSON zurück.

WICHTIGE REGELN:
1. type MUSS immer "pet_passport" sein.
2. section_type MUSS eines von diesen Werten sein:
   - "ownership"
   - "animal_description"
   - "identification"
   - "issuing_authority"
3. Datumsformat wenn möglich: YYYY-MM-DD.
4. Nicht lesbare Felder: null.
5. Namen/Adressen exakt aus dem Dokument übernehmen.

Gib ein JSON-Objekt mit dieser Struktur zurück:
{
  "type": "pet_passport",
  "title": "...",
  "document_date": "YYYY-MM-DD",
  "summary": "...",
  "passport_number": "...",
  "section_type": "ownership|animal_description|identification|issuing_authority",
  "animal": {
    "name": "...",
    "species": "dog|cat|other",
    "breed": "...",
    "sex": "...",
    "birthdate": "YYYY-MM-DD",
    "color": "...",
    "notable_features": null
  },
  "identification": {
    "chip_code": "...",
    "chip_date": "YYYY-MM-DD",
    "chip_location": "...",
    "tattoo_code": null,
    "tattoo_date": null,
    "tattoo_location": null
  },
  "issuing_authority": {
    "name": "...",
    "address": "...",
    "postcode": "...",
    "city": "...",
    "country": "...",
    "phone": "...",
    "fax": "...",
    "email": "...",
    "date_issued": "YYYY-MM-DD"
  },
  "breeder": {
    "name": "...",
    "contact_person": "...",
    "address": "...",
    "postcode": "...",
    "city": "...",
    "country": "...",
    "phone": "..."
  },
  "owner": {
    "surname": "...",
    "first_name": "...",
    "address": "...",
    "postcode": "...",
    "city": "...",
    "country": "...",
    "phone": "..."
  },
  "suggested_tags": ["EU-Heimtierausweis", "Mikrochip", "Besitzerdaten"]
}

Gib NUR gültiges JSON aus (keine Erklärungen, keine Markdown-Code-Blöcke, kein Text davor/danach).
`.trim(),

    pedigree: `
Du bist ein Veterinär-Dokumentenanalyst. Analysiere dieses Zuchtdokument/Stammbaum und gib strukturierte JSON-Daten zurück.

WICHTIGE REGELN:
1. Extrahiere Registrierungsnummer und Zuchtverband (z.B. FCI, Züchterverein).
2. Lies Tier-Identität: Name, Rasse, Geburtsdatum, Farbe/Markierungen.
3. Lies Stammbauminfos: Vater, Mutter, Großeltern (falls sichtbar).
4. "document_date": Ausstellungsdatum des Stammbaums im Format YYYY-MM-DD.
5. "title": z.B. "FCI Stammbaum - Max der Labrador".

Gib EXAKT diese JSON-Struktur zurück (nur valide JSON, kein Text davor/danach).
`.trim(),

    dog_certificate: `
Du bist ein Veterinär-Dokumentenanalyst. Analysiere dieses Hundeführerschein-/Sachkundenachweis-Dokument und gib strukturierte JSON-Daten zurück.

WICHTIGE REGELN:
1. Extrahiere Halter-Name und Hundeinfos (Name, Rasse, Chip-Nummer).
2. Lies Prüfbewertung, Ergebnis (bestanden/nicht bestanden), Prüfdatum.
3. "document_date": Ausstellungsdatum im Format YYYY-MM-DD.
4. "title": z.B. "Hundeführerschein 2024 - Max".
5. Tags: ["Hundeführerschein", "Sachkundenachweis", "Prüfung bestanden"].

Gib EXAKT diese JSON-Struktur zurück (nur valide JSON, kein Text davor/danach).
`.trim(),

    medical_product: `
Du bist ein Veterinär-Dokumentenanalyst. Analysiere diese Medikamenten-/Produktbeschreibung und gib strukturierte JSON-Daten zurück.

WICHTIGE REGELN:
1. Extrahiere: Produktname, Wirkstoff(e), Packungsgröße, Dosierung/Einheit, Anwendungsart.
2. Lies Hersteller, Chargennummer (falls vorhanden), Verfallsdatum.
3. Kurze Anwendungshinweise extrahieren.
4. "document_date": Datum auf dem Dokument oder Verfallsdatum im Format YYYY-MM-DD.
5. "title": z.B. "Amoxicillin 500mg - Packungsbeilage".

Gib EXAKT diese JSON-Struktur zurück (nur valide JSON, kein Text davor/danach).
`.trim(),

    general: `
Du bist ein Veterinär-Dokumentenanalyst. Analysiere dieses allgemeine Tierdokument und gib strukturierte JSON-Daten zurück.

WICHTIGE REGELN:
1. Extrahiere alle erkannten Informationen: Tiername, Tierart, Daten, Text.
2. "document_date": Hauptdatum auf dem Dokument im Format YYYY-MM-DD (Bericht-Datum, Rechnung-Datum, etc.).
3. "title": Kurze Zusammenfassung des Inhalts (z.B. "Untersuchungsbericht", "Laborergebnis", "Rechnung").
4. "summary": 1-2 Sätze über den Inhalt.
5. Tags basierend auf erkannten Schlüsselworten.

Gib EXAKT diese JSON-Struktur zurück (nur valide JSON, kein Text davor/danach).
`.trim()
  },

  en: {
    classification: `
You are a veterinary document analyst. Analyze the following pet document and classify it precisely.

DOCUMENT TYPES (exact description):

1. "vaccination" — vaccination record, vaccination certificate, vaccination protocol, vaccination table, vaccine sticker
   - Shows: vaccine(s), vaccination date(s), batch number, valid until date, veterinarian stamp/signature
   - Recognition features:
     * Table format with columns like "Vaccine", "Date", "Batch Number", "Valid Until", "Stamp/Signature"
     * OR: vaccine stickers with names like "Nobivac", "Eurican", "Virbagen", "Hexadog", etc.
     * OR: page title "Vaccination Record", "Additional Vaccinations", "Revaccinations"
     * OR: vaccine names + dates/batch numbers/manufacturers are identifiable
   - Keywords: vaccination, vaccine, rabies, distemper, parvo, leptospirosis, kennel cough, Nobivac, Eurican, Virbagen, MSD, Boehringer, Virbac, batch number, valid until
   - NOT: general health reports, medication invoices, treatment reports without structured vaccination entries

2. "pedigree" — pedigree, certificate, breeding document, registration
   - Shows: breeding association logo, pedigree/family tree graphic, parents/ancestors, registration number, breeding qualifications
   - NOT: simple birth certificates without breeding association stamp, vaccination records

3. "dog_certificate" — dog handler certificate, competency certification, exam certificate
   - Shows: "Dog Handler Certificate" or "Competency Certification" title, exam evaluation, confirmation of completion, issue date
   - NOT: breeding documents, vaccination records, general health documents

4. "medical_product" — medication description, package insert, product datasheet
   - Shows: medication name, active substance, dosage/unit, package size, usage instructions, manufacturer/batch number
   - NOT: vaccination certificates, veterinary treatment reports, prescriptions without product details

5. "pet_passport" — EU pet passport page, ownership details, animal description, chip/transponder page, passport issuing section
  - Shows: headers like "Details of Ownership", "Description of Animal", "Identification of the Animal", "Issuing of the Passport"
  - Shows: owner or breeder details, pet description, microchip/transponder number, issuing veterinarian practice
  - NOT: pure vaccination tables or treatment tables with repeated line entries

6. "general" — general pet document, health report, treatment, lab result
   - Shows: text and information about the pet that doesn't match another type exactly

Reply ONLY with the document type (e.g., "vaccination"), NO other words.
`.trim(),

    vaccination: `
You are a veterinary document analyst. Thoroughly analyze this vaccination record and extract EVERY vaccination entry as a separate object.

CRITICAL RULES:
1. OUTPUT: A JSON object with ONE array of vaccination entries in the "vaccinations" property
2. If 5 vaccinations are shown on the page, then 5 separate objects in the vaccinations[] array
3. Extract for EVERY vaccination entry (English field names, dates in YYYY-MM-DD):
   - administration_date: vaccination date in format YYYY-MM-DD (e.g., "2021-09-06", "2021-10-05")
     * Convert: "06.09.2021" → "2021-09-06", "5.10.2021" → "2021-10-05"
   - vaccine_name: full name of vaccine (e.g., "Nobivac SHPPI", "Eurican DAPPI-Lmulti", "Virbagen canis SHAPPi/L")
   - manufacturer: full manufacturer name (e.g., "MSD Animal Health", "Boehringer Ingelheim", "Virbac")
   - batch_number: batch/lot number (e.g., "A628B01", "L482640", "8KMF")
   - valid_from: valid from date in YYYY-MM-DD when present
   - valid_until: valid until date in format YYYY-MM-DD (e.g., "2022-11-30" for "11-2022", "2022-08-06" for "08/06/2022")
     * If only MM-YYYY: interpret as last day of month (e.g., "11-2022" → "2022-11-30")
     * Convert all formats to YYYY-MM-DD
   - expiry_date_of_vial: vial/batch expiration date in YYYY-MM-DD, or null
   - components: array of short vaccine components (e.g. ["D", "A", "P", "Pi", "L4"])
   - active_substances: array with DETAILED active substance descriptions
     * With abbreviations in parentheses: ["Canine Distemper Virus (CDV)", "Canine Adenovirus Type 2 (CAV2)", "Canine Parvovirus (CPV)"]
     * For combinations: list all individual components OR simplified form if too complex
     * Example: ["Leptospira interrogans (Canicola, Icterohaemorrhagiae, Grippotyphosa)"]
   - vet_name: name and address of veterinarian (e.g., "Dr. Klaus FISCHL, 7563 Königsdorf")
  - veterinarian: object with { name, practice, address, phone } when readable, otherwise null
   - target_disease: optional - the target disease/pathogen (e.g., "Distemper, Parvo, Rabies, Leptospirosis")
  - purpose: optional readable purpose / disease list
   - notes: optional - only if comments are explicitly mentioned (e.g., "Booster", "Preliminary", "Due for revision")

4. Additionally in main object:
   - type: "vaccination"
   - title: short title (e.g., "Vaccination Record - Max")
   - document_date: first/main vaccination date in YYYY-MM-DD format
   - summary: 1-2 sentences summary in English
   - animal: object with name, species (dog/cat/other), breed, birthdate (YYYY-MM-DD) — or null if not readable

DATA NORMALIZATION:
- ALL dates MUST be in YYYY-MM-DD format
- Examples:
  * "06.09.2021" → "2021-09-06"
  * "5.10.2021" → "2021-10-05"
  * "11-2022" → "2022-11-30" (last day of month)
  * "08/06/2022" → "2022-08-06"
- Unreadable/missing data → null (NOT "n.a." or "")
- Trim whitespace

OUTPUT FORMAT (IMPORTANT):
- Return a JSON object with these properties.

Return ONLY valid JSON (no explanations, no markdown code blocks, no text before/after).
`.trim(),

    treatment: `
You are a veterinary document analyst. Analyze this treatment document and extract EACH treatment individually.

CRITICAL RULES:
1. ONE TREATMENT = ONE OBJECT in treatments[]
2. If 3 treatments are documented, then 3 separate objects
3. ALL date specifications MUST be in YYYY-MM-DD format
4. Extract for EVERY entry:
   - substance (active ingredient/medication, e.g., "Deworming", "Milbemax", "Droncit", "Antiparasitic")
   - administered_at (treatment date, YYYY-MM-DD)
   - dosage (dosage, e.g., "1 tablet", "0.5 ml/kg", "one injection")
   - vet_name (name of veterinarian)
  - veterinarian: object with { name, practice, address, phone } when readable
  - active_ingredient (e.g., "Milbemycin oxime / Praziquantel")
  - treatment_subtype ("echinococcus", "parasite", "general")
   - next_due (next treatment due, YYYY-MM-DD, or null)
   - notes (optional notes, e.g., "Prophylaxis", "Allergy documented")
5. Animal info: name, species, breed, birthdate (YYYY-MM-DD)
6. document_date = earliest or main treatment date
7. Tags based on substances: ["Deworming", "Antiparasitic", "Milbemax", etc.]

DATA NORMALIZATION:
- All dates must be YYYY-MM-DD
- Unreadable/missing data → null

Return ONLY valid JSON (no explanations).
`.trim(),

    pet_passport: `
You are a specialized extractor for EU pet passport pages.

TASK:
1. Analyze the uploaded EU pet passport image.
2. Identify which section is shown: ownership details, animal description, identification/transponder, or passport issuing section.
3. Return ONLY valid JSON.

IMPORTANT RULES:
1. type MUST always be "pet_passport".
2. section_type MUST be one of:
   - "ownership"
   - "animal_description"
   - "identification"
   - "issuing_authority"
3. Use YYYY-MM-DD when possible.
4. Unreadable fields must be null.
5. Keep names and addresses exactly as written in the document.

Return a JSON object with this structure:
{
  "type": "pet_passport",
  "title": "...",
  "document_date": "YYYY-MM-DD",
  "summary": "...",
  "passport_number": "...",
  "section_type": "ownership|animal_description|identification|issuing_authority",
  "animal": {
    "name": "...",
    "species": "dog|cat|other",
    "breed": "...",
    "sex": "...",
    "birthdate": "YYYY-MM-DD",
    "color": "...",
    "notable_features": null
  },
  "identification": {
    "chip_code": "...",
    "chip_date": "YYYY-MM-DD",
    "chip_location": "...",
    "tattoo_code": null,
    "tattoo_date": null,
    "tattoo_location": null
  },
  "issuing_authority": {
    "name": "...",
    "address": "...",
    "postcode": "...",
    "city": "...",
    "country": "...",
    "phone": "...",
    "fax": "...",
    "email": "...",
    "date_issued": "YYYY-MM-DD"
  },
  "breeder": {
    "name": "...",
    "contact_person": "...",
    "address": "...",
    "postcode": "...",
    "city": "...",
    "country": "...",
    "phone": "..."
  },
  "owner": {
    "surname": "...",
    "first_name": "...",
    "address": "...",
    "postcode": "...",
    "city": "...",
    "country": "...",
    "phone": "..."
  },
  "suggested_tags": ["EU Pet Passport", "Microchip", "Owner details"]
}

Return ONLY valid JSON (no explanations, no markdown code blocks, no text before/after).
`.trim(),

    pedigree: `
You are a veterinary document analyst. Analyze this breeding document/pedigree and return structured JSON data.

IMPORTANT RULES:
1. Extract registration number and breeding association (e.g., FCI, breed club).
2. Read animal identity: name, breed, birthdate, color/markings.
3. Read pedigree info: sire, dam, grandparents (if visible).
4. "document_date": issue date of pedigree in format YYYY-MM-DD.
5. "title": e.g., "FCI Pedigree - Max the Labrador".

Return EXACTLY this JSON structure (only valid JSON, no text before/after).
`.trim(),

    dog_certificate: `
You are a veterinary document analyst. Analyze this dog handler certificate/competency certification document and return structured JSON data.

IMPORTANT RULES:
1. Extract holder name and dog info (name, breed, chip number).
2. Read exam evaluation, result (passed/failed), exam date.
3. "document_date": issue date in format YYYY-MM-DD.
4. "title": e.g., "Dog Handler Certificate 2024 - Max".
5. Tags: ["Dog Certificate", "Handler Certificate", "Exam Passed"].

Return EXACTLY this JSON structure (only valid JSON, no text before/after).
`.trim(),

    medical_product: `
You are a veterinary document analyst. Analyze this medication/product description and return structured JSON data.

IMPORTANT RULES:
1. Extract: product name, active substance(s), package size, dosage/unit, application method.
2. Read manufacturer, batch number (if present), expiration date.
3. Extract brief usage instructions.
4. "document_date": date on document or expiration date in format YYYY-MM-DD.
5. "title": e.g., "Amoxicillin 500mg - Package Insert".

Return EXACTLY this JSON structure (only valid JSON, no text before/after).
`.trim(),

    general: `
You are a veterinary document analyst. Analyze this general pet document and return structured JSON data.

IMPORTANT RULES:
1. Extract all identified information: animal name, species, dates, text.
2. "document_date": main date on document in format YYYY-MM-DD (report date, invoice date, etc.).
3. "title": short summary of content (e.g., "Examination Report", "Lab Result", "Invoice").
4. "summary": 1-2 sentences about the content in English.
5. Tags based on identified keywords.

Return EXACTLY this JSON structure (only valid JSON, no text before/after).
`.trim()
  }
}

export function getPromptForDocumentType(documentType, language = 'de') {
  const lang = (language && PROMPTS[language]) ? language : 'de'
  return PROMPTS[lang][normalizeDocumentType(documentType)] || PROMPTS[lang].general
}

export { PROMPTS }

const GEMINI_PROMPT = PROMPTS.de.general

const CONFIDENCE_INSTRUCTIONS = {
  de: '\n\nWICHTIG: Gib im JSON nach Moeglichkeit auch ein Feld "confidence" zurueck. Erlaubt sind Werte zwischen 0 und 1 oder Prozentangaben wie "78%".',
  en: '\n\nIMPORTANT: If possible, include a "confidence" field in the JSON output. Allowed formats are values between 0 and 1 or percentages like "78%".'
}

function withConfidenceInstructions(prompt, language = 'de') {
  const normalizedLanguage = language === 'en' ? 'en' : 'de'
  return `${prompt}${CONFIDENCE_INSTRUCTIONS[normalizedLanguage]}`
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
    'next_due_at', 'valid_from', 'expiry_date_of_vial', 'chip_date', 'tattoo_date',
    'date_issued'
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

export async function analyzeDocument(imagePath, userGeminiKey = null, model = null, onProgress = null, userAnthropicKey = null, claudeModel = null, userOpenAiKey = null, openAiModel = null, priority = ['google', 'anthropic', 'openai'], language = 'de', requestedDocumentType = null) {
  if (onProgress) onProgress(`Initialisiere OCR-Analyse...`)

  // Validate language, default to 'de'
  const normalizedLanguage = (language === 'en') ? 'en' : 'de'

  // Check if file exists before attempting analysis
  const absolutePath = resolve(imagePath)
  if (!existsSync(absolutePath)) {
    throw new Error(`Dokumentdatei nicht gefunden: ${imagePath}`)
  }

  if (process.env.NODE_ENV === 'test' && process.env.PAW_MOCK_OCR === '1') {
    return analyzeWithMockOcr(imagePath, onProgress, normalizedLanguage)
  }

  try {
    const forcedDocumentType = normalizeRequestedDocumentType(requestedDocumentType)
    const documentType = forcedDocumentType || await classifyDocumentType(imagePath, userGeminiKey, userAnthropicKey, userOpenAiKey, priority, normalizedLanguage)
    const prompt = withConfidenceInstructions(getPromptForDocumentType(documentType, normalizedLanguage), normalizedLanguage)

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

function analyzeWithMockOcr(imagePath, onProgress, language = 'de') {
  if (onProgress) onProgress(`Nutze testweises Mock-OCR... (Sprache: ${language.toUpperCase()})`)

  const file = basename(imagePath).toLowerCase()

  if (file.includes('passport') || file.includes('heimtierausweis') || file.includes('transponder')) {
    return Promise.resolve({
      provider: 'mock-ocr',
      data: {
        type: 'pet_passport',
        title: language === 'en' ? 'EU Pet Passport - Identification' : 'EU-Heimtierausweis - Identifikation',
        document_date: '2021-08-30',
        summary: language === 'en' ? 'Microchip and passport data extracted from the pet passport page.' : 'Mikrochip- und Ausweisdaten aus der Heimtierausweis-Seite erkannt.',
        passport_number: '040-0708638',
        section_type: 'identification',
        animal: {
          name: 'Funny Russell Ranch OUT OF CONTROL',
          species: 'dog',
          breed: 'Parson Russell Terrier',
          sex: 'Male',
          birthdate: '2021-07-16',
          color: 'brown & white',
          notable_features: null
        },
        identification: {
          chip_code: '040097200000276',
          chip_date: '2021-08-30',
          chip_location: 'linke Halsseite',
          tattoo_code: null,
          tattoo_date: null,
          tattoo_location: null
        },
        issuing_authority: null,
        breeder: null,
        owner: null,
        suggested_tags: ['EU Pet Passport', 'Microchip', '040097200000276']
      }
    })
  }

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
            veterinarian: { name: 'Dr. Mock', practice: 'Kleintierpraxis Mock', address: 'Mockstadt', phone: '0000/123456' },
            active_ingredient: 'Milbemycin oxime / Praziquantel',
            treatment_subtype: 'echinococcus',
            next_due: '2024-06-15',
            notes: 'Tabelle Zeile 1'
          },
          {
            substance: 'Droncit',
            administered_at: '2024-03-15',
            dosage: '0.5 Tablette',
            vet_name: 'Dr. Mock',
            veterinarian: { name: 'Dr. Mock', practice: 'Kleintierpraxis Mock', address: 'Mockstadt', phone: '0000/123456' },
            active_ingredient: 'Praziquantel',
            treatment_subtype: 'parasite',
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
            valid_from: '2021-09-06',
            valid_until: '2024-09-06',
            batch_number: 'BATCH-001',
            expiry_date_of_vial: '2022-11-30',
            manufacturer: 'Boehringer',
            components: ['D', 'H', 'L', 'P', 'Pi'],
            active_substances: ['Staupevirus', 'Parvovirus'],
            vet_name: 'Dr. Mock',
            veterinarian: { name: 'Dr. Mock', practice: 'Mock Vet Clinic', address: 'Mock Street 1', phone: '0000/123456' },
            target_disease: 'Staupe, Parvo',
            purpose: 'Distemper, Hepatitis, Leptospirosis, Parvovirus, Parainfluenza'
          },
          {
            vaccine_name: 'Tollwut',
            administration_date: '2021-09-06',
            valid_from: '2021-09-28',
            valid_until: '2024-09-06',
            batch_number: 'BATCH-002',
            expiry_date_of_vial: '2022-10-31',
            manufacturer: 'MSD',
            components: ['Rabies'],
            active_substances: ['Tollwutvirus'],
            vet_name: 'Dr. Mock',
            veterinarian: { name: 'Dr. Mock', practice: 'Mock Vet Clinic', address: 'Mock Street 1', phone: '0000/123456' },
            target_disease: 'Tollwut',
            purpose: 'Rabies'
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

  return { provider: 'claude', data: parseStructuredModelResponse(text, 'Claude', documentType) }
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
      generationConfig: {
        responseMimeType: 'application/json'
      },
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

  return { provider: 'gemini', data: parseStructuredModelResponse(text, 'Gemini', documentType) }
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
    'pet_passport': 'pet_passport',
    'heimtierausweis': 'pet_passport',
    'eu_passport': 'pet_passport',
    'vet_report': 'general',
    'report': 'general',
    'microchip': 'pet_passport',
    'transponder': 'pet_passport',
    'passport': 'pet_passport',
    'other': 'general',
    'allgemein': 'general',
    '': 'general'
  }
  
  return mapping[normalized] || 'general'
}

function normalizeRequestedDocumentType(typeInput) {
  if (!typeInput) return null

  const normalized = String(typeInput).toLowerCase().trim()
  if (!normalized || normalized === 'auto' || normalized === 'unsure' || normalized === 'uncertain') {
    return null
  }

  return normalizeDocumentType(normalized)
}

function firstDefined(...values) {
  return values.find(value => value !== undefined && value !== null && value !== '')
}

function uniqueStrings(values = []) {
  return [...new Set(values.filter(value => typeof value === 'string' && value.trim().length > 0))]
}

function extractBalancedJsonCandidate(text) {
  const source = String(text || '')
  let startIndex = -1
  let depth = 0
  let inString = false
  let escaping = false

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]

    if (inString) {
      if (escaping) {
        escaping = false
      } else if (char === '\\') {
        escaping = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }

    if (char === '"') {
      inString = true
      continue
    }

    if (char === '{' || char === '[') {
      if (depth === 0) {
        startIndex = index
      }
      depth += 1
      continue
    }

    if (char === '}' || char === ']') {
      if (depth === 0) continue
      depth -= 1
      if (depth === 0 && startIndex >= 0) {
        return source.slice(startIndex, index + 1)
      }
    }
  }

  return null
}

export function parseStructuredModelResponse(text, provider, documentType = 'general') {
  const trimmed = String(text || '').trim()
  const candidates = [trimmed]

  const fencedMatches = [...trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)]
  for (const match of fencedMatches) {
    if (match[1]) candidates.push(match[1].trim())
  }

  const balanced = extractBalancedJsonCandidate(trimmed)
  if (balanced) candidates.push(balanced)

  for (const candidate of candidates) {
    if (!candidate) continue
    try {
      const parsed = JSON.parse(candidate)
      if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') continue
      return normalizeModelMetadata(normalizeDateFields({ type: normalizeDocumentType(documentType), ...parsed }))
    } catch {
      continue
    }
  }

  const preview = trimmed.replace(/\s+/g, ' ').slice(0, 240)
  throw new Error(`Kein JSON in ${provider}-Antwort${preview ? `: ${preview}` : ''}`)
}

function getNestedArray(source, key) {
  if (!source || typeof source !== 'object') return []
  const direct = source[key]
  if (Array.isArray(direct)) return direct
  const extractedText = source.extracted_text
  if (extractedText && Array.isArray(extractedText[key])) return extractedText[key]
  return []
}

function firstNonEmptyArray(...candidates) {
  return candidates.find((candidate) => Array.isArray(candidate) && candidate.length > 0) || []
}

function collectListRecords(pageResults, primaryKey, fallbackKey = primaryKey) {
  return pageResults.flatMap((page) => {
    // Handle case where page itself is an array (new direct array format)
    if (Array.isArray(page)) {
      return page
    }
    const payload = page?.payload || {}
    return firstNonEmptyArray(
      getNestedArray(payload, primaryKey),
      getNestedArray(page, primaryKey),
      getNestedArray(payload, fallbackKey),
      getNestedArray(page, fallbackKey)
    )
  })
}

function collectTextFragments(pageResults) {
  return pageResults.flatMap((page) => {
    const payload = page?.payload || {}
    const tags = [
      ...(Array.isArray(page?.tags) ? page.tags : []),
      ...(Array.isArray(payload?.tags) ? payload.tags : []),
      ...(Array.isArray(page?.suggested_tags) ? page.suggested_tags : []),
      ...(Array.isArray(payload?.suggested_tags) ? payload.suggested_tags : [])
    ]

    return [
      page?.title,
      payload?.title,
      page?.summary,
      payload?.summary,
      page?.text,
      payload?.text,
      page?.extracted_text,
      payload?.extracted_text,
      ...tags
    ].filter(Boolean)
  })
}

function normalizeConfidenceValue(value) {
  if (value === null || value === undefined || value === '') return undefined
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return undefined
    return Number((value > 1 ? value / 100 : value).toFixed(2))
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return undefined
    const parsed = Number.parseFloat(trimmed.replace('%', '').replace(',', '.'))
    if (!Number.isFinite(parsed)) return undefined
    return Number(((trimmed.includes('%') || parsed > 1 ? parsed / 100 : parsed)).toFixed(2))
  }
  return undefined
}

function normalizeModelMetadata(record) {
  if (!record || typeof record !== 'object') return record
  const confidence = normalizeConfidenceValue(record.confidence)
  return confidence === undefined ? record : { ...record, confidence }
}

function collectModelConfidences(pageResults) {
  return pageResults
    .flatMap((page) => [page?.confidence, page?.payload?.confidence])
    .map(normalizeConfidenceValue)
    .filter((value) => value !== undefined)
}

function average(values) {
  if (!values.length) return undefined
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2))
}

function calculateRecordCompleteness(record, keys) {
  if (!record || !keys.length) return 0
  const filled = keys.filter((key) => {
    const value = record[key]
    if (Array.isArray(value)) return value.length > 0
    return value !== null && value !== undefined && value !== ''
  }).length
  return Number((filled / keys.length).toFixed(2))
}

function evaluateExtractionQuality(type, payload, pageResults) {
  const modelConfidence = average(collectModelConfidences(pageResults))

  if (type === 'vaccination') {
    const vaccinations = Array.isArray(payload?.vaccinations) ? payload.vaccinations : []
    const retryReasons = []
    if (!vaccinations.length && isVaccinationLikeDocument(pageResults)) {
      retryReasons.push('vaccination_signals_without_structured_records')
    }
    const completenessScore = vaccinations.length
      ? average(vaccinations.map((record) => calculateRecordCompleteness(record, ['vaccine_name', 'administration_date', 'batch_number', 'valid_until'])))
      : 0

    return {
      requires_retry: retryReasons.length > 0,
      retry_reasons: retryReasons,
      model_confidence: modelConfidence,
      schema_valid: vaccinations.every((record) => record && typeof record === 'object'),
      domain_valid: vaccinations.length > 0 || retryReasons.length === 0,
      completeness_score: completenessScore || 0
    }
  }

  return {
    requires_retry: false,
    retry_reasons: [],
    model_confidence: modelConfidence,
    schema_valid: true,
    domain_valid: true,
    completeness_score: 1
  }
}

function isVaccinationLikeDocument(pageResults) {
  const fragments = collectTextFragments(pageResults)
    .map((value) => typeof value === 'string' ? value : '')
    .join(' ')
    .toLowerCase()

  if (!fragments) return false

  const strongVaccinationSignals = [
    /impfpass/,
    /impfungen/,
    /vaccination/,
    /vaccine/,
    /heimtierausweis/,
    /nobivac/,
    /eurican/,
    /boehringer/,
    /msd animal health/,
    /virbac/
  ]

  const matches = strongVaccinationSignals.filter((pattern) => pattern.test(fragments)).length
  return matches >= 2
}

function inferSuggestedType(suggestedType, pageResults) {
  if (suggestedType !== 'general') return suggestedType

  const vaccinations = collectListRecords(pageResults, 'vaccinations')
  if (vaccinations.length > 0) return 'vaccination'

  if (isVaccinationLikeDocument(pageResults)) return 'vaccination'

  const treatments = collectListRecords(pageResults, 'treatments', 'treatment_log')
  if (treatments.length > 0) return 'treatment'

  return suggestedType
}

export function buildExtractedDocumentData({ combinedText, suggestedType, pageResults, pages }) {
  const effectiveSuggestedType = inferSuggestedType(suggestedType, pageResults)
  const firstPage = pageResults[0] || {}
  const animal = firstDefined(...pageResults.map(page => page?.animal).filter(Boolean))
  const title = firstDefined(...pageResults.map(page => page?.title), firstPage.title)
  const documentDate = firstDefined(...pageResults.map(page => page?.document_date), firstPage.document_date)
  const summary = firstDefined(...pageResults.map(page => page?.summary), firstPage.summary)
  const suggestedTags = uniqueStrings(pageResults.flatMap(page => page?.suggested_tags || page?.payload?.suggested_tags || []))
  const confidence = average(collectModelConfidences(pageResults))

  const extracted = {
    type: effectiveSuggestedType,
    text: combinedText,
    pages,
    page_results: pageResults,
    ...(title ? { title } : {}),
    ...(documentDate ? { document_date: documentDate } : {}),
    ...(summary ? { summary } : {}),
    ...(animal ? { animal } : {}),
    ...(confidence !== undefined ? { confidence } : {}),
    ...(suggestedTags.length ? { suggested_tags: suggestedTags } : {})
  }

  if (effectiveSuggestedType === 'vaccination') {
    const vaccinations = collectListRecords(pageResults, 'vaccinations')
    const extractionQuality = evaluateExtractionQuality(effectiveSuggestedType, { vaccinations }, pageResults)
    return {
      ...extracted,
      extraction_quality: extractionQuality,
      vaccinations,
      payload: {
        type: effectiveSuggestedType,
        ...(title ? { title } : {}),
        ...(documentDate ? { document_date: documentDate } : {}),
        ...(summary ? { summary } : {}),
        ...(animal ? { animal } : {}),
        ...(confidence !== undefined ? { confidence } : {}),
        ...(suggestedTags.length ? { suggested_tags: suggestedTags } : {}),
        vaccinations
      }
    }
  }

  if (effectiveSuggestedType === 'treatment') {
    const treatments = collectListRecords(pageResults, 'treatments', 'treatment_log')
    const extractionQuality = evaluateExtractionQuality(effectiveSuggestedType, { treatments }, pageResults)
    return {
      ...extracted,
      extraction_quality: extractionQuality,
      treatments,
      payload: {
        type: effectiveSuggestedType,
        ...(title ? { title } : {}),
        ...(documentDate ? { document_date: documentDate } : {}),
        ...(summary ? { summary } : {}),
        ...(animal ? { animal } : {}),
        ...(confidence !== undefined ? { confidence } : {}),
        ...(suggestedTags.length ? { suggested_tags: suggestedTags } : {}),
        treatments
      }
    }
  }

  const extractionQuality = evaluateExtractionQuality(effectiveSuggestedType, firstPage, pageResults)

  return {
    ...firstPage,
    ...extracted,
    extraction_quality: extractionQuality,
    payload: {
      ...firstPage,
      ...(title ? { title } : {}),
      ...(documentDate ? { document_date: documentDate } : {}),
      ...(summary ? { summary } : {}),
      ...(animal ? { animal } : {}),
      ...(confidence !== undefined ? { confidence } : {}),
      ...(suggestedTags.length ? { suggested_tags: suggestedTags } : {})
    }
  }
}

// Two-step OCR: first classify document type, then extract with type-specific prompt
export async function classifyDocumentType(imagePath, userGeminiKey = null, userAnthropicKey = null, userOpenAiKey = null, priority = ['google', 'anthropic', 'openai'], language = 'de') {
  try {
    const normalizedLanguage = (language === 'en') ? 'en' : 'de'
    for (const provider of priority) {
      if (provider === 'google' && userGeminiKey) {
        return await classifyWithGemini(imagePath, userGeminiKey, normalizedLanguage)
      }
      if (provider === 'anthropic' && userAnthropicKey) {
        return await classifyWithClaude(imagePath, userAnthropicKey, normalizedLanguage)
      }
      if (provider === 'openai' && userOpenAiKey) {
        return await classifyWithOpenAI(imagePath, userOpenAiKey, normalizedLanguage)
      }
    }
    return 'general'
  } catch (err) {
    _log.warn({ err: err.message }, 'Document classification failed, defaulting to general')
    return 'general'
  }
}

async function classifyWithGemini(imagePath, geminiKey, language = 'de') {
  const imageData = readFileSync(imagePath)
  const base64 = imageData.toString('base64')
  let mimeType = imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg'
  if (base64.startsWith('/9j/')) mimeType = 'image/jpeg'
  else if (base64.startsWith('iVBORw')) mimeType = 'image/png'
  else if (base64.startsWith('UklGRg')) mimeType = 'image/webp'

  const normalizedLanguage = (language === 'en') ? 'en' : 'de'
  const classificationPrompt = PROMPTS[normalizedLanguage].classification

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: classificationPrompt },
          { inlineData: { mimeType, data: base64 } }
        ]
      }]
    })
  })

  if (!response.ok) throw new Error(`Gemini classification failed: ${response.status}`)
  const result = await response.json()
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text || ''
  const classified = normalizeDocumentType(text)
  _log.debug({ classified, language: normalizedLanguage }, 'Document classified')
  return classified
}

async function classifyWithClaude(imagePath, anthropicKey, language = 'de') {
  const imageData = readFileSync(imagePath)
  const base64 = imageData.toString('base64')
  let mimeType = imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg'
  if (base64.startsWith('/9j/')) mimeType = 'image/jpeg'
  else if (base64.startsWith('iVBORw')) mimeType = 'image/png'
  else if (base64.startsWith('UklGRg')) mimeType = 'image/webp'

  const normalizedLanguage = (language === 'en') ? 'en' : 'de'
  const classificationPrompt = PROMPTS[normalizedLanguage].classification

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
          { type: 'text', text: classificationPrompt }
        ]
      }]
    })
  })

  if (!response.ok) throw new Error(`Claude classification failed: ${response.status}`)
  const result = await response.json()
  const text = result.content?.[0]?.text || ''
  const classified = normalizeDocumentType(text)
  _log.debug({ classified, language: normalizedLanguage }, 'Document classified')
  return classified
}

async function classifyWithOpenAI(imagePath, openAiKey, language = 'de') {
  const imageData = readFileSync(imagePath)
  const base64 = imageData.toString('base64')
  let mimeType = imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg'
  if (base64.startsWith('/9j/')) mimeType = 'image/jpeg'
  else if (base64.startsWith('iVBORw')) mimeType = 'image/png'
  else if (base64.startsWith('UklGRg')) mimeType = 'image/webp'

  const normalizedLanguage = (language === 'en') ? 'en' : 'de'
  const classificationPrompt = PROMPTS[normalizedLanguage].classification

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
          { type: 'text', text: classificationPrompt },
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } }
        ]
      }]
    })
  })

  if (!response.ok) throw new Error(`OpenAI classification failed: ${response.status}`)
  const result = await response.json()
  const text = result.choices?.[0]?.message?.content || ''
  const classified = normalizeDocumentType(text)
  _log.debug({ classified, language: normalizedLanguage }, 'Document classified')
  return classified
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

  return { provider: 'openai', data: parseStructuredModelResponse(text, 'OpenAI', documentType) }
}
