import { createWriteStream, mkdirSync } from 'fs'
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

export function getUploadPath(filename) {
  return join(UPLOADS_DIR, filename)
}
