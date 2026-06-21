import { getDb } from '../db/index.js'
import { getMailTransportConfig, isMailConfigured } from './appSettings.js'

function getBaseUrl(req) {
  // PWA origin detection from request
  let origin = req?.headers?.origin
  if (!origin && req?.headers?.referer) {
    try {
      origin = new URL(req.headers.referer).origin
    } catch { /* ignore invalid referer */ }
  }
  return (origin || process.env.PWA_URL || process.env.APP_BASE_URL || process.env.PUBLIC_APP_URL || 'http://localhost:5173').replace(/\/$/, '')
}

async function loadMailer() {
  const module = await import('nodemailer')
  return module.default || module
}

function buildTransportOptions(config) {
  const secure = config.securityMode === 'ssl'
  const requireTLS = config.securityMode === 'starttls'
  const options = {
    host: config.host,
    port: Number(config.port),
    secure,
    requireTLS,
    auth: undefined
  }

  if (config.authMode === 'oauth2') {
    options.auth = {
      type: 'OAuth2',
      user: config.username,
      clientId: config.oauth2ClientId,
      clientSecret: config.oauth2ClientSecret,
      refreshToken: config.oauth2RefreshToken,
      accessToken: config.oauth2AccessToken
    }
  } else {
    options.auth = {
      user: config.username,
      pass: config.smtpPassword
    }
  }

  return options
}

function buildFrom(config) {
  if (!config.fromName) return config.fromAddress
  return `"${config.fromName}" <${config.fromAddress}>`
}

export async function sendTestEmail({ to, fastify, overrides = {} }) {
  const db = getDb()
  const baseConfig = await getMailTransportConfig(db)
  const cleanOverrides = Object.fromEntries(
    Object.entries(overrides).filter(([, v]) => v !== undefined && v !== null && v !== '')
  )
  const config = { ...baseConfig, ...cleanOverrides }

  if (!isMailConfigured(config)) {
    return { delivered: false, skipped: true, reason: 'mail-not-configured' }
  }

  const nodemailer = await loadMailer()
  const transport = nodemailer.createTransport(buildTransportOptions(config))
  await transport.sendMail({
    from: buildFrom(config),
    to,
    replyTo: config.replyTo || undefined,
    subject: 'PAW Mail-Konfiguration Test',
    text: 'Die Mail-Konfiguration wurde erfolgreich getestet.'
  })

  fastify?.log.info({ to }, 'Test email delivered successfully')
  return { delivered: true }
}

export function shouldExposeAuthTokens() {
  return process.env.NODE_ENV === 'test' || process.env.PAW_EXPOSE_AUTH_TOKENS === '1'
}

export function buildVerificationUrl(token, req) {
  return `${getBaseUrl(req)}/login?verifyToken=${encodeURIComponent(token)}`
}

export function buildResetUrl(token, req) {
  return `${getBaseUrl(req)}/login?resetToken=${encodeURIComponent(token)}`
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ))
}

/**
 * Notify an animal owner that someone reported its GPS location ("found pet").
 * Returns { delivered, skipped? } and never throws.
 */
