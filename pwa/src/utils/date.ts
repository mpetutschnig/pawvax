/**
 * Parses any server timestamp into a JS Date:
 * - ISO string with T separator: "2026-05-06T22:47:00.123Z"
 * - PostgreSQL text with space: "2026-05-06 22:47:00.123456+02:00"
 * - Unix seconds (integer ≤ 9_999_999_999): 1746655200
 * - Unix milliseconds (integer > 9_999_999_999): 1746655200000
 * Returns null for missing/invalid values.
 */
export function parseDate(value: string | number | null | undefined): Date | null {
  if (value == null) return null
  if (typeof value === 'number') {
    // Heuristic: values ≤ 9_999_999_999 are Unix seconds, larger are ms
    const ms = value <= 9_999_999_999 ? value * 1000 : value
    const d = new Date(ms)
    return isNaN(d.getTime()) ? null : d
  }
  if (typeof value === 'string') {
    if (!value) return null
    // Replace PostgreSQL's space separator with T so all browsers parse it
    const normalized = value.replace(' ', 'T')
    const d = new Date(normalized)
    return isNaN(d.getTime()) ? null : d
  }
  return null
}

/**
 * Formats a server timestamp to a human-readable locale string.
 * Falls back to '—' for missing values.
 */
export function formatDate(
  value: string | number | null | undefined,
  locale = 'de-AT',
  opts: Intl.DateTimeFormatOptions = { dateStyle: 'short', timeStyle: 'short' }
): string {
  const d = parseDate(value)
  if (!d) return '—'
  return d.toLocaleString(locale, opts)
}

export function formatDateOnly(
  value: string | number | null | undefined,
  locale = 'de-AT'
): string {
  const d = parseDate(value)
  if (!d) return '—'
  return d.toLocaleDateString(locale)
}
