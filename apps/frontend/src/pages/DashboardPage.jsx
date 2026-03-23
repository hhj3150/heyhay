/**
 * @fileoverview 경영 대시보드 — 세계 수준 ERP 시각화
 * 카운트업 애니메이션 + 원유 흐름 강화 + 생산계획 + 배송현황 + 알림
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { apiGet, apiPut } from '@/lib/api'
import {
  Milk, Factory, ShoppingCart, Coffee, TrendingUp, TrendingDown,
  AlertTriangle, Bell, CheckCircle2, Users, CreditCard, ChevronRight,
  Package, Truck, Clock, DollarSign, RefreshCw, Building2,
  Zap, ArrowRight, BarChart3, CalendarDays, Boxes, Send,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, CartesianGrid, Legend,
} from 'recharts'
import { cn } from '@/lib/utils'

/* ───────── 상수 ───────── */
const PRIORITY_STYLE = {
  P1: { color: 'border-l-red-500 bg-red-50', badge: 'bg-red-100 text-red-800', dot: 'bg-red-500' },
  P2: { color: 'border-l-amber-500 bg-amber-50', badge: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500' },
  P3: { color: 'border-l-blue-500 bg-blue-50', badge: 'bg-blue-100 text-blue-800', dot: 'bg-blue-500' },
}
const PIE_COLORS = ['#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#3b82f6', '#ec4899']
const SKU_COLORS = {
  'A2 저지우유 750ml': '#f59e0b',
  'A2 저지우유 180ml': '#fbbf24',
  '발효유 500ml': '#8b5cf6',
  '발효유 180ml': '#a78bfa',
  '소프트아이스크림': '#ec4899',
  '카이막 100g': '#14b8a6',
}

/* ───────── 카운트업 훅 ───────── */
function useCountUp(target, duration = 800) {
  const [value, setValue] = useState(0)
  const prevTarget = useRef(0)

  useEffect(() => {
    const start = prevTarget.current
    const end = typeof target === 'number' ? target : parseFloat(target) || 0
    if (start === end) return
    prevTarget.current = end

    const startTime = performance.now()
    let rafId
    const animate = (now) => {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      // easeOutCubic
      const ease = 1 - Math.pow(1 - progress, 3)
      setValue(start + (end - start) * ease)
      if (progress < 1) {
        rafId = requestAnimationFrame(animate)
      }
    }
    rafId = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafId)
  }, [target, duration])

  return value
}

/** 카운트업 숫자 컴포넌트 */
function AnimatedNumber({ value, decimals = 0, className }) {
  const animated = useCountUp(value)
  return <span className={className}>{animated.toFixed(decimals)}</span>
}

/** 카운트업 통화 컴포넌트 */
function AnimatedCurrency({ value, className }) {
  const animated = useCountUp(value)
  return <span className={className}>{Math.round(animated).toLocaleString()}</span>
}

/* ───────── 갱신 플래시 효과 훅 ───────── */
function useFlash(dep) {
  const [flash, setFlash] = useState(false)
  const isFirst = useRef(true)

  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false
      return
    }
    setFlash(true)
    const t = setTimeout(() => setFlash(false), 600)
    return () => clearTimeout(t)
  }, [dep])

  return flash
}

