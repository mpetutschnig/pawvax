#!/usr/bin/env node

/**
 * Cleanup script for orphaned or inconsistent animals.
 * This script identifies animals without valid owners, with broken foreign keys,
 * or other data inconsistencies and generates a report.
 * 
 * Usage:
 *   node scripts/cleanup-orphaned-animals.js --dry-run   # Report only, no changes
 *   node scripts/cleanup-orphaned-animals.js --apply      # Apply deletions
 * 
 * Default is --dry-run mode.
 */

import Database from 'better-sqlite3'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { readFileSync } from 'fs'

const __dir = dirname(fileURLToPath(import.meta.url))
const dbPath = process.env.DB_PATH || join(__dir, '..', 'paw.db')

const args = process.argv.slice(2)
const isDryRun = !args.includes('--apply')
const isVerbose = args.includes('--verbose') || args.includes('-v')

console.log(`\n=== Paw Vax Animal Cleanup Script ===\n`)
console.log(`Database: ${dbPath}`)
console.log(`Mode: ${isDryRun ? 'DRY RUN (no changes)' : 'APPLY (will delete data)'}`)
console.log(`\n`)

if (!isDryRun) {
  console.warn(`⚠️  WARNING: You are running in APPLY mode. This will DELETE data.`)
  console.warn(`Press Ctrl+C within 5 seconds to cancel...\n`)
  await new Promise(resolve => setTimeout(resolve, 5000))
  console.log(`Proceeding...\n`)
}

const db = new Database(dbPath)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

const issues = {
  orphaned_animals: [],
  animals_without_account: [],
  inconsistent_tags: [],
  inconsistent_documents: [],
  archived_without_reason: []
}

const report = {
  total_issues: 0,
  by_category: {},
  deleted: 0,
  timestamp: new Date().toISOString()
}

console.log(`Scanning for issues...\n`)

// 1. Animals without valid account reference
console.log(`1. Checking for animals without valid account...`)
const orphaned = db.prepare(`
  SELECT a.id, a.name, a.account_id
  FROM animals a
  WHERE a.account_id NOT IN (SELECT id FROM accounts)
`).all()

if (orphaned.length > 0) {
  console.log(`   Found ${orphaned.length} animals with no valid account:`)
  for (const animal of orphaned) {
    console.log(`     - ${animal.id} (${animal.name}) [account: ${animal.account_id}]`)
    issues.animals_without_account.push(animal.id)
    if (isVerbose) {
      const docs = db.prepare('SELECT COUNT(*) as cnt FROM documents WHERE animal_id = ?').get(animal.id).cnt
      const tags = db.prepare('SELECT COUNT(*) as cnt FROM animal_tags WHERE animal_id = ?').get(animal.id).cnt
      console.log(`     ├─ Documents: ${docs}, Tags: ${tags}`)
    }
  }
  report.by_category['animals_without_account'] = orphaned.length
  report.total_issues += orphaned.length
} else {
  console.log(`   ✓ All animals have valid accounts`)
}

// 2. Tags without valid animal reference
console.log(`\n2. Checking for tags without valid animal...`)
const orphaned_tags = db.prepare(`
  SELECT t.tag_id, t.animal_id, t.tag_type
  FROM animal_tags t
  WHERE t.animal_id NOT IN (SELECT id FROM animals)
`).all()

if (orphaned_tags.length > 0) {
  console.log(`   Found ${orphaned_tags.length} orphaned tags:`)
  for (const tag of orphaned_tags) {
    console.log(`     - ${tag.tag_id} (type: ${tag.tag_type}) [animal: ${tag.animal_id}]`)
    issues.inconsistent_tags.push(tag.tag_id)
  }
  report.by_category['orphaned_tags'] = orphaned_tags.length
  report.total_issues += orphaned_tags.length
} else {
  console.log(`   ✓ All tags reference valid animals`)
}

// 3. Documents without valid animal reference
console.log(`\n3. Checking for documents without valid animal...`)
const orphaned_docs = db.prepare(`
  SELECT d.id, d.animal_id
  FROM documents d
  WHERE d.animal_id NOT IN (SELECT id FROM animals)
`).all()