export async function sendLocationReportEmail({ to, ownerName, animalName, lat, lng, accuracyM, note, reporterName, reporterContact, fastify, req }) {
  const db = getDb()
  const config = await getMailTransportConfig(db)
  const mapUrl = `https://www.google.com/maps?q=${encodeURIComponent(lat)},${encodeURIComponent(lng)}`
  const animalUrl = `${getBaseUrl(req)}/`
  const subject = `📍 Standortmeldung für ${animalName || 'dein Tier'}`

  const lines = [
    `Hallo ${ownerName || ''},`.trim(),
    '',
    `Es wurde ein Standort für ${animalName || 'dein Tier'} gemeldet.`,
    '',
    `Karte: ${mapUrl}`,
    accuracyM ? `Genauigkeit: ca. ${Math.round(accuracyM)} m` : null,
    note ? `Nachricht: ${note}` : null,
    reporterName ? `Gemeldet von: ${reporterName}` : null,
    reporterContact ? `Kontakt: ${reporterContact}` : null,
    '',
    `In der App: ${animalUrl}`
  ].filter((l) => l !== null)

  const html = `
    <p>Hallo ${escapeHtml(ownerName || '')},</p>
    <p>Es wurde ein Standort für <strong>${escapeHtml(animalName || 'dein Tier')}</strong> gemeldet.</p>
    <p><a href="${mapUrl}">📍 Standort auf Karte öffnen</a></p>
    ${accuracyM ? `<p>Genauigkeit: ca. ${Math.round(accuracyM)} m</p>` : ''}
    ${note ? `<p>Nachricht: ${escapeHtml(note)}</p>` : ''}
    ${reporterName ? `<p>Gemeldet von: ${escapeHtml(reporterName)}</p>` : ''}
    ${reporterContact ? `<p>Kontakt: ${escapeHtml(reporterContact)}</p>` : ''}
    <p><a href="${animalUrl}">In der App öffnen</a></p>`

  try {
    if (!isMailConfigured(config)) {
      fastify?.log?.warn({ to }, 'Location report mail skipped — mail not configured')
      return { delivered: false, skipped: true }
    }
    const nodemailer = await loadMailer()
    const transport = nodemailer.createTransport(buildTransportOptions(config))
    const info = await transport.sendMail({
      from: buildFrom(config),
      to,
      replyTo: config.replyTo || undefined,
      subject,
      text: lines.join('\n'),
      html
    })
    return { delivered: true, messageId: info.messageId }
  } catch (error) {
    fastify?.log?.error({ err: error, to }, 'Failed to deliver location report email')
    return { delivered: false, error: error.message }
  }
}

export async function sendAuthEmail({ type, to, name, token, fastify, req }) {
  const db = getDb()
  const config = await getMailTransportConfig(db)
  
  const actionUrl = type === 'verify-email' ? buildVerificationUrl(token, req) : buildResetUrl(token, req)
  const subject = type === 'verify-email'
    ? 'Bitte bestaetigen Sie Ihre E-Mail-Adresse'
    : 'Passwort zuruecksetzen'
  const intro = type === 'verify-email'
    ? `Hallo ${name || ''}, bestaetigen Sie bitte Ihre Registrierung.`.trim()
    : `Hallo ${name || ''}, ueber diesen Link koennen Sie Ihr Passwort zuruecksetzen.`.trim()

  const payload = {
    from: buildFrom(config),
    to,
    replyTo: config.replyTo || undefined,
    subject,
    text: `${intro}\n\n${actionUrl}\n\nFalls Sie diese Aktion nicht angefordert haben, ignorieren Sie diese E-Mail.`,
    html: `<p>${intro}</p><p><a href="${actionUrl}">${actionUrl}</a></p><p>Falls Sie diese Aktion nicht angefordert haben, ignorieren Sie diese E-Mail.</p>`,
    type
  }

  const smtpConfig = { host: config.host, port: config.port }
  try {
    if (!isMailConfigured(config)) {
      fastify.log.warn({ to, type, actionUrl }, 'Mail delivery skipped because mail configuration is incomplete or disabled')
      return { delivered: false, skipped: true, actionUrl, config: smtpConfig }
    }

    const nodemailer = await loadMailer()
    const transport = nodemailer.createTransport(buildTransportOptions(config))
    const info = await transport.sendMail(payload)
    return { delivered: true, actionUrl, messageId: info.messageId, smtpResponse: info.response, config: smtpConfig }
  } catch (error) {
    fastify.log.error({ err: error, to, type, actionUrl }, 'Failed to deliver auth email')
    return { delivered: false, actionUrl, error: error.message, smtpCode: error.responseCode, config: smtpConfig }
  }
}