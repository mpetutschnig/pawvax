import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import net from 'node:net'

const __dirname = dirname(fileURLToPath(import.meta.url))
const serverRoot = join(__dirname, '..')

function prefixStream(stream, prefix) {
  stream.on('data', (chunk) => {
    const text = chunk.toString()
    for (const line of text.split(/\r?\n/)) {
      if (line.trim().length > 0) {
        process.stdout.write(`${prefix} ${line}\n`)
      }
    }
  })
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : null
      server.close(() => resolve(port))
    })
    server.on('error', reject)
  })
}

async function waitForHealth(url, serverProcess) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (serverProcess.exitCode !== null) {
      throw new Error(`Test server exited early with code ${serverProcess.exitCode}`)
    }
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      // retry
    }
    await new Promise(resolve => setTimeout(resolve, 500))
  }

  throw new Error(`Timed out waiting for test server health endpoint: ${url}`)
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null) return

  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL') } catch {}
      resolve()
    }, 5000)

    child.once('exit', () => {
      clearTimeout(timer)
      resolve()
    })

    try {
      child.kill('SIGTERM')
    } catch {
      clearTimeout(timer)
      resolve()
    }
  })
}

async function main() {
  const passthroughArgs = process.argv.slice(2)
  const tempRoot = mkdtempSync(join(tmpdir(), 'pawvax-api-tests-'))
  const uploadsDir = join(tempRoot, 'uploads')
  const jestJsonOutput = join(tempRoot, 'jest-results.json')
  mkdirSync(uploadsDir, { recursive: true })

  const port = await getFreePort()
  const apiUrl = `http://127.0.0.1:${port}/api`

  const serverEnv = {
    ...process.env,
    NODE_ENV: 'test',
    PORT: String(port),
    DATABASE_URL: process.env.DATABASE_URL || 'postgresql://pawvax:pawvax@localhost:5432/pawvax_test',
    UPLOADS_DIR: uploadsDir,
    JWT_SECRET: process.env.JWT_SECRET || 'test-secret',
    PAW_MOCK_OCR: process.env.PAW_MOCK_OCR || '1',
  }

  const jestEnv = {
    ...process.env,
    NODE_ENV: 'test',
    API_URL: apiUrl,
    DATABASE_URL: process.env.DATABASE_URL || 'postgresql://pawvax:pawvax@localhost:5432/pawvax_test',
    UPLOADS_DIR: uploadsDir,
    TEST_TIMEOUT: process.env.TEST_TIMEOUT || '15000',
    PAW_MOCK_OCR: process.env.PAW_MOCK_OCR || '1',
  }

  const serverProcess = spawn(process.execPath, ['src/app.js'], {
    cwd: serverRoot,
    env: serverEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  prefixStream(serverProcess.stdout, '[test-server]')
  prefixStream(serverProcess.stderr, '[test-server]')

  try {
    await waitForHealth(`http://127.0.0.1:${port}/health`, serverProcess)

    const jestArgs = [
      '--experimental-vm-modules',
      'node_modules/jest/bin/jest.js',
      '--runInBand',
      '--forceExit',
      '--json',
      `--outputFile=${jestJsonOutput}`,
      ...passthroughArgs,
    ]

    const jestProcess = spawn(process.execPath, jestArgs, {
      cwd: serverRoot,
      env: jestEnv,
      stdio: 'inherit',
    })

    const exitCode = await new Promise((resolve, reject) => {
      jestProcess.once('error', reject)
      jestProcess.once('exit', resolve)
    })

    // Persist test results to server/data/test-results.json
    try {
      const rawJson = readFileSync(jestJsonOutput, 'utf-8')
      const jestData = JSON.parse(rawJson)
      const summary = {
        status: jestData.success ? 'passed' : 'failed',
        date: new Date().toISOString(),
        passedTests: jestData.numPassedTests,
        failedTests: jestData.numFailedTests,
        pendingTests: jestData.numPendingTests,
        todoTests: jestData.numTodoTests,
        totalTests: jestData.numTotalTests,
      }
      const dataDir = join(serverRoot, 'data')
      mkdirSync(dataDir, { recursive: true })
      writeFileSync(join(dataDir, 'test-results.json'), JSON.stringify({ summary, tests: jestData }, null, 2))
      writeFileSync(join(dataDir, 'jest-raw.json'), rawJson)
      // Also write to /tmp for cross-container access (persist-test-results.js reads from there)
      writeFileSync('/tmp/jest-raw.json', rawJson)
      console.log(`[test-runner] Results saved: ${summary.passedTests}/${summary.totalTests} passed`)
    } catch (e) {
      console.warn('[test-runner] Could not save test results:', e.message)
    }

    await stopProcess(serverProcess)
    rmSync(tempRoot, { recursive: true, force: true })
    process.exit(exitCode ?? 1)
  } catch (error) {
    console.error('[test-runner]', error.message)
    await stopProcess(serverProcess)
    rmSync(tempRoot, { recursive: true, force: true })
    process.exit(1)
  }
}

main()