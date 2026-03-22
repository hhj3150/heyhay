/**
 * @fileoverview 주문 관리 칸반보드
 * 제3자 직원이 이 화면만 보고 주문 처리 가능하도록 설계
 * 좌→우 흐름: 대기 → 결제확인 → 처리중 → 포장완료 → 배송중 → 배송완료
 */
import { useState, useEffect, useCallback } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { apiGet, apiPut } from '@/lib/api'
import {
  Package, Truck, CheckCircle2, Clock, CreditCard,
  PackageCheck, Search, RefreshCw, AlertCircle, Phone, MapPin,
  ChevronRight, Snowflake,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const COLUMNS = [
  { status: 'PENDING', label: '주문접수', icon: Clock, color: 'border-t-slate-400', bg: 'bg-slate-50', nextStatus: 'PAID', nextLabel: '결제확인' },
  { status: 'PAID', label: '결제완료', icon: CreditCard, color: 'border-t-blue-400', bg: 'bg-blue-50', nextStatus: 'PROCESSING', nextLabel: '처리시작' },
  { status: 'PROCESSING', label: '처리중', icon: Package, color: 'border-t-amber-400', bg: 'bg-amber-50', nextStatus: 'PACKED', nextLabel: '포장완료' },
  { status: 'PACKED', label: '포장완료', icon: PackageCheck, color: 'border-t-indigo-400', bg: 'bg-indigo-50', nextStatus: 'SHIPPED', nextLabel: '발송처리' },
  { status: 'SHIPPED', label: '배송중', icon: Truck, color: 'border-t-violet-400', bg: 'bg-violet-50', nextStatus: 'DELIVERED', nextLabel: '배송완료' },
  { status: 'DELIVERED', label: '배송완료', icon: CheckCircle2, color: 'border-t-green-400', bg: 'bg-green-50' },
]

const CHANNEL_BADGE = {
  SMARTSTORE: { label: '스마트스토어', color: 'bg-green-100 text-green-700' },
  OWN_MALL: { label: '자사몰', color: 'bg-blue-100 text-blue-700' },
  B2B: { label: 'B2B', color: 'bg-slate-100 text-slate-700' },
}

export default function OrderBoard() {
  const [orders, setOrders] = useState({})
  const [stats, setStats] = useState(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [shipModal, setShipModal] = useState(null)
  const [shipForm, setShipForm] = useState({ courier: 'CJ대한통운', tracking_number: '' })

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    const grouped = {}
    COLUMNS.forEach((c) => { grouped[c.status] = [] })

    // 각 상태별 주문 병렬 조회
    const results = await Promise.all(
      COLUMNS.map((c) => apiGet(`/market/orders?status=${c.status}&limit=50`)),
    )

    results.forEach((res, idx) => {
      if (res.success) {
        grouped[COLUMNS[idx].status] = res.data
      }
    })

    setOrders(grouped)

    const statsRes = await apiGet('/market/orders/stats')
    if (statsRes.success) setStats(statsRes.data)

    setLoading(false)
  }, [])

  useEffect(() => { fetchOrders() }, [fetchOrders])

  const moveOrder = async (orderId, nextStatus, extra = {}) => {
    const payload = { status: nextStatus, ...extra }
    const res = await apiPut(`/market/orders/${orderId}`, payload)
    if (res.success) fetchOrders()
  }

  const handleShip = async () => {
    if (!shipModal) return
    await moveOrder(shipModal, 'SHIPPED', {
      courier: shipForm.courier,
      tracking_number: shipForm.tracking_number,
    })
    setShipModal(null)
    setShipForm({ courier: 'CJ대한통운', tracking_number: '' })
  }

  // 검색 필터
  const filterOrders = (list) => {
    if (!search) return list
    const s = search.toLowerCase()
    return list.filter((o) =>
      o.order_number?.toLowerCase().includes(s) ||
      o.customer_name?.toLowerCase().includes(s) ||
      o.recipient_name?.toLowerCase().includes(s),
    )
  }

  // 처리 대기 건수 (긴급)
  const urgentCount = (orders['PENDING']?.length || 0) + (orders['PAID']?.length || 0)

  return (
    <div className="space-y-4">
      {/* 상단 바 */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Package className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-500" />
            주문 관리
          </h1>
          {urgentCount > 0 && (
            <div className="flex items-center gap-1 mt-1">
              <AlertCircle className="w-4 h-4 text-red-500" />
              <span className="text-sm font-semibold text-red-600">
                처리 대기 {urgentCount}건
              </span>
            </div>
          )}
        </div>
        <div className="flex gap-2 items-center w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-none">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <Input
              placeholder="주문번호 / 고객명 검색"
              className="pl-9 w-full sm:w-64"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button variant="outline" onClick={fetchOrders} disabled={loading}>
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {/* 상단 요약 */}
      {stats && (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 sm:gap-3">
          {COLUMNS.map((col) => {
            const count = orders[col.status]?.length || 0
            return (
              <div key={col.status} className={cn('text-center p-2 rounded-lg border-t-4', col.color, col.bg)}>
                <col.icon className="w-4 h-4 mx-auto mb-1 text-slate-500" />
                <p className="text-[10px] text-slate-500 font-medium">{col.label}</p>
                <p className={cn('text-xl font-bold', count > 0 && col.status !== 'DELIVERED' ? 'text-slate-900' : 'text-slate-300')}>
                  {count}
                </p>
              </div>
            )
          })}
        </div>
      )}

      {/* 칸반 보드 */}
      <div className="flex gap-3 overflow-x-auto pb-4 snap-x snap-mandatory" style={{ minHeight: '50vh' }}>
        {COLUMNS.map((col) => {
          const colOrders = filterOrders(orders[col.status] || [])
          return (
            <div key={col.status} className="flex-shrink-0 w-64 sm:w-72 snap-start">
              <div className={cn('rounded-t-lg border-t-4 p-3 mb-2', col.color, col.bg)}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <col.icon className="w-4 h-4 text-slate-600" />
                    <span className="font-semibold text-sm">{col.label}</span>
                  </div>
                  <span className="text-xs bg-white px-2 py-0.5 rounded-full font-bold">
                    {colOrders.length}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                {colOrders.map((order) => (
                  <div key={order.id} className="bg-white rounded-lg border shadow-sm hover:shadow-md transition-shadow p-3">
                    {/* 주문번호 + 채널 */}
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono text-xs font-bold text-slate-700">{order.order_number}</span>
                      <span className={cn('text-[9px] px-1.5 py-0.5 rounded font-medium',
                        CHANNEL_BADGE[order.channel]?.color)}>
                        {CHANNEL_BADGE[order.channel]?.label}
                      </span>
                    </div>

                    {/* 고객 정보 */}
                    <div className="mb-2">
                      <p className="text-sm font-medium">{order.recipient_name || order.customer_name || '미지정'}</p>
                      {order.recipient_phone && (
                        <div className="flex items-center gap-1 text-xs text-slate-500">
                          <Phone className="w-3 h-3" />
                          {order.recipient_phone}
                        </div>
                      )}
                    </div>

                    {/* 금액 */}
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-bold text-emerald-600">
                        {parseInt(order.total_amount).toLocaleString()}원
                      </span>
                      {order.ice_pack_count > 0 && (
                        <div className="flex items-center gap-0.5 text-[10px] text-blue-500">
                          <Snowflake className="w-3 h-3" />
                          아이스팩 {order.ice_pack_count}
                        </div>
                      )}
                    </div>

                    {/* 배송 주소 (요약) */}
                    {order.shipping_address && (
                      <div className="flex items-start gap-1 text-[10px] text-slate-400 mb-2">
                        <MapPin className="w-3 h-3 mt-0.5 shrink-0" />
                        <span className="line-clamp-1">{order.shipping_address}</span>
                      </div>
                    )}

                    {/* 배송 메모 */}
                    {order.shipping_memo && (
                      <div className="text-[10px] bg-amber-50 text-amber-700 px-2 py-1 rounded mb-2 font-medium">
                        {order.shipping_memo}
                      </div>
                    )}

                    {/* 운송장 (배송중) */}
                    {order.tracking_number && (
                      <div className="text-[10px] bg-violet-50 text-violet-700 px-2 py-1 rounded mb-2">
                        {order.courier} {order.tracking_number}
                      </div>
                    )}

                    {/* 다음 단계 버튼 */}
                    {col.nextStatus && (
                      <Button
                        size="sm"
                        className="w-full text-xs h-8"
                        variant={col.status === 'PENDING' ? 'default' : 'outline'}
                        onClick={() => {
                          if (col.nextStatus === 'SHIPPED') {
                            setShipModal(order.id)
                          } else {
                            moveOrder(order.id, col.nextStatus)
                          }
                        }}
                      >
                        {col.nextLabel}
                        <ChevronRight className="w-3 h-3" />
                      </Button>
                    )}

                    {/* 날짜 */}
                    <p className="text-[9px] text-slate-300 mt-2 text-right">
                      {new Date(order.created_at).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                ))}

                {colOrders.length === 0 && (
                  <div className="text-center text-slate-300 py-8 text-xs">없음</div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* 발송 처리 모달 */}
      {shipModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-5">
            <h3 className="text-lg font-bold mb-4">발송 처리</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-600">택배사</label>
                <select className="w-full h-10 px-3 border rounded-md text-sm" value={shipForm.courier}
                  onChange={(e) => setShipForm((f) => ({ ...f, courier: e.target.value }))}>
                  <option value="CJ대한통운">CJ대한통운</option>
                  <option value="롯데택배">롯데택배</option>
                  <option value="한진택배">한진택배</option>
                  <option value="우체국">우체국</option>
                  <option value="로젠택배">로젠택배</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">운송장 번호</label>
                <Input value={shipForm.tracking_number} placeholder="운송장 번호 입력"
                  onChange={(e) => setShipForm((f) => ({ ...f, tracking_number: e.target.value }))} />
              </div>
              <div className="flex gap-2 pt-2">
                <Button onClick={handleShip} className="flex-1">발송 완료</Button>
                <Button variant="outline" onClick={() => setShipModal(null)}>취소</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
