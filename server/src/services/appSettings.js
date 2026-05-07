import { getDb } from '../db/index.js'
import { decrypt, encrypt } from '../utils/crypto.js'

export const PUBLIC_SETTINGS_KEYS = new Set([
  'app_name',
  'theme_color',
  'logo_data',
  'last_test_run',
  'mail_enabled',
  'billing_price_per_page'
])

export const AI_SETTINGS_KEYS = [
  'system_gemini_token',
  'system_gemini_model',
  'system_anthropic_token',
  'system_anthropic_model',
  'system_openai_token',
  'system_openai_model',
]

export const MAIL_SETTINGS_KEYS = [
  'mail_enabled',
  'mail_from_address',
  'mail_from_name',
  'mail_reply_to',
  'smtp_host',
  'smtp_port',
  'smtp_security_mode',
  'smtp_auth_mode',
  'smtp_username',
  'smtp_password',
  'oauth2_provider',
  'oauth2_client_id',
  'oauth2_client_secret',
  'oauth2_refresh_token',
  'oauth2_access_token',
  'oauth2_tenant'
]

export const SECRET_SETTINGS_KEYS = new Set([
  'smtp_password',
  'oauth2_client_secret',
  'oauth2_refresh_token',
  'oauth2_access_token',
  'system_gemini_token',
  'system_anthropic_token',
  'system_openai_token',
])

const BOOLEAN_SETTING_KEYS = new Set(['mail_enabled'])
const NUMERIC_SETTING_KEYS = new Set(['smtp_port', 'billing_price_per_page'])

function normalizeBoolean(value) {
  return value === true || value === 'true' || value === 1 || value === '1'
}

function parseStoredValue(key, value) {
  if (value == null) return null
  if (BOOLEAN_SETTING_KEYS.has(key)) return normalizeBoolean(value)
  if (NUMERIC_SETTING_KEYS.has(key)) return Number(value)
  return value
}

export function serializeSettingValue(key, value) {
  if (value == null || value === '') return null
  if (BOOLEAN_SETTING_KEYS.has(key)) return normalizeBoolean(value) ? '1' : '0'
  if (NUMERIC_SETTING_KEYS.has(key)) return String(Number(value))
  return String(value)
}

export function sanitizeSettingsForAudit(updates) {
  const masked = {}
  for (const [key, value] of Object.entries(updates)) {
    if (SECRET_SETTINGS_KEYS.has(key)) {
      masked[key] = value ? '***' : null
    } else {
      masked[key] = value
    }
  }
  return masked
}

export function validateMailSettingsInput(input) {
  const errors = []
  const authMode = input.smtp_auth_mode || 'password'
  const enabled = normalizeBoolean(input.mail_enabled)

  if (!enabled) return errors

  if (!input.mail_from_address || !String(input.mail_from_address).includes('@')) {
    errors.push('Absenderadresse fehlt oder ist ungültig')
  }
  if (!input.smtp_host) {
    errors.push('SMTP-Server fehlt')
  }
  if (!input.smtp_port || Number.isNaN(Number(input.smtp_port)) || Number(input.smtp_port) < 1 || Number(input.smtp_port) > 65535) {
    errors.push('SMTP-Port ist ungültig')
  }
  if (!['starttls', 'ssl', 'none'].includes(input.smtp_security_mode || 'starttls')) {
    errors.push('SMTP-Sicherheitsmodus ist ungültig')
  }
  if (!['password', 'oauth2'].includes(authMode)) {
    errors.push('SMTP-Authentifizierungsmodus ist ungültig')
  }
  if (!input.smtp_username) {
    errors.push('SMTP-Benutzername fehlt')
  }

  if (authMode === 'password' && !input.smtp_password && !input.has_smtp_password) {
    errors.push('SMTP-Passwort fehlt')
  }

  if (authMode === 'oauth2') {
    if (!input.oauth2_client_id) errors.push('OAuth2 Client-ID fehlt')
    if (!input.oauth2_client_secret && !input.has_oauth2_client_secret) errors.push('OAuth2 Client-Secret fehlt')
    if (!input.oauth2_refresh_token && !input.has_oauth2_refresh_token) errors.push('OAuth2 Refresh-Token fehlt')
  }

  return errors
}

export async function getSettingsMap(db = getDb()) {
  const { rows } = await db.query('SELECT key, value FROM settings')
  const settings = {}
  for (const row of rows) {
    settings[row.key] = parseStoredValue(row.key, row.value)
  }
  return settings
}

export async function getPublicSettings(db = getDb()) {
  const raw = await getSettingsMap(db)
  const settings = {
    app_name: 'PAW',
    theme_color: '#0ea5e9',
    logo_data: '',
    mail_enabled: false
  }
  for (const [key, value] of Object.entries(raw)) {
    if (PUBLIC_SETTINGS_KEYS.has(key)) settings[key] = value
  }
  return settings
}

