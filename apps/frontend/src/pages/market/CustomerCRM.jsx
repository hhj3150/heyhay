/**
 * @fileoverview 고객 관리 CRM 페이지
 * 고객 목록 (세그먼트 필터) + 고객 클릭 시 상세 패널
 * 제3자가 이 화면만으로 고객 이력 전체 파악 가능
 */
import { useState, useEffect, useCallback } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { apiGet } from '@/lib/api'
import {
  Users, Search, UserCheck, UserX, Crown, Moon, Sparkles,
  Phone, Mail, MapPin, ShoppingCart, CreditCard, TrendingUp,
  Package, Calendar, ChevronRight, X, Clock, ArrowUpRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/date'

const SEGMENT_CONFIG = {
  ALL: { label: '전체', icon: Users, color: 'text-slate-600', bg: 'bg-slate-100' },
  VIP: { label: 'VIP', icon: Crown, color: 'text-amber-700', bg: 'bg-amber-100' },
  ACTIVE: { label: '활성', icon: UserCheck, color: 'text-green-700', bg: 'bg-green-100' },
  NEW: { label: '신규', icon: Sparkles, color: 'text-blue-700', bg: 'bg-blue-100' },
  DORMANT: { label: '휴면', icon: Moon, color: 'text-slate-700', bg: 'bg-slate-200' },
  CHURNED: { label: '이탈', icon: UserX, color: 'text-red-700', bg: 'bg-red-100' },
}

const CHANNEL_LABEL = {
  SMARTSTORE: '스마트스토어',
  OWN_MALL: '자사몰',
  CAFE: '카페',
  B2B: 'B2B',
}

const ORDER_STATUS_LABEL = {
  PENDING: '접수', PAID: '결제완료', PROCESSING: '처리중',
  PACKED: '포장완료', SHIPPED: '배송중', DELIVERED: '배송완료',
  CANCELLED: '취소', RETURNED: '반품',
}

const ORDER_STATUS_COLOR = {
  PENDING: 'bg-slate-100 text-slate-600',
  PAID: 'bg-blue-100 text-blue-700',
  PROCESSING: 'bg-amber-100 text-amber-700',
  PACKED: 'bg-indigo-100 text-indigo-700',
  SHIPPED: 'bg-violet-100 text-violet-700',
  DELIVERED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
  RETURNED: 'bg-red-100 text-red-700',
}

export default function CustomerCRM() {
  const [customers, setCustomers] = useState([])
  const [stats, setStats] = useState(null)
  const [filter, setFilter] = useState({ segment: 'ALL', search: '' })
  const [selected, setSelected] = useState(null)
  const [detail, setDetail] = useState({ orders: [], subscriptions: [] })
  const [meta, setMeta] = useState({ total: 0, page: 1, totalPages: 1 })

  const fetchCustomers = useCallback(async () => {
    const params = new URLSearchParams({ limit: '50' })
    if (filter.segment !== 'ALL') params.set('segment', filter.segment)
    if (filter.search) params.set('search', filter.search)

    const [custRes, stRes] = await Promise.all([
      apiGet(`/market/customers?${params}`),
      apiGet('/market/customers/stats'),
    ])

    if (custRes.success) {
      setCustomers(custRes.data)
      if (custRes.meta) setMeta(custRes.meta)
    }
    if (stRes.success) setStats(stRes.data)
  }, [filter.segment, filter.search])

  useEffect(() => { fetchCustomers() }, [fetchCustomers])

  // 고객 상세 로드
  const loadDetail = async (customer) => {
    setSelected(customer)
    const [ordRes, subRes] = await Promise.all([
      apiGet(`/market/orders?customer_id=${customer.id}&limit=20`),
      apiGet(`/market/subscriptions?customer_id=${customer.id}&limit=10`),
    ])
    setDetail({
      orders: ordRes.success ? ordRes.data : [],
      subscriptions: subRes.success ? subRes.data : [],
    })
  }

  return (
    <div className="flex gap-6 h-[calc(100vh-7rem)]">
      {/* 왼쪽: 고객 목록 — 모바일에서 상세 열리면 숨김 */}
      <div className={cn('flex flex-col', selected ? 'hidden lg:flex lg:w-[45%]' : 'w-full')}>
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Users className="w-6 h-6 text-blue-500" />
              고객 관리
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              전체 {stats?.total || 0}명 · VIP {stats?.vip_count || 0}명 · 평균 LTV {parseInt(stats?.avg_ltv || 0).toLocaleString()}원
            </p>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <Input placeholder="이름/전화/이메일 검색" className="pl-9 w-56"
              value={filter.search} onChange={(e) => setFilter((f) => ({ ...f, search: e.target.value }))} />
          </div>
        </div>

        {/* 세그먼트 필터 */}
        <div className="flex gap-2 mb-4 overflow-x-auto">
          {Object.entries(SEGMENT_CONFIG).map(([key, cfg]) => {
            const count = key === 'ALL' ? stats?.total :
              key === 'VIP' ? stats?.vip_count :
              key === 'ACTIVE' ? stats?.active_count :
              key === 'NEW' ? stats?.new_count :
              key === 'DORMANT' ? stats?.dormant_count :
              stats?.churned_count
            return (
              <button key={key} onClick={() => setFilter((f) => ({ ...f, segment: key }))}
                className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all',
                  filter.segment === key ? `${cfg.bg} ${cfg.color} ring-2 ring-offset-1 ring-current` : 'text-slate-400 hover:bg-slate-100')}>
                <cfg.icon className="w-3.5 h-3.5" />
                {cfg.label}
                <span className="font-bold">{count || 0}</span>
              </button>
            )
          })}
        </div>

        {/* 고객 목록 */}
        <div className="flex-1 overflow-y-auto space-y-1.5">
          {customers.map((c) => {
            const seg = SEGMENT_CONFIG[c.segment] || SEGMENT_CONFIG.ACTIVE
            const isSelected = selected?.id === c.id
            return (
              <div key={c.id} onClick={() => loadDetail(c)}
                className={cn('flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all',
                  isSelected ? 'bg-blue-50 border-blue-300 shadow-sm' : 'bg-white hover:bg-slate-50 border-slate-100')}>
                {/* 세그먼트 아이콘 */}
                <div className={cn('w-10 h-10 rounded-full flex items-center justify-center shrink-0', seg.bg)}>
                  <seg.icon className={cn('w-4 h-4', seg.color)} />
                </div>

                {/* 기본 정보 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">{c.name}</span>
                    <span className={cn('text-[9px] px-1.5 py-0.5 rounded font-bold', seg.bg, seg.color)}>
                      {seg.label}
                    </span>
                    <span className="text-[9px] text-slate-400">
                      {CHANNEL_LABEL[c.channel]}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-slate-400 mt-0.5">
                    <span>{c.phone}</span>
                    {c.total_orders > 0 && <span>주문 {c.total_orders}건</span>}
                  </div>
                </div>

                {/* 누적 금액 */}
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-slate-700">
                    {parseInt(c.total_spent || 0).toLocaleString()}원
                  </p>
                  <p className="text-[9px] text-slate-400">
                    LTV {parseInt(c.ltv || 0).toLocaleString()}
                  </p>
                </div>

                <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
              </div>
            )
          })}

          {customers.length === 0 && (
            <div className="text-center text-slate-400 py-12">고객 없음</div>
          )}
        </div>
      </div>

      {/* 오른쪽: 고객 상세 패널 — 모바일에서 전체 너비 */}
      {selected && (
        <div className="w-full lg:w-[55%] lg:border-l lg:pl-6 overflow-y-auto">
          {/* 상단: 고객 프로필 */}
          <div className="flex items-start justify-between mb-6">
            <div>
              <div className="flex items-center gap-3">
                <div className={cn('w-14 h-14 rounded-xl flex items-center justify-center text-lg font-bold',
                  SEGMENT_CONFIG[selected.segment]?.bg, SEGMENT_CONFIG[selected.segment]?.color)}>
                  {selected.name.charAt(0)}
                </div>
                <div>
                  <h2 className="text-xl font-bold">{selected.name}</h2>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-bold',
                      SEGMENT_CONFIG[selected.segment]?.bg, SEGMENT_CONFIG[selected.segment]?.color)}>
                      {SEGMENT_CONFIG[selected.segment]?.label}
                    </span>
                    <span className="text-xs text-slate-400">{CHANNEL_LABEL[selected.channel]}</span>
                  </div>
                </div>
              </div>
            </div>
            <button onClick={() => setSelected(null)} className="p-1.5 hover:bg-slate-100 rounded-lg">
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>

          {/* 연락처 + 주소 */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            {selected.phone && (
              <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg">
                <Phone className="w-4 h-4 text-slate-400" />
                <span className="text-sm">{selected.phone}</span>
              </div>
            )}
            {selected.email && (
              <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg">
                <Mail className="w-4 h-4 text-slate-400" />
                <span className="text-sm truncate">{selected.email}</span>
              </div>
            )}
            {selected.address_main && (
              <div className="flex items-start gap-2 p-3 bg-slate-50 rounded-lg col-span-2">
                <MapPin className="w-4 h-4 text-slate-400 mt-0.5" />
                <span className="text-sm">
                  [{selected.address_zip}] {selected.address_main} {selected.address_detail}
                </span>
              </div>
            )}
          </div>

          {/* KPI 카드 */}
          <div className="grid grid-cols-4 gap-3 mb-6">
            <div className="text-center p-3 bg-blue-50 rounded-lg">
              <ShoppingCart className="w-4 h-4 text-blue-500 mx-auto mb-1" />
              <p className="text-[10px] text-slate-500">총 주문</p>
              <p className="text-lg font-bold text-blue-600">{selected.total_orders || 0}건</p>
            </div>
            <div className="text-center p-3 bg-emerald-50 rounded-lg">
              <TrendingUp className="w-4 h-4 text-emerald-500 mx-auto mb-1" />
              <p className="text-[10px] text-slate-500">총 소비</p>
              <p className="text-sm font-bold text-emerald-600">{parseInt(selected.total_spent || 0).toLocaleString()}</p>
            </div>
            <div className="text-center p-3 bg-violet-50 rounded-lg">
              <CreditCard className="w-4 h-4 text-violet-500 mx-auto mb-1" />
              <p className="text-[10px] text-slate-500">LTV</p>
              <p className="text-sm font-bold text-violet-600">{parseInt(selected.ltv || 0).toLocaleString()}</p>
            </div>
            <div className="text-center p-3 bg-amber-50 rounded-lg">
              <Calendar className="w-4 h-4 text-amber-500 mx-auto mb-1" />
              <p className="text-[10px] text-slate-500">첫 주문</p>
              <p className="text-xs font-bold text-amber-600">{formatDate(selected.first_order_at)}</p>
            </div>
          </div>

          {/* 구독 현황 */}
          {detail.subscriptions.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-bold text-slate-900 mb-2 flex items-center gap-1.5">
                <CreditCard className="w-4 h-4 text-violet-500" />
                구독 현황
              </h3>
              <div className="space-y-2">
                {detail.subscriptions.map((s) => {
                  const items = typeof s.items === 'string' ? JSON.parse(s.items) : s.items
                  const statusColor = s.status === 'ACTIVE' ? 'bg-green-100 text-green-700' :
                    s.status === 'PAUSED' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                  const statusLabel = s.status === 'ACTIVE' ? '활성' : s.status === 'PAUSED' ? '정지' : '해지'
                  return (
                    <div key={s.id} className="p-3 border rounded-lg bg-white">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm font-medium">{s.plan_name}</span>
                        <span className={cn('text-[9px] px-2 py-0.5 rounded-full font-bold', statusColor)}>{statusLabel}</span>
                      </div>
                      <div className="flex items-center gap-4 text-[10px] text-slate-500">
                        <span>{s.frequency === '1W' ? '주 1회' : s.frequency === '2W' ? '격주' : '월 1회'}</span>
                        <span>{parseInt(s.price_per_cycle).toLocaleString()}원/회</span>
                        <span>{items?.map((i) => `${i.sku_code}×${i.quantity}`).join(', ')}</span>
                      </div>
                      {s.next_payment_at && (
                        <p className="text-[10px] text-blue-500 mt-1">다음 결제: {formatDate(s.next_payment_at)}</p>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* 주문 타임라인 */}
          <div>
            <h3 className="text-sm font-bold text-slate-900 mb-2 flex items-center gap-1.5">
              <Package className="w-4 h-4 text-blue-500" />
              주문 이력
              <span className="text-[10px] text-slate-400 font-normal">({detail.orders.length}건)</span>
            </h3>

            {detail.orders.length > 0 ? (
              <div className="relative">
                {/* 타임라인 라인 */}
                <div className="absolute left-4 top-6 bottom-6 w-px bg-slate-200" />

                <div className="space-y-3">
                  {detail.orders.map((o, idx) => (
                    <div key={o.id} className="flex gap-3 relative">
                      {/* 타임라인 점 */}
                      <div className={cn('w-8 h-8 rounded-full flex items-center justify-center shrink-0 z-10 border-2 border-white',
                        o.status === 'DELIVERED' ? 'bg-green-100' :
                        o.status === 'SHIPPED' ? 'bg-violet-100' :
                        o.status === 'CANCELLED' ? 'bg-red-100' : 'bg-blue-100')}>
                        <span className="text-[9px] font-bold text-slate-600">{idx + 1}</span>
                      </div>

                      {/* 주문 카드 */}
                      <div className="flex-1 p-3 border rounded-lg bg-white hover:bg-slate-50 transition-colors">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-mono text-xs font-bold text-slate-600">{o.order_number}</span>
                          <span className={cn('text-[9px] px-1.5 py-0.5 rounded font-medium',
                            ORDER_STATUS_COLOR[o.status])}>
                            {ORDER_STATUS_LABEL[o.status]}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold text-emerald-600">
                            {parseInt(o.total_amount).toLocaleString()}원
                          </span>
                          <div className="flex items-center gap-1 text-[10px] text-slate-400">
                            <Clock className="w-3 h-3" />
                            {new Date(o.created_at).toLocaleString('ko-KR', {
                              year: 'numeric', month: 'short', day: 'numeric',
                              hour: '2-digit', minute: '2-digit',
                            })}
                          </div>
                        </div>
                        {o.tracking_number && (
                          <p className="text-[10px] text-violet-500 mt-1">
                            {o.courier} {o.tracking_number}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-center text-slate-400 py-6 text-sm">주문 이력 없음</p>
            )}
          </div>

          {/* 메모 */}
          {selected.notes && (
            <div className="mt-6 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-xs font-medium text-amber-800">메모</p>
              <p className="text-sm text-amber-700 mt-1">{selected.notes}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
