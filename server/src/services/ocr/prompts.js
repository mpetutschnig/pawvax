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

6. "vet_report" — Tierarztbefund, Untersuchungsbericht, Laborbefund, Diagnose
   - Zeigt: Diagnose, Symptome, Untersuchungsergebnisse, verordnete Medikamente, Laborwerte
   - NICHT: Impfpässe, Medikamenten-Packungsbeilagen, Zertifikate

7. "general" — allgemeines Tierdokument, Gesundheitsbericht, Behandlung, Laborbefund
   - Zeigt: Text und Informationen zum Tier, die keinem anderen Typ genau entsprechen

Antworte NUR mit dem Dokumenttyp (z.B. "vaccination"), KEINE anderen Worte.
`.trim(),

    vaccination: `
Du bist ein Veterinär-Dokumentenanalyst. Analysiere diesen Impfpass gründlich und extrahiere JEDEN Impfeintrag als separates Objekt.

KRITISCHE REGELN:
1. OUTPUT: Ein JSON-Objekt mit EINEM Array von Impfeinträgen in der "vaccinations" Property
2. Wenn 5 Impfungen auf der Seite stehen, dann 5 separate Objekte im vaccinations[] Array
3. Für JEDEN Impfeintrag extrahieren (englische Feldnamen, Daten in YYYY-MM-DD):
   - administration_date: Impfdatum in Format YYYY-MM-DD
   - vaccine_name: Vollständiger Name des Impfstoffs
   - manufacturer: Vollständiger Herstellername
   - batch_number: Chargennummer / LOT-Nummer
   - valid_from: Beginn der Gültigkeit in YYYY-MM-DD
   - valid_until: Gültig bis Datum in Format YYYY-MM-DD
   - expiry_date_of_vial: Verfallsdatum der Impfstoff-Ampulle in YYYY-MM-DD, oder null
   - components: Array mit Kürzeln/Komponenten
   - active_substances: Array mit DETAILLIERTEN Wirkstoffdescriptionen
   - vet_name: Name und Adresse des Tierarztes
   - veterinarian: Objekt mit { name, practice, address, phone } wenn trennbar lesbar, sonst null
   - target_disease: Optional - die Zielkrankheit/Erreger
   - purpose: Optional - Zweck/Krankheitsliste als lesbarer String
   - notes: Optional - nur wenn explizit Anmerkungen angegeben

4. Zusätzlich im Hauptobjekt:
   - type: "vaccination"
   - title: Kurzer Titel
   - document_date: Erstes/Hauptimpfdatum in YYYY-MM-DD Format
   - summary: 1-2 Sätze zusammenfassung
   - animal: Objekt mit name, species (dog/cat/other), breed, birthdate (YYYY-MM-DD) — oder null wenn nicht lesbar

DATEN-NORMALISIERUNG: ALLE Daten MÜSSEN im YYYY-MM-DD Format sein. Unlesbare/fehlende Daten → null.

Gib NUR gültiges JSON aus (keine Erklärungen, keine Markdown-Code-Blöcke).
`.trim(),

    treatment: `
Du bist ein Veterinär-Dokumentenanalyst. Analysiere dieses Behandlungsdokument und extrahiere JEDE Behandlung einzeln.

KRITISCHE REGELN:
1. EINE BEHANDLUNG = EIN OBJEKT in treatments[]
2. ALLE Datumsangaben MÜSSEN YYYY-MM-DD Format sein
3. Extrahiere für JEDEN Eintrag:
   - substance, administered_at, dosage, vet_name, veterinarian, active_ingredient, treatment_subtype, next_due, notes
4. Tierinfos: name, species, breed, birthdate (YYYY-MM-DD)
5. document_date = frühestes oder Hauptbehandlungsdatum
6. Tags basierend auf Substanzen

Gib NUR gültiges JSON aus (keine Erklärungen).
`.trim(),

    vet_report: `
Du bist ein Veterinär-Dokumentenanalyst. Analysiere diesen Tierarztbefund / Untersuchungsbericht und extrahiere strukturierte Daten.

