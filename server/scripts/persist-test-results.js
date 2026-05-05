import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import pg from 'pg'

function parseArgs(argv) {
  const [resultsPath, connectionString] = argv.slice(2)

  if (!resultsPath) {
    throw new Error('Usage: node scripts/persist-test-results.js <results-json-path> [connection-string]')
  }

  return { resultsPath, connectionString: connectionString || process.env.DATABASE_URL }
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

async function persistResults(connectionString, summary, detailsRaw) {
  const client = new pg.Client({ connectionString })
  await client.connect()

  try {
    const summaryJson = JSON.stringify(summary)
    const testTimestamp = Date.parse(summary.date)

    await client.query('BEGIN')

    await client.query(`
      INSERT INTO test_results (
        id,
        test_timestamp,
        summary_json,
        details_json,
        pass_count,
        fail_count,
        total_count,
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      randomUUID(),
      Number.isFinite(testTimestamp) ? testTimestamp : Date.now(),
      summaryJson,
      detailsRaw,
      summary.passedTests,
      summary.failedTests,
      summary.totalTests,
      summary.status,
    ])

    await client.query(
      'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      ['last_test_run', summaryJson]
    )

    await client.query(
      'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      ['last_test_run_details', detailsRaw]
    )

    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    await client.end()
  }
}

async function main() {
  const { resultsPath, connectionString } = parseArgs(process.argv)

  if (!connectionString) {
    throw new Error('Connection string required: pass as second argument or set DATABASE_URL')
  }

  if (!existsSync(resultsPath)) {
    throw new Error(`Test results file not found: ${resultsPath}`)
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
  await persistResults(connectionString, summary, normalizedDetailsRaw)
  process.stdout.write(`Persisted deploy test results (${summary.status}, ${summary.passedTests}/${summary.totalTests} passed)\n`)
}

main()