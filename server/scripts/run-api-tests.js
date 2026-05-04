import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs'
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
  const dbPath = join(tempRoot, 'paw.test.db')
  const uploadsDir = join(tempRoot, 'uploads')
  mkdirSync(uploadsDir, { recursive: true })

  const port = await getFreePort()
  const apiUrl = `http://127.0.0.1:${port}/api`

  const serverEnv = {
    ...process.env,
    NODE_ENV: 'test',
    PORT: String(port),
    DB_PATH: dbPath,
    UPLOADS_DIR: uploadsDir,
    JWT_SECRET: process.env.JWT_SECRET || 'test-secret',
  }

  const jestEnv = {
    ...process.env,
    NODE_ENV: 'test',
    API_URL: apiUrl,
    DB_PATH: dbPath,
    UPLOADS_DIR: uploadsDir,
    TEST_TIMEOUT: process.env.TEST_TIMEOUT || '15000',
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
      '--detectOpenHandles',
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