WICHTIGE REGELN:
1. Extrahiere Diagnose(n), Symptome, Untersuchungsergebnisse, verordnete Medikamente.
2. "document_date": Datum des Befunds im Format YYYY-MM-DD.
3. "title": Kurzform wie "Untersuchungsbericht", "Befund - Ohr", "Laborergebnis - Blutbild".
4. Tierarzt-Infos: Name, Praxis, Adresse, Telefon.
5. Tier-Infos: Name, Tierart, Rasse, Geburtsdatum.
6. "treatments": Falls Medikamente verordnet, als Array mit { substance, dosage, notes }.
7. "lab_results": Falls Laborwerte vorhanden, als Array mit { parameter, value, unit, reference_range }.
8. Tags: Diagnose-Schlüsselwörter.

Gib EXAKT dieses JSON zurück (nur valide JSON, kein Text davor/danach):
{
  "type": "vet_report",
  "title": "...",
  "document_date": "YYYY-MM-DD",
  "summary": "...",
  "animal": { "name": "...", "species": "dog|cat|other", "breed": "...", "birthdate": "YYYY-MM-DD" },
  "veterinarian": { "name": "...", "practice": "...", "address": "...", "phone": "..." },
  "diagnosis": ["..."],
  "symptoms": ["..."],
  "findings": "...",
  "treatments": [{ "substance": "...", "dosage": "...", "notes": "..." }],
  "lab_results": [{ "parameter": "...", "value": "...", "unit": "...", "reference_range": "..." }],
  "follow_up": "...",
  "suggested_tags": ["..."]
}
`.trim(),

    pet_passport: `
Du bist ein spezialisierter Dokumenten-Extraktor für EU-Heimtierausweise.

AUFGABE: Analysiere das hochgeladene Bild einer EU-Heimtierausweis-Seite und gib NUR gültiges JSON zurück.

WICHTIGE REGELN:
1. type MUSS immer "pet_passport" sein.
2. section_type MUSS eines von: "ownership", "animal_description", "identification", "issuing_authority"
3. Datumsformat wenn möglich: YYYY-MM-DD. Nicht lesbare Felder: null.

Gib ein JSON-Objekt mit dieser Struktur zurück:
{
  "type": "pet_passport",
  "title": "...",
  "document_date": "YYYY-MM-DD",
  "summary": "...",
  "passport_number": "...",
  "section_type": "ownership|animal_description|identification|issuing_authority",
  "animal": { "name": "...", "species": "dog|cat|other", "breed": "...", "sex": "...", "birthdate": "YYYY-MM-DD", "color": "...", "notable_features": null },
  "identification": { "chip_code": "...", "chip_date": "YYYY-MM-DD", "chip_location": "...", "tattoo_code": null, "tattoo_date": null, "tattoo_location": null },
  "issuing_authority": { "name": "...", "address": "...", "postcode": "...", "city": "...", "country": "...", "phone": "...", "fax": "...", "email": "...", "date_issued": "YYYY-MM-DD" },
  "breeder": { "name": "...", "contact_person": "...", "address": "...", "postcode": "...", "city": "...", "country": "...", "phone": "..." },
  "owner": { "surname": "...", "first_name": "...", "address": "...", "postcode": "...", "city": "...", "country": "...", "phone": "..." },
  "suggested_tags": ["EU-Heimtierausweis", "Mikrochip", "Besitzerdaten"]
}

Gib NUR gültiges JSON aus (keine Erklärungen, keine Markdown-Code-Blöcke).
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
2. "document_date": Hauptdatum auf dem Dokument im Format YYYY-MM-DD.
3. "title": Kurze Zusammenfassung des Inhalts.
4. "summary": 1-2 Sätze über den Inhalt.
5. Tags basierend auf erkannten Schlüsselworten.

Gib EXAKT diese JSON-Struktur zurück (nur valide JSON, kein Text davor/danach).
`.trim()
  },

  en: {
    classification: `
