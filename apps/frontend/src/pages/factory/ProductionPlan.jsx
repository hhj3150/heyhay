/**
 * @fileoverview 생산 계획 대시보드
 * 핵심: 주문 → 원유 필요량 역산 → 일자별 납유량 + 제품별 생산 + 거래처별 출하
 * 사용자: 하원장님, 아내, 여동생 (스마트폰 최적화)
 */
import { useState, useEffect, useCallback } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { apiGet } from '@/lib/api'
import {
  Factory, Milk, TrendingUp, AlertTriangle, Users,
  Package, Truck, ChevronRight, Calendar, CheckCircle2,
} from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { cn } from '@/lib/utils'

const SKU_EMOJI = {
  'A2-750': '🥛', 'A2-180': '🥛', 'YG-500': '🫙', 'YG-180': '🫙',
  'SI-001': '🍦', 'KM-100': '🧈',
}

const SKU_NAME = {
  'A2-750': 'A2 우유 750ml', 'A2-180': 'A2 우유 180ml',
  'YG-500': '발효유 500ml', 'YG-180': '발효유 180ml',
  'SI-001': '소프트아이스크림', 'KM-100': '카이막 100g',
}

export default function ProductionPlan() {
  const [plan, setPlan] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchPlan = useCallback(async () => {
    setLoading(true)
    const res = await apiGet('/factory/production-plan')
    if (res.success) setPlan(res.data)
    setLoading(false)
  }, [])

  useEffect(() => { fetchPlan() }, [fetchPlan])

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-slate-400">계산 중...</div>
  }

  if (!plan) {
    return <div className="flex items-center justify-center h-64 text-slate-400">데이터 없음</div>
  }

  const { summary, raw_milk, demand_by_sku, demand_by_channel, farm_capacity, milk_allocation, smartstore } = plan
  const isSufficient = summary.status === '정상'

  // 차트용 SKU별 원유 소요량
  const chartData = (raw_milk.breakdown || []).map((b) => ({
    name: SKU_NAME[b.sku_code] || b.sku_code,
    원유: b.raw_milk_total,
    수량: b.quantity,
  }))

  // 채널별 수요 요약
  const b2bWeeklyTotal = Object.values(demand_by_channel.b2b?.weekly_by_sku || {}).reduce((s, v) => s + v, 0)
  const channelSummary = [
    { label: '정기구독', count: Object.values(demand_by_channel.subscriptions || {}).reduce((s, v) => s + v, 0), color: 'text-violet-600', bg: 'bg-violet-50' },
    { label: '주문(미처리)', count: Object.values(demand_by_channel.pending_orders || {}).reduce((s, v) => s + (v.quantity || 0), 0), color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'B2B(주간)', count: b2bWeeklyTotal, color: 'text-indigo-600', bg: 'bg-indigo-50' },
  ]

  return (
    <div className="space-y-4 sm:space-y-6 max-w-4xl mx-auto">
      {/* 타이틀 */}
      <div>
        <h1 className="text-xl sm:text-2xl font-black text-slate-900 flex items-center gap-2">
          <Factory className="w-5 h-5 sm:w-6 sm:h-6 text-blue-500" />
          생산 계획
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-0.5">{plan.period} · 주문 기반 원유 수요 역산</p>
      </div>

      {/* 핵심 지표 — 원유 배분 (착유 → D2O → 진흥회) */}
      <Card className={cn('border-2', isSufficient ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50')}>
        <CardContent className="p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-3">
            {isSufficient
              ? <CheckCircle2 className="w-6 h-6 text-green-500" />
              : <AlertTriangle className="w-6 h-6 text-red-500" />}
            <span className={cn('text-sm font-bold', isSufficient ? 'text-green-700' : 'text-red-700')}>
              {summary.status}
            </span>
            <span className="text-[10px] text-slate-400 ml-auto">loss {raw_milk.loss_rate_pct}%</span>
          </div>

          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="p-2 bg-white/60 rounded-xl">
              <p className="text-[10px] sm:text-xs text-slate-500">🐄 일 착유</p>
              <p className="text-2xl sm:text-3xl font-black text-slate-800">{summary.daily_milking}</p>
              <p className="text-[10px] text-slate-400">L/일</p>
            </div>
            <div className="p-2 bg-white/60 rounded-xl">
              <p className="text-[10px] sm:text-xs text-slate-500">🏭 D2O 생산</p>
              <p className="text-2xl sm:text-3xl font-black text-blue-600">{summary.daily_to_factory}</p>
              <p className="text-[10px] text-slate-400">L/일</p>
            </div>
            <div className="p-2 bg-white/60 rounded-xl">
              <p className="text-[10px] sm:text-xs text-slate-500">🚛 진흥회 납유</p>
              <p className={cn('text-2xl sm:text-3xl font-black', summary.daily_to_dairy >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                {summary.daily_to_dairy}
              </p>
              <p className="text-[10px] text-slate-400">L/일</p>
            </div>
          </div>

          {/* 원유 흐름 바 */}
          {milk_allocation && (
            <div className="mt-3">
              <div className="h-6 rounded-full overflow-hidden flex bg-slate-200">
                <div className="bg-blue-500 flex items-center justify-center text-[9px] text-white font-bold"
                  style={{ width: `${Math.min((summary.daily_to_factory / summary.daily_milking) * 100, 100)}%` }}>
                  D2O {summary.daily_to_factory}L
                </div>
                {summary.daily_to_dairy > 0 && (
                  <div className="bg-emerald-400 flex items-center justify-center text-[9px] text-white font-bold"
                    style={{ width: `${(summary.daily_to_dairy / summary.daily_milking) * 100}%` }}>
                    진흥회 {summary.daily_to_dairy}L
                  </div>
                )}
              </div>
            </div>
          )}

          <p className="text-xs text-slate-500 mt-3 text-center bg-white/50 rounded-lg py-2">
            {summary.message}
          </p>
        </CardContent>
      </Card>

      {/* 채널별 주문 현황 */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {channelSummary.map((ch) => (
          <div key={ch.label} className={cn('text-center p-3 sm:p-4 rounded-xl', ch.bg)}>
            <p className="text-[10px] sm:text-xs text-slate-500">{ch.label}</p>
            <p className={cn('text-xl sm:text-2xl font-black', ch.color)}>{ch.count}</p>
            <p className="text-[10px] text-slate-400">단위</p>
          </div>
        ))}
      </div>

      {/* 제품별 생산 수량 + 원유 소요 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm sm:text-base flex items-center gap-2">
            <Package className="w-4 h-4 text-blue-500" />
            제품별 생산 계획
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {Object.entries(demand_by_sku).map(([sku, data]) => {
              const bom = raw_milk.breakdown?.find((b) => b.sku_code === sku)
              return (
                <div key={sku} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                  <span className="text-2xl">{SKU_EMOJI[sku] || '📦'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate">{SKU_NAME[sku] || sku}</p>
                    <div className="flex gap-3 text-[10px] text-slate-400 mt-0.5">
                      {data.sources && Object.entries(data.sources).map(([src, qty]) => (
                        <span key={src}>{src} {qty}</span>
                      ))}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-lg font-black text-slate-800">{data.total}<span className="text-xs text-slate-400 ml-0.5">개</span></p>
                    {bom && (
                      <p className="text-[10px] text-blue-500">→ 원유 {bom.raw_milk_total}L</p>
                    )}
                  </div>
                </div>
              )
            })}

            {Object.keys(demand_by_sku).length === 0 && (
              <p className="text-center text-slate-400 py-6">이번주 주문 없음</p>
            )}
          </div>

          {/* 원유 합계 바 */}
          <div className="mt-4 p-3 bg-blue-50 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Milk className="w-5 h-5 text-blue-500" />
              <span className="text-sm font-bold text-blue-700">주간 원유 합계</span>
            </div>
            <span className="text-xl font-black text-blue-600">{raw_milk.weekly_need_l}L</span>
          </div>
        </CardContent>
      </Card>

      {/* 원유 소요 차트 */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm sm:text-base">제품별 원유 소요량 (L)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} layout="vertical">
                <XAxis type="number" fontSize={10} />
                <YAxis type="category" dataKey="name" width={100} fontSize={10} />
                <Tooltip formatter={(v) => `${v}L`} />
                <Bar dataKey="원유" radius={[0, 6, 6, 0]}>
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={['#f59e0b', '#f59e0b', '#10b981', '#10b981', '#ec4899', '#8b5cf6'][i] || '#3b82f6'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* B2B 거래처 */}
      {demand_by_channel.b2b?.by_partner?.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm sm:text-base flex items-center gap-2">
              <Truck className="w-4 h-4 text-slate-500" />
              B2B 거래처 정기주문 (주간)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {demand_by_channel.b2b.by_partner.map((b, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                  <div>
                    <p className="text-sm font-bold">{b.partner_name}</p>
                    <p className="text-[10px] text-slate-400">
                      {b.sku_name} · {b.frequency === 'DAILY' ? '매일' : b.frequency === 'WEEKLY' ? '주1회' : b.frequency}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-black">{b.weekly_qty}<span className="text-xs text-slate-400 ml-0.5">개/주</span></span>
                    <p className="text-[10px] text-slate-400">({b.quantity}개/{b.frequency === 'DAILY' ? '일' : '회'})</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 스마트스토어 상태 */}
      {smartstore && (
        <div className="text-[10px] text-center bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-0.5">
          <p className="font-bold text-amber-700">📋 스마트스토어: {smartstore.current_products}</p>
          <p className="text-amber-600">{smartstore.dairy_launch_eta} · {smartstore.note}</p>
        </div>
      )}

      {/* 목장 정보 */}
      <div className="text-[10px] text-slate-400 text-center pb-4 space-y-0.5">
        <p>송영신목장 일 착유 ~{farm_capacity?.daily_milking_l}L → D2O 생산 먼저 → 잔여분 진흥회 납유</p>
      </div>
    </div>
  )
}