/* ───────── 메인 컴포넌트 ───────── */
export default function DashboardPage() {
  const [kpi, setKpi] = useState(null)
  const [alerts, setAlerts] = useState([])
  const [orderStats, setOrderStats] = useState(null)
  const [milkHistory, setMilkHistory] = useState([])
  const [productionPlan, setProductionPlan] = useState(null)
  const [deliveryStats, setDeliveryStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshCount, setRefreshCount] = useState(0)
  const navigate = useNavigate()

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      // Promise.allSettled로 개별 실패가 전체를 중단하지 않도록 처리
      const results = await Promise.allSettled([
        apiGet('/dashboard/kpi'),
        apiGet('/dashboard/alerts?resolved=false'),
        apiGet('/market/orders/stats'),
        apiGet('/farm/milking/daily?days=7'),
        apiGet('/factory/production-plan'),
        apiGet('/market/checklist/stats'),
      ])

      const getValue = (idx) => results[idx].status === 'fulfilled' ? results[idx].value : null

      const kpiRes = getValue(0)
      const alertRes = getValue(1)
      const orderRes = getValue(2)
      const milkRes = getValue(3)
      const planRes = getValue(4)
      const deliveryRes = getValue(5)

      // 성공한 응답만 업데이트, 실패 시 이전 state 유지
      if (kpiRes?.success) setKpi(kpiRes.data)
      if (alertRes?.success) setAlerts(alertRes.data)
      if (orderRes?.success) setOrderStats(orderRes.data)
      if (milkRes?.success) setMilkHistory(Array.isArray(milkRes.data) ? milkRes.data.reverse() : [])
      if (planRes?.success) setProductionPlan(planRes.data)
      if (deliveryRes?.success) setDeliveryStats(deliveryRes.data)
    } catch (err) {
      // 토큰 갱신 실패 등 전체 에러 시 이전 데이터 유지 (state 초기화하지 않음)
      console.error('대시보드 데이터 조회 실패:', err)
    }
    setLoading(false)
    setRefreshCount((c) => c + 1)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])
  // 30초 자동 갱신
  useEffect(() => {
    const timer = setInterval(fetchData, 30000)
    return () => clearInterval(timer)
  }, [fetchData])

  const flash = useFlash(refreshCount)

  const resolveAlert = async (id) => {
    const res = await apiPut(`/dashboard/alerts/${id}`, { is_read: true, is_resolved: true })
    if (res.success) fetchData()
  }

  const farm = kpi?.farm || {}
  const market = kpi?.market || {}
  const factory = kpi?.factory || {}
  const cafe = kpi?.cafe || {}
  const milkChange = parseFloat(farm.milk_change_pct || 0)
  const totalMonthRevenue = (parseInt(market.month_revenue) || 0) + (parseInt(cafe.month_revenue) || 0)

  // 원유 흐름 계산
  const todayMilk = parseFloat(farm.today_milk_l || 0)
  const factoryInput = parseFloat(factory.today_raw_milk_l || 0)
  const dairyAssocMilk = todayMilk - factoryInput
  const dairyShortage = dairyAssocMilk < 0

  // 주문 상태 파이차트
  const orderPie = orderStats ? [
    { name: '접수', value: parseInt(orderStats.pending) || 0 },
    { name: '결제', value: parseInt(orderStats.paid) || 0 },
    { name: '처리중', value: parseInt(orderStats.processing) || 0 },
    { name: '배송중', value: parseInt(orderStats.shipped) || 0 },
  ].filter((d) => d.value > 0) : []

  // 생산 계획 SKU 바 차트 데이터
  const skuBarData = productionPlan?.demand_by_sku
    ? Object.entries(productionPlan.demand_by_sku).map(([sku, info]) => ({
        name: sku.length > 10 ? sku.slice(0, 10) + '...' : sku,
        fullName: sku,
        필요량: typeof info === 'object' ? (info.daily_qty || info.qty || 0) : info,
      }))
    : (productionPlan?.raw_milk?.breakdown || []).map((b) => ({
        name: b.sku_name?.length > 10 ? b.sku_name.slice(0, 10) + '...' : (b.sku_name || ''),
        fullName: b.sku_name || '',
        필요량: b.daily_qty || 0,
      }))

  // 배송 현황
  const deliveryTotal = parseInt(deliveryStats?.total) || 0
  const deliveryShipped = parseInt(deliveryStats?.shipped) || 0
  const deliveryNotShipped = deliveryTotal - deliveryShipped
  const deliveryPct = deliveryStats?.completion_pct || 0

  const now = new Date()
  const greeting = now.getHours() < 12 ? '좋은 아침입니다' : now.getHours() < 18 ? '안녕하세요' : '수고하셨습니다'

  return (
    <div className="space-y-6">
      {/* ───── 헤더 ───── */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {greeting}, 원장님
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {now.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
            {' · '}HEY HAY MILK 경영 현황
          </p>
        </div>
        <div className="flex items-center gap-2">
          {flash && (
            <span className="text-[10px] text-emerald-500 font-medium animate-pulse">
              <Zap className="w-3 h-3 inline mr-0.5" />LIVE
            </span>
          )}
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
            <span className="ml-1 hidden sm:inline">새로고침</span>
          </Button>
        </div>
      </div>

      {/* ───── 긴급 알림 (P1만 상단) ───── */}
      {alerts.filter((a) => a.priority === 'P1').length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3 animate-pulse">
          <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-bold text-red-800">긴급 알림</p>
            {alerts.filter((a) => a.priority === 'P1').map((a) => (
              <p key={a.id} className="text-sm text-red-700 mt-1">{a.title}: {a.message}</p>
            ))}
          </div>
        </div>
      )}

      {/* ───── 핵심 KPI 6개 (카운트업 애니메이션) ───── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card
          className={cn(
            'hover:shadow-lg transition-all cursor-pointer border-l-4 border-l-amber-400',
            flash && 'ring-2 ring-amber-200 ring-opacity-50',
          )}
          onClick={() => navigate('/farm/milk')}
        >
          <CardContent className="p-4">
            <div className="flex justify-between items-start">
              <Milk className="w-8 h-8 text-amber-500 p-1.5 bg-amber-50 rounded-lg" />
              <ChevronRight className="w-4 h-4 text-slate-300" />
            </div>
            <p className="text-[10px] text-slate-500 mt-3 font-medium">오늘 착유량</p>
            <p className="text-2xl font-black text-amber-600">
              <AnimatedNumber value={todayMilk} /><span className="text-sm font-medium">L</span>
            </p>
            {farm.milk_change_pct && (
              <div className={cn('flex items-center gap-1 text-[10px] mt-1 font-medium',
                milkChange >= 0 ? 'text-green-600' : 'text-red-600')}>
                {milkChange >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                전일 대비 {milkChange > 0 ? '+' : ''}{milkChange}%
              </div>
            )}
          </CardContent>
        </Card>

        <Card
          className={cn(
            'hover:shadow-lg transition-all cursor-pointer border-l-4 border-l-emerald-400',
            flash && 'ring-2 ring-emerald-200 ring-opacity-50',
          )}
          onClick={() => navigate('/market/orders')}
        >
          <CardContent className="p-4">
            <div className="flex justify-between items-start">
              <ShoppingCart className="w-8 h-8 text-emerald-500 p-1.5 bg-emerald-50 rounded-lg" />
              <ChevronRight className="w-4 h-4 text-slate-300" />
            </div>
            <p className="text-[10px] text-slate-500 mt-3 font-medium">오늘 주문</p>
            <p className="text-2xl font-black text-emerald-600">
              <AnimatedNumber value={parseInt(market.today_orders) || 0} /><span className="text-sm font-medium">건</span>
            </p>
            <p className="text-[10px] text-slate-400 mt-1">
              <AnimatedCurrency value={parseInt(market.today_revenue) || 0} />원
            </p>
          </CardContent>
        </Card>

        <Card
          className={cn(
            'hover:shadow-lg transition-all cursor-pointer border-l-4 border-l-violet-400',
            flash && 'ring-2 ring-violet-200 ring-opacity-50',
          )}
          onClick={() => navigate('/market/subscriptions')}
        >
          <CardContent className="p-4">
            <div className="flex justify-between items-start">
              <CreditCard className="w-8 h-8 text-violet-500 p-1.5 bg-violet-50 rounded-lg" />
              <ChevronRight className="w-4 h-4 text-slate-300" />
            </div>
            <p className="text-[10px] text-slate-500 mt-3 font-medium">활성 구독</p>
            <p className="text-2xl font-black text-violet-600">
              <AnimatedNumber value={parseInt(market.active_subscribers) || 0} /><span className="text-sm font-medium">명</span>
            </p>
          </CardContent>
        </Card>

        <Card
          className={cn(
            'hover:shadow-lg transition-all cursor-pointer border-l-4 border-l-blue-400',
            flash && 'ring-2 ring-blue-200 ring-opacity-50',
          )}
          onClick={() => navigate('/factory/plan')}
        >
          <CardContent className="p-4">
            <div className="flex justify-between items-start">
              <Factory className="w-8 h-8 text-blue-500 p-1.5 bg-blue-50 rounded-lg" />
              <ChevronRight className="w-4 h-4 text-slate-300" />
            </div>
            <p className="text-[10px] text-slate-500 mt-3 font-medium">공장 생산</p>
            <p className="text-2xl font-black text-blue-600">
              <AnimatedNumber value={parseInt(factory.today_batches) || 0} /><span className="text-sm font-medium">배치</span>
            </p>
          </CardContent>
        </Card>

        <Card
          className={cn(
            'hover:shadow-lg transition-all cursor-pointer border-l-4 border-l-pink-400',
            flash && 'ring-2 ring-pink-200 ring-opacity-50',
          )}
          onClick={() => navigate('/market/b2b')}
        >
          <CardContent className="p-4">
            <div className="flex justify-between items-start">
              <Building2 className="w-8 h-8 text-pink-500 p-1.5 bg-pink-50 rounded-lg" />
              <ChevronRight className="w-4 h-4 text-slate-300" />
            </div>
            <p className="text-[10px] text-slate-500 mt-3 font-medium">B2B 매출</p>
            <p className="text-2xl font-black text-pink-600">
              <AnimatedCurrency value={parseInt(cafe.today_revenue) || 0} /><span className="text-[10px] font-medium">원</span>
            </p>
          </CardContent>
        </Card>

        <Card
          className={cn(
            'hover:shadow-lg transition-all cursor-pointer border-l-4 border-l-slate-400',
            flash && 'ring-2 ring-slate-200 ring-opacity-50',
          )}
          onClick={() => navigate('/market/overview')}
        >
          <CardContent className="p-4">
            <div className="flex justify-between items-start">
              <DollarSign className="w-8 h-8 text-slate-600 p-1.5 bg-slate-100 rounded-lg" />
              <ChevronRight className="w-4 h-4 text-slate-300" />
            </div>
            <p className="text-[10px] text-slate-500 mt-3 font-medium">월 매출</p>
            <p className="text-xl font-black text-slate-800">
              <AnimatedCurrency value={totalMonthRevenue} /><span className="text-[10px] font-medium">원</span>
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ───── 원유 흐름도 (강화) + 주문 파이프라인 ───── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 원유 흐름도 */}
        <Card className={cn(flash && 'ring-1 ring-blue-100')}>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Milk className="w-4 h-4 text-amber-500" />
              원유 흐름 (오늘)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 메인 흐름 */}
            <div className="flex items-center gap-1 text-center">
              <div className="flex-1 p-3 bg-gradient-to-b from-amber-50 to-amber-100 rounded-xl border border-amber-200">
                <Milk className="w-5 h-5 text-amber-500 mx-auto mb-1" />
                <p className="text-[9px] text-slate-500 font-medium">착유</p>
                <p className="text-lg font-black text-amber-600">
                  <AnimatedNumber value={todayMilk} />L
                </p>
              </div>

              <div className="flex flex-col items-center shrink-0 px-1">
                <ArrowRight className="w-4 h-4 text-amber-400" />
              </div>

              <div className="flex-1 p-3 bg-gradient-to-b from-blue-50 to-blue-100 rounded-xl border border-blue-200">
                <Factory className="w-5 h-5 text-blue-500 mx-auto mb-1" />
                <p className="text-[9px] text-slate-500 font-medium">D2O 공장</p>
                <p className="text-lg font-black text-blue-600">
                  <AnimatedNumber value={factoryInput} />L
                </p>
              </div>

              <div className="flex flex-col items-center shrink-0 px-1">
                <ArrowRight className="w-4 h-4 text-blue-400" />
              </div>

              <div className="flex-1 p-3 bg-gradient-to-b from-emerald-50 to-emerald-100 rounded-xl border border-emerald-200">
                <Package className="w-5 h-5 text-emerald-500 mx-auto mb-1" />
                <p className="text-[9px] text-slate-500 font-medium">제품 출하</p>
                <p className="text-lg font-black text-emerald-600">
                  <AnimatedNumber value={parseInt(market.today_orders) || 0} />건
                </p>
              </div>
            </div>

            {/* 진흥회 납유 분리 표시 */}
            <div className={cn(
              'flex items-center gap-3 p-3 rounded-xl border',
              dairyShortage
                ? 'bg-red-50 border-red-300'
                : 'bg-green-50 border-green-200',
            )}>
              <Truck className={cn('w-6 h-6 shrink-0', dairyShortage ? 'text-red-500' : 'text-green-600')} />
              <div className="flex-1">
                <p className="text-[10px] text-slate-500 font-medium">낙농진흥회 납유</p>
                <p className="text-xs text-slate-400">착유량 - D2O 투입량 = 자동 계산</p>
              </div>
              <div className="text-right">
                <p className={cn(
                  'text-xl font-black',
                  dairyShortage ? 'text-red-600' : 'text-green-700',
                )}>
                  <AnimatedNumber value={Math.abs(dairyAssocMilk)} />L
                </p>
                {dairyShortage && (
                  <div className="flex items-center gap-1 text-[10px] text-red-600 font-bold mt-0.5">
                    <AlertTriangle className="w-3 h-3" />
                    원유 부족!
                  </div>
                )}
              </div>
            </div>

            {/* 원유 배분 바 */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-[10px] text-slate-500">
                <span>원유 배분</span>
                <span>{todayMilk.toFixed(0)}L 중</span>
              </div>
              <div className="h-3 bg-slate-100 rounded-full overflow-hidden flex">
                {todayMilk > 0 && (
                  <>
                    <div
                      className="bg-blue-500 h-full transition-all duration-700"
                      style={{ width: `${Math.min((factoryInput / todayMilk) * 100, 100)}%` }}
                      title={`D2O: ${factoryInput.toFixed(0)}L`}
                    />
                    <div
                      className={cn('h-full transition-all duration-700', dairyShortage ? 'bg-red-400' : 'bg-green-500')}
                      style={{ width: `${Math.max((Math.max(dairyAssocMilk, 0) / todayMilk) * 100, 0)}%` }}
                      title={`진흥회: ${Math.max(dairyAssocMilk, 0).toFixed(0)}L`}
                    />
                  </>
                )}
              </div>
              <div className="flex justify-between text-[9px]">
                <span className="text-blue-600 font-medium">D2O {factoryInput.toFixed(0)}L</span>
                <span className={cn('font-medium', dairyShortage ? 'text-red-600' : 'text-green-600')}>
                  진흥회 {Math.max(dairyAssocMilk, 0).toFixed(0)}L
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 주문 처리 현황 */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle className="text-base">주문 파이프라인</CardTitle>
              <button onClick={() => navigate('/market/orders')} className="text-xs text-violet-500 hover:text-violet-700">전체보기 →</button>
            </div>
          </CardHeader>
          <CardContent>
            {orderPie.length > 0 ? (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width="40%" height={130}>
                  <PieChart>
                    <Pie data={orderPie} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={30} outerRadius={55}>
                      {orderPie.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2">
                  {[
                    { label: '접수 대기', count: orderStats?.pending, color: 'bg-emerald-500' },
                    { label: '결제 완료', count: orderStats?.paid, color: 'bg-amber-500' },
                    { label: '처리중', count: orderStats?.processing, color: 'bg-red-500' },
                    { label: '배송중', count: orderStats?.shipped, color: 'bg-violet-500' },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center gap-2">
                      <div className={cn('w-2.5 h-2.5 rounded-full', item.color)} />
                      <span className="text-xs text-slate-600 flex-1">{item.label}</span>
                      <span className="text-sm font-bold">{parseInt(item.count) || 0}건</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-center text-slate-400 py-8 text-sm">처리 중인 주문 없음</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ───── 생산 계획 + 배송 현황 ───── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 금일 생산 계획 */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle className="text-base flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-blue-500" />
                금일 생산 계획
              </CardTitle>
              <button onClick={() => navigate('/factory/plan')} className="text-xs text-blue-500 hover:text-blue-700">상세 →</button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {skuBarData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={skuBarData} layout="vertical" margin={{ left: 10, right: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                    <XAxis type="number" fontSize={10} />
                    <YAxis type="category" dataKey="name" fontSize={10} width={80} />
                    <Tooltip
                      formatter={(v, _name, props) => [`${v}개`, props.payload.fullName]}
                      contentStyle={{ fontSize: 12 }}
                    />
                    <Bar dataKey="필요량" radius={[0, 4, 4, 0]}>
                      {skuBarData.map((entry, i) => (
                        <Cell key={i} fill={SKU_COLORS[entry.fullName] || PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                {/* 원유 배분 요약 */}
                {productionPlan?.milk_allocation && (
                  <div className="flex gap-3">
                    <div className="flex-1 bg-blue-50 rounded-lg p-2.5 text-center border border-blue-100">
                      <p className="text-[9px] text-blue-500 font-medium">D2O 필요</p>
                      <p className="text-base font-black text-blue-700">
                        {parseFloat(productionPlan.milk_allocation.daily_to_factory_l || 0).toFixed(0)}L
                      </p>
                    </div>
                    <div className="flex-1 bg-green-50 rounded-lg p-2.5 text-center border border-green-100">
                      <p className="text-[9px] text-green-500 font-medium">진흥회 납유</p>
                      <p className="text-base font-black text-green-700">
                        {parseFloat(productionPlan.milk_allocation.daily_to_dairy_l || 0).toFixed(0)}L
                      </p>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-8">
                <Boxes className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                <p className="text-sm text-slate-400">생산 계획 없음</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 배송 현황 요약 */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle className="text-base flex items-center gap-2">
                <Send className="w-4 h-4 text-emerald-500" />
                배송 현황 (오늘)
              </CardTitle>
              <button onClick={() => navigate('/market/checklist')} className="text-xs text-emerald-500 hover:text-emerald-700">상세 →</button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {deliveryTotal > 0 ? (
              <>
                {/* 프로그레스 바 */}
                <div className="space-y-2">
                  <div className="flex justify-between items-end">
                    <p className="text-sm text-slate-600 font-medium">발송 진행률</p>
                    <p className="text-2xl font-black text-emerald-600">
                      <AnimatedNumber value={deliveryPct} />
                      <span className="text-sm font-medium">%</span>
                    </p>
                  </div>
                  <div className="h-4 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all duration-1000',
                        deliveryPct >= 100 ? 'bg-emerald-500' : deliveryPct >= 50 ? 'bg-blue-500' : 'bg-amber-500',
                      )}
                      style={{ width: `${Math.min(deliveryPct, 100)}%` }}
                    />
                  </div>
                </div>

                {/* 숫자 요약 */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-slate-50 rounded-lg p-3 text-center border">
                    <Package className="w-4 h-4 text-slate-400 mx-auto mb-1" />
                    <p className="text-[9px] text-slate-500">총 배송</p>
                    <p className="text-xl font-black text-slate-700">
                      <AnimatedNumber value={deliveryTotal} />
                    </p>
                  </div>
                  <div className="bg-emerald-50 rounded-lg p-3 text-center border border-emerald-100">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto mb-1" />
                    <p className="text-[9px] text-emerald-600">발송 완료</p>
                    <p className="text-xl font-black text-emerald-700">
                      <AnimatedNumber value={deliveryShipped} />
                    </p>
                  </div>
                  <div className={cn(
                    'rounded-lg p-3 text-center border',
                    deliveryNotShipped > 0 ? 'bg-amber-50 border-amber-100' : 'bg-slate-50',
                  )}>
                    <Clock className="w-4 h-4 text-amber-500 mx-auto mb-1" />
                    <p className="text-[9px] text-amber-600">미발송</p>
                    <p className={cn('text-xl font-black', deliveryNotShipped > 0 ? 'text-amber-600' : 'text-slate-400')}>
                      <AnimatedNumber value={deliveryNotShipped} />
                    </p>
                  </div>
                </div>

                {/* 출처별 분류 */}
                {deliveryStats?.by_source && (
                  <div className="flex gap-2 text-[10px]">
                    <span className="bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-medium">
                      구독 {deliveryStats.by_source.subscription || 0}건
                    </span>
                    <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
                      주문 {deliveryStats.by_source.order || 0}건
                    </span>
                    <span className="bg-pink-100 text-pink-700 px-2 py-0.5 rounded-full font-medium">
                      B2B {deliveryStats.by_source.b2b || 0}건
                    </span>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-8">
                <Truck className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                <p className="text-sm text-slate-400">오늘 배송 건 없음</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ───── 7일 착유량 차트 + 알림 ───── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 7일 착유량 */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-amber-500" />
              최근 7일 착유량
            </CardTitle>
          </CardHeader>
          <CardContent>
            {milkHistory.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={milkHistory}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} fontSize={11} />
                  <YAxis fontSize={11} />
                  <Tooltip formatter={(v) => [`${parseFloat(v).toFixed(1)}L`]} />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="total_l" name="착유량" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="dairy_assoc_l" name="진흥회" fill="#22c55e" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="d2o_l" name="D2O" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-slate-400 py-8 text-sm">착유 데이터 없음</p>
            )}
          </CardContent>
        </Card>

        {/* 알림 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Bell className="w-4 h-4" />
              알림
              {alerts.length > 0 && (
                <span className="bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full animate-pulse">{alerts.length}</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {alerts.length > 0 ? (
              <div className="space-y-2 max-h-[200px] overflow-y-auto">
                {alerts.slice(0, 8).map((a) => (
                  <div key={a.id} className={cn('flex items-start gap-2 p-2.5 border-l-4 rounded-lg text-xs', PRIORITY_STYLE[a.priority]?.color)}>
                    <div className={cn('w-2 h-2 rounded-full mt-1 shrink-0', PRIORITY_STYLE[a.priority]?.dot)} />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{a.title}</p>
                      <p className="text-slate-500 truncate mt-0.5">{a.message}</p>
                    </div>
                    <button onClick={() => resolveAlert(a.id)} className="p-1 hover:bg-white rounded shrink-0">
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6">
                <CheckCircle2 className="w-8 h-8 text-green-300 mx-auto mb-2" />
                <p className="text-sm text-slate-400">알림 없음</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ───── 빠른 접근 버튼 (강화 디자인) ───── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: '주문 등록', desc: '새 주문 접수', icon: ShoppingCart, path: '/market/orders', color: 'from-emerald-500 to-emerald-600', ring: 'hover:ring-emerald-300' },
          { label: '배송 체크', desc: '발송 관리', icon: Package, path: '/market/checklist', color: 'from-blue-500 to-blue-600', ring: 'hover:ring-blue-300' },
          { label: '착유량 입력', desc: '오늘 착유 기록', icon: Milk, path: '/farm/milk', color: 'from-amber-500 to-amber-600', ring: 'hover:ring-amber-300' },
          { label: '고객 관리', desc: '고객 조회', icon: Users, path: '/market/customers', color: 'from-violet-500 to-violet-600', ring: 'hover:ring-violet-300' },
        ].map((item) => (
          <button key={item.label} onClick={() => navigate(item.path)}
            className={cn(
              'flex items-center gap-3 p-4 rounded-xl text-white font-medium text-sm bg-gradient-to-r shadow-md',
              'hover:shadow-xl hover:ring-2 transition-all hover:scale-[1.02] active:scale-[0.98]',
              item.color, item.ring,
            )}>
            <div className="bg-white/20 p-2 rounded-lg">
              <item.icon className="w-5 h-5" />
            </div>
            <div className="text-left">
              <p className="font-bold">{item.label}</p>
              <p className="text-[10px] text-white/70">{item.desc}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
