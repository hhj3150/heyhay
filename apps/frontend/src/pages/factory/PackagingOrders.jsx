/**
 * @fileoverview 포장 자재 발주 관리 페이지
 * 발주 목록 (상태 필터) + 발주 등록 모달 + 상태 변경
 */
import { useState, useEffect, useCallback } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { apiGet, apiPost, apiPut } from '@/lib/api'
import {
  ClipboardList, Plus, X, Truck, Package, CheckCircle2,
  XCircle, Clock, ArrowRight, FileText,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/** 발주 상태 라벨·색상 */
const STATUS_CONFIG = {
  DRAFT: { label: '작성중', color: 'bg-slate-100 text-slate-600', icon: FileText },
  ORDERED: { label: '발주완료', color: 'bg-blue-100 text-blue-700', icon: ClipboardList },
  SHIPPED: { label: '배송중', color: 'bg-amber-100 text-amber-700', icon: Truck },
  RECEIVED: { label: '입고완료', color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
  CANCELLED: { label: '취소', color: 'bg-red-100 text-red-600', icon: XCircle },
}

/** 상태 전이 가능한 다음 상태 */
const NEXT_STATUS = {
  DRAFT: ['ORDERED', 'CANCELLED'],
  ORDERED: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['RECEIVED', 'CANCELLED'],
  RECEIVED: [],
  CANCELLED: [],
}

/** 카테고리 한글 라벨 */
const CATEGORY_LABEL = {
  PET_BOTTLE: '페트병', CUP: '컵', LID: '뚜껑', CAP: '캡',
  LABEL: '라벨', BOX: '박스', ICE_PACK: '아이스팩', TAPE: '테이프', OTHER: '기타',
}

/** 상태 필터 탭 */
const STATUS_TABS = [
  { key: 'ALL', label: '전체' },
  { key: 'DRAFT', label: '작성중' },
  { key: 'ORDERED', label: '발주완료' },
  { key: 'SHIPPED', label: '배송중' },
  { key: 'RECEIVED', label: '입고완료' },
]

export default function PackagingOrders() {
  const [orders, setOrders] = useState([])
  const [materials, setMaterials] = useState([])
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [showCreate, setShowCreate] = useState(false)
  const [showReceive, setShowReceive] = useState(null)
  const [receiveQty, setReceiveQty] = useState('')
  const [createForm, setCreateForm] = useState({
    material_id: '', order_qty: '', unit_cost: 0,
    supplier_name: '', expected_at: '', notes: '',
  })

  const fetchOrders = useCallback(async () => {
    const params = statusFilter !== 'ALL' ? `?status=${statusFilter}` : ''
    const res = await apiGet(`/packaging/orders${params}`)
    if (res.success) setOrders(res.data)
  }, [statusFilter])

  const fetchMaterials = useCallback(async () => {
    const res = await apiGet('/packaging/materials')
    if (res.success) setMaterials(res.data)
  }, [])

  useEffect(() => { fetchOrders() }, [fetchOrders])
  useEffect(() => { fetchMaterials() }, [fetchMaterials])

  // 자재 선택 시 공급업체 자동 채움
  const onMaterialSelect = (materialId) => {
    const mat = materials.find((m) => m.id === materialId)
    setCreateForm({
      ...createForm,
      material_id: materialId,
      supplier_name: mat?.supplier_name || '',
      unit_cost: mat?.unit_cost || 0,
    })
  }

  // 발주 등록
  const handleCreate = async () => {
    if (!createForm.material_id || !createForm.order_qty) return
    const res = await apiPost('/packaging/orders', {
      material_id: createForm.material_id,
      order_qty: parseInt(createForm.order_qty),
      unit_cost: parseInt(createForm.unit_cost) || 0,
      supplier_name: createForm.supplier_name || undefined,
      expected_at: createForm.expected_at || undefined,
      notes: createForm.notes || undefined,
    })
    if (res.success) {
      setShowCreate(false)
      setCreateForm({
        material_id: '', order_qty: '', unit_cost: 0,
        supplier_name: '', expected_at: '', notes: '',
      })
      fetchOrders()
    }
  }

  // 상태 변경
  const changeStatus = async (orderId, newStatus) => {
    const body = { status: newStatus }

    // RECEIVED 시 입고수량 포함
    if (newStatus === 'RECEIVED' && showReceive === orderId) {
      body.received_qty = parseInt(receiveQty) || undefined
      setShowReceive(null)
      setReceiveQty('')
    }

    const res = await apiPut(`/packaging/orders/${orderId}`, body)
    if (res.success) fetchOrders()
  }

  // RECEIVED 버튼 클릭 시 수량 입력 토글
  const handleReceiveClick = (orderId, orderQty) => {
    if (showReceive === orderId) {
      // 이미 열린 상태면 입고 처리
      changeStatus(orderId, 'RECEIVED')
    } else {
      setShowReceive(orderId)
      setReceiveQty(String(orderQty))
    }
  }

  /** 날짜 포매팅 */
  const formatDate = (dateStr) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString('ko-KR', {
      month: 'short', day: 'numeric',
    })
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">발주 관리</h1>
          <p className="text-sm text-slate-500 mt-1">포장 자재 발주 등록 및 상태 관리</p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4 mr-1" /> 발주 등록
        </Button>
      </div>

      {/* 상태 필터 탭 */}
      <div className="flex gap-2 border-b pb-2">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setStatusFilter(tab.key)}
            className={cn(
              'px-4 py-2 text-sm font-medium rounded-t-lg transition-colors',
              statusFilter === tab.key
                ? 'bg-white border border-b-0 border-slate-200 text-slate-900'
                : 'text-slate-500 hover:text-slate-700',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 발주 목록 */}
      <div className="space-y-3">
        {orders.length === 0 && (
          <div className="text-center py-12 text-slate-400">
            <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>발주 내역이 없습니다</p>
          </div>
        )}
        {orders.map((order) => {
          const statusCfg = STATUS_CONFIG[order.status]
          const StatusIcon = statusCfg.icon
          const nextStatuses = NEXT_STATUS[order.status]

          return (
            <Card key={order.id}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start justify-between gap-4">
                  {/* 자재 정보 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium', statusCfg.color)}>
                        <StatusIcon className="w-3 h-3 inline mr-0.5" />
                        {statusCfg.label}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                        {CATEGORY_LABEL[order.category]}
                      </span>
                    </div>
                    <p className="font-semibold text-sm">{order.material_name}</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-slate-500">
                      <span>발주수량: <strong className="text-slate-700">{order.order_qty?.toLocaleString()}{order.unit}</strong></span>
                      {order.unit_cost > 0 && (
                        <span>단가: {order.unit_cost?.toLocaleString()}원</span>
                      )}
                      {order.total_cost > 0 && (
                        <span>합계: <strong className="text-slate-700">{order.total_cost?.toLocaleString()}원</strong></span>
                      )}
                      {order.supplier_name && <span>공급: {order.supplier_name}</span>}
                    </div>
                    <div className="flex flex-wrap gap-x-4 mt-1 text-xs text-slate-400">
                      {order.ordered_at && <span>발주일: {formatDate(order.ordered_at)}</span>}
                      {order.expected_at && <span>입고예정: {formatDate(order.expected_at)}</span>}
                      {order.received_at && <span>입고일: {formatDate(order.received_at)}</span>}
                      {order.received_qty != null && <span>입고수량: {order.received_qty?.toLocaleString()}</span>}
                    </div>
                    {order.notes && <p className="text-xs text-slate-400 mt-1">메모: {order.notes}</p>}
                  </div>

                  {/* 상태 변경 버튼 */}
                  <div className="flex flex-col gap-1 shrink-0">
                    {nextStatuses.map((ns) => {
                      const nsCfg = STATUS_CONFIG[ns]
                      if (ns === 'RECEIVED') {
                        return (
                          <div key={ns} className="flex flex-col gap-1">
                            {showReceive === order.id && (
                              <Input
                                type="number"
                                value={receiveQty}
                                onChange={(e) => setReceiveQty(e.target.value)}
                                placeholder="입고수량"
                                className="h-7 text-xs w-24"
                              />
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={() => handleReceiveClick(order.id, order.order_qty)}
                            >
                              <CheckCircle2 className="w-3 h-3 mr-1" />
                              {showReceive === order.id ? '입고 확인' : '입고완료'}
                            </Button>
                          </div>
                        )
                      }
                      return (
                        <Button
                          key={ns}
                          size="sm"
                          variant={ns === 'CANCELLED' ? 'destructive' : 'outline'}
                          className="h-7 text-xs"
                          onClick={() => changeStatus(order.id, ns)}
                        >
                          <ArrowRight className="w-3 h-3 mr-1" />
                          {nsCfg.label}
                        </Button>
                      )
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* 발주 등록 모달 */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-lg">발주 등록</h2>
              <button onClick={() => setShowCreate(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-600 font-medium">자재 선택</label>
                <select
                  value={createForm.material_id}
                  onChange={(e) => onMaterialSelect(e.target.value)}
                  className="w-full h-9 border rounded-md px-3 text-sm"
                >
                  <option value="">선택하세요</option>
                  {materials.map((m) => (
                    <option key={m.id} value={m.id}>
                      [{CATEGORY_LABEL[m.category]}] {m.name} (재고: {m.current_stock})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-600 font-medium">발주 수량</label>
                  <Input
                    type="number"
                    value={createForm.order_qty}
                    onChange={(e) => setCreateForm({ ...createForm, order_qty: e.target.value })}
                    placeholder="수량"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-600 font-medium">단가 (원)</label>
                  <Input
                    type="number"
                    value={createForm.unit_cost}
                    onChange={(e) => setCreateForm({ ...createForm, unit_cost: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-600 font-medium">공급업체</label>
                <Input
                  value={createForm.supplier_name}
                  onChange={(e) => setCreateForm({ ...createForm, supplier_name: e.target.value })}
                  placeholder="업체명"
                />
              </div>
              <div>
                <label className="text-xs text-slate-600 font-medium">입고 예정일</label>
                <Input
                  type="date"
                  value={createForm.expected_at}
                  onChange={(e) => setCreateForm({ ...createForm, expected_at: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs text-slate-600 font-medium">메모</label>
                <Input
                  value={createForm.notes}
                  onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
                  placeholder="비고"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowCreate(false)}>취소</Button>
              <Button onClick={handleCreate}>발주 등록</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
