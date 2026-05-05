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

import pg from 'pg'

const args = process.argv.slice(2)
const isDryRun = !args.includes('--apply')
const isVerbose = args.includes('--verbose') || args.includes('-v')

const connectionString = process.env.DATABASE_URL || process.argv.find(a => a.startsWith('--db='))?.slice(5)

if (!connectionString) {
  console.error('Error: No database connection string. Set DATABASE_URL or pass --db=<connection_string>')
  process.exit(1)
}

console.log(`\n=== Paw Vax Animal Cleanup Script ===\n`)
console.log(`Database: ${connectionString.replace(/:[^:@]+@/, ':***@')}`)
console.log(`Mode: ${isDryRun ? 'DRY RUN (no changes)' : 'APPLY (will delete data)'}`)
console.log(`\n`)

if (!isDryRun) {
  console.warn(`⚠️  WARNING: You are running in APPLY mode. This will DELETE data.`)
  console.warn(`Press Ctrl+C within 5 seconds to cancel...\n`)
  await new Promise(resolve => setTimeout(resolve, 5000))
  console.log(`Proceeding...\n`)
}

const client = new pg.Client({ connectionString })
await client.connect()

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
const { rows: orphaned } = await client.query(`
  SELECT a.id, a.name, a.account_id
  FROM animals a
  WHERE a.account_id NOT IN (SELECT id FROM accounts)
`)

if (orphaned.length > 0) {
  console.log(`   Found ${orphaned.length} animals with no valid account:`)
  for (const animal of orphaned) {
    console.log(`     - ${animal.id} (${animal.name}) [account: ${animal.account_id}]`)
    issues.animals_without_account.push(animal.id)
    if (isVerbose) {
      const docs = (await client.query('SELECT COUNT(*) as cnt FROM documents WHERE animal_id = $1', [animal.id])).rows[0].cnt
      const tags = (await client.query('SELECT COUNT(*) as cnt FROM animal_tags WHERE animal_id = $1', [animal.id])).rows[0].cnt
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
const { rows: orphaned_tags } = await client.query(`
  SELECT t.tag_id, t.animal_id, t.tag_type
  FROM animal_tags t
  WHERE t.animal_id NOT IN (SELECT id FROM animals)
`)

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
const { rows: orphaned_docs } = await client.query(`
  SELECT d.id, d.animal_id
  FROM documents d
  WHERE d.animal_id NOT IN (SELECT id FROM animals)
`)

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
const { rows: archived_no_reason } = await client.query(`
  SELECT a.id, a.name, a.is_archived, a.archive_reason
  FROM animals a
  WHERE a.is_archived = TRUE AND (a.archive_reason IS NULL OR trim(a.archive_reason) = '')
`)

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
  await client.end()
  process.exit(0)
}

if (isDryRun) {
  console.log(`\n📋 DRY RUN: No changes made.`)
  console.log(`To apply these deletions, run:`)
  console.log(`   node scripts/cleanup-orphaned-animals.js --apply`)
  await client.end()
  process.exit(0)
}

// ===== APPLY MODE =====
console.log(`\n⚙️  APPLYING CLEANUP...\n`)

try {
  await client.query('BEGIN')
  let deleted = 0

  // Delete orphaned tags
  if (issues.inconsistent_tags.length > 0) {
    const { rowCount: delCount } = await client.query('DELETE FROM animal_tags WHERE tag_id = ANY($1::text[])', [issues.inconsistent_tags])
    console.log(`✓ Deleted ${delCount} orphaned tags`)
    deleted += delCount
  }

  // Delete orphaned documents (cascade deletes document_pages)
  if (issues.inconsistent_documents.length > 0) {
    const { rowCount: delCount } = await client.query('DELETE FROM documents WHERE id = ANY($1::text[])', [issues.inconsistent_documents])
    console.log(`✓ Deleted ${delCount} orphaned documents`)
    deleted += delCount
  }

  // Delete animals without account
  if (issues.animals_without_account.length > 0) {
    const { rowCount: delCount } = await client.query('DELETE FROM animals WHERE id = ANY($1::text[])', [issues.animals_without_account])
    console.log(`✓ Deleted ${delCount} animals without valid account`)
    deleted += delCount
  }

  // For archived animals without reason, we don't delete; just log
  if (issues.archived_without_reason.length > 0) {
    console.log(`⚠️  ${issues.archived_without_reason.length} archived animals have no archive reason (manual review recommended)`)
  }

  await client.query('COMMIT')
  report.deleted = deleted
  console.log(`\n✅ Cleanup complete! Deleted ${deleted} inconsistent records.`)
} catch (err) {
  await client.query('ROLLBACK')
  console.error(`\n❌ Cleanup failed:`, err.message)
  await client.end()
  process.exit(1)
}

// Save report
try {
  const settingsKey = 'last_cleanup_report'
  await client.query(
    'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
    [settingsKey, JSON.stringify(report)]
  )
  console.log(`Report saved to database.`)
} catch (err) {
  console.log(`Warning: Could not save report to database: ${err.message}`)
}

await client.end()
console.log(`\n`)
process.exit(0)
