import { existsSync, readFileSync } from 'node:fs'
import Database from 'better-sqlite3'

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
  const status = numFailedTests > 0 || results?.success === false ? 'failed' : 'success'

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

function persistResults(dbPath, summary, detailsRaw) {
  const db = new Database(dbPath)
  const upsert = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')

  db.transaction(() => {
    upsert.run('last_test_run', JSON.stringify(summary))
    upsert.run('last_test_run_details', detailsRaw)
  })()

  db.close()
}

function main() {
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
  persistResults(dbPath, summary, normalizedDetailsRaw)
  process.stdout.write(`Persisted deploy test results (${summary.status}, ${summary.passedTests}/${summary.totalTests} passed)\n`)
}

main()