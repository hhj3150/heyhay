/**
 * @fileoverview 구독자 관리 대시보드
 * 제3자가 보고 즉시 파악: 누가 / 언제 / 무엇을 / 얼마에 받는지
 * 결제 실패·이탈 위험 즉시 인지
 * 모바일: 카드 뷰 + 반응형 그리드
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
import { formatDate } from '@/lib/date'

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
    <div className="space-y-4 sm:space-y-6 px-3 sm:px-0">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
          <CreditCard className="w-5 h-5 sm:w-6 sm:h-6 text-violet-500" />
          구독 관리
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-1">HEY HAY MILK 정기구독 현황 · 결제 · 배송 스케줄</p>
      </div>

      {/* 핵심 지표 — grid-cols-2 (모바일) → grid-cols-5 (데스크톱) */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 sm:gap-3">
        <KpiCard
          icon={UserCheck}
          iconBg="bg-green-50"
          iconColor="text-green-500"
          borderColor="border-l-green-500"
          label="활성 구독"
          value={`${stats?.active || 0}명`}
          valueColor="text-green-600"
        />
        <KpiCard
          icon={Pause}
          iconBg="bg-amber-50"
          iconColor="text-amber-500"
          borderColor="border-l-amber-500"
          label="일시정지"
          value={`${stats?.paused || 0}명`}
          valueColor="text-amber-600"
        />
        <KpiCard
          icon={DollarSign}
          iconBg="bg-violet-50"
          iconColor="text-violet-500"
          borderColor="border-l-violet-500"
          label="월 반복 수익"
          value={`${parseInt(stats?.monthly_recurring_revenue || 0).toLocaleString()}원`}
          valueColor="text-violet-600"
          valueSize="text-base sm:text-lg"
        />
        <KpiCard
          icon={TrendingUp}
          iconBg="bg-blue-50"
          iconColor="text-blue-500"
          borderColor="border-l-blue-500"
          label="이번주 신규"
          value={`${stats?.new_this_week || 0}명`}
          valueColor="text-blue-600"
        />
        <KpiCard
          icon={UserX}
          iconBg="bg-red-50"
          iconColor="text-red-500"
          borderColor="border-l-red-500"
          label="해지"
          value={`${stats?.cancelled || 0}명`}
          valueColor="text-red-600"
          className="col-span-2 md:col-span-1"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-6">
        {/* 구독 분포 파이차트 — 모바일에서 높이 축소 */}
        <Card>
          <CardHeader className="px-3 sm:px-6">
            <CardTitle className="text-sm sm:text-base">구독 상태 분포</CardTitle>
          </CardHeader>
          <CardContent className="px-3 sm:px-6">
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={150} className="sm:!h-[200px]">
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={65} label={({ name, value }) => `${name} ${value}`}>
                    {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-slate-400 py-8 sm:py-12">데이터 없음</p>
            )}
          </CardContent>
        </Card>

        {/* 7일 내 결제 예정 */}
        <Card className="lg:col-span-2">
          <CardHeader className="px-3 sm:px-6">
            <CardTitle className="text-sm sm:text-base flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-500" />
              7일 내 결제 예정
              {upcomingPayments.length > 0 && (
                <span className="bg-blue-500 text-white text-[10px] px-2 py-0.5 rounded-full">{upcomingPayments.length}</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 sm:px-6">
            {upcomingPayments.length > 0 ? (
              <div className="space-y-2 max-h-64 overflow-y-auto scroll-momentum">
                {upcomingPayments.map((s) => {
                  const daysLeft = Math.ceil((new Date(s.next_payment_at) - new Date()) / (1000 * 60 * 60 * 24))
                  return (
                    <div key={s.id} className="flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3 border rounded-lg hover:bg-slate-50 touch-feedback">
                      <div className={cn('w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0',
                        daysLeft <= 1 ? 'bg-red-100 text-red-700' :
                        daysLeft <= 3 ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700')}>
                        D-{daysLeft}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{s.customer_name}</p>
                        <p className="text-[10px] text-slate-400 truncate">{s.customer_phone} · {FREQ_LABEL[s.frequency]}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-sm font-bold text-violet-600">
                          {parseInt(s.price_per_cycle).toLocaleString()}원
                        </span>
                        <p className="text-[10px] text-slate-400">{formatDate(s.next_payment_at)}</p>
                      </div>
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
        <CardHeader className="px-3 sm:px-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <CardTitle className="text-sm sm:text-base">구독자 목록</CardTitle>
            <div className="flex gap-2 items-center">
              <div className="flex gap-1 overflow-x-auto">
                {Object.entries(STATUS_CONFIG).slice(0, 3).map(([key, { label, bg, color }]) => (
                  <button key={key}
                    onClick={() => setFilter((f) => ({ ...f, status: key }))}
                    className={cn('text-xs px-3 py-1.5 rounded-full font-medium transition-colors whitespace-nowrap touch-target',
                      filter.status === key ? `${bg} ${color}` : 'text-slate-400 hover:bg-slate-100')}>
                    {label}
                  </button>
                ))}
              </div>
              <div className="relative">
                <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-400" />
                <Input placeholder="이름/전화 검색" className="pl-8 h-8 text-xs w-36 sm:w-44"
                  value={filter.search} onChange={(e) => setFilter((f) => ({ ...f, search: e.target.value }))} />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-3 sm:px-6">
          {/* 데스크톱: 테이블 뷰 */}
          <div className="hidden md:block overflow-x-auto">
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
                      <td className="p-3 text-xs text-slate-500 group relative">
                        <div className="text-center cursor-help">
                          {items?.map((i) => `${i.sku_code}×${i.quantity}`).join(' + ')}
                        </div>
                        {/* 호버 시 단가 상세 표시 */}
                        <div className="hidden group-hover:block absolute z-20 left-1/2 -translate-x-1/2 top-full mt-1 bg-white border border-slate-200 shadow-lg rounded-lg p-3 min-w-[220px]">
                          <p className="text-[10px] font-bold text-slate-700 mb-1.5 border-b pb-1">결제금액 산출근거</p>
                          {items?.map((i, idx) => (
                            <div key={idx} className="flex justify-between text-[11px] text-slate-600 py-0.5">
                              <span>{i.sku_code} × {i.quantity}</span>
                              <span className="font-mono">
                                @{(i.unit_price || 0).toLocaleString()} = {((i.unit_price || 0) * i.quantity).toLocaleString()}원
                              </span>
                            </div>
                          ))}
                          <div className="flex justify-between text-[11px] font-bold text-slate-900 border-t mt-1.5 pt-1.5">
                            <span>합계</span>
                            <span className="font-mono">{parseInt(s.price_per_cycle).toLocaleString()}원</span>
                          </div>
                        </div>
                      </td>
                      <td className="p-3 text-right font-mono font-bold">
                        {parseInt(s.price_per_cycle).toLocaleString()}원
                      </td>
                      <td className="p-3 text-center text-xs">{formatDate(s.next_payment_at)}</td>
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

          {/* 모바일: 카드 뷰 */}
          <div className="md:hidden space-y-2 scroll-momentum">
            {filtered.map((s) => {
              const items = typeof s.items === 'string' ? JSON.parse(s.items) : s.items
              const cfg = STATUS_CONFIG[s.status] || STATUS_CONFIG.ACTIVE
              return (
                <div key={s.id} className="border rounded-xl p-3 bg-white touch-feedback">
                  {/* 상단: 이름 + 상태 */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm">{s.customer_name}</p>
                      <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-bold', cfg.bg, cfg.color)}>
                        {cfg.label}
                      </span>
                    </div>
                    <span className="text-xs bg-slate-100 px-2 py-0.5 rounded font-medium">
                      {FREQ_LABEL[s.frequency]}
                    </span>
                  </div>
                  {/* 연락처 */}
                  <p className="text-[10px] text-slate-400 mb-1.5">{s.customer_phone}</p>
                  {/* 구독 내용 */}
                  <div className="flex flex-wrap gap-1 mb-2">
                    {items?.map((i, idx) => (
                      <span key={idx} className="text-[10px] bg-slate-50 border px-1.5 py-0.5 rounded">
                        {i.sku_code}×{i.quantity}
                      </span>
                    ))}
                  </div>
                  {/* 하단: 금액 + 다음결제 + 액션 */}
                  <div className="flex items-center justify-between pt-2 border-t">
                    <div>
                      <p className="text-base font-bold text-violet-600">
                        {parseInt(s.price_per_cycle).toLocaleString()}원
                      </p>
                      <p className="text-[10px] text-slate-400">
                        다음 결제: {formatDate(s.next_payment_at)}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      {s.status === 'ACTIVE' && (
                        <button onClick={() => handleAction(s.id, 'PAUSED', '관리자 일시정지')}
                          className="p-2 hover:bg-amber-50 rounded-lg touch-target" title="일시정지">
                          <Pause className="w-4 h-4 text-amber-500" />
                        </button>
                      )}
                      {s.status === 'PAUSED' && (
                        <button onClick={() => handleAction(s.id, 'ACTIVE')}
                          className="p-2 hover:bg-green-50 rounded-lg touch-target" title="재개">
                          <Play className="w-4 h-4 text-green-500" />
                        </button>
                      )}
                      {s.status !== 'CANCELLED' && (
                        <button onClick={() => {
                          if (confirm('정말 해지하시겠습니까?')) handleAction(s.id, 'CANCELLED', '관리자 해지')
                        }} className="p-2 hover:bg-red-50 rounded-lg touch-target" title="해지">
                          <XCircle className="w-4 h-4 text-red-400" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
            {filtered.length === 0 && (
              <div className="p-8 text-center text-slate-400">구독자 없음</div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

/* ─────────── KPI 카드 컴포넌트 ─────────── */
function KpiCard({ icon: Icon, iconBg, iconColor, borderColor, label, value, valueColor, valueSize, className }) {
  return (
    <Card className={cn('border-l-4', borderColor, className)}>
      <CardContent className="p-3 sm:p-4 flex items-center gap-2.5 sm:gap-3">
        <div className={cn('w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center shrink-0', iconBg)}>
          <Icon className={cn('w-5 h-5 sm:w-6 sm:h-6', iconColor)} />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] sm:text-xs text-slate-500">{label}</p>
          <p className={cn('font-bold truncate', valueSize || 'text-lg sm:text-2xl', valueColor)}>{value}</p>
        </div>
      </CardContent>
    </Card>
  )
}
