/**
 * @fileoverview B2B 거래처 관리
 * 거래처 목록 + 거래처별 제품·수량 주문 설정
 * 밀크카페, 와인코리아 등 각 거래처의 정기 주문을 관리
 */
import { useState, useEffect, useCallback } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { apiGet, apiPost, apiPut } from '@/lib/api'
import {
  Building2, Plus, Phone, MapPin, Edit3, Save, X,
  Package, Truck, ChevronRight, Calendar, DollarSign,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const FREQ_LABEL = { DAILY: '매일', WEEKLY: '주 1회', BIWEEKLY: '격주', MONTHLY: '월 1회' }
const DELIVERY_LABEL = { MON: '월', TUE: '화', WED: '수', THU: '목', FRI: '금', SAT: '토', DAILY: '매일' }

export default function B2BPartners() {
  const [partners, setPartners] = useState([])
  const [selected, setSelected] = useState(null)
  const [detail, setDetail] = useState(null)
  const [skus, setSkus] = useState([])
  const [editingOrders, setEditingOrders] = useState(false)
  const [orderForm, setOrderForm] = useState([])
  const [b2bPrices, setB2bPrices] = useState({}) // SKU코드 → B2B 단가 매핑
  const [showAddPartner, setShowAddPartner] = useState(false)
  const [newPartner, setNewPartner] = useState({ name: '', contact_name: '', contact_phone: '', address: '', delivery_day: 'MON' })

  const fetchPartners = useCallback(async () => {
    const res = await apiGet('/market/b2b')
    if (res.success) setPartners(res.data)
  }, [])

  const fetchSKUs = useCallback(async () => {
    try {
      const res = await apiGet('/factory/skus')
      if (res.success) setSkus(res.data)
    } catch {
      setSkus([])
    }
  }, [])

  /** sku_prices에서 B2B 채널 단가를 로드 */
  const fetchB2BPrices = useCallback(async () => {
    try {
      const res = await apiGet('/settings/prices')
      if (res.success) {
        const priceMap = {}
        res.data
          .filter((p) => p.channel === 'B2B')
          .forEach((p) => { priceMap[p.sku_code] = parseInt(p.unit_price) })
        setB2bPrices(priceMap)
      }
    } catch {
      setB2bPrices({})
    }
  }, [])

  useEffect(() => { fetchPartners(); fetchSKUs(); fetchB2BPrices() }, [fetchPartners, fetchSKUs, fetchB2BPrices])

  const loadDetail = async (partner) => {
    setSelected(partner)
    setEditingOrders(false)
    const res = await apiGet(`/market/b2b/${partner.id}`)
    if (res.success) setDetail(res.data)
  }

  const addPartner = async () => {
    if (!newPartner.name) return
    const res = await apiPost('/market/b2b', newPartner)
    if (res.success) {
      setShowAddPartner(false)
      setNewPartner({ name: '', contact_name: '', contact_phone: '', address: '', delivery_day: 'MON' })
      fetchPartners()
    }
  }

  const startEditOrders = () => {
    const existing = (detail?.standing_orders || []).map((o) => ({
      sku_id: o.sku_id,
      sku_code: o.sku_code,
      sku_name: o.sku_name,
      quantity: o.quantity,
      frequency: o.frequency,
      unit_price: parseInt(o.unit_price) || 0,
      is_active: o.is_active,
    }))

    // SKU 목록에서 미등록 SKU 추가 (B2B 기본 단가 적용)
    const existingIds = new Set(existing.map((e) => e.sku_id))
    const allItems = [...existing]

    if (skus.length > 0) {
      skus.filter((s) => !existingIds.has(s.id)).forEach((s) => {
        allItems.push({
          sku_id: s.id,
          sku_code: s.code,
          sku_name: s.name,
          quantity: 0,
          frequency: 'WEEKLY',
          unit_price: b2bPrices[s.code] || 0, // sku_prices B2B 채널 단가
        })
      })
    }

    setOrderForm(allItems)
    setEditingOrders(true)
  }

  const updateOrderItem = (idx, field, value) => {
    setOrderForm((prev) => prev.map((item, i) =>
      i === idx ? { ...item, [field]: value } : item
    ))
  }

  const saveOrders = async () => {
    const items = orderForm.map((o) => ({
      sku_id: o.sku_id,
      quantity: parseInt(o.quantity) || 0,
      frequency: o.frequency,
      unit_price: parseInt(o.unit_price) || 0,
    }))

    const res = await apiPost(`/market/b2b/${selected.id}/orders`, { items })
    if (res.success) {
      setEditingOrders(false)
      loadDetail(selected)
      fetchPartners()
    }
  }

  const shipNow = async () => {
    if (!confirm('정기주문 기준으로 출하 처리하시겠습니까?')) return
    const res = await apiPost(`/market/b2b/${selected.id}/ship`, {})
    if (res.success) {
      loadDetail(selected)
    }
  }

  return (
    <div className="flex gap-6 h-[calc(100vh-7rem)]">
      {/* 좌측: 거래처 목록 */}
      <div className={cn('flex flex-col', selected ? 'hidden lg:flex lg:w-[40%]' : 'w-full')}>
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Building2 className="w-6 h-6 text-indigo-500" />
              B2B 거래처
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">거래처별 제품 주문 관리</p>
          </div>
          <Button size="sm" onClick={() => setShowAddPartner(true)}>
            <Plus className="w-4 h-4 mr-1" />
            거래처 추가
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2">
          {partners.map((p) => (
            <div key={p.id} onClick={() => loadDetail(p)}
              className={cn('p-4 rounded-xl border cursor-pointer transition-all',
                selected?.id === p.id ? 'bg-indigo-50 border-indigo-300' : 'bg-white hover:bg-slate-50 border-slate-100')}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                    <Building2 className="w-5 h-5 text-indigo-500" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{p.name}</p>
                    <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                      {p.contact_phone && <span>{p.contact_phone}</span>}
                      <span>배송: {DELIVERY_LABEL[p.delivery_day] || p.delivery_day}</span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500">{p.active_orders || 0}개 제품</p>
                  {parseInt(p.estimated_monthly) > 0 && (
                    <p className="text-[10px] text-indigo-500 font-bold">
                      ~{parseInt(p.estimated_monthly).toLocaleString()}원
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}

          {partners.length === 0 && (
            <div className="text-center text-slate-400 py-12">등록된 거래처가 없습니다</div>
          )}
        </div>
      </div>

      {/* 우측: 거래처 상세 + 주문 관리 */}
      {selected && detail && (
        <div className="w-full lg:w-[60%] lg:border-l lg:pl-6 overflow-y-auto">
          {/* 헤더 */}
          <div className="flex items-start justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 bg-indigo-100 rounded-xl flex items-center justify-center">
                <Building2 className="w-7 h-7 text-indigo-500" />
              </div>
              <div>
                <h2 className="text-xl font-bold">{detail.name}</h2>
                <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
                  {detail.contact_name && <span>{detail.contact_name}</span>}
                  <span>배송: {DELIVERY_LABEL[detail.delivery_day] || detail.delivery_day}</span>
                  <span>결제: {detail.payment_terms === 'MONTHLY' ? '월정산' : detail.payment_terms}</span>
                </div>
              </div>
            </div>
            <button onClick={() => { setSelected(null); setDetail(null) }}
              className="p-1.5 hover:bg-slate-100 rounded-lg lg:block hidden">
              <X className="w-5 h-5 text-slate-400" />
            </button>
            <button onClick={() => { setSelected(null); setDetail(null) }}
              className="lg:hidden p-2 bg-slate-100 rounded-lg text-sm font-medium text-slate-600">
              ← 목록
            </button>
          </div>

          {/* 연락처 */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            {detail.contact_phone && (
              <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg text-sm">
                <Phone className="w-4 h-4 text-slate-400" />
                {detail.contact_phone}
              </div>
            )}
            {detail.address && (
              <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg text-sm col-span-2">
                <MapPin className="w-4 h-4 text-slate-400" />
                {detail.address}
              </div>
            )}
          </div>

          {/* 정기 주문 */}
          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Package className="w-4 h-4 text-indigo-500" />
                  제품별 주문
                </CardTitle>
                <div className="flex gap-2">
                  {!editingOrders ? (
                    <>
                      <Button size="sm" variant="outline" onClick={startEditOrders}>
                        <Edit3 className="w-3 h-3 mr-1" />
                        수정
                      </Button>
                      <Button size="sm" onClick={shipNow}>
                        <Truck className="w-3 h-3 mr-1" />
                        출하
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button size="sm" onClick={saveOrders}>
                        <Save className="w-3 h-3 mr-1" />
                        저장
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingOrders(false)}>
                        취소
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {editingOrders ? (
                /* 주문 편집 모드 */
                <div className="space-y-2">
                  <div className="grid grid-cols-12 gap-2 text-[10px] text-slate-500 font-medium px-1">
                    <div className="col-span-4">제품</div>
                    <div className="col-span-2 text-center">수량</div>
                    <div className="col-span-3 text-center">주기</div>
                    <div className="col-span-3 text-center">단가(원)</div>
                  </div>
                  {orderForm.map((item, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center p-2 bg-slate-50 rounded-lg">
                      <div className="col-span-4">
                        <p className="text-xs font-medium">{item.sku_name}</p>
                        <p className="text-[9px] text-slate-400">{item.sku_code}</p>
                      </div>
                      <div className="col-span-2">
                        <Input type="number" min={0} className="h-8 text-xs text-center"
                          value={item.quantity}
                          onChange={(e) => updateOrderItem(idx, 'quantity', e.target.value)} />
                      </div>
                      <div className="col-span-3">
                        <select className="w-full h-8 text-xs border rounded-md px-2"
                          value={item.frequency}
                          onChange={(e) => updateOrderItem(idx, 'frequency', e.target.value)}>
                          {Object.entries(FREQ_LABEL).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-3">
                        <Input type="number" min={0} className="h-8 text-xs text-center"
                          value={item.unit_price}
                          onChange={(e) => updateOrderItem(idx, 'unit_price', e.target.value)} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                /* 주문 표시 모드 */
                <div className="space-y-2">
                  {(detail.standing_orders || []).filter((o) => o.is_active).map((o) => (
                    <div key={o.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                      <div className="flex items-center gap-3">
                        <span className="text-xl">
                          {o.sku_code?.startsWith('A2') ? '🥛' :
                           o.sku_code?.startsWith('YG') ? '🫙' :
                           o.sku_code === 'SI-001' ? '🍦' :
                           o.sku_code === 'KM-100' ? '🧈' : '📦'}
                        </span>
                        <div>
                          <p className="text-sm font-medium">{o.sku_name}</p>
                          <p className="text-[10px] text-slate-400">
                            {FREQ_LABEL[o.frequency]} · {parseInt(o.unit_price).toLocaleString()}원/개
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-black">{o.quantity}<span className="text-xs text-slate-400 ml-0.5">개</span></p>
                        <p className="text-[10px] text-indigo-500">
                          {(o.quantity * parseInt(o.unit_price)).toLocaleString()}원
                        </p>
                      </div>
                    </div>
                  ))}

                  {(!detail.standing_orders || detail.standing_orders.filter((o) => o.is_active).length === 0) && (
                    <div className="text-center text-slate-400 py-6">
                      <p className="text-sm">등록된 주문이 없습니다</p>
                      <Button size="sm" variant="outline" className="mt-2" onClick={startEditOrders}>
                        <Plus className="w-3 h-3 mr-1" />
                        주문 등록
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* 최근 출하 이력 */}
          {detail.recent_shipments?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Truck className="w-4 h-4 text-slate-500" />
                  최근 출하 이력
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {detail.recent_shipments.map((s) => (
                    <div key={s.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <p className="text-sm font-medium">{s.shipment_date}</p>
                        <p className="text-[10px] text-slate-400">
                          {s.items?.map((i) => `${i.sku_code}×${i.quantity}`).join(', ')}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className={cn('text-[9px] px-2 py-0.5 rounded-full font-bold',
                          s.status === 'DELIVERED' ? 'bg-green-100 text-green-700' :
                          s.status === 'SHIPPED' ? 'bg-violet-100 text-violet-700' :
                          'bg-slate-100 text-slate-600')}>
                          {s.status === 'PREPARED' ? '준비' : s.status === 'SHIPPED' ? '출하' :
                           s.status === 'DELIVERED' ? '완료' : s.status}
                        </span>
                        <p className="text-xs font-bold mt-1">
                          {parseInt(s.total_amount).toLocaleString()}원
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {detail.notes && (
            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
              {detail.notes}
            </div>
          )}
        </div>
      )}

      {/* 거래처 추가 모달 */}
      {showAddPartner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-5">
            <h3 className="text-lg font-bold mb-4">거래처 추가</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-600">거래처명 *</label>
                <Input value={newPartner.name} placeholder="예: 와인코리아"
                  onChange={(e) => setNewPartner((p) => ({ ...p, name: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-600">담당자</label>
                  <Input value={newPartner.contact_name} placeholder="담당자명"
                    onChange={(e) => setNewPartner((p) => ({ ...p, contact_name: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">전화번호</label>
                  <Input value={newPartner.contact_phone} placeholder="010-0000-0000"
                    onChange={(e) => setNewPartner((p) => ({ ...p, contact_phone: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">주소</label>
                <Input value={newPartner.address} placeholder="주소"
                  onChange={(e) => setNewPartner((p) => ({ ...p, address: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">배송 요일</label>
                <select className="w-full h-10 px-3 border rounded-md text-sm"
                  value={newPartner.delivery_day}
                  onChange={(e) => setNewPartner((p) => ({ ...p, delivery_day: e.target.value }))}>
                  {Object.entries(DELIVERY_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2 pt-2">
                <Button onClick={addPartner} className="flex-1">등록</Button>
                <Button variant="outline" onClick={() => setShowAddPartner(false)}>취소</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