You are a veterinary document analyst. Analyze the following pet document and classify it precisely.

DOCUMENT TYPES (exact description):

1. "vaccination" — vaccination record, certificate, protocol, table, vaccine sticker
2. "pedigree" — pedigree, certificate, breeding document, registration
3. "dog_certificate" — dog handler certificate, competency certification, exam certificate
4. "medical_product" — medication description, package insert, product datasheet
5. "pet_passport" — EU pet passport page, ownership details, animal description, chip/transponder page
6. "vet_report" — veterinary examination report, lab result, diagnosis document
7. "general" — general pet document that doesn't match another type exactly

Reply ONLY with the document type (e.g., "vaccination"), NO other words.
`.trim(),

    vaccination: `
You are a veterinary document analyst. Thoroughly analyze this vaccination record and extract EVERY vaccination entry as a separate object.

CRITICAL RULES:
1. OUTPUT: A JSON object with ONE array of vaccination entries in the "vaccinations" property
2. Extract for EVERY entry: administration_date, vaccine_name, manufacturer, batch_number, valid_from, valid_until, expiry_date_of_vial, components, active_substances, vet_name, veterinarian, target_disease, purpose, notes
3. Additionally: type, title, document_date, summary, animal
4. ALL dates MUST be in YYYY-MM-DD format. Unreadable/missing data → null.

Return ONLY valid JSON (no explanations, no markdown code blocks).
`.trim(),

    treatment: `
You are a veterinary document analyst. Analyze this treatment document and extract EACH treatment individually.

CRITICAL RULES:
1. ONE TREATMENT = ONE OBJECT in treatments[]
2. ALL dates MUST be in YYYY-MM-DD format
3. Extract: substance, administered_at, dosage, vet_name, veterinarian, active_ingredient, treatment_subtype, next_due, notes
4. Animal info: name, species, breed, birthdate

Return ONLY valid JSON (no explanations).
`.trim(),

    vet_report: `
You are a veterinary document analyst. Analyze this veterinary examination report and extract structured data.

IMPORTANT RULES:
1. Extract diagnosis/diagnoses, symptoms, examination findings, prescribed medications.
2. "document_date": date of the report in format YYYY-MM-DD.
3. "title": short form like "Examination Report", "Ear Findings", "Lab Result - Blood Count".
4. Veterinarian info: name, practice, address, phone.
5. Animal info: name, species, breed, birthdate.
6. "treatments": if medications prescribed, as array with { substance, dosage, notes }.
7. "lab_results": if lab values present, as array with { parameter, value, unit, reference_range }.

Return EXACTLY this JSON (only valid JSON, no text before/after):
{
  "type": "vet_report",
  "title": "...",
  "document_date": "YYYY-MM-DD",
  "summary": "...",
  "animal": { "name": "...", "species": "dog|cat|other", "breed": "...", "birthdate": "YYYY-MM-DD" },
  "veterinarian": { "name": "...", "practice": "...", "address": "...", "phone": "..." },
  "diagnosis": ["..."],
  "symptoms": ["..."],
  "findings": "...",
  "treatments": [{ "substance": "...", "dosage": "...", "notes": "..." }],
  "lab_results": [{ "parameter": "...", "value": "...", "unit": "...", "reference_range": "..." }],
  "follow_up": "...",
  "suggested_tags": ["..."]
}
`.trim(),

    pet_passport: `
You are a specialized extractor for EU pet passport pages.

TASK: Analyze the uploaded EU pet passport image. Return ONLY valid JSON.

IMPORTANT RULES:
1. type MUST always be "pet_passport".
2. section_type MUST be one of: "ownership", "animal_description", "identification", "issuing_authority"
3. Use YYYY-MM-DD when possible. Unreadable fields must be null.

