// Sentry/GlitchTip initialization — MUST be imported before anything else.
// No-op unless SENTRY_DSN is set, so it is safe to ship disabled.
import 'dotenv/config'

const dsn = process.env.SENTRY_DSN
if (dsn) {
  const Sentry = await import('@sentry/node')
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'production',
    release: process.env.APP_VERSION || undefined,
    // Keep tracing light on a single box; raise if needed.
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0.1),
    sendDefaultPii: false,
    beforeSend(event) {
      // Strip personal data (GPS, contact, tokens, owner/animal payloads)
      try {
        if (event.request) {
          delete event.request.cookies
          if (event.request.headers) {
            delete event.request.headers.authorization
            delete event.request.headers.cookie
          }
          if (event.request.data && typeof event.request.data === 'object') {
            for (const k of ['lat', 'lng', 'reporter_contact', 'reporter_name', 'note', 'password', 'currentPassword', 'gemini_token', 'anthropic_token', 'openai_token', 'mistral_token', 'gladia_token']) {
              if (k in event.request.data) event.request.data[k] = '[redacted]'
            }
          }
        }
        if (event.user) {
          // keep only an opaque id, drop email/ip
          event.user = event.user.id ? { id: event.user.id } : undefined
        }
      } catch { /* never block delivery */ }
      return event
    }
  })
}
