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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-50 to-slate-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-amber-500 text-white flex items-center justify-center font-black text-2xl">
            H
          </div>
          <div>
            <CardTitle className="text-2xl">HEY HAY MILK</CardTitle>
            <CardDescription className="mt-1">통합 ERP 시스템</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">아이디</label>
              <Input
                type="text"
                placeholder="아이디를 입력하세요"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
                required
                disabled={isLocked}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">비밀번호</label>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="비밀번호를 입력하세요"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={isLocked}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  tabIndex={-1}
                  aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 표시'}
                >
                  {showPassword
                    ? <EyeOff className="w-4 h-4" />
                    : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-md">{error}</p>
            )}

            {isLocked && (
              <p className="text-sm text-amber-600 bg-amber-50 px-3 py-2 rounded-md">
                로그인 시도가 {MAX_FAIL_COUNT}회 실패했습니다. {cooldown}초 후 다시 시도하세요.
              </p>
            )}

            <Button
              type="submit"
              className="w-full bg-amber-500 hover:bg-amber-600"
              disabled={isLoading || isLocked}
            >
              {isLocked
                ? `${cooldown}초 후 재시도`
                : isLoading
                  ? '로그인 중...'
                  : '로그인'}
            </Button>
          </form>

          <p className="mt-6 text-center text-xs text-slate-400">
            Farm-to-Consumer 경영 플랫폼
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
