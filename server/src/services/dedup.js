import { createHash } from 'node:crypto'

/**
 * Compute a stable content hash for a single extracted record or document.
 *
 * List types (vaccination, treatment): hash key identifying fields of each record.
 * Singleton types (pedigree, dog_certificate, certificate, general, …):
 *   hash title + document_date + issuer/document_number.
 */
export function computeRecordHash(docType, record) {
  const h = createHash('sha256')
  if (docType === 'vaccination') {
    // batch_number is globally unique — fall back to vaccine + administration_date
    const key = [
      String(record.batch_number || '').toLowerCase().trim(),
      String(record.vaccine_name || record.vaccine || '').toLowerCase().trim(),
      String(record.administration_date || '').trim()
    ].filter(Boolean).join('|')
    h.update(key || 'unknown')
  } else if (docType === 'treatment') {
    const key = [
      String(record.substance || record.treatment || record.medication || '').toLowerCase().trim(),
      String(record.administered_at || record.date || '').trim()
    ].filter(Boolean).join('|')
    h.update(key || 'unknown')
  } else {
    // Singleton: title + document_date + issuer/document_number
    const key = [
      String(record.title || '').toLowerCase().trim(),
      String(record.document_date || '').trim(),
      String(record.issuer || record.document_number || '').toLowerCase().trim()
    ].filter(Boolean).join('|')
    h.update(key || 'unknown')
  }
  return h.digest('hex').substring(0, 16)
}

const LIST_TYPES = new Set(['vaccination', 'treatment'])

/**
 * Flag duplicate records across all existing documents of the same animal.
 * Mutates the pageResults array in-place:
 *   - List types: sets `_record_hash`, `_duplicate`, `_source_document_id` on each record
 *   - Singleton types: sets `_record_hash`, `_duplicate`, `_source_document_id` on the pageResult itself
 *
 * @param {object} db   better-sqlite3 DB instance
 * @param {string} animalId
 * @param {string} currentDocId  the document being created/updated (excluded from lookup)
 * @param {string} docType
 * @param {any[]}  pageResults   array of per-page AI results
 */
export async function flagDuplicates(db, animalId, currentDocId, docType, pageResults) {
  const { rows: existingDocs } = await db.query(`
    SELECT id, extracted_json FROM documents
    WHERE animal_id = $1 AND id != $2 AND doc_type = $3 AND analysis_status = 'completed'
  `, [animalId, currentDocId, docType])

  if (LIST_TYPES.has(docType)) {
    // Build hash → source_document_id map from all existing records
    const existingHashes = new Map()
    for (const doc of existingDocs) {
      let ej
      try { ej = typeof doc.extracted_json === 'string' ? JSON.parse(doc.extracted_json) : doc.extracted_json } catch { continue }
      // Records are stored inside page_results[i].vaccinations / .treatments
      const pageResults = Array.isArray(ej?.page_results) ? ej.page_results : []
      for (const page of pageResults) {
        const vaccinations = Array.isArray(page?.vaccinations) ? page.vaccinations : 
                             Array.isArray(page?.payload?.vaccinations) ? page.payload.vaccinations : []
        const treatments = Array.isArray(page?.treatments) ? page.treatments : 
                           Array.isArray(page?.treatment_log) ? page.treatment_log :
                           Array.isArray(page?.payload?.treatment_log) ? page.payload.treatment_log : []
        
        const recs = (docType === 'vaccination' ? vaccinations : treatments)
        for (const rec of recs) {
          if (rec._record_hash && !rec._duplicate) {
            existingHashes.set(rec._record_hash, doc.id)
          }
        }
      }
    }

    // Stamp each record in the new page_results
    for (const pageResult of pageResults) {
      const vaccinations = Array.isArray(pageResult?.vaccinations) ? pageResult.vaccinations : 
                           Array.isArray(pageResult?.payload?.vaccinations) ? pageResult.payload.vaccinations : []
      const treatments = Array.isArray(pageResult?.treatments) ? pageResult.treatments : 
                         Array.isArray(pageResult?.treatment_log) ? pageResult.treatment_log :
                         Array.isArray(pageResult?.payload?.treatment_log) ? pageResult.payload.treatment_log : []

      const records = (docType === 'vaccination' ? vaccinations : treatments)
      
      for (const rec of records) {
        if (!rec || typeof rec !== 'object') continue
        const hash = computeRecordHash(docType, rec)
        rec._record_hash = hash
        if (existingHashes.has(hash)) {
          rec._duplicate = true
          rec._source_document_id = existingHashes.get(hash)
        }
      }
    }
  } else {
    // Singleton: hash the whole page result
    for (const pageResult of pageResults) {
      const hash = computeRecordHash(docType, pageResult)
      pageResult._record_hash = hash
      for (const doc of existingDocs) {
        let ej
        try { ej = typeof doc.extracted_json === 'string' ? JSON.parse(doc.extracted_json) : doc.extracted_json } catch { continue }
        // page_results is an array stored inside extracted_json
        const existingPages = ej?.page_results || []
        if (existingPages.some(p => p._record_hash === hash)) {
          pageResult._duplicate = true
          pageResult._source_document_id = doc.id
          break
        }
      }
    }
  }
}
