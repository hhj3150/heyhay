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
import usePullToRefresh from '@/hooks/usePullToRefresh'
import PullToRefreshIndicator from '@/components/mobile/PullToRefreshIndicator'
import SwipeableItem from '@/components/mobile/SwipeableItem'
import {
  AlertTriangle, Bell, CheckCircle2, Package, Truck, Milk,
  ChevronRight, ChevronDown, Clock, RefreshCw, Boxes, CreditCard,
  BarChart3, Droplets, Send, CircleAlert, ShoppingCart, Calendar,
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

/**
 * 백엔드 응답 → 프론트엔드 데이터 변환
 * 생산: sku_demand → items, 배송: checklist → items
 */
function transformOpsData(raw) {
  const prod = raw.production || {}
  const del = raw.deliveries || {}

  // 생산 데이터 변환
  const prodItems = (prod.sku_demand || []).map((d) => ({
    sku: d.sku_name || d.sku_code,
    skuCode: d.sku_code,
    totalQty: d.needed,
    subscription: d.reason_breakdown?.subscription || 0,
    order: d.reason_breakdown?.orders || 0,
    b2b: d.reason_breakdown?.b2b || 0,
    milkNeeded: 0,
    breakdown: d.breakdown || null,
  }))

  // 배송 데이터 변환 — 구독/주문/B2B 체크리스트를 단일 리스트로 병합
  const mapChecklist = (rows, orderType) =>
    (rows || []).map((r) => {
      // JSON.parse 안전 처리
      let items = []
      try {
        items = typeof r.items === 'string' ? JSON.parse(r.items) : (r.items || [])
      } catch { items = [] }
      return {
        orderId: r.id,
        orderType,
        customerName: r.customer_name,
        products: Array.isArray(items)
          ? items.map((i) => `${i.sku_code}×${i.quantity}`).join(', ')
          : '',
        itemDetails: Array.isArray(items) ? items : [],
        address: r.shipping_address || '',
        status: r.is_shipped ? 'shipped' : r.is_packed ? 'packed' : 'pending',
        trackingNumber: r.tracking_number || '',
        packagingNote: r.ice_pack_count > 1 ? `아이스팩 ${r.ice_pack_count}개` : '',
        hasIssue: r.has_issue,
        issueNote: r.issue_note,
      }
    })

  const deliveryItems = [
    ...mapChecklist(del.subscription, 'subscription'),
    ...mapChecklist(del.orders, 'order'),
    ...mapChecklist(del.b2b, 'b2b'),
  ]

  const stats = del.checklist_stats || { total: 0, packed: 0, shipped: 0, issues: 0 }
  const milking = raw.milking || {}
  const rawSummary = raw.summary || {}
  const rawAlerts = raw.alerts || []
  const rawOrders = raw.orders || {}

  // 긴급 액션 생성
  const urgentActions = []
  const pendingCount = parseInt(rawSummary.pending_orders || rawOrders.pending_action?.length || 0)
  if (pendingCount > 0) urgentActions.push({ type: 'pending_orders', count: pendingCount, label: `결제확인 대기 ${pendingCount}건`, path: '/market/orders', color: 'red' })
  if (!milking.recorded && !milking.today_total) urgentActions.push({ type: 'no_milk', label: '착유량 미입력', path: '/farm/milk', color: 'amber' })
  if (prod.materials_shortage?.length > 0) urgentActions.push({ type: 'material_shortage', count: prod.materials_shortage.length, label: `자재 부족 ${prod.materials_shortage.length}건`, path: '/factory/packaging', color: 'amber' })

  const totalDeliveries = parseInt(stats.total) || 0
  const shippedDeliveries = parseInt(stats.shipped) || 0

  return {
    date: raw.date || new Date().toISOString().slice(0, 10),
    progress: { total: totalDeliveries, completed: shippedDeliveries },
    milkEntered: !!(milking.recorded || milking.today_total),
    urgentActions,
    alerts: rawAlerts.slice(0, 5),
    production: {
      items: prodItems,
      label: prod.label || '생산 계획',
      tomorrowDeliveryCount: prod.tomorrow_delivery_count || 0,
      totalMilkNeeded: prod.milk_needed_l || 0,
      totalMilking: milking.today_total || 0,
      d2oAlloc: milking.d2o || 0,
      dairyAssocAlloc: milking.dairy_assoc || 0,
    },
    deliveries: {
      total: totalDeliveries,
      shipped: shippedDeliveries,
      pending: totalDeliveries - shippedDeliveries,
      items: deliveryItems,
      label: del.label || '배송 실행',
    },
    summary: {
      revenue: parseInt(rawSummary.today_revenue || 0),
      shippedCount: shippedDeliveries,
      totalCount: totalDeliveries,
      milking: milking.today_total || 0,
      d2oAlloc: milking.d2o || 0,
      dairyAssocAlloc: milking.dairy_assoc || 0,
    },
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
        setData(transformOpsData(res.data))
      } else {
        // API 실패해도 빈 데이터로 렌더링
        setData(emptyData())
      }
    } catch {
      // 에러 시 빈 데이터로 표시 (크래시 방지)
      setData(emptyData())
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

  // 풀투리프레시
  const { pullDistance, isRefreshing, handlers: pullHandlers } = usePullToRefresh({
    onRefresh: fetchData,
  })

  if (loading) {
    return <LoadingSkeleton />
  }

  const { date, progress, milkEntered, urgentActions, alerts, production, deliveries, summary } = data
  const progressPercent = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0

  return (
    <div
      className="max-w-3xl mx-auto space-y-3 pb-28 px-3 sm:px-0"
      {...pullHandlers}
    >
      {/* 풀투리프레시 인디케이터 */}
      <PullToRefreshIndicator pullDistance={pullDistance} isRefreshing={isRefreshing} />

      {/* 1. 헤더 — 날짜 + KPI + 진행률 */}
      <HeaderSection
        date={date}
        progressPercent={progressPercent}
        progress={progress}
        milkEntered={milkEntered}
        onRefresh={fetchData}
        summary={summary}
      />

      {/* 2. 긴급 액션 카드 — 가로 snap 스크롤 */}
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

      {/* 5. 하단 요약 — sticky bottom bar */}
      <StickyBottomSummary summary={summary} production={production} />
    </div>
  )
}

/* ═══════════════════════════════════════
   섹션 컴포넌트들
   ═══════════════════════════════════════ */

/** 헤더: 날짜 배너 + KPI 퀵스탯 + 진행률 바 */
function HeaderSection({ date, progressPercent, progress, milkEntered, onRefresh, summary = {} }) {
  const barColor = progressPercent >= 100 ? 'bg-emerald-500' : progressPercent >= 50 ? 'bg-blue-500' : 'bg-amber-500'

  const kpiItems = [
    {
      label: '착유량',
      value: summary.milking ? `${summary.milking}L` : '–',
      icon: Droplets,
      iconBg: 'bg-amber-500/15',
      iconColor: 'text-amber-400',
      valueCls: 'text-amber-400',
    },
    {
      label: '배송 완료',
      value: progress.total > 0 ? `${progress.completed}/${progress.total}` : '–',
      icon: Send,
      iconBg: 'bg-emerald-500/15',
      iconColor: 'text-emerald-400',
      valueCls: 'text-emerald-400',
    },
    {
      label: '오늘 매출',
      value: summary.revenue > 0 ? `${(summary.revenue / 10000).toFixed(0)}만` : '–',
      icon: BarChart3,
      iconBg: 'bg-blue-500/15',
      iconColor: 'text-blue-400',
      valueCls: 'text-blue-400',
    },
    {
      label: 'D2O 배분',
      value: summary.d2oAlloc ? `${summary.d2oAlloc}L` : '–',
      icon: Milk,
      iconBg: 'bg-violet-500/15',
      iconColor: 'text-violet-400',
      valueCls: 'text-violet-400',
    },
  ]

  return (
    <div className="space-y-2.5">
      {/* 날짜 + 새로고침 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base sm:text-lg font-bold text-slate-800 leading-tight">
            {formatKoreanDate(date)}
          </h1>
          <p className="text-xs text-slate-400 mt-0.5 font-medium tracking-wide uppercase">오늘의 운영 커맨드센터</p>
        </div>
        <button
          onClick={onRefresh}
          className="p-2.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-white transition-all touch-target"
          aria-label="새로고침"
        >
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>

      {/* KPI 퀵스탯 4카드 */}
      <div className="grid grid-cols-4 gap-2">
        {kpiItems.map(({ label, value, icon: Icon, iconBg, iconColor, valueCls }) => (
          <div key={label} className="bg-slate-900 rounded-xl p-2.5 flex flex-col gap-1.5 shadow-sm border border-white/5">
            <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center', iconBg)}>
              <Icon className={cn('w-3.5 h-3.5', iconColor)} />
            </div>
            <p className={cn('text-sm font-bold leading-none tabular-nums', valueCls)}>{value}</p>
            <p className="text-[10px] text-slate-500 leading-none">{label}</p>
          </div>
        ))}
      </div>

      {/* 진행률 바 */}
      <div className="bg-white rounded-xl p-3 shadow-sm border border-slate-100">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-slate-800">{progressPercent}%</span>
            <span className="text-xs text-slate-400">배송 완료</span>
          </div>
          <span className="text-xs font-medium text-slate-500 bg-slate-50 px-2 py-0.5 rounded-full">
            {progress.completed} / {progress.total}건
          </span>
        </div>
        <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all duration-700', barColor)}
            style={{ width: `${Math.min(progressPercent, 100)}%` }}
          />
        </div>
        {!milkEntered && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-600 font-medium">
            <AlertTriangle className="w-3.5 h-3.5" />
            착유량 미입력 — 입력이 필요합니다
          </div>
        )}
      </div>
    </div>
  )
}