function applySecretStatus(settings) {
  settings.has_smtp_password = !!settings.smtp_password
  settings.has_oauth2_client_secret = !!settings.oauth2_client_secret
  settings.has_oauth2_refresh_token = !!settings.oauth2_refresh_token
  settings.has_oauth2_access_token = !!settings.oauth2_access_token
  delete settings.smtp_password
  delete settings.oauth2_client_secret
  delete settings.oauth2_refresh_token
  delete settings.oauth2_access_token

  settings.has_system_gemini_token = !!settings.system_gemini_token
  settings.has_system_anthropic_token = !!settings.system_anthropic_token
  settings.has_system_openai_token = !!settings.system_openai_token
  delete settings.system_gemini_token
  delete settings.system_anthropic_token
  delete settings.system_openai_token

  return settings
}

export async function getAdminSettings(db = getDb()) {
  const raw = await getSettingsMap(db)
  const result = {
    app_name: raw.app_name || 'PAW',
    theme_color: raw.theme_color || '#0ea5e9',
    logo_data: raw.logo_data || '',
    mail_enabled: normalizeBoolean(raw.mail_enabled),
    mail_from_address: raw.mail_from_address || '',
    mail_from_name: raw.mail_from_name || '',
    mail_reply_to: raw.mail_reply_to || '',
    smtp_host: raw.smtp_host || '',
    smtp_port: raw.smtp_port || 587,
    smtp_security_mode: raw.smtp_security_mode || 'starttls',
    smtp_auth_mode: raw.smtp_auth_mode || 'password',
    smtp_username: raw.smtp_username || '',
    oauth2_provider: raw.oauth2_provider || '',
    oauth2_client_id: raw.oauth2_client_id || '',
    oauth2_tenant: raw.oauth2_tenant || '',
    system_gemini_model: raw.system_gemini_model || '',
    system_anthropic_model: raw.system_anthropic_model || '',
    system_openai_model: raw.system_openai_model || '',
  }

  for (const secretKey of SECRET_SETTINGS_KEYS) {
    const storedValue = raw[secretKey]
    if (storedValue) {
      try {
        result[secretKey] = decrypt(storedValue)
      } catch {
        result[secretKey] = storedValue
      }
    }
  }

  return applySecretStatus(result)
}

export async function saveSettings(updates, dbClient, existingSettings = {}) {
  for (const [key, rawValue] of Object.entries(updates)) {
    const serialized = serializeSettingValue(key, rawValue)
    if (serialized == null) {
      if (SECRET_SETTINGS_KEYS.has(key)) {
        const secretFlagMap = {
          smtp_password: 'has_smtp_password',
          oauth2_client_secret: 'has_oauth2_client_secret',
          oauth2_refresh_token: 'has_oauth2_refresh_token',
          oauth2_access_token: 'has_oauth2_access_token'
        }
        const statusKey = secretFlagMap[key]
        if (statusKey && existingSettings[statusKey]) {
          continue
        }
      }
      await dbClient.query('DELETE FROM settings WHERE key = $1', [key])
      continue
    }

    const valueToStore = SECRET_SETTINGS_KEYS.has(key) ? encrypt(serialized) : serialized
    await dbClient.query(
      'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      [key, valueToStore]
    )
  }
}

export async function getMailTransportConfig(db = getDb()) {
  const settings = await getSettingsMap(db)
  const config = {
    enabled: normalizeBoolean(settings.mail_enabled),
    fromAddress: settings.mail_from_address || '',
    fromName: settings.mail_from_name || '',
    replyTo: settings.mail_reply_to || '',
    host: settings.smtp_host || '',
    port: settings.smtp_port ? Number(settings.smtp_port) : 587,
    securityMode: settings.smtp_security_mode || 'starttls',
    authMode: settings.smtp_auth_mode || 'password',
    username: settings.smtp_username || '',
    oauth2Provider: settings.oauth2_provider || '',
    oauth2ClientId: settings.oauth2_client_id || '',
    oauth2Tenant: settings.oauth2_tenant || ''
  }

  for (const secretKey of SECRET_SETTINGS_KEYS) {
    const storedValue = settings[secretKey]
    if (storedValue) {
      try {
        config[secretKey] = decrypt(storedValue)
      } catch {
        config[secretKey] = storedValue
      }
    }
  }

  return config
}

export async function getSystemAiKeys(db = getDb()) {
  const settings = await getSettingsMap(db)
  const decryptSetting = (val) => { try { return val ? decrypt(val) : null } catch { return null } }
  return {
    geminiKey: decryptSetting(settings.system_gemini_token) || process.env.GEMINI_API_KEY || null,
    anthropicKey: decryptSetting(settings.system_anthropic_token) || process.env.ANTHROPIC_API_KEY || null,
    openaiKey: decryptSetting(settings.system_openai_token) || process.env.OPENAI_API_KEY || null,
    geminiModel: settings.system_gemini_model || null,
    anthropicModel: settings.system_anthropic_model || null,
    openaiModel: settings.system_openai_model || null,
  }
}

export function isMailConfigured(config) {
  if (!config?.enabled) return false
  if (!config.fromAddress || !config.host || !config.port || !config.username) return false
  if (config.authMode === 'oauth2') {
    return !!(config.oauth2ClientId && config.oauth2_client_secret && config.oauth2_refresh_token)
  }
  return !!config.smtp_password
}