Return a JSON object with this structure:
{
  "type": "pet_passport",
  "title": "...",
  "document_date": "YYYY-MM-DD",
  "summary": "...",
  "passport_number": "...",
  "section_type": "ownership|animal_description|identification|issuing_authority",
  "animal": { "name": "...", "species": "dog|cat|other", "breed": "...", "sex": "...", "birthdate": "YYYY-MM-DD", "color": "...", "notable_features": null },
  "identification": { "chip_code": "...", "chip_date": "YYYY-MM-DD", "chip_location": "...", "tattoo_code": null, "tattoo_date": null, "tattoo_location": null },
  "issuing_authority": { "name": "...", "address": "...", "postcode": "...", "city": "...", "country": "...", "phone": "...", "fax": "...", "email": "...", "date_issued": "YYYY-MM-DD" },
  "breeder": { "name": "...", "contact_person": "...", "address": "...", "postcode": "...", "city": "...", "country": "...", "phone": "..." },
  "owner": { "surname": "...", "first_name": "...", "address": "...", "postcode": "...", "city": "...", "country": "...", "phone": "..." },
  "suggested_tags": ["EU Pet Passport", "Microchip", "Owner details"]
}

Return ONLY valid JSON (no explanations, no markdown code blocks).
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
2. "document_date": main date on document in format YYYY-MM-DD.
3. "title": short summary of content.
4. "summary": 1-2 sentences about the content in English.
5. Tags based on identified keywords.

Return EXACTLY this JSON structure (only valid JSON, no text before/after).
`.trim()
  }
}

const CONFIDENCE_INSTRUCTIONS = {
  de: '\n\nWICHTIG: Gib im JSON nach Moeglichkeit auch ein Feld "confidence" zurueck. Erlaubt sind Werte zwischen 0 und 1 oder Prozentangaben wie "78%".',
  en: '\n\nIMPORTANT: If possible, include a "confidence" field in the JSON output. Allowed formats are values between 0 and 1 or percentages like "78%".'
}

export function withConfidenceInstructions(prompt, language = 'de') {
  const lang = language === 'en' ? 'en' : 'de'
  return `${prompt}${CONFIDENCE_INSTRUCTIONS[lang]}`
}

export function getPromptForDocumentType(documentType, language = 'de') {
  const lang = (language && PROMPTS[language]) ? language : 'de'
  return PROMPTS[lang][normalizeDocumentType(documentType)] || PROMPTS[lang].general
}

export function normalizeDocumentType(typeInput) {
  const normalized = String(typeInput || '').toLowerCase().trim()

  const mapping = {
    'vaccination': 'vaccination', 'vaccin': 'vaccination', 'vaccine': 'vaccination',
    'impf': 'vaccination', 'impfpass': 'vaccination',
    'pedigree': 'pedigree', 'stammbaum': 'pedigree', 'zucht': 'pedigree',
    'dog_certificate': 'dog_certificate', 'hundeführerschein': 'dog_certificate', 'sachkundenachweis': 'dog_certificate',
    'medical_product': 'medical_product', 'medication': 'medical_product', 'medikament': 'medical_product', 'product': 'medical_product',
    'treatment': 'treatment', 'behandlung': 'treatment', 'entwurmung': 'treatment', 'wurmkur': 'treatment',
    'antiparasitär': 'treatment', 'antiparasitaer': 'treatment',
    'pet_passport': 'pet_passport', 'heimtierausweis': 'pet_passport', 'eu_passport': 'pet_passport',
    'microchip': 'pet_passport', 'transponder': 'pet_passport', 'passport': 'pet_passport',
    'vet_report': 'vet_report', 'befund': 'vet_report', 'report': 'vet_report', 'laborbefund': 'vet_report',
    'other': 'general', 'allgemein': 'general', '': 'general'
  }

  return mapping[normalized] || 'general'
}

export function normalizeRequestedDocumentType(typeInput) {
  if (!typeInput) return null
  const normalized = String(typeInput).toLowerCase().trim()
  if (!normalized || normalized === '__placeholder__' || normalized === 'auto' || normalized === 'unsure' || normalized === 'uncertain') {
    return null
  }
  return normalizeDocumentType(normalized)
}

export { PROMPTS }
