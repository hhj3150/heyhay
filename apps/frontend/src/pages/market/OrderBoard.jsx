/**
 * @fileoverview 주문 관리 칸반보드
 * 제3자 직원이 이 화면만 보고 주문 처리 가능하도록 설계
 * 좌→우 흐름: 대기 → 결제확인 → 처리중 → 포장완료 → 배송중 → 배송완료
 */
import { useState, useEffect, useCallback } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { apiGet, apiPut, apiPost } from '@/lib/api'
import {
  Package, Truck, CheckCircle2, Clock, CreditCard,
  PackageCheck, Search, RefreshCw, AlertCircle, Phone, MapPin,
  ChevronRight, Snowflake, Plus, X, Trash2,
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
  PHONE: { label: '전화주문', color: 'bg-orange-100 text-orange-700' },
  KAKAO: { label: '카톡주문', color: 'bg-yellow-100 text-yellow-700' },
  VISIT: { label: '방문주문', color: 'bg-pink-100 text-pink-700' },
  FACTORY_DIRECT: { label: '공장직판', color: 'bg-cyan-100 text-cyan-700' },
  SAMPLE: { label: '무료샘플', color: 'bg-rose-100 text-rose-700' },
  OFFLINE: { label: '오프라인', color: 'bg-purple-100 text-purple-700' },
}

const EMPTY_OFFLINE_ORDER = {
  channel: 'PHONE',
  recipient_name: '',
  recipient_phone: '',
  shipping_zip: '',
  shipping_address: '',
  shipping_memo: '',
  items: [{ sku_id: '', quantity: 1, unit_price: 0 }],
  payment_method: '계좌이체',
  paid: false,
}

