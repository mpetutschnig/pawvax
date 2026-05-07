export function generateICS(event: { title: string; date: string; description?: string }): string {
  const dt = event.date.replace(/-/g, '').split('T')[0] // YYYYMMDD
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//PAW Digitaler Tierimpfpass//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `DTSTART;VALUE=DATE:${dt}`,
    `DTEND;VALUE=DATE:${dt}`,
    `SUMMARY:${escapeICS(event.title)}`,
    `DESCRIPTION:${escapeICS(event.description ?? '')}`,
    `UID:paw-${Date.now()}-${Math.random().toString(36).slice(2)}@${new URL(window.location.origin).hostname}`,
    `DTSTAMP:${formatDateISO(new Date())}`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n')
}

function escapeICS(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
}

function formatDateISO(date: Date): string {
  return date.toISOString().replace(/[:-]/g, '').split('.')[0] + 'Z'
}

export function downloadBlob(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType + ';charset=utf-8' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
