/**
 * @fileoverview 구독자 관리 대시보드
 * 제3자가 보고 즉시 파악: 누가 / 언제 / 무엇을 / 얼마에 받는지
 * 결제 실패·이탈 위험 즉시 인지
 */
import { useState, useEffect, useCallback } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { apiGet, apiPut } from '@/lib/api'
import {
  CreditCard, Users, AlertTriangle, TrendingUp, Pause,
  Play, XCircle, Calendar, Search, RefreshCw, DollarSign,
  UserCheck, UserX, Clock,
} from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts'
import { cn } from '@/lib/utils'

const STATUS_CONFIG = {
  ACTIVE: { label: '활성', color: 'text-green-700', bg: 'bg-green-100', icon: UserCheck },
  PAUSED: { label: '일시정지', color: 'text-amber-700', bg: 'bg-amber-100', icon: Pause },
  CANCELLED: { label: '해지', color: 'text-red-700', bg: 'bg-red-100', icon: XCircle },
  EXPIRED: { label: '만료', color: 'text-slate-700', bg: 'bg-slate-100', icon: Clock },
  PENDING_RENEWAL: { label: '갱신대기', color: 'text-blue-700', bg: 'bg-blue-100', icon: RefreshCw },
}

const FREQ_LABEL = { '1W': '주 1회', '2W': '주 2회', '4W': '주 4회' }

const PIE_COLORS = ['#10b981', '#f59e0b', '#ef4444', '#94a3b8', '#3b82f6']

