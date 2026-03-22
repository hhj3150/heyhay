/**
 * @fileoverview API 클라이언트
 * JWT 자동 첨부 + 토큰 갱신 + 에러 처리
 */

const BASE_URL = '/api/v1'

/**
 * 로컬스토리지에서 토큰 관리
 */
const getAccessToken = () => localStorage.getItem('accessToken')
const getRefreshToken = () => localStorage.getItem('refreshToken')
const setTokens = (access, refresh) => {
  localStorage.setItem('accessToken', access)
  localStorage.setItem('refreshToken', refresh)
}
const clearTokens = () => {
  localStorage.removeItem('accessToken')
  localStorage.removeItem('refreshToken')
  localStorage.removeItem('user')
}

/**
 * 토큰 갱신 시도
 * @returns {Promise<string|null>} 새 access token 또는 null
 */
const refreshAccessToken = async () => {
  const refreshToken = getRefreshToken()
  if (!refreshToken) return null

  try {
    const res = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })

    if (!res.ok) {
      clearTokens()
      return null
    }

    const json = await res.json()
    if (json.success) {
      setTokens(json.data.accessToken, json.data.refreshToken)
      return json.data.accessToken
    }
    return null
  } catch {
    clearTokens()
    return null
  }
}

/**
 * API 요청 헬퍼
 * @param {string} endpoint - /auth/login 등
 * @param {RequestInit} options
 * @returns {Promise<{success: boolean, data?: any, error?: {code: string, message: string}}>}
 */
export const api = async (endpoint, options = {}) => {
  const url = `${BASE_URL}${endpoint}`
  const token = getAccessToken()

  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  let res = await fetch(url, { ...options, headers })

  // 401이면 토큰 갱신 시도
  if (res.status === 401 && token) {
    const newToken = await refreshAccessToken()
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`
      res = await fetch(url, { ...options, headers })
    } else {
      clearTokens()
      window.location.href = '/login'
      return { success: false, error: { code: 'AUTH_EXPIRED', message: '세션이 만료되었습니다' } }
    }
  }

  const json = await res.json()
  return json
}

/** GET */
export const apiGet = (endpoint) => api(endpoint)

/** POST */
export const apiPost = (endpoint, body) =>
  api(endpoint, { method: 'POST', body: JSON.stringify(body) })

/** PUT */
export const apiPut = (endpoint, body) =>
  api(endpoint, { method: 'PUT', body: JSON.stringify(body) })

/** DELETE */
export const apiDelete = (endpoint) =>
  api(endpoint, { method: 'DELETE' })

export { setTokens, clearTokens, getAccessToken }
