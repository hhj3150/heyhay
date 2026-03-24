/**
 * @fileoverview 인증 상태 관리 (Zustand)
 * 하드 리프레시 시에도 토큰 유효성 체크 → 만료 시 refresh 시도
 */
import { create } from 'zustand'
import { apiPost, setTokens, clearTokens, getAccessToken, refreshAccessToken } from '@/lib/api'

/**
 * localStorage에서 안전하게 사용자 정보 읽기
 * @returns {object|null}
 */
const readStoredUser = () => {
  try {
    const raw = localStorage.getItem('user')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

const useAuthStore = create((set) => ({
  user: readStoredUser(),
  isAuthenticated: !!localStorage.getItem('accessToken'),
  isLoading: false,
  error: null,

  /**
   * 앱 시작 시 토큰 유효성 검증
   * 토큰 존재 → 만료 체크 → 만료되었으면 refresh → 실패 시에만 로그아웃
   * @returns {Promise<void>}
   */
  initAuth: async () => {
    const token = getAccessToken()
    if (!token) {
      set({ user: null, isAuthenticated: false })
      return
    }

    // JWT payload에서 만료 시간 확인
    try {
      const payload = JSON.parse(atob(token.split('.')[1]))
      const isExpired = payload.exp * 1000 < Date.now()

      if (!isExpired) {
        // 토큰 유효 — 인증 상태 유지
        set({ isAuthenticated: true, user: readStoredUser() })
        return
      }
    } catch {
      // 토큰 파싱 실패 — refresh 시도
    }

    // 토큰 만료 또는 파싱 실패 — refresh 시도
    const newToken = await refreshAccessToken()
    if (newToken) {
      set({ isAuthenticated: true, user: readStoredUser() })
    } else {
      clearTokens()
      set({ user: null, isAuthenticated: false })
    }
  },

  /**
   * 로그인
   * @param {string} username
   * @param {string} password
   * @returns {Promise<boolean>}
   */
  login: async (username, password) => {
    set({ isLoading: true, error: null })

    const result = await apiPost('/auth/login', { username, password })

    if (result.success) {
      const { user, accessToken, refreshToken } = result.data
      setTokens(accessToken, refreshToken)
      localStorage.setItem('user', JSON.stringify(user))
      set({ user, isAuthenticated: true, isLoading: false })
      return true
    }

    set({ isLoading: false, error: result.error.message })
    return false
  },

  /**
   * 로그아웃
   */
  logout: async () => {
    await apiPost('/auth/logout', {}).catch(() => {})
    clearTokens()
    set({ user: null, isAuthenticated: false, error: null })
  },

  /**
   * 에러 초기화
   */
  clearError: () => set({ error: null }),
}))

export default useAuthStore
