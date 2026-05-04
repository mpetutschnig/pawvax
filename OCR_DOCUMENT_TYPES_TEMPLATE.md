# OCR Dokumententypen — Template für Marco

Dieses Dokument definiert, welche Dokumententypen die PWA erkennen und strukturiert extrahieren soll.

**Hinweis:** Für jeden Dokumententyp:
1. Gib ein reales Beispiel (Foto oder Scan eines echten Dokuments deines Hundes)
2. Definiere die wichtigsten zu extrahierenden Felder
3. Definiere das gewünschte JSON-Output-Format
4. Definiere die Schlüsselwörter/Erkennungsmerkmale

---

## ✅ BEREITS DEFINIERT

### 1. `vaccination` — Impfpass
**Status:** ✅ Implementiert  
**Felder:** datum, impfstoff, hersteller, charge_lot, gueltig_bis, wirkstoffe, tierarzt, status (optional)  
**Output:** Array von Impfeinträgen mit deutschen Feldnamen

---

## ⏳ ZU DEFINIEREN

### 2. `health_report` — Gesundheitsbericht / Untersuchungsergebnis

**Beispiel-Dokument:** [BITTE BEREITSTELLEN]

**Wichtigste Felder zu extrahieren:**
- [ ] Untersuchungsdatum (YYYY-MM-DD)
- [ ] Untersuchungsart (z.B. "Allgemeine Untersuchung", "Zahnkontrolle", "Kardiologische Untersuchung")
- [ ] Tierarztname
- [ ] Befunde (kurz zusammengefasst)
- [ ] Diagnose (falls vorhanden)
- [ ] Empfehlung / Therapie
- [ ] Gewicht (kg)
- [ ] Blutdruck / Körpertemperatur (falls gemessen)
- [ ] Sonstige Messwerte?

**Gewünschtes JSON-Output-Format:**
```json
{
  "type": "health_report",
  "title": "...",
  "document_date": "YYYY-MM-DD",
  "summary": "...",
  "examination": {
    "date": "YYYY-MM-DD",
    "type": "...",
    "vet_name": "...",
    "weight_kg": null,
    "temperature_celsius": null,
    "blood_pressure": null
  },
  "findings": "...",
  "diagnosis": "...",
  "recommendations": "...",
  "suggested_tags": [...]
}
```

**Erkennungsmerkmale:**
- [ ] Stichwörter: "Untersuchung", "Befund", "Diagnose", "Untersuchungsbericht"
- [ ] Struktur: Kopf mit Tierarztpraxis + Datum, Körper mit Befunden

---

### 3. `lab_result` — Laborergebnis / Bluttest

**Beispiel-Dokument:** [BITTE BEREITSTELLEN]

**Wichtigste Felder zu extrahieren:**
- [ ] Untersuchungsdatum (YYYY-MM-DD)
- [ ] Laborname / Einsender-Tierarzt
- [ ] Testtyp (z.B. "Blutbild", "Serologie", "Urinalyse")
- [ ] Einzelne Messwerte (z.B. Hämatokrit, Leukozyten, etc.)
- [ ] Referenzbereiche (Normal/Auffällig)
- [ ] Zusammenfassung / Interpretation
- [ ] Testdatum vs. Analysedatum

**Gewünschtes JSON-Output-Format:**
```json
{
  "type": "lab_result",
  "title": "...",
  "document_date": "YYYY-MM-DD",
  "summary": "...",
  "lab": {
    "name": "...",
    "vet_name": "..."
  },
  "test_type": "...",
  "measurements": [
    {
      "parameter": "Hämatokrit",
      "value": "45",
      "unit": "%",
      "reference_range": "40-55",
      "status": "normal"
    }
  ],
  "interpretation": "...",
  "suggested_tags": [...]
}
```

**Erkennungsmerkmale:**
- [ ] Stichwörter: "Labor", "Blutbild", "Serologie", "Urinalyse", "Analyse"
- [ ] Struktur: Tabellen mit Parametern/Werten, Referenzbereiche