if (orphaned_docs.length > 0) {
  console.log(`   Found ${orphaned_docs.length} orphaned documents:`)
  for (const doc of orphaned_docs.slice(0, 10)) {
    console.log(`     - ${doc.id} [animal: ${doc.animal_id}]`)
  }
  if (orphaned_docs.length > 10) {
    console.log(`     ... and ${orphaned_docs.length - 10} more`)
  }
  issues.inconsistent_documents = orphaned_docs.map(d => d.id)
  report.by_category['orphaned_documents'] = orphaned_docs.length
  report.total_issues += orphaned_docs.length
} else {
  console.log(`   ✓ All documents reference valid animals`)
}

// 4. Archived animals without archive reason
console.log(`\n4. Checking for archived animals without archive reason...`)
const archived_no_reason = db.prepare(`
  SELECT a.id, a.name, a.is_archived, a.archive_reason
  FROM animals a
  WHERE a.is_archived = 1 AND (a.archive_reason IS NULL OR trim(a.archive_reason) = '')
`).all()

if (archived_no_reason.length > 0) {
  console.log(`   Found ${archived_no_reason.length} archived animals without reason:`)
  for (const animal of archived_no_reason.slice(0, 10)) {
    console.log(`     - ${animal.id} (${animal.name})`)
  }
  if (archived_no_reason.length > 10) {
    console.log(`     ... and ${archived_no_reason.length - 10} more`)
  }
  issues.archived_without_reason = archived_no_reason.map(a => a.id)
  report.by_category['archived_without_reason'] = archived_no_reason.length
  report.total_issues += archived_no_reason.length
} else {
  console.log(`   ✓ All archived animals have archive reasons`)
}

// Summary
console.log(`\n${'='.repeat(50)}\n`)
console.log(`Report Summary:`)
console.log(`  Total issues found: ${report.total_issues}`)
for (const [category, count] of Object.entries(report.by_category)) {
  console.log(`  - ${category}: ${count}`)
}

if (report.total_issues === 0) {
  console.log(`\n✓ Database is clean!`)
  process.exit(0)
}

if (isDryRun) {
  console.log(`\n📋 DRY RUN: No changes made.`)
  console.log(`To apply these deletions, run:`)
  console.log(`   node scripts/cleanup-orphaned-animals.js --apply`)
  process.exit(0)
}

// ===== APPLY MODE =====
console.log(`\n⚙️  APPLYING CLEANUP...\n`)

const deleteTransaction = db.transaction(() => {
  let deleted = 0

  // Delete orphaned tags
  if (issues.inconsistent_tags.length > 0) {
    const placeholders = issues.inconsistent_tags.map(() => '?').join(',')
    const delCount = db.prepare(`DELETE FROM animal_tags WHERE tag_id IN (${placeholders})`).run(...issues.inconsistent_tags).changes
    console.log(`✓ Deleted ${delCount} orphaned tags`)
    deleted += delCount
  }

  // Delete orphaned documents (cascade deletes document_pages)
  if (issues.inconsistent_documents.length > 0) {
    const placeholders = issues.inconsistent_documents.map(() => '?').join(',')
    const delCount = db.prepare(`DELETE FROM documents WHERE id IN (${placeholders})`).run(...issues.inconsistent_documents).changes
    console.log(`✓ Deleted ${delCount} orphaned documents`)
    deleted += delCount
  }

  // Delete animals without account
  if (issues.animals_without_account.length > 0) {
    const placeholders = issues.animals_without_account.map(() => '?').join(',')
    const delCount = db.prepare(`DELETE FROM animals WHERE id IN (${placeholders})`).run(...issues.animals_without_account).changes
    console.log(`✓ Deleted ${delCount} animals without valid account`)
    deleted += delCount
  }

  // For archived animals without reason, we don't delete; just log
  if (issues.archived_without_reason.length > 0) {
    console.log(`⚠️  ${issues.archived_without_reason.length} archived animals have no archive reason (manual review recommended)`)
  }

  return deleted
})

try {
  const deletedCount = deleteTransaction()
  report.deleted = deletedCount
  console.log(`\n✅ Cleanup complete! Deleted ${deletedCount} inconsistent records.`)
} catch (err) {
  console.error(`\n❌ Cleanup failed:`, err.message)
  process.exit(1)
}

// Save report
try {
  const settingsKey = 'last_cleanup_report'
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(settingsKey, JSON.stringify(report))
  console.log(`Report saved to database.`)
} catch (err) {
  console.log(`Warning: Could not save report to database: ${err.message}`)
}

console.log(`\n`)
process.exit(0)
