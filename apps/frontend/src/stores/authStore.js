/**
 * @fileoverview 인증 상태 관리 (Zustand)
 */
import { create } from 'zustand'
import { apiPost, setTokens, clearTokens } from '@/lib/api'

const useAuthStore = create((set) => ({
  user: JSON.parse(localStorage.getItem('user') || 'null'),
  isAuthenticated: !!localStorage.getItem('accessToken'),
  isLoading: false,
  error: null,

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
