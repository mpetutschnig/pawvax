import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

/**
 * Robustly resolves the uploads directory relative to the project structure.
 * This ensures consistency regardless of the current working directory.
 */
export const UPLOADS_DIR = process.env.UPLOADS_DIR
  ? resolve(process.env.UPLOADS_DIR)
  : resolve(join(__dirname, '..', '..', 'uploads'))
