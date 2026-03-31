/**
 * @fileoverview 오프라인 상태 감지 배너
 * navigator.onLine은 부정확한 경우가 많으므로 실제 API 헬스체크로 판단한다.
 * - 초기 마운트 시 1회 확인 (3초 딜레이로 false positive 방지)
 * - 이후 30초마다 재확인
 * - navigator offline 이벤트 발생 시 즉시 확인
 */
import { useState, useEffect, useRef } from 'react'
import { WifiOff } from 'lucide-react'

/** 실제 API 서버에 핑을 보내 연결 여부를 확인한다 */
const checkApiReachable = async () => {
  try {
    const res = await fetch('/api/v1/health', {
      method: 'GET',
      cache: 'no-store',
      signal: AbortSignal.timeout(5000), // 5초 타임아웃
    })
    return res.ok
  } catch {
    return false
  }
}

/**
 * 오프라인일 때 화면 상단에 경고 배너를 표시하는 컴포넌트
 * @returns {JSX.Element|null} 오프라인 배너 또는 null
 */
export default function OfflineIndicator() {
  const [isOffline, setIsOffline] = useState(false)
  const timerRef = useRef(null)

  const runCheck = async () => {
    const reachable = await checkApiReachable()
    setIsOffline(!reachable)
  }

  useEffect(() => {
    // 초기 마운트 후 3초 뒤 첫 확인 (페이지 로드 직후 false positive 방지)
    const initTimer = setTimeout(runCheck, 3000)

    // 30초마다 재확인
    timerRef.current = setInterval(runCheck, 30000)

    // 브라우저 오프라인 이벤트 시 즉시 확인
    const handleOffline = () => runCheck()
    const handleOnline = () => runCheck()
    window.addEventListener('offline', handleOffline)
    window.addEventListener('online', handleOnline)

    return () => {
      clearTimeout(initTimer)
      clearInterval(timerRef.current)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('online', handleOnline)
    }
  }, [])

  if (!isOffline) {
    return null
  }

  return (
    <div
      role="alert"
      className="flex items-center justify-center gap-2 bg-red-500 text-white text-sm font-medium py-2 px-4 rounded-lg mb-3"
    >
      <WifiOff className="w-4 h-4 shrink-0" aria-hidden="true" />
      <span>서버 연결을 확인하세요</span>
    </div>
  )
}
