import axios from 'axios'

function getServerUrl(): string {
  const stored = localStorage.getItem('paw_server_url')
  if (stored) return stored
  return window.location.origin
}

function getApiBaseUrl(): string {
  return `${getServerUrl()}/api`
}

export const api = axios.create({
  baseURL: getApiBaseUrl()
})

// Update baseURL dynamically before each request
api.interceptors.request.use((config) => {
  config.baseURL = getApiBaseUrl()
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    if (err.response?.status === 429) {
      const retryAfter = err.response.headers?.['retry-after']
      err.isRateLimited = true
      err.retryAfterSeconds = retryAfter ? parseInt(retryAfter, 10) : null
    }
    return Promise.reject(err)
  }
)

export function getRateLimitMessage(err: any, fallback = 'Zu viele Anfragen. Bitte warte einen Moment.') {
  if (!err?.isRateLimited) return null
  if (err.retryAfterSeconds) return `Zu viele Anfragen — bitte warte ${err.retryAfterSeconds} Sekunden.`
  return fallback
}

// Auth
export const register = (name: string, email: string, password: string, confirmPassword: string) =>
  api.post('/auth/register', { name, email, password, confirmPassword })

export const login = (email: string, password: string) =>
  api.post('/auth/login', { email, password })

export const verifyEmail = (token: string) =>
  api.post('/auth/verify-email', { token })

export const requestPasswordReset = (email: string) =>
  api.post('/auth/forgot-password', { email })

export const resetPassword = (token: string, password: string, confirmPassword: string) =>
  api.post('/auth/reset-password', { token, password, confirmPassword })

export const logout = () =>
  api.post('/auth/logout', {})

export const refreshToken = () =>
  api.post('/auth/refresh')

// Animals
export const getAnimals = () => api.get('/animals')
export const getAnimal = (id: string) => api.get(`/animals/${id}`)
export const createAnimal = (data: object) => api.post('/animals', data)
export const updateAnimal = (id: string, data: object) => api.patch(`/animals/${id}`, data)
export const uploadAnimalAvatar = (id: string, base64Image: string) => api.patch(`/animals/${id}/avatar`, { base64Image })
export const deleteAnimal = (id: string, confirmationText: string) =>
  api.delete(`/animals/${id}`, { data: { confirmationText } })
export const getAnimalByTag = (tagId: string) => api.get(`/animals/by-tag/${tagId}`)
export const getAnimalDocuments = (id: string) => api.get(`/animals/${id}/documents`)
export const getAnimalTags = (id: string) => api.get(`/animals/${id}/tags`)
export const addTag = (id: string, tagId: string, tagType: 'barcode' | 'nfc' | 'chip') =>
  api.post(`/animals/${id}/tags`, { tagId, tagType })

// Tags
export const deactivateTag = (tagId: string) =>
  api.patch(`/animal-tags/${tagId}`, { active: false })
export const activateTag = (tagId: string) =>
  api.patch(`/animal-tags/${tagId}`, { active: true })
export const deleteTag = (tagId: string) =>
  api.delete(`/animal-tags/${tagId}`)

// Documents
export const getDocument = (id: string) => api.get(`/documents/${id}`)
export const patchDocument = (id: string, data: object) => api.patch(`/documents/${id}`, data)
export const deleteDocument = (id: string) => api.delete(`/documents/${id}`)

// Unified document analysis endpoint (handles both retry-analysis and re-analyze)
export const analyzeDocument = (
  id: string,
  action: 'retry' | 'reanalyze',
  data: { provider?: string; model?: string; requestedDocumentType?: string; language?: string } = {}
) => {
  const endpoint = action === 'retry' ? 'retry-analysis' : 're-analyze'
  return api.post(`/documents/${id}/${endpoint}`, data)
}

// Legacy function - now delegates to analyzeDocument()
export const reanalyzeDocument = (id: string, data: { provider?: string; model?: string; requestedDocumentType?: string; language?: string } = {}) =>
  analyzeDocument(id, 'reanalyze', data)

export const getDocumentHistory = (id: string) => api.get(`/documents/${id}/history`)

export const patchDocumentRecord = (docId: string, key: string, allowed_roles: string[]) =>
  api.patch(`/documents/${docId}/records`, { key, allowed_roles })

// Manual entry
export const addVaccination = (animalId: string, data: {
  vaccine_name: string; date: string; batch_number?: string; valid_until?: string;
  target_disease?: string; vet_name?: string; notes?: string; allowed_roles?: string[]
}) => api.post(`/animals/${animalId}/vaccinations`, data)

export const addTreatment = (animalId: string, data: {
  substance: string; date: string; dosage?: string; vet_name?: string;
  notes?: string; next_due?: string; active_ingredient?: string; allowed_roles?: string[]
}) => api.post(`/animals/${animalId}/treatments`, data)

// Sharing
export const getSharing = (animalId: string) => api.get(`/animals/${animalId}/sharing`)
export const updateSharing = (animalId: string, role: string, data: object) =>
  api.put(`/animals/${animalId}/sharing`, { role, ...data })
