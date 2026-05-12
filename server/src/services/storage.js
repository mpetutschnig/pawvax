import { createWriteStream, mkdirSync, writeFileSync } from 'fs'
import { join, resolve, sep, dirname } from 'path'
import { fileURLToPath } from 'url'
import sharp from 'sharp'
import { UPLOADS_DIR } from '../utils/paths.js'

const __dir = dirname(fileURLToPath(import.meta.url))
const UPLOADS_DIR_RESOLVED = UPLOADS_DIR

mkdirSync(UPLOADS_DIR_RESOLVED, { recursive: true })

// Prevent path traversal attacks
function safePath(filename) {
  const full = resolve(UPLOADS_DIR_RESOLVED, filename)
  if (!full.startsWith(UPLOADS_DIR_RESOLVED + sep)) {
    throw new Error('Path traversal blocked')
  }
  return full
}

export function saveImageChunks(filename) {
  const filepath = safePath(filename)
  const stream = createWriteStream(filepath)
  return {
    write: (chunk) => stream.write(chunk),
    finish: () => new Promise((resolve, reject) => {
      stream.end()
      stream.on('finish', () => resolve(filepath))
      stream.on('error', reject)
    })
  }
}

export function saveBase64Image(filename, base64Data) {
  const filepath = safePath(filename)
  // Entferne evtl. vorhandene Data-URI-Präfixe (z.B. "data:image/jpeg;base64,")
  const base64 = base64Data.replace(/^data:image\/\w+;base64,/, '')
  const buffer = Buffer.from(base64, 'base64')
  writeFileSync(filepath, buffer)
  return filepath
}

export function getUploadPath(filename) {
  return safePath(filename)
}

export async function saveAvatarImage(filename, base64Data) {
  const filepath = safePath(filename)
  const base64 = base64Data.replace(/^data:image\/\w+;base64,/, '')
  const buffer = Buffer.from(base64, 'base64')

  await sharp(buffer)
    .resize(128, 128, { fit: 'cover', position: 'center' })
    .webp({ quality: 80 })
    .toFile(filepath)

  return filepath
}
