/**
 * @fileoverview 로그인 페이지
 * 비밀번호 표시/숨기기 토글, 5회 연속 실패 시 30초 쿨다운
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { Navigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Eye, EyeOff } from 'lucide-react'
import useAuthStore from '@/stores/authStore'

/** 연속 실패 허용 횟수 */
const MAX_FAIL_COUNT = 5
/** 쿨다운 시간 (초) */
const COOLDOWN_SECONDS = 30

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [failCount, setFailCount] = useState(0)
  const [cooldown, setCooldown] = useState(0)
  const cooldownRef = useRef(null)
  const { login, isAuthenticated, isLoading, error, clearError } = useAuthStore()

  // 쿨다운 타이머
  useEffect(() => {
    if (cooldown <= 0) {
      if (cooldownRef.current) {
        clearInterval(cooldownRef.current)
        cooldownRef.current = null
      }
      return
    }
    cooldownRef.current = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(cooldownRef.current)
          cooldownRef.current = null
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => {
      if (cooldownRef.current) {
        clearInterval(cooldownRef.current)
        cooldownRef.current = null
      }
    }
  }, [cooldown])

  const startCooldown = useCallback(() => {
    setCooldown(COOLDOWN_SECONDS)
  }, [])

  if (isAuthenticated) {
    return <Navigate to="/" replace />
  }

  const isLocked = cooldown > 0

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (isLocked) return
    clearError()

    const result = await login(username, password)

    // login이 성공하면 isAuthenticated가 true로 변경되어 리다이렉트됨
    // 실패 시 error가 세팅되고, failCount를 증가시킴
    if (!result) {
      const nextCount = failCount + 1
      setFailCount(nextCount)
      if (nextCount >= MAX_FAIL_COUNT) {
        startCooldown()
        setFailCount(0)
      }
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      {/* 배경 장식 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-amber-500/5 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-blue-500/5 blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm">
        {/* 로고 영역 */}
        <div className="text-center mb-8">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center font-black text-2xl text-white shadow-2xl shadow-amber-500/30 mb-4">
            H
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">HEY HAY MILK</h1>
          <p className="text-slate-400 text-sm mt-1 tracking-widest uppercase">ERP System</p>
        </div>

        {/* 로그인 카드 */}
        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 shadow-2xl">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">아이디</label>
              <Input
                type="text"
                placeholder="아이디를 입력하세요"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
                required
                disabled={isLocked}
                className="bg-white/10 border-white/10 text-white placeholder:text-slate-500 focus:border-amber-400 focus:ring-amber-400/20"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">비밀번호</label>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="비밀번호를 입력하세요"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={isLocked}
                  className="bg-white/10 border-white/10 text-white placeholder:text-slate-500 focus:border-amber-400 focus:ring-amber-400/20 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                  tabIndex={-1}
                  aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 표시'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-lg">{error}</p>
            )}
            {isLocked && (
              <p className="text-sm text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-2 rounded-lg">
                {MAX_FAIL_COUNT}회 실패. {cooldown}초 후 재시도 가능
              </p>
            )}

            <Button
              type="submit"
              className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-white font-semibold shadow-lg shadow-amber-500/25 border-0 mt-2"
              disabled={isLoading || isLocked}
            >
              {isLocked ? `${cooldown}초 후 재시도` : isLoading ? '로그인 중...' : '로그인'}
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-slate-600">
          Farm-to-Consumer 경영 플랫폼 · D2O 농업회사법인
        </p>
      </div>
    </div>
  )
}
