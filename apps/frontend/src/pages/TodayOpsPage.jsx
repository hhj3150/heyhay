/**
 * @fileoverview 오늘의 운영 커맨드센터
 * 매일 아침 이 화면 하나로 오늘 할 일 전체 파악 + 즉시 실행
 * 30초 자동 갱신, 모바일 퍼스트
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { apiGet, apiPut, apiPost } from '@/lib/api'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  AlertTriangle, Bell, CheckCircle2, Package, Truck, Milk,
  ChevronRight, Clock, RefreshCw, Boxes, CreditCard,
  BarChart3, Droplets, Send, CircleAlert, ShoppingCart,
} from 'lucide-react'

/* ─────────── 상수 ─────────── */
const REFRESH_INTERVAL = 30_000
const ORDER_TYPE_STYLE = {
  subscription: { label: '구독', bg: 'bg-purple-100', text: 'text-purple-700', bar: 'bg-purple-500' },
  order: { label: '주문', bg: 'bg-emerald-100', text: 'text-emerald-700', bar: 'bg-emerald-500' },
  b2b: { label: 'B2B', bg: 'bg-blue-100', text: 'text-blue-700', bar: 'bg-blue-500' },
}
const PRIORITY_STYLE = {
  P1: { border: 'border-l-red-500', bg: 'bg-red-50', badge: 'bg-red-100 text-red-700' },
  P2: { border: 'border-l-amber-500', bg: 'bg-amber-50', badge: 'bg-amber-100 text-amber-700' },
}

/* ─────────── 날짜 포맷 ─────────── */
/** @param {string} isoDate - YYYY-MM-DD */
function formatKoreanDate(isoDate) {
  const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']
  const d = new Date(`${isoDate}T00:00:00+09:00`)
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  const day = d.getDate()
  const dow = WEEKDAYS[d.getDay()]
  return `${y}년 ${m}월 ${day}일 ${dow}요일`
}

/* ─────────── 빈 데이터 (API 로딩 전) ─────────── */
function emptyData() {
  return {
    date: new Date().toISOString().slice(0, 10),
    progress: { total: 0, completed: 0 },
    milkEntered: true,
    urgentActions: [],
    alerts: [],
    production: { items: [], totalMilkNeeded: 0, totalMilking: 0, d2oAlloc: 0, dairyAssocAlloc: 0 },
    deliveries: { total: 0, shipped: 0, pending: 0, items: [] },
    summary: { revenue: 0, shippedCount: 0, totalCount: 0, milking: 0, d2oAlloc: 0, dairyAssocAlloc: 0 },
  }
}

