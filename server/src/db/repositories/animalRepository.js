export async function findAnimalByTagIdAndActive(db, tagId) {
  const { rows } = await db.query(`
      SELECT a.*, ac.name AS owner_name
      FROM animals a
      JOIN animal_tags t ON t.animal_id = a.id
      JOIN accounts ac ON ac.id = a.account_id
      WHERE (t.tag_id = $1 OR UPPER(REPLACE(t.tag_id, ':', '')) = $1) AND t.active = 1
    `, [tagId])
  return rows[0]
}

export async function findOwnAnimalByTagIdAndActive(db, tagId, accountId) {
  const { rows } = await db.query(`
      SELECT a.* FROM animals a
      JOIN animal_tags t ON t.animal_id = a.id
      WHERE (t.tag_id = $1 OR UPPER(REPLACE(t.tag_id, ':', '')) = $1) AND t.active = 1 AND a.account_id = $2
    `, [tagId, accountId])
  return rows[0]
}

export async function findAnimalWithOwnerByTagIdAndActive(db, tagId) {
  const { rows } = await db.query(`
      SELECT a.*, ac.name AS owner_name, ac.email AS owner_email
      FROM animals a
      JOIN animal_tags t ON t.animal_id = a.id
      JOIN accounts ac ON ac.id = a.account_id
      WHERE (t.tag_id = $1 OR UPPER(REPLACE(t.tag_id, ':', '')) = $1) AND t.active = 1
    `, [tagId])
  return rows[0]
}

export async function insertAnimalSharing(db, id, animalId, role, shareContact, shareBreed, shareBirthdate, shareAddress, shareDynamicFields, shareRawImages = 0) {
  await db.query(`INSERT INTO animal_sharing (id, animal_id, role, share_contact, share_breed, share_birthdate, share_address, share_dynamic_fields, share_raw_images)
                  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [id, animalId, role, shareContact, shareBreed, shareBirthdate, shareAddress, shareDynamicFields, shareRawImages])
}

export async function insertAnimalSharingFallback(db, id, animalId, role, shareContact, shareBreed, shareBirthdate, shareAddress, shareDynamicFields) {
  await db.query(`INSERT INTO animal_sharing (id, animal_id, role, share_contact, share_breed, share_birthdate, share_address, share_dynamic_fields)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [id, animalId, role, shareContact, shareBreed, shareBirthdate, shareAddress, shareDynamicFields])
}

export async function updateAnimalSharing(db, shareContact, shareBreed, shareBirthdate, shareAddress, shareDynamicFields, shareRawImages, animalId, role) {
  await db.query(`UPDATE animal_sharing SET share_contact=$1, share_breed=$2, share_birthdate=$3, share_address=$4, share_dynamic_fields=$5, share_raw_images=$6
                  WHERE animal_id=$7 AND role=$8`,
        [shareContact, shareBreed, shareBirthdate, shareAddress, shareDynamicFields, shareRawImages, animalId, role])
}

export async function findAnimalDocumentsWithUploader(db, animalId) {
  const { rows } = await db.query(`
      SELECT d.*, uploader.name AS added_by_name, uploader.verified AS added_by_verified
      FROM documents d
      LEFT JOIN accounts uploader ON uploader.id = d.added_by_account
      WHERE d.animal_id = $1
      ORDER BY d.created_at DESC
    `, [animalId])
  return rows
}

export async function findDocumentPages(db, documentId) {
  const { rows } = await db.query('SELECT image_path FROM document_pages WHERE document_id = $1 ORDER BY id ASC', [documentId])
  return rows
}

export async function findPublicShareById(db, shareId) {
  const { rows } = await db.query('SELECT * FROM animal_public_shares WHERE id = $1', [shareId])
  return rows[0]
}

export async function findAnimalByIdWithOwner(db, id) {
  const { rows } = await db.query(`
      SELECT a.*, ac.name AS owner_name, ac.email AS owner_email
      FROM animals a
      JOIN accounts ac ON a.account_id = ac.id
      WHERE a.id = $1
    `, [id])
  return rows[0]
}

export async function findAnimalSharingByRole(db, animalId, role) {
  const { rows } = await db.query('SELECT * FROM animal_sharing WHERE animal_id = $1 AND role = $2', [animalId, role])
  return rows[0]
}

export async function findTagByTagId(db, tagId) {
  const { rows } = await db.query('SELECT animal_id FROM animal_tags WHERE tag_id = $1', [tagId])
  return rows[0]
}

export async function findTagByTagIdCaseInsensitive(db, tagId) {
  const { rows } = await db.query(`
      SELECT animal_id FROM animal_tags 
      WHERE tag_id = $1 OR UPPER(REPLACE(tag_id, ':', '')) = $1
    `, [tagId])
  return rows[0]
}

