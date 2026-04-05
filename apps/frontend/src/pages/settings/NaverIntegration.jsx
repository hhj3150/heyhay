/**
 * @fileoverview 네이버 스마트스토어 연동 관리 페이지
 * 연동 상태 확인 + 신규 주문 수동 동기화
 */
import { useState, useEffect, useCallback } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { apiGet, apiPost } from '@/lib/api'
import {
  ShoppingBag, RefreshCw, CheckCircle2, XCircle,
  Download, AlertCircle, Info,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export default function NaverIntegration() {
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState(null)
  const [syncHours, setSyncHours] = useState(24)

  const fetchStatus = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiGet('/market/naver/status')
      if (res.success) setStatus(res.data)
    } catch (err) {
      // 조회 실패 시 연결 안 됨 상태
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchStatus() }, [fetchStatus])

  /** 수동 동기화 실행 */
  const handleSync = async () => {
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await apiPost('/market/naver/sync', { hours: syncHours })
      if (res.success) {
        setSyncResult(res.data)
        await fetchStatus()
      } else {
        setSyncResult({ error: res.error?.message || '동기화 실패' })
      }
    } catch (err) {
      setSyncResult({ error: err.message })
    } finally {
      setSyncing(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 w-56 bg-slate-200 rounded animate-pulse" />
        <div className="h-48 bg-slate-200 rounded-xl animate-pulse" />
      </div>
    )
  }

  const connected = status?.connected

  return (
    <div className="p-6 space-y-6">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center">
          <ShoppingBag className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">네이버 스마트스토어 연동</h1>
          <p className="text-sm text-slate-500">주문 자동 수집 및 발송 처리</p>
        </div>
      </div>

      {/* 연동 상태 카드 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            {connected ? (
              <>
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                <span>연결됨</span>
              </>
            ) : (
              <>
                <XCircle className="w-5 h-5 text-red-500" />
                <span>연결 안 됨</span>
              </>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-3 rounded-lg bg-slate-50">
              <p className="text-xs text-slate-500 mb-1">API 자격증명</p>
              <p className={cn('text-sm font-medium', status?.credentials_set ? 'text-emerald-600' : 'text-red-600')}>
                {status?.credentials_set ? '설정됨' : '미설정'}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-slate-50">
              <p className="text-xs text-slate-500 mb-1">최근 24시간 동기화</p>
              <p className="text-lg font-bold text-slate-900">
                {status?.recent_synced_24h ?? 0}<span className="text-xs font-normal text-slate-400 ml-1">건</span>
              </p>
            </div>
            <div className="p-3 rounded-lg bg-slate-50">
              <p className="text-xs text-slate-500 mb-1">총 누적 동기화</p>
              <p className="text-lg font-bold text-slate-900">
                {status?.total_synced ?? 0}<span className="text-xs font-normal text-slate-400 ml-1">건</span>
              </p>
            </div>
          </div>

          {!connected && (
            <div className="mt-4 p-3 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <div className="text-xs text-amber-800">
                <p className="font-medium mb-1">API 자격증명이 설정되지 않았습니다</p>
                <p className="text-amber-700">
                  서버 환경변수에 <code className="bg-white px-1 rounded">NAVER_COMMERCE_CLIENT_ID</code>,{' '}
                  <code className="bg-white px-1 rounded">NAVER_COMMERCE_CLIENT_SECRET</code>을 설정해주세요.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 수동 동기화 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Download className="w-4 h-4 text-blue-500" />
            신규 주문 수동 동기화
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="text-xs font-medium text-slate-600 mb-1 block">조회 기간 (최근 N시간)</label>
              <select
                className="w-full h-9 rounded-md border border-slate-300 px-3 text-sm"
                value={syncHours}
                onChange={(e) => setSyncHours(parseInt(e.target.value))}
              >
                <option value={1}>1시간</option>
                <option value={6}>6시간</option>
                <option value={12}>12시간</option>
                <option value={24}>24시간 (권장)</option>
                <option value={72}>3일</option>
                <option value={168}>7일</option>
              </select>
            </div>
            <Button
              variant="market"
              onClick={handleSync}
              disabled={syncing || !connected}
            >
              <RefreshCw className={cn('w-4 h-4 mr-1', syncing && 'animate-spin')} />
              {syncing ? '동기화 중...' : '지금 동기화'}
            </Button>
          </div>

          {/* 동기화 결과 */}
          {syncResult && (
            <div className={cn(
              'mt-4 p-3 rounded-lg border flex items-start gap-2',
              syncResult.error
                ? 'bg-red-50 border-red-200'
                : 'bg-emerald-50 border-emerald-200',
            )}>
              {syncResult.error ? (
                <XCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
              )}
              <div className="text-sm">
                {syncResult.error ? (
                  <p className="text-red-800 font-medium">{syncResult.error}</p>
                ) : (
                  <>
                    <p className="text-emerald-800 font-medium">{syncResult.message}</p>
                    <p className="text-xs text-emerald-700 mt-1">
                      신규 등록 {syncResult.synced ?? 0}건 · 중복 스킵 {syncResult.skipped ?? 0}건
                    </p>
                  </>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 안내 */}
      <Card className="border-blue-200 bg-blue-50/30">
        <CardContent className="pt-5">
          <div className="flex items-start gap-2">
            <Info className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
            <div className="text-xs text-slate-700 space-y-2">
              <p className="font-medium text-slate-900">자동 동기화 안내</p>
              <ul className="list-disc pl-4 space-y-1 text-slate-600">
                <li>ERP는 2시간 간격으로 자동 동기화를 실행합니다 (06시 제외).</li>
                <li>수동 동기화는 긴급한 주문 확인 시 사용하세요.</li>
                <li>중복 주문은 자동으로 스킵됩니다.</li>
                <li>스마트스토어 HACCP 인증 완료 후 유제품 등록 예정입니다.</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
