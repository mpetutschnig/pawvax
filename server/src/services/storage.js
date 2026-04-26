import { createWriteStream, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'

const UPLOADS_DIR = process.env.UPLOADS_DIR ?? './uploads'

mkdirSync(UPLOADS_DIR, { recursive: true })

export function saveImageChunks(filename) {
  const filepath = join(UPLOADS_DIR, filename)
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
  const filepath = join(UPLOADS_DIR, filename)
  // Entferne evtl. vorhandene Data-URI-Präfixe (z.B. "data:image/jpeg;base64,")
  const base64 = base64Data.replace(/^data:image\/\w+;base64,/, '')
  const buffer = Buffer.from(base64, 'base64')
  writeFileSync(filepath, buffer)
  return filepath
}

export function getUploadPath(filename) {
  return join(UPLOADS_DIR, filename)
}