---

### 4. `surgical_report` — Operationsbericht / Kastration

**Beispiel-Dokument:** [BITTE BEREITSTELLEN]

**Wichtigste Felder zu extrahieren:**
- [ ] OP-Datum (YYYY-MM-DD)
- [ ] OP-Typ (z.B. "Kastration", "Spay", "Zahnextraktion", "Tumor-OP")
- [ ] Chirurg/Veterinär
- [ ] Anästhesie-Details (falls dokumentiert)
- [ ] Operationsbericht (Kurzbeschreibung)
- [ ] Material (Nahtmaterial, Implantate)
- [ ] Nachsorge-Empfehlungen (z.B. "Hose tragen", "Aktivität einschränken", "Fäden ziehen am XYZ")
- [ ] Fäden-Termin (falls vorhanden)

**Gewünschtes JSON-Output-Format:**
```json
{
  "type": "surgical_report",
  "title": "...",
  "document_date": "YYYY-MM-DD",
  "summary": "...",
  "surgery": {
    "date": "YYYY-MM-DD",
    "type": "...",
    "surgeon": "...",
    "anesthesia": "..."
  },
  "report": "...",
  "material": "...",
  "aftercare": {
    "restrictions": "...",
    "suture_removal_date": "YYYY-MM-DD"
  },
  "suggested_tags": [...]
}
```

**Erkennungsmerkmale:**
- [ ] Stichwörter: "Operation", "OP", "Chirurgie", "Kastration", "Spay", "Sutur", "Nähte"
- [ ] Struktur: Praxiskopf + OP-Datum, Operationsbericht, Nachsorge

---

### 5. `allergy_document` — Allergie / Unverträglichkeit

**Beispiel-Dokument:** [BITTE BEREITSTELLEN]

**Wichtigste Felder zu extrahieren:**
- [ ] Erkennungsdatum (YYYY-MM-DD)
- [ ] Allergen / Unverträglichkeit (z.B. "Geflügel", "Gluten", "Penicillin")
- [ ] Symptome (z.B. "Juckreiz", "Durchfall", "Anaphylaxie")
- [ ] Schweregrad (leicht, mittel, schwer)
- [ ] Testmethode (klinisch diagnostiziert, Intrakutan-Test, Bluttest)
- [ ] Empfohlene Vermeidung
- [ ] Notfallmedikation (z.B. "Antihistaminika", "Epinephrin")
- [ ] Tierarztname

**Gewünschtes JSON-Output-Format:**
```json
{
  "type": "allergy_document",
  "title": "...",
  "document_date": "YYYY-MM-DD",
  "summary": "...",
  "allergen": "...",
  "symptoms": ["...", "..."],
  "severity": "light|moderate|severe",
  "test_method": "...",
  "avoidance": "...",
  "emergency_medication": "...",
  "vet_name": "...",
  "suggested_tags": [...]
}
```

**Erkennungsmerkmale:**
- [ ] Stichwörter: "Allergie", "Unverträglichkeit", "Allergen", "Intolerant"
- [ ] Symptome aufgelistet

---

### 6. `weight_record` — Gewichtsverlauf / Körperkondition

**Beispiel-Dokument:** [BITTE BEREITSTELLEN]

**Wichtigste Felder zu extrahieren:**
- [ ] Messdatum (YYYY-MM-DD)
- [ ] Gewicht (kg)
- [ ] Ideal-Gewicht (falls angegeben)
- [ ] Body Condition Score (BCS 1-9)
- [ ] Tierarztnotizen
- [ ] Trend (z.B. "stabil", "zunehmend", "abnehmend")

**Gewünschtes JSON-Output-Format:**
```json
{
  "type": "weight_record",
  "title": "...",
  "document_date": "YYYY-MM-DD",
  "summary": "...",
  "measurements": [
    {
      "date": "YYYY-MM-DD",
      "weight_kg": 28.5,
      "ideal_weight_kg": 30,
      "bcs": 6,
      "notes": "..."
    }
  ],
  "suggested_tags": [...]
}
```

