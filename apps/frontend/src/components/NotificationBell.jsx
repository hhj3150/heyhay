/**
 * @fileoverview 실시간 알림 벨 아이콘
 * SSE로 서버에서 알림 수신 → 뱃지 카운트 + toast + 브라우저 알림
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { apiGet, apiPut, getAccessToken } from '@/lib/api'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { Bell, X, AlertTriangle, Info, CheckCircle } from 'lucide-react'

const PRIORITY_STYLES = {
  P1: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-800', badge: 'bg-red-500', icon: AlertTriangle },
  P2: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-800', badge: 'bg-amber-500', icon: Info },
  P3: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-800', badge: 'bg-blue-500', icon: Info },
}

export default function NotificationBell() {
  const [alerts, setAlerts] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef(null)
  const sseRef = useRef(null)

  // 알림 목록 조회
  const fetchAlerts = useCallback(async () => {
    try {
      const res = await apiGet('/dashboard/alerts?resolved=false')
      const data = Array.isArray(res.data) ? res.data : []
      setAlerts(data.slice(0, 10))
      setUnreadCount(data.filter((a) => !a.is_read).length)
    } catch {
      // 조용히 실패
    }
  }, [])

  // SSE 연결
  useEffect(() => {
    const token = getAccessToken()
    if (!token) return

    // EventSource는 헤더 설정 불가 → 쿼리스트링으로 토큰 전달
    // Netlify는 SSE 스트리밍 미지원 → 프로덕션에서 Railway URL로 직접 연결
    const baseUrl = import.meta.env.DEV
      ? 'http://localhost:3001'
      : (import.meta.env.VITE_API_URL || '')
    const eventSource = new EventSource(`${baseUrl}/api/v1/dashboard/sse?token=${encodeURIComponent(token)}`)
    sseRef.current = eventSource

    // 이벤트 핸들러를 변수로 분리하여 cleanup 시 제거 가능
    const handleAlert = (event) => {
      try {
        const alert = JSON.parse(event.data)

        // toast 알림
        const toastFn = alert.priority === 'P1' ? toast.error : toast.warning
        toastFn(`[${alert.priority}] ${alert.title}`, {
          description: alert.message,
          duration: alert.priority === 'P1' ? 15000 : 5000,
        })

        // 브라우저 Notification (P1만)
        if (alert.priority === 'P1' && Notification.permission === 'granted') {
          new Notification(`CCP 이탈 경고`, { body: alert.message, icon: '/vite.svg' })
        }

        // 목록 새로고침
        fetchAlerts()
      } catch {
        // 파싱 실패 무시
      }
    }

    const handleConnected = () => {
      fetchAlerts()
    }

    eventSource.addEventListener('alert', handleAlert)
    eventSource.addEventListener('connected', handleConnected)

    eventSource.onerror = () => {
      // 자동 재연결 (EventSource 기본 동작)
    }

    return () => {
      eventSource.removeEventListener('alert', handleAlert)
      eventSource.removeEventListener('connected', handleConnected)
      eventSource.close()
      sseRef.current = null
    }
  }, [fetchAlerts])

  // 브라우저 알림 권한 요청 (최초 1회)
  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  // 드롭다운 외부 클릭 닫기
  useEffect(() => {
    const handleClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // 알림 읽음 처리
  const markRead = async (alertId) => {
    try {
      await apiPut(`/dashboard/alerts/${alertId}`, { is_read: true })
      fetchAlerts()
    } catch {
      toast.error('알림 읽음 처리 실패')
    }
  }

  // 알림 해결 처리
  const markResolved = async (alertId) => {
    try {
      await apiPut(`/dashboard/alerts/${alertId}`, { is_read: true, is_resolved: true })
      fetchAlerts()
      toast.success('알림 해결됨')
    } catch {
      toast.error('알림 해결 처리 실패')
    }
  }

  // 시간 포맷
  const timeAgo = (dateStr) => {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return '방금'
    if (mins < 60) return `${mins}분 전`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}시간 전`
    return `${Math.floor(hrs / 24)}일 전`
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* 벨 아이콘 */}
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="relative p-2 rounded-lg hover:bg-slate-100 transition-colors"
        aria-label="알림"
      >
        <Bell className="w-5 h-5 text-slate-600" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* 드롭다운 */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 max-h-96 overflow-y-auto bg-white rounded-xl shadow-lg border border-slate-200 z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <h3 className="font-bold text-sm">알림</h3>
            <button onClick={() => setOpen(false)} className="p-1 hover:bg-slate-100 rounded">
              <X className="w-4 h-4" />
            </button>
          </div>

          {alerts.length === 0 ? (
            <div className="p-6 text-center text-slate-400 text-sm">
              미확인 알림이 없습니다
            </div>
          ) : (
            <div className="divide-y">
              {alerts.map((alert) => {
                const style = PRIORITY_STYLES[alert.priority] || PRIORITY_STYLES.P3
                const Icon = style.icon
                return (
                  <div
                    key={alert.id}
                    className={cn('p-3 hover:bg-slate-50 transition-colors', !alert.is_read && style.bg)}
                  >
                    <div className="flex items-start gap-2">
                      <span className={cn('mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold text-white', style.badge)}>
                        {alert.priority}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className={cn('text-sm font-medium', style.text)}>{alert.title}</p>
                        <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{alert.message}</p>
                        <p className="text-[10px] text-slate-400 mt-1">{timeAgo(alert.created_at)}</p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        {!alert.is_read && (
                          <button
                            onClick={() => markRead(alert.id)}
                            className="p-1 hover:bg-slate-200 rounded text-slate-400"
                            title="읽음"
                          >
                            <CheckCircle className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => markResolved(alert.id)}
                          className="p-1 hover:bg-green-100 rounded text-green-600"
                          title="해결"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