/* ─────────── 메인 페이지 ─────────── */
export default function TodayOpsPage() {
  const [data, setData] = useState(emptyData)
  const [loading, setLoading] = useState(true)
  const [processingIds, setProcessingIds] = useState({})
  const timerRef = useRef(null)
  const navigate = useNavigate()

  const fetchData = useCallback(async () => {
    try {
      const res = await apiGet('/dashboard/today-ops')
      if (res.success && res.data) {
        setData(res.data)
      }
    } catch (error) {
      toast.error('운영 데이터를 불러오지 못했습니다')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    timerRef.current = setInterval(fetchData, REFRESH_INTERVAL)
    return () => clearInterval(timerRef.current)
  }, [fetchData])

  /** 포장완료 처리 */
  const handlePack = useCallback(async (orderId) => {
    setProcessingIds((prev) => ({ ...prev, [orderId]: 'packing' }))
    try {
      const res = await apiPut(`/market/orders/${orderId}/status`, { status: 'packed' })
      if (res.success) {
        toast.success('포장 완료 처리됨')
        await fetchData()
      } else {
        toast.error(res.error?.message || '포장 처리 실패')
      }
    } catch (error) {
      toast.error('포장 처리 중 오류 발생')
    } finally {
      setProcessingIds((prev) => {
        const { [orderId]: _, ...rest } = prev
        return rest
      })
    }
  }, [fetchData])

  /** 발송처리 */
  const handleShip = useCallback(async (orderId) => {
    setProcessingIds((prev) => ({ ...prev, [orderId]: 'shipping' }))
    try {
      const res = await apiPut(`/market/orders/${orderId}/status`, { status: 'shipped' })
      if (res.success) {
        toast.success('발송 처리 완료')
        await fetchData()
      } else {
        toast.error(res.error?.message || '발송 처리 실패')
      }
    } catch (error) {
      toast.error('발송 처리 중 오류 발생')
    } finally {
      setProcessingIds((prev) => {
        const { [orderId]: _, ...rest } = prev
        return rest
      })
    }
  }, [fetchData])

  if (loading) {
    return <LoadingSkeleton />
  }

  const { date, progress, milkEntered, urgentActions, alerts, production, deliveries, summary } = data
  const progressPercent = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0

  return (
    <div className="max-w-3xl mx-auto space-y-4 pb-4">
      {/* 1. 헤더 — 날짜 + 진행률 */}
      <HeaderSection
        date={date}
        progressPercent={progressPercent}
        progress={progress}
        milkEntered={milkEntered}
        onRefresh={fetchData}
      />

      {/* 2. 긴급 액션 카드 */}
      <UrgentSection
        urgentActions={urgentActions}
        alerts={alerts}
        milkEntered={milkEntered}
        navigate={navigate}
      />

      {/* 3. 생산 계획 */}
      <ProductionSection production={production} />

      {/* 4. 배송 실행 */}
      <DeliverySection
        deliveries={deliveries}
        processingIds={processingIds}
        onPack={handlePack}
        onShip={handleShip}
      />

      {/* 5. 하단 요약 */}
      <SummarySection summary={summary} />
    </div>
  )
}

/* ═══════════════════════════════════════
   섹션 컴포넌트들
   ═══════════════════════════════════════ */

/** 헤더: 날짜 + 진행률 바 */
function HeaderSection({ date, progressPercent, progress, milkEntered, onRefresh }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-800 leading-tight">
            {formatKoreanDate(date)}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">오늘의 운영</p>
        </div>
        <button
          onClick={onRefresh}
          className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-white transition-colors"
          aria-label="새로고침"
        >
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>

      {/* 진행률 바 */}
      <div className="bg-white rounded-xl p-3 shadow-sm border border-slate-100">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-slate-700">
            {progressPercent}% 완료
          </span>
          <span className="text-xs text-slate-500">
            {progress.completed}/{progress.total}건 발송
          </span>
        </div>
        <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500',
              progressPercent >= 100
                ? 'bg-emerald-500'
                : progressPercent >= 50
                  ? 'bg-blue-500'
                  : 'bg-amber-500',
            )}
            style={{ width: `${Math.min(progressPercent, 100)}%` }}
          />
        </div>
        {!milkEntered && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-600 font-medium">
            <AlertTriangle className="w-3.5 h-3.5" />
            착유량 미입력
          </div>
        )}
      </div>
    </div>
  )
}

