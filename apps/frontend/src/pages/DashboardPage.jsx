/**
 * @fileoverview 경영 대시보드 — 상용화 수준 시각화
 * 실시간 KPI + 원유 흐름 + 주문 파이프라인 + 매출 차트 + 알림
 */
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { apiGet, apiPut } from '@/lib/api'
import {
  Milk, Factory, ShoppingCart, Coffee, TrendingUp, TrendingDown,
  AlertTriangle, Bell, CheckCircle2, Users, CreditCard, ChevronRight,
  Package, Truck, Clock, DollarSign, RefreshCw, Building2,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, CartesianGrid,
} from 'recharts'
import { cn } from '@/lib/utils'

const PRIORITY_STYLE = {
  P1: { color: 'border-l-red-500 bg-red-50', badge: 'bg-red-100 text-red-800', dot: 'bg-red-500' },
  P2: { color: 'border-l-amber-500 bg-amber-50', badge: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500' },
  P3: { color: 'border-l-blue-500 bg-blue-50', badge: 'bg-blue-100 text-blue-800', dot: 'bg-blue-500' },
}

const PIE_COLORS = ['#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#3b82f6']

export default function DashboardPage() {
  const [kpi, setKpi] = useState(null)
  const [alerts, setAlerts] = useState([])
  const [orderStats, setOrderStats] = useState(null)
  const [milkHistory, setMilkHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [kpiRes, alertRes, orderRes, milkRes] = await Promise.all([
      apiGet('/dashboard/kpi'),
      apiGet('/dashboard/alerts?resolved=false'),
      apiGet('/market/orders/stats'),
      apiGet('/farm/milking/daily?days=7'),
    ])
    if (kpiRes.success) setKpi(kpiRes.data)
    if (alertRes.success) setAlerts(alertRes.data)
    if (orderRes.success) setOrderStats(orderRes.data)
    if (milkRes.success) setMilkHistory(Array.isArray(milkRes.data) ? milkRes.data.reverse() : [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])
  // 30초마다 자동 갱신
  useEffect(() => {
    const timer = setInterval(fetchData, 30000)
    return () => clearInterval(timer)
  }, [fetchData])

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

  // 주문 상태 파이차트
  const orderPie = orderStats ? [
    { name: '접수', value: parseInt(orderStats.pending) || 0 },
    { name: '결제', value: parseInt(orderStats.paid) || 0 },
    { name: '처리중', value: parseInt(orderStats.processing) || 0 },
    { name: '배송중', value: parseInt(orderStats.shipped) || 0 },
  ].filter((d) => d.value > 0) : []

  // 구독자 파이
  const subPie = [
    { name: '활성', value: parseInt(market.active_subscribers) || 0 },
  ].filter((d) => d.value > 0)

  const now = new Date()
  const greeting = now.getHours() < 12 ? '좋은 아침입니다' : now.getHours() < 18 ? '안녕하세요' : '수고하셨습니다'

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {greeting}, 원장님 👋
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {now.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
            {' · '}HEY HAY MILK 경영 현황
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
          <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          <span className="ml-1 hidden sm:inline">새로고침</span>
        </Button>
      </div>

      {/* 긴급 알림 (P1만 상단 표시) */}
      {alerts.filter((a) => a.priority === 'P1').length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-bold text-red-800">긴급 알림</p>
            {alerts.filter((a) => a.priority === 'P1').map((a) => (
              <p key={a.id} className="text-sm text-red-700 mt-1">{a.title}: {a.message}</p>
            ))}
          </div>
        </div>
      )}

      {/* 핵심 KPI — 6개 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card className="hover:shadow-lg transition-all cursor-pointer border-l-4 border-l-amber-400" onClick={() => navigate('/farm/milk')}>
          <CardContent className="p-4">
            <div className="flex justify-between items-start">
              <Milk className="w-8 h-8 text-amber-500 p-1.5 bg-amber-50 rounded-lg" />
              <ChevronRight className="w-4 h-4 text-slate-300" />
            </div>
            <p className="text-[10px] text-slate-500 mt-3 font-medium">오늘 착유량</p>
            <p className="text-2xl font-black text-amber-600">{parseFloat(farm.today_milk_l || 0).toFixed(0)}<span className="text-sm font-medium">L</span></p>
            {farm.milk_change_pct && (
              <div className={cn('flex items-center gap-1 text-[10px] mt-1 font-medium',
                milkChange >= 0 ? 'text-green-600' : 'text-red-600')}>
                {milkChange >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                전일 대비 {milkChange > 0 ? '+' : ''}{milkChange}%
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-all cursor-pointer border-l-4 border-l-emerald-400" onClick={() => navigate('/market/orders')}>
          <CardContent className="p-4">
            <div className="flex justify-between items-start">
              <ShoppingCart className="w-8 h-8 text-emerald-500 p-1.5 bg-emerald-50 rounded-lg" />
              <ChevronRight className="w-4 h-4 text-slate-300" />
            </div>
            <p className="text-[10px] text-slate-500 mt-3 font-medium">오늘 주문</p>
            <p className="text-2xl font-black text-emerald-600">{market.today_orders || 0}<span className="text-sm font-medium">건</span></p>
            <p className="text-[10px] text-slate-400 mt-1">{(parseInt(market.today_revenue) || 0).toLocaleString()}원</p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-all cursor-pointer border-l-4 border-l-violet-400" onClick={() => navigate('/market/subscriptions')}>
          <CardContent className="p-4">
            <div className="flex justify-between items-start">
              <CreditCard className="w-8 h-8 text-violet-500 p-1.5 bg-violet-50 rounded-lg" />
              <ChevronRight className="w-4 h-4 text-slate-300" />
            </div>
            <p className="text-[10px] text-slate-500 mt-3 font-medium">활성 구독</p>
            <p className="text-2xl font-black text-violet-600">{market.active_subscribers || 0}<span className="text-sm font-medium">명</span></p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-all cursor-pointer border-l-4 border-l-blue-400" onClick={() => navigate('/factory/plan')}>
          <CardContent className="p-4">
            <div className="flex justify-between items-start">
              <Factory className="w-8 h-8 text-blue-500 p-1.5 bg-blue-50 rounded-lg" />
              <ChevronRight className="w-4 h-4 text-slate-300" />
            </div>
            <p className="text-[10px] text-slate-500 mt-3 font-medium">공장 생산</p>
            <p className="text-2xl font-black text-blue-600">{factory.today_batches || 0}<span className="text-sm font-medium">배치</span></p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-all cursor-pointer border-l-4 border-l-pink-400" onClick={() => navigate('/market/b2b')}>
          <CardContent className="p-4">
            <div className="flex justify-between items-start">
              <Building2 className="w-8 h-8 text-pink-500 p-1.5 bg-pink-50 rounded-lg" />
              <ChevronRight className="w-4 h-4 text-slate-300" />
            </div>
            <p className="text-[10px] text-slate-500 mt-3 font-medium">B2B 매출</p>
            <p className="text-2xl font-black text-pink-600">{(parseInt(cafe.today_revenue) || 0).toLocaleString()}<span className="text-[10px] font-medium">원</span></p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-all cursor-pointer border-l-4 border-l-slate-400" onClick={() => navigate('/market/overview')}>
          <CardContent className="p-4">
            <div className="flex justify-between items-start">
              <DollarSign className="w-8 h-8 text-slate-600 p-1.5 bg-slate-100 rounded-lg" />
              <ChevronRight className="w-4 h-4 text-slate-300" />
            </div>
            <p className="text-[10px] text-slate-500 mt-3 font-medium">월 매출</p>
            <p className="text-xl font-black text-slate-800">{totalMonthRevenue.toLocaleString()}<span className="text-[10px] font-medium">원</span></p>
          </CardContent>
        </Card>
      </div>

      {/* 중단: 원유 흐름 + 주문 파이프라인 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 원유 흐름도 */}
        <Card>
          <CardHeader><CardTitle className="text-base">원유 흐름 (오늘)</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center gap-1.5 text-center">
              <div className="flex-1 p-3 bg-gradient-to-b from-amber-50 to-amber-100 rounded-xl">
                <Milk className="w-5 h-5 text-amber-500 mx-auto mb-1" />
                <p className="text-[9px] text-slate-500">착유</p>
                <p className="text-lg font-black text-amber-600">{parseFloat(farm.today_milk_l || 0).toFixed(0)}L</p>
              </div>
              <div className="text-amber-300 text-sm shrink-0">▶</div>
              <div className="flex-1 p-3 bg-gradient-to-b from-blue-50 to-blue-100 rounded-xl">
                <Factory className="w-5 h-5 text-blue-500 mx-auto mb-1" />
                <p className="text-[9px] text-slate-500">D2O 공장</p>
                <p className="text-lg font-black text-blue-600">{parseFloat(factory.today_raw_milk_l || 0).toFixed(0)}L</p>
              </div>
              <div className="text-blue-300 text-sm shrink-0">▶</div>
              <div className="flex-1 p-3 bg-gradient-to-b from-emerald-50 to-emerald-100 rounded-xl">
                <Package className="w-5 h-5 text-emerald-500 mx-auto mb-1" />
                <p className="text-[9px] text-slate-500">제품 출하</p>
                <p className="text-lg font-black text-emerald-600">{market.today_orders || 0}건</p>
              </div>
              <div className="text-emerald-300 text-sm shrink-0">▶</div>
              <div className="flex-1 p-3 bg-gradient-to-b from-green-50 to-green-100 rounded-xl">
                <Truck className="w-5 h-5 text-green-500 mx-auto mb-1" />
                <p className="text-[9px] text-slate-500">진흥회</p>
                <p className="text-lg font-black text-green-600">납유</p>
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

      {/* 하단: 착유량 차트 + 알림 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 7일 착유량 */}
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">최근 7일 착유량</CardTitle></CardHeader>
          <CardContent>
            {milkHistory.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={milkHistory}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} fontSize={11} />
                  <YAxis fontSize={11} />
                  <Tooltip formatter={(v) => [`${parseFloat(v).toFixed(1)}L`]} />
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
                <span className="bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full">{alerts.length}</span>
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

      {/* 빠른 접근 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: '주문 등록', icon: ShoppingCart, path: '/market/orders', color: 'from-emerald-500 to-emerald-600' },
          { label: '배송 체크', icon: Package, path: '/market/checklist', color: 'from-blue-500 to-blue-600' },
          { label: '착유량 입력', icon: Milk, path: '/farm/milk', color: 'from-amber-500 to-amber-600' },
          { label: '고객 관리', icon: Users, path: '/market/customers', color: 'from-violet-500 to-violet-600' },
        ].map((item) => (
          <button key={item.label} onClick={() => navigate(item.path)}
            className={cn('flex items-center gap-3 p-4 rounded-xl text-white font-medium text-sm bg-gradient-to-r shadow-md hover:shadow-lg transition-all hover:scale-[1.02]', item.color)}>
            <item.icon className="w-5 h-5" />
            {item.label}
          </button>
        ))}
      </div>
    </div>
  )
}