**Erkennungsmerkmale:**
- [ ] Stichwörter: "Gewicht", "Körperkondition", "BCS", "BMI", "Waage"
- [ ] Struktur: Tabelle mit Daten/Gewichten

---

### 7. `imaging_report` — Röntgen / Ultraschall / CT-Bericht

**Beispiel-Dokument:** [BITTE BEREITSTELLEN]

**Wichtigste Felder zu extrahieren:**
- [ ] Untersuchungsdatum (YYYY-MM-DD)
- [ ] Bildgebungstyp (z.B. "Röntgen Abdomen", "Ultraschall Herz", "CT Gehirn")
- [ ] Körperregion
- [ ] Veterinär-Radiologe
- [ ] Befunde / Diagnose
- [ ] Kontrastmittel-Verwendung (ja/nein)
- [ ] Aufnahmequalität
- [ ] Empfehlungen

**Gewünschtes JSON-Output-Format:**
```json
{
  "type": "imaging_report",
  "title": "...",
  "document_date": "YYYY-MM-DD",
  "summary": "...",
  "imaging": {
    "type": "...",
    "region": "...",
    "radiologist": "...",
    "contrast_used": false
  },
  "findings": "...",
  "diagnosis": "...",
  "recommendations": "...",
  "suggested_tags": [...]
}
```

**Erkennungsmerkmale:**
- [ ] Stichwörter: "Röntgen", "Ultraschall", "CT", "MRT", "Bildgebung", "Radiologie"
- [ ] Struktur: Kopf mit Datum + Region, Befundbeschreibung

---

### 8. `insurance_document` — Versicherung / Haftpflicht

**Beispiel-Dokument:** [BITTE BEREITSTELLEN]

**Wichtigste Felder zu extrahieren:**
- [ ] Versicherungstyp (z.B. "Krankenversicherung", "Haftpflichtversicherung", "OP-Versicherung")
- [ ] Versicherungsgesellschaft
- [ ] Policennummer
- [ ] Gültig von / bis (YYYY-MM-DD)
- [ ] Deckungssumme
- [ ] Selbstbeteiligung
- [ ] Ausschlüsse / Besonderheiten

**Gewünschtes JSON-Output-Format:**
```json
{
  "type": "insurance_document",
  "title": "...",
  "document_date": "YYYY-MM-DD",
  "summary": "...",
  "insurance": {
    "type": "...",
    "company": "...",
    "policy_number": "...",
    "valid_from": "YYYY-MM-DD",
    "valid_until": "YYYY-MM-DD",
    "coverage": "...",
    "deductible": "..."
  },
  "exclusions": "...",
  "suggested_tags": [...]
}
```

**Erkennungsmerkmale:**
- [ ] Stichwörter: "Versicherung", "Insurance", "Haftpflicht", "Police", "Deckungssumme"
- [ ] Struktur: Versicherer-Logo, Policy-Details

---

### 9. `registration_document` — Registrierung / Chip-Info / Zuchtverband

**Beispiel-Dokument:** [BITTE BEREITSTELLEN]

**Wichtigste Felder zu extrahieren:**
- [ ] Registrierungstyp (z.B. "Chip-Registrierung", "Zuchtverband-Eintrag", "Rasseclub")
- [ ] Chip-Nummer / Registrierungs-ID
- [ ] Registrierungsdatum (YYYY-MM-DD)
- [ ] Registrierungsbehörde / Verband
- [ ] Gültig bis (YYYY-MM-DD, falls zutreffend)
- [ ] Halter-Infos
- [ ] Spezielle Markierungen / Besonderheiten

**Gewünschtes JSON-Output-Format:**
```json
{
  "type": "registration_document",
  "title": "...",
  "document_date": "YYYY-MM-DD",
  "summary": "...",
  "registration": {
    "type": "...",
    "registration_id": "...",
    "authority": "...",
    "registered_at": "YYYY-MM-DD",
    "valid_until": "YYYY-MM-DD"
  },
  "holder_info": "...",
  "notes": "...",
  "suggested_tags": [...]
}
```

