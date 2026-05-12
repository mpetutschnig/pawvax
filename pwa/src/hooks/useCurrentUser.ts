export interface CurrentUser {
  token: string | null
  roleStr: string
  roles: string[]
  isGuest: boolean
  isAuthenticated: boolean
}

export function useCurrentUser(): CurrentUser {
  const token = localStorage.getItem('token')
  const roleStr = token ? (localStorage.getItem('role') || 'user') : ''
  const roles = roleStr.split(',').map(r => r.trim()).filter(Boolean)
  const isGuest = roles.length > 0 && roles.every(r => r === 'guest')
  return { token, roleStr, roles, isGuest, isAuthenticated: !!token }
}