export default function SubscriptionDashboard() {
  const [stats, setStats] = useState(null)
  const [subscriptions, setSubscriptions] = useState([])
  const [filter, setFilter] = useState({ status: 'ACTIVE', search: '' })
  const [upcomingPayments, setUpcomingPayments] = useState([])
  const [actionModal, setActionModal] = useState(null)

  const fetchData = useCallback(async () => {
    const [stRes, subRes, allRes] = await Promise.all([
      apiGet('/market/subscriptions/stats'),
      apiGet(`/market/subscriptions?status=${filter.status}&limit=100`),
      apiGet('/market/subscriptions?limit=200'),
    ])
    if (stRes.success) setStats(stRes.data)
    if (subRes.success) setSubscriptions(subRes.data)
    if (allRes.success) {
      // 7일 내 결제 예정 추출
      const now = new Date()
      const week = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
      const upcoming = allRes.data
        .filter((s) => s.status === 'ACTIVE' && s.next_payment_at)
        .filter((s) => {
          const d = new Date(s.next_payment_at)
          return d >= now && d <= week
        })
        .sort((a, b) => new Date(a.next_payment_at) - new Date(b.next_payment_at))
      setUpcomingPayments(upcoming)
    }
  }, [filter.status])

  useEffect(() => { fetchData() }, [fetchData])

  const handleAction = async (id, status, reason = '') => {
    const payload = { status }
    if (status === 'PAUSED') payload.pause_reason = reason
    if (status === 'CANCELLED') payload.cancel_reason = reason
    const res = await apiPut(`/market/subscriptions/${id}`, payload)
    if (res.success) { setActionModal(null); fetchData() }
  }

  // 검색 필터
  const filtered = subscriptions.filter((s) => {
    if (!filter.search) return true
    const q = filter.search.toLowerCase()
    return s.customer_name?.toLowerCase().includes(q) ||
           s.customer_phone?.includes(q) ||
           s.plan_name?.toLowerCase().includes(q)
  })

  // 파이 차트 데이터
  const pieData = stats ? [
    { name: '활성', value: parseInt(stats.active || 0) },
    { name: '일시정지', value: parseInt(stats.paused || 0) },
    { name: '해지', value: parseInt(stats.cancelled || 0) },
  ].filter((d) => d.value > 0) : []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <CreditCard className="w-6 h-6 text-violet-500" />
          구독 관리
        </h1>
        <p className="text-sm text-slate-500 mt-1">HEY HAY MILK 정기구독 현황 · 결제 · 배송 스케줄</p>
      </div>

      {/* 핵심 지표 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-12 h-12 bg-green-50 rounded-xl flex items-center justify-center">
              <UserCheck className="w-6 h-6 text-green-500" />
            </div>
            <div>
              <p className="text-xs text-slate-500">활성 구독</p>
              <p className="text-2xl font-bold text-green-600">{stats?.active || 0}명</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center">
              <Pause className="w-6 h-6 text-amber-500" />
            </div>
            <div>
              <p className="text-xs text-slate-500">일시정지</p>
              <p className="text-2xl font-bold text-amber-600">{stats?.paused || 0}명</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-violet-500">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-12 h-12 bg-violet-50 rounded-xl flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-violet-500" />
            </div>
            <div>
              <p className="text-xs text-slate-500">월 반복 수익</p>
              <p className="text-lg font-bold text-violet-600">
                {parseInt(stats?.monthly_recurring_revenue || 0).toLocaleString()}원
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-blue-500" />
            </div>
            <div>
              <p className="text-xs text-slate-500">이번주 신규</p>
              <p className="text-2xl font-bold text-blue-600">{stats?.new_this_week || 0}명</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-red-500">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-12 h-12 bg-red-50 rounded-xl flex items-center justify-center">
              <UserX className="w-6 h-6 text-red-500" />
            </div>
            <div>
              <p className="text-xs text-slate-500">해지</p>
              <p className="text-2xl font-bold text-red-600">{stats?.cancelled || 0}명</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 구독 분포 파이차트 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">구독 상태 분포</CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} label={({ name, value }) => `${name} ${value}`}>
                    {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-slate-400 py-12">데이터 없음</p>
            )}
          </CardContent>
        </Card>

        {/* 7일 내 결제 예정 */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-500" />
              7일 내 결제 예정
              {upcomingPayments.length > 0 && (
                <span className="bg-blue-500 text-white text-[10px] px-2 py-0.5 rounded-full">{upcomingPayments.length}</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {upcomingPayments.length > 0 ? (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {upcomingPayments.map((s) => {
                  const daysLeft = Math.ceil((new Date(s.next_payment_at) - new Date()) / (1000 * 60 * 60 * 24))
                  return (
                    <div key={s.id} className="flex items-center gap-3 p-3 border rounded-lg hover:bg-slate-50">
                      <div className={cn('w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold',
                        daysLeft <= 1 ? 'bg-red-100 text-red-700' :
                        daysLeft <= 3 ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700')}>
                        D-{daysLeft}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{s.customer_name}</p>
                        <p className="text-[10px] text-slate-400">{s.customer_phone} · {FREQ_LABEL[s.frequency]}</p>
                      </div>
                      <span className="text-sm font-bold text-violet-600">
                        {parseInt(s.price_per_cycle).toLocaleString()}원
                      </span>
                      <span className="text-[10px] text-slate-400">{s.next_payment_at}</span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-center text-slate-400 py-8">7일 내 결제 예정 없음</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 구독자 목록 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">구독자 목록</CardTitle>
            <div className="flex gap-2 items-center">
              <div className="flex gap-1">
                {Object.entries(STATUS_CONFIG).slice(0, 3).map(([key, { label, bg, color }]) => (
                  <button key={key}
                    onClick={() => setFilter((f) => ({ ...f, status: key }))}
                    className={cn('text-xs px-3 py-1.5 rounded-full font-medium transition-colors',
                      filter.status === key ? `${bg} ${color}` : 'text-slate-400 hover:bg-slate-100')}>
                    {label}
                  </button>
                ))}
              </div>
              <div className="relative">
                <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-400" />
                <Input placeholder="이름/전화 검색" className="pl-8 h-8 text-xs w-44"
                  value={filter.search} onChange={(e) => setFilter((f) => ({ ...f, search: e.target.value }))} />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50">
                  <th className="text-left p-3 font-semibold">고객</th>
                  <th className="text-center p-3 font-semibold">구독 주기</th>
                  <th className="text-center p-3 font-semibold">구독 내용</th>
                  <th className="text-right p-3 font-semibold">결제금액</th>
                  <th className="text-center p-3 font-semibold">다음 결제</th>
                  <th className="text-center p-3 font-semibold">상태</th>
                  <th className="text-center p-3 font-semibold">작업</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => {
                  const items = typeof s.items === 'string' ? JSON.parse(s.items) : s.items
                  const cfg = STATUS_CONFIG[s.status] || STATUS_CONFIG.ACTIVE
                  return (
                    <tr key={s.id} className="border-b hover:bg-slate-50">
                      <td className="p-3">
                        <p className="font-medium">{s.customer_name}</p>
                        <p className="text-[10px] text-slate-400">{s.customer_phone}</p>
                      </td>
                      <td className="p-3 text-center">
                        <span className="text-xs bg-slate-100 px-2 py-0.5 rounded font-medium">
                          {FREQ_LABEL[s.frequency]}
                        </span>
                      </td>
                      <td className="p-3 text-center text-xs text-slate-500">
                        {items?.map((i) => `${i.sku_code}×${i.quantity}`).join(', ')}
                      </td>
                      <td className="p-3 text-right font-mono font-bold">
                        {parseInt(s.price_per_cycle).toLocaleString()}원
                      </td>
                      <td className="p-3 text-center text-xs">{s.next_payment_at || '-'}</td>
                      <td className="p-3 text-center">
                        <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-bold', cfg.bg, cfg.color)}>
                          {cfg.label}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex justify-center gap-1">
                          {s.status === 'ACTIVE' && (
                            <button onClick={() => handleAction(s.id, 'PAUSED', '관리자 일시정지')}
                              className="p-1 hover:bg-amber-50 rounded" title="일시정지">
                              <Pause className="w-3.5 h-3.5 text-amber-500" />
                            </button>
                          )}
                          {s.status === 'PAUSED' && (
                            <button onClick={() => handleAction(s.id, 'ACTIVE')}
                              className="p-1 hover:bg-green-50 rounded" title="재개">
                              <Play className="w-3.5 h-3.5 text-green-500" />
                            </button>
                          )}
                          {s.status !== 'CANCELLED' && (
                            <button onClick={() => {
                              if (confirm('정말 해지하시겠습니까?')) handleAction(s.id, 'CANCELLED', '관리자 해지')
                            }} className="p-1 hover:bg-red-50 rounded" title="해지">
                              <XCircle className="w-3.5 h-3.5 text-red-400" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className="p-8 text-center text-slate-400">구독자 없음</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
