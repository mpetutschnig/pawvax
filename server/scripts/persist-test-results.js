import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import Database from 'better-sqlite3'

const SQLITE_BUSY_RETRIES = 5
const SQLITE_BUSY_DELAY_MS = 750

function parseArgs(argv) {
  const [resultsPath, dbPath] = argv.slice(2)

  if (!resultsPath || !dbPath) {
    throw new Error('Usage: node scripts/persist-test-results.js <results-json-path> <sqlite-db-path>')
  }

  return { resultsPath, dbPath }
}

function buildSummary(results) {
  const numPassedTests = Number(results?.numPassedTests || 0)
  const numFailedTests = Number(results?.numFailedTests || 0)
  const numPendingTests = Number(results?.numPendingTests || 0)
  const numTodoTests = Number(results?.numTodoTests || 0)
  const totalTests = Number(results?.numTotalTests || (numPassedTests + numFailedTests + numPendingTests + numTodoTests))
  const status = numFailedTests > 0 || results?.success === false
    ? 'failed'
    : (numPassedTests + numPendingTests + numTodoTests < totalTests ? 'incomplete' : 'passed')

  return {
    status,
    date: new Date().toISOString(),
    passedTests: numPassedTests,
    failedTests: numFailedTests,
    pendingTests: numPendingTests,
    todoTests: numTodoTests,
    totalTests,
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function persistResults(dbPath, summary, detailsRaw) {
  const db = new Database(dbPath)

  try {
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    db.pragma('busy_timeout = 5000')

    const upsert = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    const insertTestResult = db.prepare(`
      INSERT INTO test_results (
        id,
        test_timestamp,
        summary_json,
        details_json,
        pass_count,
        fail_count,
        total_count,
        status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const summaryJson = JSON.stringify(summary)
    const testTimestamp = Date.parse(summary.date)

    db.transaction(() => {
      insertTestResult.run(
        randomUUID(),
        Number.isFinite(testTimestamp) ? testTimestamp : Date.now(),
        summaryJson,
        detailsRaw,
        summary.passedTests,
        summary.failedTests,
        summary.totalTests,
        summary.status,
      )
      upsert.run('last_test_run', summaryJson)
      upsert.run('last_test_run_details', detailsRaw)
    })()
  } finally {
    db.close()
  }
}

async function persistResultsWithRetry(dbPath, summary, detailsRaw) {
  for (let attempt = 1; attempt <= SQLITE_BUSY_RETRIES; attempt += 1) {
    try {
      persistResults(dbPath, summary, detailsRaw)
      return
    } catch (error) {
      const isBusy = error && typeof error === 'object' && error.code === 'SQLITE_BUSY'
      if (!isBusy || attempt === SQLITE_BUSY_RETRIES) {
        throw error
      }
      await wait(SQLITE_BUSY_DELAY_MS * attempt)
    }
  }
}

async function main() {
  const { resultsPath, dbPath } = parseArgs(process.argv)

  if (!existsSync(resultsPath)) {
    throw new Error(`Test results file not found: ${resultsPath}`)
  }

  if (!existsSync(dbPath)) {
    throw new Error(`SQLite database not found: ${dbPath}`)
  }

  const detailsRaw = readFileSync(resultsPath, 'utf8')
  const normalizedDetailsRaw = detailsRaw.replace(/^\uFEFF/, '')
  if (!normalizedDetailsRaw.trim()) {
    throw new Error(`Test results file is empty: ${resultsPath}`)
  }

  let details
  try {
    details = JSON.parse(normalizedDetailsRaw)
  } catch (error) {
    throw new Error(`Test results file is not valid JSON: ${error instanceof Error ? error.message : 'unknown parse error'}`)
  }

  const summary = buildSummary(details)
  await persistResultsWithRetry(dbPath, summary, normalizedDetailsRaw)
  process.stdout.write(`Persisted deploy test results (${summary.status}, ${summary.passedTests}/${summary.totalTests} passed)\n`)
}

main()