/** 긴급 액션 카드 + 알림 */
function UrgentSection({ urgentActions, alerts, milkEntered, navigate }) {
  const allItems = [
    ...(!milkEntered
      ? [{ id: '_milk', type: 'warning', label: '착유량 미입력', description: '오늘 착유 데이터를 입력하세요', path: '/farm/milk' }]
      : []),
    ...(urgentActions || []),
    ...(alerts || []).map((a) => ({
      ...a,
      id: a.id || `alert-${a.message}`,
      type: a.priority === 'P1' ? 'danger' : 'warning',
      label: a.message,
      description: a.detail || '',
    })),
  ]

  if (allItems.length === 0) {
    return (
      <Card className="border-emerald-200 bg-emerald-50">
        <CardContent className="p-4 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
          <p className="text-sm font-medium text-emerald-700">긴급 사항 없음 — 순조롭게 운영 중</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
        <CircleAlert className="w-4 h-4 text-red-500" />
        긴급 액션
      </h2>
      {allItems.map((item) => {
        const isDanger = item.type === 'danger'
        return (
          <button
            key={item.id}
            onClick={() => item.path && navigate(item.path)}
            className={cn(
              'w-full text-left rounded-xl p-3.5 border-l-4 transition-colors',
              'active:scale-[0.98] min-h-[48px]',
              isDanger
                ? 'border-l-red-500 bg-red-50 hover:bg-red-100'
                : 'border-l-amber-500 bg-amber-50 hover:bg-amber-100',
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                {isDanger
                  ? <AlertTriangle className="w-4.5 h-4.5 text-red-500 shrink-0" />
                  : <Bell className="w-4.5 h-4.5 text-amber-500 shrink-0" />}
                <div>
                  <p className={cn('text-sm font-semibold', isDanger ? 'text-red-800' : 'text-amber-800')}>
                    {item.label}
                  </p>
                  {item.description && (
                    <p className={cn('text-xs mt-0.5', isDanger ? 'text-red-600' : 'text-amber-600')}>
                      {item.description}
                    </p>
                  )}
                </div>
              </div>
              {item.path && <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
            </div>
          </button>
        )
      })}
    </div>
  )
}

/** 생산 계획 테이블 + 원유 배분 바 */
function ProductionSection({ production }) {
  const { items, totalMilkNeeded, totalMilking, d2oAlloc, dairyAssocAlloc } = production
  const milkUsagePercent = totalMilking > 0 ? Math.round((d2oAlloc / totalMilking) * 100) : 0

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
          <Droplets className="w-4 h-4 text-blue-500" />
          생산 계획
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* 제품별 테이블 */}
        {items.length > 0 ? (
          <div className="space-y-2">
            {items.map((item) => {
              const maxQty = Math.max(item.subscription || 0, item.order || 0, item.b2b || 0, 1)
              return (
                <div key={item.sku} className="bg-slate-50 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-medium text-slate-800">{item.sku}</span>
                    <span className="text-xs text-slate-500">{item.totalQty}개 · {item.milkNeeded}L</span>
                  </div>
                  {/* 수량 내역 가로 막대 */}
                  <div className="flex gap-1 h-2.5 rounded-full overflow-hidden bg-slate-200">
                    {item.subscription > 0 && (
                      <div
                        className="bg-purple-500 rounded-full"
                        style={{ flex: item.subscription }}
                        title={`구독 ${item.subscription}`}
                      />
                    )}
                    {item.order > 0 && (
                      <div
                        className="bg-emerald-500 rounded-full"
                        style={{ flex: item.order }}
                        title={`주문 ${item.order}`}
                      />
                    )}
                    {item.b2b > 0 && (
                      <div
                        className="bg-blue-500 rounded-full"
                        style={{ flex: item.b2b }}
                        title={`B2B ${item.b2b}`}
                      />
                    )}
                  </div>
                  {/* 범례 */}
                  <div className="flex gap-3 mt-1.5">
                    {item.subscription > 0 && (
                      <LegendDot color="bg-purple-500" label={`구독 ${item.subscription}`} />
                    )}
                    {item.order > 0 && (
                      <LegendDot color="bg-emerald-500" label={`주문 ${item.order}`} />
                    )}
                    {item.b2b > 0 && (
                      <LegendDot color="bg-blue-500" label={`B2B ${item.b2b}`} />
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-sm text-slate-400 text-center py-4">오늘 생산 계획 없음</p>
        )}

        {/* 원유 배분 요약 */}
        <div className="bg-blue-50 rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-blue-800">
              원유 합계: {totalMilkNeeded}L 필요
            </span>
            <span className="text-blue-600">
              착유 {totalMilking}L
            </span>
          </div>
          {/* 원유 배분 바 */}
          <div className="h-3 bg-blue-200 rounded-full overflow-hidden flex">
            <div
              className="bg-blue-600 transition-all"
              style={{ width: `${milkUsagePercent}%` }}
              title={`D2O ${d2oAlloc}L`}
            />
          </div>
          <div className="flex justify-between text-[11px] text-blue-700">
            <span>D2O {d2oAlloc}L ({milkUsagePercent}%)</span>
            <span>낙농진흥회 {dairyAssocAlloc}L</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/** 배송 실행 체크리스트 */
function DeliverySection({ deliveries, processingIds, onPack, onShip }) {
  const { total, shipped, pending, items } = deliveries

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
            <Truck className="w-4 h-4 text-emerald-500" />
            배송 실행
          </CardTitle>
          <div className="flex gap-2 text-xs">
            <span className="text-slate-500">전체 {total}건</span>
            <span className="text-emerald-600 font-semibold">발송 {shipped}건</span>
            {pending > 0 && (
              <span className="text-amber-600 font-semibold">미발송 {pending}건</span>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-4">오늘 배송 건 없음</p>
        )}
        {items.map((item) => {
          const isCompleted = item.status === 'shipped' || item.status === 'delivered'
          const isPacked = item.status === 'packed'
          const typeStyle = ORDER_TYPE_STYLE[item.orderType] || ORDER_TYPE_STYLE.order
          const isProcessing = Boolean(processingIds[item.orderId])

          return (
            <div
              key={item.orderId}
              className={cn(
                'rounded-xl border p-3.5 transition-all',
                isCompleted
                  ? 'bg-slate-50 border-slate-200 opacity-70'
                  : 'bg-white border-slate-200',
              )}
            >
              {/* 상단: 고객명 + 태그 */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={cn(
                      'text-sm font-semibold',
                      isCompleted ? 'line-through text-slate-400' : 'text-slate-800',
                    )}>
                      {item.customerName}
                    </span>
                    <span className={cn(
                      'text-[10px] px-1.5 py-0.5 rounded-full font-medium',
                      typeStyle.bg, typeStyle.text,
                    )}>
                      {typeStyle.label}
                    </span>
                  </div>
                  {/* 상품 목록 */}
                  <p className="text-xs text-slate-500 mt-1 truncate">
                    {item.products}
                  </p>
                  {/* 주소 */}
                  <p className="text-xs text-slate-400 mt-0.5 truncate">
                    {item.address}
                  </p>
                </div>

                {/* 상태 표시 */}
                {isCompleted && (
                  <div className="flex items-center gap-1 text-xs text-emerald-600 shrink-0">
                    <CheckCircle2 className="w-4 h-4" />
                    <div className="text-right">
                      <p className="font-medium">발송완료</p>
                      {item.trackingNumber && (
                        <p className="text-[10px] text-slate-400">{item.trackingNumber}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* 아이스팩/박스 태그 */}
              {item.packagingNote && (
                <div className="flex gap-1.5 mt-2">
                  {item.packagingNote.split(',').map((note) => (
                    <span
                      key={note.trim()}
                      className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded"
                    >
                      {note.trim()}
                    </span>
                  ))}
                </div>
              )}

              {/* 액션 버튼 */}
              {!isCompleted && (
                <div className="flex gap-2 mt-3">
                  {!isPacked ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 min-h-[44px] text-xs font-semibold"
                      onClick={() => onPack(item.orderId)}
                      disabled={isProcessing}
                    >
                      <Package className="w-3.5 h-3.5 mr-1.5" />
                      {isProcessing && processingIds[item.orderId] === 'packing' ? '처리중...' : '포장완료'}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      className="flex-1 min-h-[44px] text-xs font-semibold bg-emerald-600 hover:bg-emerald-700"
                      onClick={() => onShip(item.orderId)}
                      disabled={isProcessing}
                    >
                      <Send className="w-3.5 h-3.5 mr-1.5" />
                      {isProcessing && processingIds[item.orderId] === 'shipping' ? '처리중...' : '발송처리'}
                    </Button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

/** 하단 요약 스트립 */
function SummarySection({ summary }) {
  const stats = [
    { label: '오늘 매출', value: `${(summary.revenue || 0).toLocaleString()}원`, icon: BarChart3, color: 'text-slate-700' },
    { label: '발송', value: `${summary.shippedCount}/${summary.totalCount}`, icon: Truck, color: 'text-emerald-600' },
    { label: '착유', value: `${summary.milking}L`, icon: Milk, color: 'text-amber-600' },
    { label: 'D2O', value: `${summary.d2oAlloc}L`, icon: Droplets, color: 'text-blue-600' },
    { label: '진흥회', value: `${summary.dairyAssocAlloc}L`, icon: Droplets, color: 'text-slate-500' },
  ]

  return (
    <div className="bg-white rounded-xl p-3 shadow-sm border border-slate-100">
      <div className="grid grid-cols-5 gap-1">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="text-center">
            <Icon className={cn('w-4 h-4 mx-auto mb-0.5', color)} />
            <p className={cn('text-xs font-bold', color)}>{value}</p>
            <p className="text-[10px] text-slate-400">{label}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ─────────── 유틸 컴포넌트 ─────────── */

/** 범례 도트 */
function LegendDot({ color, label }) {
  return (
    <span className="flex items-center gap-1 text-[10px] text-slate-500">
      <span className={cn('w-2 h-2 rounded-full', color)} />
      {label}
    </span>
  )
}

/** 로딩 스켈레톤 */
function LoadingSkeleton() {
  return (
    <div className="max-w-3xl mx-auto space-y-4 pb-4 animate-pulse">
      <div className="h-8 bg-slate-200 rounded w-3/4" />
      <div className="h-16 bg-slate-200 rounded-xl" />
      <div className="h-24 bg-slate-200 rounded-xl" />
      <div className="h-48 bg-slate-200 rounded-xl" />
      <div className="h-64 bg-slate-200 rounded-xl" />
      <div className="h-16 bg-slate-200 rounded-xl" />
    </div>
  )
}
