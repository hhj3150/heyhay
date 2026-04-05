/**
 * @fileoverview 원가 분석 페이지
 * 생산배치 기반 원가 집계 · SKU별 마진율 · 월별 추이
 */
import { useState, useEffect, useCallback } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { apiGet } from '@/lib/api'
import {
  TrendingUp, DollarSign, Package, Droplets, RefreshCw, BarChart3,
} from 'lucide-react'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { cn } from '@/lib/utils'

/** 기간 옵션 */
const PERIOD_OPTIONS = [
  { value: 'week', label: '주간 (7일)' },
  { value: 'month', label: '이번 달' },
  { value: '30d', label: '최근 30일' },
]

/** 숫자 포맷 (₩ 단위) */
const fmtWon = (n) => {
  if (!n || n === 0) return '-'
  return `₩${parseInt(n).toLocaleString()}`
}

export default function CostAnalysisPage() {
  const [period, setPeriod] = useState('month')
  const [summary, setSummary] = useState(null)
  const [bySku, setBySku] = useState([])
  const [trend, setTrend] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [sumRes, skuRes, trendRes] = await Promise.all([
        apiGet(`/factory/cost-analysis/summary?period=${period}`),
        apiGet(`/factory/cost-analysis/by-sku?period=${period}`),
        apiGet('/factory/cost-analysis/trend'),
      ])
      if (sumRes.success) setSummary(sumRes.data)
      if (skuRes.success) setBySku(skuRes.data)
      if (trendRes.success) setTrend(trendRes.data)
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => { fetchData() }, [fetchData])

  // 원가 구성 차트 데이터
  const costBreakdownData = summary ? [
    { name: '원재료비', value: summary.total_material_cost, color: '#f59e0b' },
    { name: '인건비', value: summary.total_labor_cost, color: '#3b82f6' },
    { name: '간접비', value: summary.total_overhead_cost, color: '#8b5cf6' },
  ] : []

  // SKU별 마진 차트 데이터
  const marginChartData = bySku
    .filter((s) => s.batch_count > 0)
    .map((s) => ({
      name: s.code,
      원가: s.avg_unit_cost,
      판매가: s.retail_price,
      마진: s.margin || 0,
    }))

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 w-40 bg-slate-200 rounded animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-slate-200 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-violet-100 text-violet-600 flex items-center justify-center">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">원가 분석</h1>
            <p className="text-sm text-slate-500">생산배치 원가·SKU별 마진율·월별 추이</p>
          </div>
        </div>
        <div className="flex gap-2">
          <select
            className="h-9 rounded-md border border-slate-300 px-3 text-sm"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          >
            {PERIOD_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="w-4 h-4 mr-1" />새로고침
          </Button>
        </div>
      </div>

      {/* KPI 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500">총 원가</p>
                <p className="text-xl font-bold text-slate-900 mt-1">
                  {fmtWon(summary?.total_cost)}
                </p>
              </div>
              <div className="w-9 h-9 rounded-lg bg-violet-50 flex items-center justify-center">
                <DollarSign className="w-4 h-4 text-violet-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500">배치 수</p>
                <p className="text-xl font-bold text-slate-900 mt-1">
                  {summary?.batch_count ?? 0}<span className="text-xs font-normal text-slate-400 ml-1">건</span>
                </p>
              </div>
              <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
                <Package className="w-4 h-4 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500">투입 원유</p>
                <p className="text-xl font-bold text-slate-900 mt-1">
                  {parseFloat(summary?.total_raw_milk_l || 0).toFixed(0)}<span className="text-xs font-normal text-slate-400 ml-1">L</span>
                </p>
              </div>
              <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center">
                <Droplets className="w-4 h-4 text-amber-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500">평균 개당 원가</p>
                <p className="text-xl font-bold text-slate-900 mt-1">
                  {fmtWon(summary?.avg_unit_cost)}
                </p>
              </div>
              <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-emerald-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 원가 구성 + 월별 추이 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">원가 구성</CardTitle>
          </CardHeader>
          <CardContent>
            {summary?.total_cost > 0 ? (
              <div className="space-y-3">
                {costBreakdownData.map((item) => {
                  const pct = summary.total_cost > 0
                    ? (item.value / summary.total_cost * 100).toFixed(1)
                    : 0
                  return (
                    <div key={item.name}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-slate-700">{item.name}</span>
                        <span className="text-sm font-mono text-slate-900">{fmtWon(item.value)} <span className="text-xs text-slate-400">({pct}%)</span></span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, backgroundColor: item.color }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-sm text-slate-400 py-8 text-center">데이터가 없습니다</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">월별 원가 추이 (최근 6개월)</CardTitle>
          </CardHeader>
          <CardContent>
            {trend.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => fmtWon(v)} />
                  <Line type="monotone" dataKey="total_cost" stroke="#8b5cf6" strokeWidth={2} name="총원가" />
                  <Line type="monotone" dataKey="avg_unit_cost" stroke="#10b981" strokeWidth={2} name="평균원가" />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-slate-400 py-8 text-center">데이터가 없습니다</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* SKU별 마진 차트 */}
      {marginChartData.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">SKU별 원가·판매가·마진</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={marginChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => fmtWon(v)} />
                <Legend />
                <Bar dataKey="원가" fill="#f59e0b" />
                <Bar dataKey="판매가" fill="#3b82f6" />
                <Bar dataKey="마진" fill="#10b981" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* SKU별 상세 테이블 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">SKU별 원가·마진 상세</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="text-left px-4 py-3 font-medium text-slate-500">SKU</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500">제품명</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-500">생산량</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-500">개당 원가</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-500">소매가</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-500">마진</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-500">마진율</th>
                </tr>
              </thead>
              <tbody>
                {bySku.map((s) => (
                  <tr key={s.sku_id} className="border-b border-slate-50 hover:bg-slate-50/50">
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded">{s.code}</span>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">{s.name}</td>
                    <td className="px-4 py-3 text-right font-mono">{s.total_qty.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-mono">{s.avg_unit_cost > 0 ? fmtWon(s.avg_unit_cost) : '-'}</td>
                    <td className="px-4 py-3 text-right font-mono">{s.retail_price > 0 ? fmtWon(s.retail_price) : '-'}</td>
                    <td className={cn(
                      'px-4 py-3 text-right font-mono font-semibold',
                      s.margin > 0 ? 'text-emerald-600' : s.margin < 0 ? 'text-red-600' : 'text-slate-400',
                    )}>
                      {s.margin !== null ? fmtWon(s.margin) : '-'}
                    </td>
                    <td className={cn(
                      'px-4 py-3 text-right font-mono',
                      s.margin_pct > 30 ? 'text-emerald-600 font-semibold' : 'text-slate-600',
                    )}>
                      {s.margin_pct !== null ? `${s.margin_pct}%` : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
