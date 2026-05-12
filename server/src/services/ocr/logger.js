let _log = {
  debug: () => {},
  info: () => {},
  warn: (data, msg) => process.stderr.write(JSON.stringify({ level: 'warn', name: 'ocr', ...data, msg }) + '\n'),
  error: (data, msg) => process.stderr.write(JSON.stringify({ level: 'error', name: 'ocr', ...data, msg }) + '\n'),
}

export function setOcrLogger(log) { _log = log }
export function getOcrLogger() { return _log }
