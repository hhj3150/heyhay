/**
 * @fileoverview 통합 대시보드 페이지 — 실데이터 연동
 * 4개 모듈 KPI + 알림 + 원유 흐름도
 */
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { apiGet, apiPut } from '@/lib/api'
import {
  Milk, Factory, ShoppingCart, Coffee, TrendingUp, TrendingDown,
  AlertTriangle, Bell, CheckCircle2, Users, CreditCard, ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const PRIORITY_STYLE = {
  P1: { color: 'border-l-red-500 bg-red-50', badge: 'bg-red-100 text-red-800' },
  P2: { color: 'border-l-amber-500 bg-amber-50', badge: 'bg-amber-100 text-amber-800' },
  P3: { color: 'border-l-blue-500 bg-blue-50', badge: 'bg-blue-100 text-blue-800' },
}

export default function DashboardPage() {
  const [kpi, setKpi] = useState(null)
  const [alerts, setAlerts] = useState([])

  const fetchData = useCallback(async () => {
    const [kpiRes, alertRes] = await Promise.all([
      apiGet('/dashboard/kpi'),
      apiGet('/dashboard/alerts?resolved=false'),
    ])
    if (kpiRes.success) setKpi(kpiRes.data)
    if (alertRes.success) setAlerts(alertRes.data)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const resolveAlert = async (id) => {
    const res = await apiPut(`/dashboard/alerts/${id}`, { is_read: true, is_resolved: true })
    if (res.success) fetchData()
  }

  const navigate = useNavigate()
  const farm = kpi?.farm || {}
  const factory = kpi?.factory || {}
  const market = kpi?.market || {}
  const cafe = kpi?.cafe || {}
  const milkChange = parseFloat(farm.milk_change_pct || 0)

  // 월 매출 합계 (온라인 + 카페)
  const totalMonthRevenue = (market.month_revenue || 0) + (cafe.month_revenue || 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">경영 대시보드</h1>
        <p className="text-sm text-slate-500 mt-1">HEY HAY MILK 통합 현황</p>
      </div>

      {/* KPI 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {/* 오늘 착유량 */}
        <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => navigate('/farm/milk')}>
          <CardContent className="p-4">
            <div className="flex justify-between items-start">
              <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center mb-3">
                <Milk className="w-5 h-5 text-amber-500" />
              </div>
              <ChevronRight className="w-4 h-4 text-slate-300" />
            </div>
            <p className="text-xs text-slate-500">오늘 착유량</p>
            <p className="text-lg font-bold text-amber-600">{farm.today_milk_l?.toFixed(1) || '0'}L</p>
            {farm.milk_change_pct && (
              <div className={cn('flex items-center gap-1 text-[10px] mt-0.5',
                milkChange >= 0 ? 'text-green-600' : 'text-red-600')}>
                {milkChange >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {milkChange > 0 ? '+' : ''}{milkChange}%
              </div>
            )}
          </CardContent>
        </Card>

        {/* 공장 */}
        <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => navigate('/factory/plan')}>
          <CardContent className="p-4">
            <div className="flex justify-between items-start">
              <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center mb-3">
                <Factory className="w-5 h-5 text-blue-500" />
              </div>
              <ChevronRight className="w-4 h-4 text-slate-300" />
            </div>
            <p className="text-xs text-slate-500">공장 가동</p>
            <p className="text-lg font-bold">{factory.today_batches || 0}배치</p>
            <p className="text-[10px] text-slate-400">원유 {factory.today_raw_milk_l?.toFixed(0) || 0}L</p>
          </CardContent>
        </Card>

        {/* 오늘 주문 */}
        <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => navigate('/market/orders')}>
          <CardContent className="p-4">
            <div className="flex justify-between items-start">
              <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center mb-3">
                <ShoppingCart className="w-5 h-5 text-emerald-500" />
              </div>
              <ChevronRight className="w-4 h-4 text-slate-300" />
            </div>
            <p className="text-xs text-slate-500">오늘 주문</p>
            <p className="text-lg font-bold text-emerald-600">{market.today_orders || 0}건</p>
            <p className="text-[10px] text-slate-400">{(market.today_revenue || 0).toLocaleString()}원</p>
          </CardContent>
        </Card>

        {/* 구독자 */}
        <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => navigate('/market/subscriptions')}>
          <CardContent className="p-4">
            <div className="flex justify-between items-start">
              <div className="w-10 h-10 rounded-lg bg-violet-50 flex items-center justify-center mb-3">
                <Users className="w-5 h-5 text-violet-500" />
              </div>
              <ChevronRight className="w-4 h-4 text-slate-300" />
            </div>
            <p className="text-xs text-slate-500">활성 구독</p>
            <p className="text-lg font-bold text-violet-600">{market.active_subscribers || 0}명</p>
          </CardContent>
        </Card>

        {/* B2B 거래처 */}
        <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => navigate('/market/b2b')}>
          <CardContent className="p-4">
            <div className="flex justify-between items-start">
              <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center mb-3">
                <Coffee className="w-5 h-5 text-purple-500" />
              </div>
              <ChevronRight className="w-4 h-4 text-slate-300" />
            </div>
            <p className="text-xs text-slate-500">B2B 거래처</p>
            <p className="text-lg font-bold">{(cafe.today_revenue || 0).toLocaleString()}원</p>
            <p className="text-[10px] text-slate-400">월 {(cafe.month_revenue || 0).toLocaleString()}</p>
          </CardContent>
        </Card>

        {/* 월 매출 합계 */}
        <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => navigate('/market/overview')}>
          <CardContent className="p-4">
            <div className="flex justify-between items-start">
              <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center mb-3">
                <TrendingUp className="w-5 h-5 text-slate-600" />
              </div>
              <ChevronRight className="w-4 h-4 text-slate-300" />
            </div>
            <p className="text-xs text-slate-500">월 매출 합계</p>
            <p className="text-lg font-bold">{totalMonthRevenue.toLocaleString()}원</p>
          </CardContent>
        </Card>
      </div>

      {/* 원유 흐름도 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">원유 흐름 (오늘)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-2 text-center">
            <div className="flex-1 p-4 bg-amber-50 rounded-lg border border-amber-200">
              <Milk className="w-6 h-6 text-amber-500 mx-auto mb-1" />
              <p className="text-xs text-slate-500">목장 착유</p>
              <p className="text-xl font-bold text-amber-600">{farm.today_milk_l?.toFixed(0) || 0}L</p>
            </div>
            <div className="text-slate-300 text-2xl shrink-0">→</div>
            <div className="flex-1 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <Factory className="w-6 h-6 text-blue-500 mx-auto mb-1" />
              <p className="text-xs text-slate-500">공장 투입</p>
              <p className="text-xl font-bold text-blue-600">{factory.today_raw_milk_l?.toFixed(0) || 0}L</p>
            </div>
            <div className="text-slate-300 text-2xl shrink-0">→</div>
            <div className="flex-1 p-4 bg-emerald-50 rounded-lg border border-emerald-200">
              <ShoppingCart className="w-6 h-6 text-emerald-500 mx-auto mb-1" />
              <p className="text-xs text-slate-500">온라인 판매</p>
              <p className="text-xl font-bold text-emerald-600">{market.today_orders || 0}건</p>
            </div>
            <div className="text-slate-300 text-2xl shrink-0">→</div>
            <div className="flex-1 p-4 bg-violet-50 rounded-lg border border-violet-200">
              <Coffee className="w-6 h-6 text-violet-500 mx-auto mb-1" />
              <p className="text-xs text-slate-500">카페 매출</p>
              <p className="text-xl font-bold text-violet-600">{(cafe.today_revenue || 0).toLocaleString()}</p>
            </div>
          </div>
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
            <div className="space-y-2">
              {alerts.slice(0, 10).map((a) => (
                <div key={a.id} className={cn('flex items-center gap-3 p-3 border-l-4 rounded-lg', PRIORITY_STYLE[a.priority]?.color)}>
                  <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-bold', PRIORITY_STYLE[a.priority]?.badge)}>
                    {a.priority}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{a.title}</p>
                    <p className="text-xs text-slate-500 truncate">{a.message}</p>
                  </div>
                  <span className="text-[10px] text-slate-400 shrink-0">{a.module}</span>
                  <button onClick={() => resolveAlert(a.id)} className="p-1 hover:bg-white rounded shrink-0">
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-slate-400 py-6">미확인 알림이 없습니다</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
