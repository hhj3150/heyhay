/**
 * @fileoverview 오프라인 상태 감지 배너
 * navigator.onLine 기반으로 네트워크 연결 상태를 표시한다.
 */
import { useState, useEffect, useCallback } from 'react'
import { WifiOff } from 'lucide-react'

/**
 * 오프라인일 때 화면 상단에 경고 배너를 표시하는 컴포넌트
 * @returns {JSX.Element|null} 오프라인 배너 또는 null
 */
export default function OfflineIndicator() {
  const [isOffline, setIsOffline] = useState(() => !navigator.onLine)

  const handleOnline = useCallback(() => setIsOffline(false), [])
  const handleOffline = useCallback(() => setIsOffline(true), [])

  useEffect(() => {
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [handleOnline, handleOffline])

  if (!isOffline) {
    return null
  }

  return (
    <div
      role="alert"
      className="flex items-center justify-center gap-2 bg-red-500 text-white text-sm font-medium py-2 px-4 rounded-lg mb-3"
    >
      <WifiOff className="w-4 h-4 shrink-0" aria-hidden="true" />
      <span>인터넷 연결을 확인하세요</span>
    </div>
  )
}