export const createTemporaryShare = (animalId: string, name?: string, role?: string) =>
  api.post(`/animals/${animalId}/sharing/temporary`, { ...(name ? { name } : {}), ...(role ? { role } : {}) })
export const getAnimalShares = (animalId: string) =>
  api.get(`/animals/${animalId}/shares`)
export const revokeAnimalShare = (animalId: string, shareId: string) =>
  api.delete(`/animals/${animalId}/shares/${shareId}`)

// Vet verification
export const requestVerification = (type?: 'vet' | 'authority', notes?: string, document?: File) => {
  // If no type provided, use simple POST for backward compatibility
  if (!type) {
    return api.post('/accounts/request-verification')
  }
  
  const formData = new FormData()
  formData.append('type', type)
  if (notes) formData.append('notes', notes)
  if (document) formData.append('document', document)
  return api.post('/accounts/request-verification', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
}

export const getMyVerifications = () => api.get('/accounts/verifications')

// Animal scans
export const trackAnimalScan = (animalId: string) => api.post(`/animals/${animalId}/track-scan`)
export const getRecentScans = (animalId: string) => api.get(`/animals/${animalId}/recent-scans`)
export const getRecentlyScannedAnimals = () => api.get('/animals/recently-scanned')
export const unarchiveAnimal = (animalId: string) => api.post(`/animals/${animalId}/unarchive`)

// Account / Profil
export const getMe = () => api.get('/accounts/me')
export const patchMe = (data: object) => api.patch('/accounts/me', data)
export const deleteMe = () => api.delete('/accounts/me')

// Admin
export const adminGetAccounts = () => api.get('/admin/accounts')
export const adminGetAnimals = () => api.get('/admin/animals')
export const adminGetPendingVerifications = () => api.get('/admin/accounts/pending-verification')
export const adminVerifyAccount = (id: string, approved: boolean, note?: string) =>
  api.post(`/admin/accounts/${id}/verify`, { approved, note })
export const adminGetVerifications = () => api.get('/admin/verifications')
export const adminApproveVerification = (id: string) => api.post(`/admin/verifications/${id}/approve`)
export const adminRejectVerification = (id: string, reason: string) => 
  api.post(`/admin/verifications/${id}/reject`, { reason })
export const adminPatchAccount = (id: string, data: object) => api.patch(`/admin/accounts/${id}`, data)
export const adminGetAuditLog = (params?: object) => api.get('/admin/audit', { params })
export const adminGetStats = () => api.get('/admin/stats')
export const adminGetSettings = () => api.get('/admin/settings')
export const adminPatchSettings = (data: object) => api.patch('/admin/settings', data)
export const adminTestMailSettings = (data?: object) => api.post('/admin/settings/test-mail', data || {})
export const adminGetTestResults = () => api.get('/admin/test-results')
export const adminGetTestRuns = (limit?: number, page?: number) => api.get('/admin/test-runs', { params: { limit, page } })
export const adminGetTestRunDetail = (id: string) => api.get(`/admin/test-runs/${id}`)
export const adminGetVersion = () => api.get('/admin/version')
export const adminGetOrphans = () => api.get('/admin/orphans')
export const adminDeleteOrphans = (categories: string[]) => api.post('/admin/orphans/delete', { categories })
export const adminDeleteAccount = (id: string) => api.delete(`/admin/accounts/${id}`)
export const adminDeleteAnimal = (id: string) => api.delete(`/admin/animals/${id}`)
export const adminDeleteDocument = (id: string) => api.delete(`/admin/documents/${id}`)
export const adminDeleteTag = (tagId: string) => api.delete(`/admin/tags/${tagId}`)

// Reminders
export const getReminders = () => api.get('/reminders')
export const createReminder = (data: { animal_id: string; document_id?: string; title: string; due_date: string; notes?: string }) =>
  api.post('/reminders', data)
export const dismissReminder = (id: string) => api.patch(`/reminders/${id}/dismiss`)

// User API Keys
export const getUserApiKeys = () => api.get('/accounts/api-keys')
export const createUserApiKey = (description: string) => api.post('/accounts/api-keys', { description })
export const deleteUserApiKey = (id: string) => api.delete(`/accounts/api-keys/${id}`)

// OAuth Login
export const getOAuthUrl = (provider: 'google' | 'github' | 'microsoft') =>
  `${getServerUrl()}/api/auth/oauth/${provider}`

// Supabase Auth Handshake
export const supabaseLogin = (token: string) =>
  api.post('/auth/supabase', { token })

// Billing
export const getBillingMe = () => api.get('/billing/me')
export const postBillingConsent = () => api.post('/billing/consent')
export const adminGetBilling = () => api.get('/admin/billing')
export const patchBillingSettings = (body: { systemFallbackEnabled?: boolean; budgetEur?: number | null }) =>
  api.patch('/billing/settings', body)
