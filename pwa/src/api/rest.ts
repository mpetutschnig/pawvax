import axios from 'axios'

export const api = axios.create({
  baseURL: '/api'
})

api.interceptors.request.use((config) => {
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
    return Promise.reject(err)
  }
)

// Auth
export const register = (name: string, email: string, password: string) =>
  api.post('/auth/register', { name, email, password })

export const login = (email: string, password: string) =>
  api.post('/auth/login', { email, password })

export const logout = () =>
  api.post('/auth/logout', {})

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
export const addTag = (id: string, tagId: string, tagType: 'barcode' | 'nfc') =>
  api.post(`/animals/${id}/tags`, { tagId, tagType })

// Tags
export const deactivateTag = (tagId: string) =>
  api.patch(`/animal-tags/${tagId}`, { active: false })
export const activateTag = (tagId: string) =>
  api.patch(`/animal-tags/${tagId}`, { active: true })

// Documents
export const getDocument = (id: string) => api.get(`/documents/${id}`)
export const patchDocument = (id: string, data: object) => api.patch(`/documents/${id}`, data)
export const deleteDocument = (id: string) => api.delete(`/documents/${id}`)

// Sharing
export const getSharing = (animalId: string) => api.get(`/animals/${animalId}/sharing`)
export const updateSharing = (animalId: string, role: string, data: object) =>
  api.put(`/animals/${animalId}/sharing`, { role, ...data })
export const createTemporaryShare = (animalId: string, name?: string) =>
  api.post(`/animals/${animalId}/sharing/temporary`, name ? { name } : {})
export const getAnimalShares = (animalId: string) =>
  api.get(`/animals/${animalId}/shares`)
export const revokeAnimalShare = (animalId: string, shareId: string) =>
  api.delete(`/animals/${animalId}/shares/${shareId}`)

// Vet verification
export const requestVerification = () => api.post('/accounts/request-verification')

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
export const adminPatchAccount = (id: string, data: object) => api.patch(`/admin/accounts/${id}`, data)
export const adminGetAuditLog = (params?: object) => api.get('/admin/audit', { params })
export const adminGetStats = () => api.get('/admin/stats')
export const adminGetTestResults = () => api.get('/admin/test-results')
export const adminDeleteAccount = (id: string) => api.delete(`/admin/accounts/${id}`)
export const adminDeleteAnimal = (id: string) => api.delete(`/admin/animals/${id}`)
export const adminDeleteDocument = (id: string) => api.delete(`/admin/documents/${id}`)
export const adminDeleteTag = (tagId: string) => api.delete(`/admin/tags/${tagId}`)