export async function createAnimalWithTagTransaction(db, animalId, accountId, name, species, breed, pedigree_name, birthdate, address, tagId, tagType, ensureDefaultSharingFn) {
  const client = await db.connect()
  try {
    await client.query('BEGIN')

    await client.query('INSERT INTO animals (id, account_id, name, species, breed, pedigree_name, birthdate, address) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        [animalId, accountId, name, species, breed ?? null, pedigree_name ?? null, birthdate ?? null, address ?? null])

    if (tagId && tagType) {
      await client.query('INSERT INTO animal_tags (tag_id, animal_id, tag_type) VALUES ($1, $2, $3)',
          [tagId, animalId, tagType])
    }

    await ensureDefaultSharingFn(client, animalId)

    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

export async function findAnimalById(db, id) {
  const { rows } = await db.query('SELECT * FROM animals WHERE id = $1', [id])
  return rows[0]
}

export async function findAnimalByIdAndAccount(db, id, accountId) {
  const { rows } = await db.query('SELECT * FROM animals WHERE id = $1 AND account_id = $2', [id, accountId])
  return rows[0]
}

export async function updateAnimal(db, name, species, breed, pedigree_name, birthdate, address, dynamic_fields, avatar_path, id) {
  await db.query('UPDATE animals SET name=$1, species=$2, breed=$3, pedigree_name=$4, birthdate=$5, address=$6, dynamic_fields=$7, avatar_path=$8 WHERE id=$9',
      [name, species, breed, pedigree_name, birthdate, address, dynamic_fields, avatar_path, id])
}

export async function findAnimalArchiveState(db, id, accountId) {
  const { rows } = await db.query('SELECT id, is_archived FROM animals WHERE id = $1 AND account_id = $2', [id, accountId])
  return rows[0]
}

export async function updateAnimalArchiveState(db, isArchived, archiveReason, archivedAt, id) {
  await db.query('UPDATE animals SET is_archived = $1, archive_reason = $2, archived_at = $3 WHERE id = $4',
      [isArchived, archiveReason, archivedAt, id])
}

export async function unarchiveAnimal(db, id) {
  await db.query('UPDATE animals SET is_archived = 0, archive_reason = NULL, archived_at = NULL WHERE id = $1', [id])
}

export async function deleteAnimalTransaction(db, id) {
  await db.query('DELETE FROM document_pages WHERE document_id IN (SELECT id FROM documents WHERE animal_id = $1)', [id])
  await db.query('DELETE FROM documents WHERE animal_id = $1', [id])
  await db.query('DELETE FROM animal_tags WHERE animal_id = $1', [id])
  await db.query('DELETE FROM animal_sharing WHERE animal_id = $1', [id])
  await db.query('DELETE FROM animal_public_shares WHERE animal_id = $1', [id])
  await db.query('DELETE FROM animals WHERE id = $1', [id])
}

export async function findAnimalsByAccount(db, accountId) {
  const { rows } = await db.query('SELECT * FROM animals WHERE account_id = $1 ORDER BY is_archived ASC, name ASC', [accountId])
  return rows
}

export async function getAnimalStats(db, accountId) {
  const { rows: [{ cnt: total }] } = await db.query('SELECT COUNT(*) as cnt FROM animals WHERE account_id = $1', [accountId])
  const { rows: [{ cnt: active }] } = await db.query('SELECT COUNT(*) as cnt FROM animals WHERE account_id = $1 AND is_archived = 0', [accountId])
  const { rows: [{ cnt: archived }] } = await db.query('SELECT COUNT(*) as cnt FROM animals WHERE account_id = $1 AND is_archived = 1', [accountId])
  const { rows: [{ cnt: with_docs }] } = await db.query(`
      SELECT COUNT(DISTINCT a.id) as cnt FROM animals a
      JOIN documents d ON d.animal_id = a.id
      WHERE a.account_id = $1
    `, [accountId])
  return { total, active, archived, with_documents: with_docs }
}

export async function findTagsByAnimalId(db, animalId) {
  const { rows } = await db.query('SELECT * FROM animal_tags WHERE animal_id = $1 ORDER BY added_at DESC', [animalId])
  return rows
}

export async function findAnimalBasicInfo(db, id) {
  const { rows } = await db.query('SELECT id FROM animals WHERE id = $1', [id])
  return rows[0]
}

export async function findAnimalBasicInfoAndArchive(db, id) {
  const { rows } = await db.query('SELECT id, account_id, is_archived FROM animals WHERE id = $1', [id])
  return rows[0]
}

export async function findAccountRoleAndVerified(db, accountId) {
  const { rows } = await db.query('SELECT role, verified FROM accounts WHERE id = $1', [accountId])
  return rows[0]
}

export async function insertAnimalTag(db, tagId, animalId, tagType) {
  await db.query('INSERT INTO animal_tags (tag_id, animal_id, tag_type) VALUES ($1, $2, $3)', [tagId, animalId, tagType])
}

export async function findTagWithAccount(db, tagId) {
  const { rows } = await db.query(`
      SELECT t.tag_id, a.account_id FROM animal_tags t
      JOIN animals a ON a.id = t.animal_id
      WHERE t.tag_id = $1
    `, [tagId])
  return rows[0]
}

export async function updateTagActiveState(db, active, tagId) {
  await db.query('UPDATE animal_tags SET active = $1 WHERE tag_id = $2', [active, tagId])
}

export async function findTagById(db, tagId) {
  const { rows } = await db.query('SELECT * FROM animal_tags WHERE tag_id = $1', [tagId])
  return rows[0]
}

export async function deleteAnimalTag(db, tagId) {
  await db.query('DELETE FROM animal_tags WHERE tag_id = $1', [tagId])
}

export async function findAllSharingForAnimal(db, animalId) {
  const { rows } = await db.query('SELECT * FROM animal_sharing WHERE animal_id = $1 ORDER BY role', [animalId])
  return rows
}

export async function insertAnimalPublicShare(db, shareId, animalId, linkName, expiresAt, allowedRole) {
  await db.query('INSERT INTO animal_public_shares (id, animal_id, link_name, expires_at, allowed_role) VALUES ($1, $2, $3, $4, $5)',
    [shareId, animalId, linkName, expiresAt, allowedRole])
}

export async function findActivePublicShares(db, animalId, nowSeconds) {
  const { rows } = await db.query(`
      SELECT id, link_name, created_at, expires_at, allowed_role, (expires_at - $1) as seconds_remaining
      FROM animal_public_shares
      WHERE animal_id = $2 AND expires_at > $3
      ORDER BY created_at DESC
    `, [nowSeconds, animalId, nowSeconds])
  return rows
}

export async function findAnimalPublicShare(db, shareId, animalId) {
  const { rows } = await db.query('SELECT id FROM animal_public_shares WHERE id = $1 AND animal_id = $2', [shareId, animalId])
  return rows[0]
}

export async function updatePublicShareExpiresAt(db, expiresAtSeconds, shareId) {
  await db.query('UPDATE animal_public_shares SET expires_at = $1 WHERE id = $2', [expiresAtSeconds, shareId])
}

export async function deleteAnimalTransfers(db, animalId) {
  await db.query('DELETE FROM animal_transfers WHERE animal_id = $1', [animalId])
}

export async function insertAnimalTransfer(db, code, animalId, expiresAtISO) {
  await db.query('INSERT INTO animal_transfers (code, animal_id, expires_at) VALUES ($1, $2, $3)', [code, animalId, expiresAtISO])
}

export async function findAnimalTransferByCode(db, code) {
  const { rows } = await db.query('SELECT * FROM animal_transfers WHERE code = $1', [code])
  return rows[0]
}

export async function deleteAnimalTransferByCode(db, code) {
  await db.query('DELETE FROM animal_transfers WHERE code = $1', [code])
}

export async function updateAnimalOwner(db, accountId, animalId) {
  await db.query('UPDATE animals SET account_id = $1 WHERE id = $2', [accountId, animalId])
}

export async function updateAnimalAvatar(db, avatarPath, animalId) {
  await db.query('UPDATE animals SET avatar_path = $1 WHERE id = $2', [avatarPath, animalId])
}

export async function findRecentlyScannedAnimals(db, accountId) {
  const { rows } = await db.query(`
      SELECT DISTINCT ON (a.id) a.*, ast.scanned_at
      FROM animal_scans ast
      JOIN animals a ON a.id = ast.animal_id
      WHERE ast.account_id = $1 AND a.account_id != $1
      ORDER BY a.id, ast.scanned_at DESC
    `, [accountId])
  return rows
}

export async function findAnimalOwner(db, id) {
  const { rows } = await db.query('SELECT account_id FROM animals WHERE id = $1', [id])
  return rows[0]
}

export async function findRecentScans(db, animalId, sinceISO) {
  const { rows } = await db.query(`
      SELECT ast.id, ast.animal_id, ast.account_id, ast.scanned_at, a.name as scanner_name
      FROM animal_scans ast
      JOIN accounts a ON a.id = ast.account_id
      WHERE ast.animal_id = $1 AND ast.scanned_at > $2
      ORDER BY ast.scanned_at DESC
    `, [animalId, sinceISO])
  return rows
}

export async function insertAnimalScan(db, scanId, animalId, accountId) {
  await db.query(`
      INSERT INTO animal_scans (id, animal_id, account_id, scanned_at)
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
    `, [scanId, animalId, accountId])
}

export async function findScanHistoryLimit1(db, animalId, accountId) {
  const { rows } = await db.query('SELECT id FROM animal_scans WHERE animal_id = $1 AND account_id = $2 LIMIT 1', [animalId, accountId])
  return rows[0]
}

export async function insertDocument(db, docId, animalId, docType, imagePath, extractedJsonStr, ocrProvider, addedByRole, addedByAccount, allowedRolesStr, analysisStatus) {
  await db.query(`
      INSERT INTO documents (id, animal_id, doc_type, image_path, extracted_json, ocr_provider, added_by_role, added_by_account, allowed_roles, analysis_status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [docId, animalId, docType, imagePath, extractedJsonStr, ocrProvider, addedByRole, addedByAccount, allowedRolesStr, analysisStatus])
}
