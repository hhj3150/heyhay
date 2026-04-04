/**
 * @fileoverview 재고 현황 페이지
 * SKU별 재고 + 안전재고 알림 + 재고 이동(출고) + 소비기한 경고
 */
import { useState, useEffect, useCallback } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { apiGet, apiPost } from '@/lib/api'
import { formatDate, formatDday } from '@/lib/date'
import {
  Package, AlertTriangle, ArrowRightLeft, RefreshCw,
  ChevronDown, ChevronUp, TrendingDown, Clock,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/** 재고 이동 유형 */
const MOVE_TYPES = [
  { value: 'SALE', label: '판매 출고' },
  { value: 'CAFE_OUT', label: '카페 출고' },
  { value: 'B2B_OUT', label: 'B2B 출고' },
  { value: 'DISCARD', label: '폐기' },
  { value: 'ADJUSTMENT', label: '재고 조정' },
]

export default function InventoryPage() {
  const [inventory, setInventory] = useState([])
  const [alerts, setAlerts] = useState([])
  const [skus, setSkus] = useState([])
  const [loading, setLoading] = useState(true)
  const [showMoveForm, setShowMoveForm] = useState(false)
  const [moveForm, setMoveForm] = useState({
    sku_id: '', movement_type: 'SALE', quantity: '', reason: '',
  })
  const [saving, setSaving] = useState(false)
  const [expandedSku, setExpandedSku] = useState(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [invRes, alertRes, skuRes] = await Promise.all([
        apiGet('/factory/inventory'),
        apiGet('/factory/inventory/alerts'),
        apiGet('/factory/skus'),
      ])
      if (invRes.success) setInventory(invRes.data)
      if (alertRes.success) setAlerts(alertRes.data)
      if (skuRes.success) setSkus(skuRes.data)
    } catch (err) {
      // 조회 실패 시 빈 상태 유지
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  /** 재고 이동 실행 */
  const handleMove = async () => {
    if (!moveForm.sku_id || !moveForm.quantity) return
    setSaving(true)
    try {
      const res = await apiPost('/factory/inventory/move', {
        sku_id: moveForm.sku_id,
        movement_type: moveForm.movement_type,
        quantity: parseInt(moveForm.quantity, 10),
        reason: moveForm.reason || undefined,
      })
      if (res.success) {
        setShowMoveForm(false)
        setMoveForm({ sku_id: '', movement_type: 'SALE', quantity: '', reason: '' })
        await fetchData()
      }
    } finally {
      setSaving(false)
    }
  }

  /** 소비기한 D-day 색상 */
  const expiryColor = (dateStr) => {
    if (!dateStr) return ''
    const diff = Math.ceil((new Date(dateStr) - new Date()) / 86400000)
    if (diff <= 1) return 'text-red-500 font-bold'
    if (diff <= 3) return 'text-amber-500 font-semibold'
    return 'text-slate-500'
  }

  /** SKU 행 펼침/접기 */
  const toggleExpand = (skuId) => {
    setExpandedSku(expandedSku === skuId ? null : skuId)
  }

  // 총 재고량 집계
  const totalQty = inventory.reduce((sum, item) => sum + parseInt(item.total_qty || 0, 10), 0)
  const alertCount = alerts.length

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="h-8 w-48 bg-slate-200 rounded animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 bg-slate-200 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="h-64 bg-slate-200 rounded-xl animate-pulse" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
            <Package className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">재고 현황</h1>
            <p className="text-sm text-slate-500">완제품 SKU별 재고·소비기한·출고</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="w-4 h-4 mr-1" />새로고침
          </Button>
          <Button variant="factory" size="sm" onClick={() => setShowMoveForm(!showMoveForm)}>
            <ArrowRightLeft className="w-4 h-4 mr-1" />재고 이동
          </Button>
        </div>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">총 재고량</p>
                <p className="text-2xl font-bold text-slate-900">{totalQty.toLocaleString()}<span className="text-sm font-normal text-slate-400 ml-1">개</span></p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
                <Package className="w-5 h-5 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">SKU 종류</p>
                <p className="text-2xl font-bold text-slate-900">{inventory.length}<span className="text-sm font-normal text-slate-400 ml-1">종</span></p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center">
                <Package className="w-5 h-5 text-emerald-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={alertCount > 0 ? 'ring-1 ring-red-200' : ''}>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">안전재고 미달</p>
                <p className={cn('text-2xl font-bold', alertCount > 0 ? 'text-red-600' : 'text-slate-900')}>
                  {alertCount}<span className="text-sm font-normal text-slate-400 ml-1">건</span>
                </p>
              </div>
              <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', alertCount > 0 ? 'bg-red-50' : 'bg-slate-50')}>
                <AlertTriangle className={cn('w-5 h-5', alertCount > 0 ? 'text-red-500' : 'text-slate-400')} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 안전재고 미달 알림 */}
      {alerts.length > 0 && (
        <Card className="border-red-200 bg-red-50/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-red-700 flex items-center gap-2">
              <TrendingDown className="w-4 h-4" />안전재고 미달 품목
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {alerts.map((a, idx) => (
                <div key={idx} className="flex items-center justify-between px-3 py-2 bg-white rounded-lg border border-red-100">
                  <div>
                    <span className="font-medium text-sm text-slate-900">{a.name}</span>
                    <span className="text-xs text-slate-500 ml-2">{a.code}</span>
                    {a.channel && <span className="text-xs text-red-500 ml-2">{a.channel}</span>}
                  </div>
                  <div className="text-sm">
                    <span className="text-red-600 font-semibold">{parseInt(a.current_qty).toLocaleString()}</span>
                    <span className="text-slate-400 mx-1">/</span>
                    <span className="text-slate-500">{parseInt(a.min_quantity).toLocaleString()}</span>
                    <span className="text-xs text-red-500 ml-2">({parseInt(a.shortage)}개 부족)</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 재고 이동 폼 */}
      {showMoveForm && (
        <Card className="border-blue-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ArrowRightLeft className="w-4 h-4 text-blue-500" />재고 이동 (출고)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">SKU</label>
                <select
                  className="w-full h-9 rounded-md border border-slate-300 px-3 text-sm"
                  value={moveForm.sku_id}
                  onChange={(e) => setMoveForm({ ...moveForm, sku_id: e.target.value })}
                >
                  <option value="">선택</option>
                  {inventory.map((item) => (
                    <option key={item.sku_id} value={item.sku_id}>
                      {item.code} — {item.name} (재고: {parseInt(item.total_qty).toLocaleString()})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">이동 유형</label>
                <select
                  className="w-full h-9 rounded-md border border-slate-300 px-3 text-sm"
                  value={moveForm.movement_type}
                  onChange={(e) => setMoveForm({ ...moveForm, movement_type: e.target.value })}
                >
                  {MOVE_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">수량</label>
                <Input
                  type="number"
                  placeholder="0"
                  min="1"
                  value={moveForm.quantity}
                  onChange={(e) => setMoveForm({ ...moveForm, quantity: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">사유</label>
                <Input
                  placeholder="사유 (선택)"
                  value={moveForm.reason}
                  onChange={(e) => setMoveForm({ ...moveForm, reason: e.target.value })}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-3">
              <Button variant="outline" size="sm" onClick={() => setShowMoveForm(false)}>취소</Button>
              <Button variant="factory" size="sm" onClick={handleMove} disabled={saving || !moveForm.sku_id || !moveForm.quantity}>
                {saving ? '처리중...' : '이동 실행'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* SKU별 재고 테이블 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">SKU별 재고 현황</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="text-left px-4 py-3 font-medium text-slate-500">SKU</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500">제품명</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-500">공장 재고</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-500">카페 재고</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-500">총 재고</th>
                  <th className="text-center px-4 py-3 font-medium text-slate-500">소비기한</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {inventory.map((item) => {
                  const totalQty = parseInt(item.total_qty || 0, 10)
                  const factoryQty = parseInt(item.factory_qty || 0, 10)
                  const cafeQty = parseInt(item.cafe_qty || 0, 10)
                  const isExpanded = expandedSku === item.sku_id

                  return (
                    <tr
                      key={item.sku_id}
                      className={cn(
                        'border-b border-slate-50 hover:bg-slate-50/50 cursor-pointer transition-colors',
                        totalQty === 0 && 'opacity-50',
                      )}
                      onClick={() => toggleExpand(item.sku_id)}
                    >
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded">{item.code}</span>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">{item.name}</td>
                      <td className="px-4 py-3 text-right font-mono">{factoryQty.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right font-mono">{cafeQty.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={cn('font-bold font-mono', totalQty === 0 ? 'text-red-500' : 'text-slate-900')}>
                          {totalQty.toLocaleString()}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {item.earliest_expiry ? (
                          <span className={cn('text-xs', expiryColor(item.earliest_expiry))}>
                            <Clock className="w-3 h-3 inline mr-1" />
                            {formatDday(item.earliest_expiry)}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-300">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {isExpanded
                          ? <ChevronUp className="w-4 h-4 text-slate-400" />
                          : <ChevronDown className="w-4 h-4 text-slate-400" />}
                      </td>
                    </tr>
                  )
                })}
                {inventory.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                      등록된 재고가 없습니다
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