export default function OrderBoard() {
  const [orders, setOrders] = useState({})
  const [stats, setStats] = useState(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [shipModal, setShipModal] = useState(null)
  const [shipForm, setShipForm] = useState({ courier: 'CJ대한통운', tracking_number: '' })
  const [newOrderModal, setNewOrderModal] = useState(false)
  const [newOrder, setNewOrder] = useState({ ...EMPTY_OFFLINE_ORDER })
  const [skuList, setSkuList] = useState([])

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

    // SKU 목록 조회
    const skuRes = await apiGet('/factory/skus')
    if (skuRes.success) setSkuList(skuRes.data)

    setLoading(false)
  }, [])

  useEffect(() => { fetchOrders() }, [fetchOrders])

  // 오프라인 주문 등록
  const submitOfflineOrder = async () => {
    const o = newOrder
    if (!o.recipient_name || !o.recipient_phone) return

    const validItems = o.items.filter((i) => i.sku_id && i.quantity > 0)
    if (validItems.length === 0) return

    const res = await apiPost('/market/orders', {
      channel: o.channel,
      items: validItems.map((i) => ({
        sku_id: i.sku_id,
        quantity: parseInt(i.quantity),
        unit_price: parseInt(i.unit_price),
      })),
      recipient_name: o.recipient_name,
      recipient_phone: o.recipient_phone,
      shipping_zip: o.shipping_zip,
      shipping_address: o.shipping_address,
      shipping_memo: o.shipping_memo,
    })

    if (res.success) {
      const orderId = res.data?.id
      if (orderId) {
        if (o.channel === 'FACTORY_DIRECT' || o.channel === 'SAMPLE') {
          // 공장직판/무료샘플: 즉시 배송완료 처리
          const label = o.channel === 'SAMPLE' ? '무료샘플' : '현장수령'
          await apiPut(`/market/orders/${orderId}`, { status: 'PAID' })
          await apiPut(`/market/orders/${orderId}`, { status: 'PROCESSING' })
          await apiPut(`/market/orders/${orderId}`, { status: 'PACKED' })
          await apiPut(`/market/orders/${orderId}`, { status: 'SHIPPED', courier: label, tracking_number: label })
          await apiPut(`/market/orders/${orderId}`, { status: 'DELIVERED' })
        } else if (o.paid) {
          // 결제 완료 체크됐으면 PAID로
          await apiPut(`/market/orders/${orderId}`, { status: 'PAID' })
        }
      }
      setNewOrderModal(false)
      setNewOrder({ ...EMPTY_OFFLINE_ORDER })
      fetchOrders()
    }
  }

  const updateNewOrderItem = (idx, key, value) => {
    setNewOrder((prev) => ({
      ...prev,
      items: prev.items.map((item, i) => i === idx ? { ...item, [key]: value } : item),
    }))
  }

  const addNewOrderItem = () => {
    setNewOrder((prev) => ({
      ...prev,
      items: [...prev.items, { sku_id: '', quantity: 1, unit_price: 0 }],
    }))
  }

  const removeNewOrderItem = (idx) => {
    setNewOrder((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== idx),
    }))
  }

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
          <Button onClick={() => setNewOrderModal(true)} className="bg-emerald-500 hover:bg-emerald-600 shrink-0">
            <Plus className="w-4 h-4" /> 주문등록
          </Button>
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

      {/* 오프라인 주문 등록 모달 */}
      {newOrderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto mx-4">
            <div className="flex items-center justify-between p-5 border-b">
              <h3 className="text-lg font-bold">주문 등록</h3>
              <button onClick={() => { setNewOrderModal(false); setNewOrder({ ...EMPTY_OFFLINE_ORDER }) }}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {/* 주문 채널 */}
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1.5 block">주문 경로</label>
                <div className="flex gap-2 flex-wrap">
                  {[
                    { value: 'FACTORY_DIRECT', label: '🏭 공장직판', color: 'bg-cyan-100 text-cyan-700 border-cyan-300' },
                    { value: 'SAMPLE', label: '🎁 무료샘플', color: 'bg-rose-100 text-rose-700 border-rose-300' },
                    { value: 'PHONE', label: '📞 전화', color: 'bg-orange-100 text-orange-700 border-orange-300' },
                    { value: 'KAKAO', label: '💬 카톡', color: 'bg-yellow-100 text-yellow-700 border-yellow-300' },
                    { value: 'VISIT', label: '🏠 방문', color: 'bg-pink-100 text-pink-700 border-pink-300' },
                    { value: 'B2B', label: '🏢 B2B', color: 'bg-slate-100 text-slate-700 border-slate-300' },
                    { value: 'SMARTSTORE', label: '🟢 스마트스토어', color: 'bg-green-100 text-green-700 border-green-300' },
                  ].map((ch) => (
                    <button key={ch.value}
                      onClick={() => setNewOrder((o) => ({ ...o, channel: ch.value }))}
                      className={cn('px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
                        newOrder.channel === ch.value ? `${ch.color} ring-2 ring-offset-1` : 'bg-white text-slate-400 border-slate-200')}>
                      {ch.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 고객 정보 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600">받는분 *</label>
                  <Input placeholder="이름" value={newOrder.recipient_name}
                    onChange={(e) => setNewOrder((o) => ({ ...o, recipient_name: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600">연락처 *</label>
                  <Input placeholder="010-0000-0000" value={newOrder.recipient_phone}
                    onChange={(e) => setNewOrder((o) => ({ ...o, recipient_phone: e.target.value }))} />
                </div>
              </div>

              {/* 공장직판 안내 */}
              {newOrder.channel === 'FACTORY_DIRECT' && (
                <div className="bg-cyan-50 border border-cyan-200 rounded-lg p-3 text-sm text-cyan-700">
                  🏭 현장 판매 — 등록 즉시 <strong>배송완료</strong> 처리됩니다
                </div>
              )}

              {/* 무료샘플 안내 */}
              {newOrder.channel === 'SAMPLE' && (
                <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 text-sm text-rose-700">
                  🎁 무료 샘플 — 단가 0원 자동 적용, 재고에서 차감됩니다
                </div>
              )}

              {/* 배송 주소 (공장직판이 아닐 때만) */}
              {newOrder.channel !== 'FACTORY_DIRECT' && (
                <>
                  <div>
                    <label className="text-xs font-semibold text-slate-600">배송 주소</label>
                    <Input placeholder="주소 입력" value={newOrder.shipping_address}
                      onChange={(e) => setNewOrder((o) => ({ ...o, shipping_address: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600">배송 메모</label>
                    <Input placeholder="부재시 경비실 / 벨 누르지 마세요 등" value={newOrder.shipping_memo}
                      onChange={(e) => setNewOrder((o) => ({ ...o, shipping_memo: e.target.value }))} />
                  </div>
                </>
              )}

              {/* 주문 상품 */}
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1.5 block">주문 상품 *</label>
                <div className="space-y-2">
                  {newOrder.items.map((item, idx) => (
                    <div key={idx} className="flex gap-2 items-end bg-slate-50 p-2.5 rounded-lg">
                      <div className="flex-1">
                        <select className="w-full h-9 px-2 border rounded text-sm" value={item.sku_id}
                          onChange={(e) => {
                            const sku = skuList.find((s) => s.id === e.target.value)
                            updateNewOrderItem(idx, 'sku_id', e.target.value)
                            if (sku) updateNewOrderItem(idx, 'unit_price', newOrder.channel === 'SAMPLE' ? 0 : (sku.default_price || 0))
                          }}>
                          <option value="">제품 선택</option>
                          {skuList.map((s) => (
                            <option key={s.id} value={s.id}>{s.code} — {s.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="w-20">
                        <Input type="number" min="1" className="h-9 text-center" placeholder="수량"
                          value={item.quantity}
                          onChange={(e) => updateNewOrderItem(idx, 'quantity', e.target.value)} />
                      </div>
                      <div className="w-24">
                        <Input type="number" className="h-9 text-right" placeholder="단가"
                          value={item.unit_price}
                          onChange={(e) => updateNewOrderItem(idx, 'unit_price', e.target.value)} />
                      </div>
                      {newOrder.items.length > 1 && (
                        <button onClick={() => removeNewOrderItem(idx)} className="p-1 hover:bg-red-50 rounded">
                          <Trash2 className="w-4 h-4 text-red-400" />
                        </button>
                      )}
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={addNewOrderItem} className="w-full">
                    <Plus className="w-3 h-3" /> 상품 추가
                  </Button>
                </div>
              </div>

              {/* 합계 */}
              <div className="bg-slate-50 p-3 rounded-lg">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">상품 합계</span>
                  <span className="font-bold text-lg">
                    {newOrder.items.reduce((sum, i) => sum + (parseInt(i.quantity) || 0) * (parseInt(i.unit_price) || 0), 0).toLocaleString()}원
                  </span>
                </div>
              </div>

              {/* 결제 확인 */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 rounded" checked={newOrder.paid}
                  onChange={(e) => setNewOrder((o) => ({ ...o, paid: e.target.checked }))} />
                <span className="text-sm font-medium text-slate-700">결제 완료됨 (계좌이체/현금 등)</span>
              </label>

              {/* 버튼 */}
              <div className="flex gap-2 pt-2">
                <Button onClick={submitOfflineOrder} className="flex-1 bg-emerald-500 hover:bg-emerald-600">
                  주문 등록
                </Button>
                <Button variant="outline" onClick={() => { setNewOrderModal(false); setNewOrder({ ...EMPTY_OFFLINE_ORDER }) }}>
                  취소
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 발송 처리 모달 */}
      {shipModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-5">
            <h3 className="text-lg font-bold mb-4">배송 방법</h3>
            <div className="space-y-3">
              {/* 배송 방법 선택 */}
              <div className="flex gap-2">
                <button
                  onClick={() => setShipForm((f) => ({ ...f, courier: '직접배달', tracking_number: '직접배달' }))}
                  className={cn('flex-1 p-3 rounded-lg border-2 text-center transition-all',
                    shipForm.courier === '직접배달'
                      ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
                      : 'border-slate-200 hover:bg-slate-50')}>
                  <span className="text-lg">🚗</span>
                  <p className="text-xs font-medium mt-1">직접 배달</p>
                </button>
                <button
                  onClick={() => setShipForm((f) => ({ ...f, courier: 'CJ대한통운', tracking_number: '' }))}
                  className={cn('flex-1 p-3 rounded-lg border-2 text-center transition-all',
                    shipForm.courier !== '직접배달'
                      ? 'border-blue-400 bg-blue-50 text-blue-700'
                      : 'border-slate-200 hover:bg-slate-50')}>
                  <span className="text-lg">📦</span>
                  <p className="text-xs font-medium mt-1">택배 발송</p>
                </button>
              </div>

              {/* 택배 선택 시에만 표시 */}
              {shipForm.courier !== '직접배달' && (
                <>
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
                </>
              )}

              <div className="flex gap-2 pt-2">
                <Button onClick={handleShip} className="flex-1">
                  {shipForm.courier === '직접배달' ? '🚗 직접 배달 완료' : '📦 발송 완료'}
                </Button>
                <Button variant="outline" onClick={() => setShipModal(null)}>취소</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