**Erkennungsmerkmale:**
- [ ] Stichwörter: "Chip", "Registrierung", "Zuchtverband", "Rasseclub", "Eintrag"

---

### 10. `invoice_receipt` — Rechnung / Quittung

**Beispiel-Dokument:** [BITTE BEREITSTELLEN]

**Wichtigste Felder zu extrahieren:**
- [ ] Rechnungsdatum (YYYY-MM-DD)
- [ ] Rechnungsnummer
- [ ] Tierarztpraxis / Klinik
- [ ] Leistungen (z.B. "Untersuchung", "Spritze", "Zahnreinigung")
- [ ] Beträge (Einzelpreise, Gesamtbetrag)
- [ ] Zahlungsart (bar, Überweisung, EC)
- [ ] Steuersatz (falls relevant)
- [ ] Zahlungsdatum (falls bezahlt)

**Gewünschtes JSON-Output-Format:**
```json
{
  "type": "invoice_receipt",
  "title": "...",
  "document_date": "YYYY-MM-DD",
  "summary": "...",
  "invoice": {
    "number": "...",
    "date": "YYYY-MM-DD",
    "provider": "...",
    "items": [
      {
        "description": "...",
        "amount": 50.00,
        "quantity": 1
      }
    ],
    "total": 150.00,
    "currency": "EUR",
    "tax_rate": 19
  },
  "payment": {
    "method": "...",
    "paid_on": "YYYY-MM-DD"
  },
  "suggested_tags": [...]
}
```

**Erkennungsmerkmale:**
- [ ] Stichwörter: "Rechnung", "Quittung", "Invoice", "Betrag", "Euro", "Gesamtkosten"
- [ ] Struktur: Tierarzt-Header, Positionen in Tabelle, Gesamtbetrag

---

## INSTRUKTIONEN FÜR MARCO

Für **jeden** weiteren Dokumententyp (2-10):

1. **Beispiel-Dokument:**
   - Scanne / fotografiere ein echtes Beispiel-Dokument von deinem Hund
   - Speichere es als `.jpg` oder `.png`
   - Lade es im entsprechenden Abschnitt hoch (oder beschreibe es detailliert)

2. **Felder ausfüllen:**
   - Schreibe auf, welche Felder aus diesem Dokument **wirklich** wichtig sind
   - Lösche Felder, die nicht relevant sind
   - Füge fehlende Felder hinzu

3. **JSON-Format definieren:**
   - Passe das suggested Format an
   - Deutsche oder englische Feldnamen? (Was bevorzugst du?)
   - Welche Felder sind optional vs. Pflicht?

4. **Erkennungsmerkmale:**
   - Welche Stichwörter helfen, den Dokumententyp zu erkennen?
   - Wie sieht die typische Struktur aus?

---

## ZUSAMMENFASSUNG

| Typ | Status | Beispiel | Felder | JSON | Erkennungsmerkmale |
|-----|--------|---------|--------|------|-------------------|
| vaccination | ✅ | ✅ | ✅ | ✅ | ✅ |
| health_report | ⏳ | [ ] | [ ] | [ ] | [ ] |
| lab_result | ⏳ | [ ] | [ ] | [ ] | [ ] |
| surgical_report | ⏳ | [ ] | [ ] | [ ] | [ ] |
| allergy_document | ⏳ | [ ] | [ ] | [ ] | [ ] |
| weight_record | ⏳ | [ ] | [ ] | [ ] | [ ] |
| imaging_report | ⏳ | [ ] | [ ] | [ ] | [ ] |
| insurance_document | ⏳ | [ ] | [ ] | [ ] | [ ] |
| registration_document | ⏳ | [ ] | [ ] | [ ] | [ ] |
| invoice_receipt | ⏳ | [ ] | [ ] | [ ] | [ ] |

---

**Noch weitere Dokumententypen nötig?** Einfach Bescheid sagen! 📝