/** 긴급 액션 카드 + 알림 — 가로 snap 스크롤 */
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
        <CardContent className="p-3 flex items-center gap-3">
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
      {/* 가로 snap 스크롤 (2개 이상일 때) */}
      {allItems.length >= 2 ? (
        <div className="snap-scroll-x gap-2 -mx-3 px-3 pb-1">
          {allItems.map((item) => (
            <UrgentCard key={item.id} item={item} navigate={navigate} isSnap />
          ))}
        </div>
      ) : (
        allItems.map((item) => (
          <UrgentCard key={item.id} item={item} navigate={navigate} />
        ))
      )}
    </div>
  )
}

/** 긴급 액션 단일 카드 */
function UrgentCard({ item, navigate, isSnap = false }) {
  const isDanger = item.type === 'danger'
  return (
    <button
      onClick={() => item.path && navigate(item.path)}
      className={cn(
        'text-left rounded-xl p-3 border-l-4 transition-colors touch-feedback',
        'min-h-[48px]',
        isDanger
          ? 'border-l-red-500 bg-red-50 hover:bg-red-100'
          : 'border-l-amber-500 bg-amber-50 hover:bg-amber-100',
        isSnap ? 'w-[85vw] max-w-[340px]' : 'w-full',
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
}

/** 생산 계획 테이블 + 드릴다운 accordion + 원유 배분 바 */
function ProductionSection({ production }) {
  const { items, totalMilkNeeded, totalMilking, d2oAlloc, dairyAssocAlloc, label } = production
  const milkUsagePercent = totalMilking > 0 ? Math.round((d2oAlloc / totalMilking) * 100) : 0
  const [expandedSku, setExpandedSku] = useState(null)

  const toggleSku = (sku) => {
    setExpandedSku((prev) => (prev === sku ? null : sku))
  }

  return (
    <Card>
      <CardHeader className="pb-2 px-3">
        <CardTitle className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
          <Package className="w-4 h-4 text-blue-500" />
          {label || '생산 계획'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 px-3 pb-3">
        {/* SKU별 생산 수요 + 드릴다운 */}
        {items.length > 0 ? (
          <div className="space-y-2">
            {items.map((item) => {
              const isExpanded = expandedSku === item.sku
              return (
                <div key={item.sku} className="bg-slate-50 rounded-lg overflow-hidden">
                  {/* 클릭 가능한 헤더 — 44px 터치 영역 */}
                  <button
                    onClick={() => toggleSku(item.sku)}
                    className="w-full text-left p-3 touch-feedback touch-target"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        {isExpanded
                          ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                          : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
                        <span className="text-sm font-medium text-slate-800">{item.sku}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-700">{item.totalQty}개</span>
                        {item.milkNeeded > 0 && (
                          <span className="text-xs text-slate-500">{item.milkNeeded}L</span>
                        )}
                      </div>
                    </div>
                    {/* 수량 내역 가로 막대 */}
                    <div className="flex gap-1 h-3 rounded-full overflow-hidden bg-slate-200">
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
                    {/* 범례 — 요약 수량 포함 */}
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
                  </button>

                  {/* 드릴다운 상세 */}
                  {isExpanded && item.breakdown && (
                    <BreakdownDetail breakdown={item.breakdown} />
                  )}
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

/** SKU 드릴다운 — 구독/주문/B2B 배송지별 상세 */
function BreakdownDetail({ breakdown }) {
  const { subscription, orders, b2b } = breakdown
  const hasAny = subscription.length > 0 || orders.length > 0 || b2b.length > 0

  if (!hasAny) return null

  return (
    <div className="px-3 pb-3 space-y-2 border-t border-slate-200 pt-2">
      {/* 구독 */}
      {subscription.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-purple-600 mb-1">구독</p>
          <div className="space-y-0.5">
            {subscription.map((s, i) => (
              <p key={`sub-${i}`} className="text-xs text-slate-600 pl-2">
                {s.customer_name} {s.quantity}개
                {s.address_short && (
                  <span className="text-slate-400 ml-1">({s.address_short})</span>
                )}
              </p>
            ))}
          </div>
        </div>
      )}
      {/* 주문 */}
      {orders.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-emerald-600 mb-1">주문</p>
          <div className="space-y-0.5">
            {orders.map((o, i) => (
              <p key={`ord-${i}`} className="text-xs text-slate-600 pl-2">
                {o.order_number && (
                  <span className="text-slate-400 mr-1">{o.order_number}</span>
                )}
                {o.recipient} {o.quantity}개
              </p>
            ))}
          </div>
        </div>
      )}
      {/* B2B */}
      {b2b.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-blue-600 mb-1">B2B</p>
          <div className="space-y-0.5">
            {b2b.map((b, i) => (
              <p key={`b2b-${i}`} className="text-xs text-slate-600 pl-2">
                {b.partner_name} {b.quantity}개
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/** 배송 실행 체크리스트 — 스와이프 액션 + 큰 버튼 */
function DeliverySection({ deliveries, processingIds, onPack, onShip }) {
  const { total, shipped, pending, items, label } = deliveries

  return (
    <Card>
      <CardHeader className="pb-2 px-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
            <Truck className="w-4 h-4 text-emerald-500" />
            {label || '배송 실행'}
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
      <CardContent className="space-y-2 px-3 pb-3">
        {items.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-4">오늘 배송 건 없음</p>
        )}
        {items.map((item) => {
          const isCompleted = item.status === 'shipped' || item.status === 'delivered'
          const isPacked = item.status === 'packed'
          const typeStyle = ORDER_TYPE_STYLE[item.orderType] || ORDER_TYPE_STYLE.order
          const isProcessing = Boolean(processingIds[item.orderId])

          // 스와이프 액션 영역
          const swipeLeftAction = !isCompleted && !isPacked ? (
            <div className="bg-blue-500 h-full w-full flex items-center justify-center rounded-r-xl">
              <div className="text-white text-center">
                <Package className="w-5 h-5 mx-auto mb-0.5" />
                <span className="text-[10px] font-bold">포장</span>
              </div>
            </div>
          ) : !isCompleted && isPacked ? (
            <div className="bg-emerald-500 h-full w-full flex items-center justify-center rounded-r-xl">
              <div className="text-white text-center">
                <Send className="w-5 h-5 mx-auto mb-0.5" />
                <span className="text-[10px] font-bold">발송</span>
              </div>
            </div>
          ) : null

          return (
            <SwipeableItem
              key={item.orderId}
              rightAction={swipeLeftAction}
            >
              <div
                className={cn(
                  'rounded-xl border p-3 transition-all',
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
                      {item.itemDetails
                        ? item.itemDetails.map((d) => `${d.sku_code}×${d.quantity}`).join(', ')
                        : item.products}
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

                {/* 액션 버튼 — 큰 터치 영역 */}
                {!isCompleted && (
                  <div className="flex gap-2 mt-3">
                    {!isPacked ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 h-12 text-sm font-semibold touch-feedback"
                        onClick={() => onPack(item.orderId)}
                        disabled={isProcessing}
                      >
                        <Package className="w-4 h-4 mr-1.5" />
                        {isProcessing && processingIds[item.orderId] === 'packing' ? '처리중...' : '포장완료'}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className="flex-1 h-12 text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 touch-feedback"
                        onClick={() => onShip(item.orderId)}
                        disabled={isProcessing}
                      >
                        <Send className="w-4 h-4 mr-1.5" />
                        {isProcessing && processingIds[item.orderId] === 'shipping' ? '처리중...' : '발송처리'}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </SwipeableItem>
          )
        })}

        {/* 스와이프 힌트 (미발송 건이 있을 때) */}
        {pending > 0 && items.length > 0 && (
          <p className="text-[10px] text-slate-400 text-center pt-1">
            ← 왼쪽으로 밀어 빠른 처리
          </p>
        )}
      </CardContent>
    </Card>
  )
}

/** 하단 고정 sticky 요약 바 */
function StickyBottomSummary({ summary, production }) {
  const tomorrowCount = production?.tomorrowDeliveryCount || 0
  const totalProductionNeeded = (production?.items || []).reduce((sum, i) => sum + (i.totalQty || 0), 0)

  const stats = [
    { label: '매출', value: `${(summary.revenue || 0).toLocaleString()}`, icon: BarChart3, color: 'text-slate-700' },
    { label: '발송', value: `${summary.shippedCount}/${summary.totalCount}`, icon: Truck, color: 'text-emerald-600' },
    { label: '착유', value: `${summary.milking}L`, icon: Milk, color: 'text-amber-600' },
    { label: 'D2O', value: `${summary.d2oAlloc}L`, icon: Droplets, color: 'text-blue-600' },
    { label: '진흥회', value: `${summary.dairyAssocAlloc}L`, icon: Droplets, color: 'text-slate-500' },
  ]

  return (
    <>
      {/* 내일 배송 예정 */}
      {tomorrowCount > 0 && (
        <div className="bg-amber-50 rounded-xl p-3 border border-amber-200">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-amber-600 shrink-0" />
            <p className="text-xs font-semibold text-amber-800">
              내일 배송 예정 {tomorrowCount}건 → 오늘 {totalProductionNeeded}개 제품 생산 필요
            </p>
          </div>
        </div>
      )}

      {/* 고정 하단 요약 바 */}
      <div className="fixed bottom-0 left-0 right-0 z-20 bg-white/95 backdrop-blur-sm border-t border-slate-200 px-3 py-2.5 safe-area-bottom">
        <div className="max-w-3xl mx-auto">
          <div className="grid grid-cols-5 gap-1">
            {stats.map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="text-center">
                <Icon className={cn('w-3.5 h-3.5 mx-auto mb-0.5', color)} />
                <p className={cn('text-xs font-bold leading-tight', color)}>{value}</p>
                <p className="text-[9px] text-slate-400">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
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
    <div className="max-w-3xl mx-auto space-y-3 pb-4 px-3 animate-pulse">
      <div className="h-8 bg-slate-200 rounded w-3/4" />
      <div className="h-16 bg-slate-200 rounded-xl" />
      <div className="h-24 bg-slate-200 rounded-xl" />
      <div className="h-48 bg-slate-200 rounded-xl" />
      <div className="h-64 bg-slate-200 rounded-xl" />
      <div className="h-16 bg-slate-200 rounded-xl" />
    </div>
  )
}
