/**
 * @fileoverview 일일 공장 운영 — 단일 페이지 통합
 * 사용자 입력 3가지: 공장 입고량 / 생산량 / 출하량
 * 자동 산출: 진흥회 / 표준환산 / 로스 / 재고 / 정산 / 알림
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { apiGet, apiPost } from '@/lib/api'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  Calendar, Milk, Factory, Truck, Lock, Unlock, Plus,
  AlertTriangle, CheckCircle2, RefreshCw, Boxes,
} from 'lucide-react'

const todayKst = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })

const fmt = (n, suffix = '') => {
  if (n === null || n === undefined) return '—'
  const num = typeof n === 'string' ? parseFloat(n) : n
  if (Number.isNaN(num)) return '—'
  return `${num.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}${suffix}`
}

const fmtMoney = (n) => {
  if (n === null || n === undefined) return '—'
  return `₩${Math.round(typeof n === 'string' ? parseFloat(n) : n).toLocaleString('ko-KR')}`
}

const CHANNELS = [
  { value: 'B2B', label: 'B2B 거래처' },
  { value: 'SMARTSTORE', label: '스마트스토어' },
  { value: 'OWN_MALL', label: '자사몰' },
  { value: 'CAFE', label: '밀크카페' },
  { value: 'SUBSCRIPTION', label: '정기구독' },
]

export default function DailyOpsPage() {
  const [date, setDate] = useState(todayKst)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [intakeInput, setIntakeInput] = useState('')
  const [partners, setPartners] = useState([])
  const [openOrders, setOpenOrders] = useState([])

  /** 데이터 로드 */
  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [opsRes, partnersRes, ordersRes] = await Promise.all([
      apiGet(`/factory/daily-ops/${date}`),
      apiGet('/market/b2b').catch(() => ({ success: false })),
      apiGet('/market/orders?status=PENDING').catch(() => ({ success: false })),
    ])
    if (opsRes.success) {
      setData(opsRes.data)
      setIntakeInput(opsRes.data.ops?.factory_intake_l ?? '')
    }
    if (partnersRes.success) setPartners(partnersRes.data || [])
    if (ordersRes.success) setOpenOrders(ordersRes.data?.items || [])
    setLoading(false)
  }, [date])

  useEffect(() => { fetchAll() }, [fetchAll])

  const isClosed = !!data?.ops?.is_closed
  const lossPct = data?.derived?.loss_pct ?? 0

  /** 공장 입고량 저장 */
  const saveIntake = async () => {
    if (!intakeInput || isNaN(parseFloat(intakeInput))) {
      toast.error('숫자를 입력하세요')
      return
    }
    setSaving(true)
    const res = await apiPost(`/factory/daily-ops/${date}`, {
      factory_intake_l: parseFloat(intakeInput),
    })
    setSaving(false)
    if (res.success) {
      toast.success('공장 입고량 저장됨')
      fetchAll()
    } else {
      toast.error(res.error?.message || '저장 실패')
    }
  }

  /** 일일 마감 */
  const handleClose = async () => {
    if (!confirm(`${date} 일자를 마감하시겠습니까?\n진흥회 납유 기록이 자동 생성됩니다.`)) return
    setSaving(true)
    const res = await apiPost(`/factory/daily-ops/${date}/close`, {})
    setSaving(false)
    if (res.success) {
      toast.success('마감 완료')
      fetchAll()
    } else {
      toast.error(res.error?.message || '마감 실패')
    }
  }

  /** 마감 해제 */
  const handleReopen = async () => {
    if (!confirm(`${date} 마감을 해제하시겠습니까?`)) return
    setSaving(true)
    const res = await apiPost(`/factory/daily-ops/${date}/reopen`, {})
    setSaving(false)
    if (res.success) {
      toast.success('마감 해제됨')
      fetchAll()
    } else {
      toast.error(res.error?.message || '해제 실패')
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-slate-400">로딩 중…</div>
  }
  if (!data) {
    return <div className="flex items-center justify-center h-64 text-red-400">데이터를 불러올 수 없습니다</div>
  }

  const ops = data.ops || {}

  return (
    <div className="space-y-4 max-w-5xl mx-auto pb-24">
      {/* 헤더 */}
      <div className="flex items-center gap-2 flex-wrap">
        <Calendar className="w-5 h-5 text-blue-500" />
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="px-3 py-1.5 border rounded-lg text-sm"
        />
        <h1 className="text-lg sm:text-xl font-black text-slate-900">일일 운영</h1>
        {isClosed
          ? <span className="ml-auto px-2 py-0.5 bg-slate-200 text-slate-700 text-xs rounded-full flex items-center gap-1"><Lock className="w-3 h-3" />마감됨</span>
          : <span className="ml-auto px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full flex items-center gap-1"><Unlock className="w-3 h-3" />작업 중</span>
        }
        <button onClick={fetchAll} className="p-1.5 text-slate-400 hover:text-slate-600">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* 알림 */}
      {data.alerts?.length > 0 && (
        <div className="space-y-2">
          {data.alerts.map((a, i) => (
            <div key={i} className={cn(
              'p-3 rounded-lg border-l-4 flex items-start gap-2',
              a.priority === 'P1' ? 'bg-red-50 border-red-500 text-red-800' : 'bg-amber-50 border-amber-500 text-amber-800',
            )}>
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-bold">{a.priority} · {a.code}</p>
                <p className="text-sm">{a.message}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 핵심 KPI */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Kpi icon={Milk} label="송영신 착유" value={fmt(ops.milking_total_l, 'L')} color="text-emerald-600 bg-emerald-50" />
        <Kpi icon={Factory} label="공장 입고" value={fmt(ops.factory_intake_l, 'L')} color="text-blue-600 bg-blue-50" />
        <Kpi icon={Truck} label="진흥회" value={fmt(ops.dairy_promotion_l, 'L')} color="text-violet-600 bg-violet-50" />
        <Kpi
          icon={lossPct > 5 ? AlertTriangle : CheckCircle2}
          label="로스율"
          value={fmt(lossPct, '%')}
          color={lossPct > 5 || lossPct < -5 ? 'text-red-600 bg-red-50' : 'text-slate-600 bg-slate-50'}
        />
      </div>

      {/* 입력 1: 공장 입고량 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Factory className="w-4 h-4 text-blue-500" /> 공장 입고량 입력
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-slate-500">
            착유 {fmt(ops.milking_total_l, 'L')} 중 공장에 들어간 양 (나머지 = 진흥회 자동)
          </p>
          <div className="flex gap-2">
            <input
              type="number"
              step="0.1"
              value={intakeInput}
              onChange={(e) => setIntakeInput(e.target.value)}
              disabled={isClosed}
              placeholder="예: 200"
              className="flex-1 px-3 py-2 border rounded-lg disabled:bg-slate-100"
            />
            <Button onClick={saveIntake} disabled={saving || isClosed}>저장</Button>
          </div>
        </CardContent>
      </Card>

      {/* 입력 2: 생산 */}
      <ProductionSection
        date={date}
        isClosed={isClosed}
        productionBySku={data.production_by_sku || []}
        intakeId={data.intake_receipts?.[0]?.id}
        onChange={fetchAll}
      />

      {/* 입력 3: 출하 */}
      <ShipmentSection
        date={date}
        isClosed={isClosed}
        shipmentsByChannel={data.shipments_by_channel || []}
        shipmentsBySku={data.shipments_by_sku || []}
        productionBySku={data.production_by_sku || []}
        partners={partners}
        openOrders={openOrders}
        onChange={fetchAll}
      />

      {/* 재고 현황 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Boxes className="w-4 h-4 text-slate-500" /> 현재 재고
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
            {(data.inventory_now || []).map((inv) => (
              <div key={inv.sku_id} className="p-2 bg-slate-50 rounded-lg">
                <p className="font-medium text-slate-700">{inv.name}</p>
                <p className="text-lg font-black text-slate-900">{inv.qty}<span className="text-xs font-normal">개</span></p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 진흥회 정산 (마감 후) */}
      {data.dairy_promotion && (
        <Card className="bg-violet-50 border-violet-200">
          <CardContent className="p-4">
            <p className="text-xs text-violet-700 font-bold mb-1">진흥회 납유 정산</p>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600">
                  {fmt(data.dairy_promotion.amount_l, 'L')} × {fmtMoney(data.dairy_promotion.unit_price)}/L
                </p>
              </div>
              <p className="text-2xl font-black text-violet-700">{fmtMoney(data.dairy_promotion.total_amount)}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 마감 버튼 */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t shadow-lg sm:relative sm:p-0 sm:border-0 sm:shadow-none sm:bg-transparent">
        <div className="max-w-5xl mx-auto">
          {isClosed ? (
            <Button onClick={handleReopen} disabled={saving} variant="outline" className="w-full">
              <Unlock className="w-4 h-4 mr-2" /> 마감 해제
            </Button>
          ) : (
            <Button onClick={handleClose} disabled={saving} className="w-full bg-violet-600 hover:bg-violet-700">
              <Lock className="w-4 h-4 mr-2" /> 일일 마감 + 진흥회 정산 자동 생성
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

/* ─────────── 하위 컴포넌트 ─────────── */

function Kpi({ icon: Icon, label, value, color }) {
  return (
    <div className={cn('p-3 rounded-xl', color)}>
      <div className="flex items-center gap-1 text-[10px] font-medium opacity-75">
        <Icon className="w-3 h-3" /> {label}
      </div>
      <p className="text-xl font-black mt-1">{value}</p>
    </div>
  )
}

function ProductionSection({ date, isClosed, productionBySku, intakeId, onChange }) {
  const [adding, setAdding] = useState(null) // sku_id
  const [qty, setQty] = useState('')
  const [milk, setMilk] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const submit = async () => {
    if (!qty || !milk) {
      toast.error('수량과 원유 사용량을 입력하세요')
      return
    }
    setSubmitting(true)
    const res = await apiPost('/factory/batches', {
      sku_id: adding,
      produced_at: date,
      quantity: parseInt(qty, 10),
      raw_milk_used_l: parseFloat(milk),
      raw_milk_receipt_id: intakeId,
    })
    setSubmitting(false)
    if (res.success) {
      toast.success('생산 등록 완료')
      setAdding(null)
      setQty('')
      setMilk('')
      onChange()
    } else {
      toast.error(res.error?.message || '등록 실패')
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Factory className="w-4 h-4 text-emerald-500" /> 생산 등록 (SKU별)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {productionBySku.map((p) => (
            <div key={p.sku_id} className="border rounded-lg p-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{p.name}</p>
                  <p className="text-xs text-slate-500">
                    생산 {p.produced_qty}개 · 표준 {fmt(p.expected_milk_l, 'L')} · 실제 {fmt(p.actual_milk_l, 'L')}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setAdding(adding === p.sku_id ? null : p.sku_id)}
                  disabled={isClosed}
                  className="flex-shrink-0"
                >
                  <Plus className="w-3 h-3 mr-1" /> 추가
                </Button>
              </div>
              {adding === p.sku_id && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    placeholder="수량 (개)"
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                    className="px-2 py-1.5 border rounded text-sm"
                  />
                  <input
                    type="number"
                    step="0.1"
                    placeholder="원유 사용 (L)"
                    value={milk}
                    onChange={(e) => setMilk(e.target.value)}
                    className="px-2 py-1.5 border rounded text-sm"
                  />
                  <Button onClick={submit} disabled={submitting} size="sm" className="col-span-2">
                    등록
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function ShipmentSection({
  date, isClosed, shipmentsByChannel, shipmentsBySku, productionBySku, partners, openOrders, onChange,
}) {
  const [open, setOpen] = useState(false)
  const [channel, setChannel] = useState('B2B')
  const [partnerId, setPartnerId] = useState('')
  const [orderId, setOrderId] = useState('')
  const [items, setItems] = useState([{ sku_id: '', quantity: '', unit_price: 0 }])
  const [submitting, setSubmitting] = useState(false)

  const skuOpts = useMemo(() => productionBySku.map((p) => ({ id: p.sku_id, code: p.code, name: p.name })), [productionBySku])

  const reset = () => {
    setOpen(false)
    setPartnerId('')
    setOrderId('')
    setItems([{ sku_id: '', quantity: '', unit_price: 0 }])
  }

  const submit = async () => {
    const validItems = items.filter((it) => it.sku_id && parseInt(it.quantity, 10) > 0)
    if (validItems.length === 0) {
      toast.error('SKU·수량을 1건 이상 입력하세요')
      return
    }
    if (channel === 'B2B' && !partnerId) {
      toast.error('B2B 거래처를 선택하세요')
      return
    }
    if (channel === 'SMARTSTORE' && !orderId) {
      toast.error('스마트스토어 주문을 선택하세요')
      return
    }
    setSubmitting(true)
    const body = {
      channel,
      planned_date: date,
      items: validItems.map((it) => ({
        sku_id: it.sku_id,
        quantity: parseInt(it.quantity, 10),
        unit_price: parseInt(it.unit_price || 0, 10),
      })),
    }
    if (partnerId) body.partner_id = partnerId
    if (orderId) body.order_id = orderId

    const createRes = await apiPost('/factory/shipments', body)
    if (!createRes.success) {
      setSubmitting(false)
      toast.error(createRes.error?.message || '출하 생성 실패')
      return
    }
    // 즉시 출하 확정
    const confirmRes = await apiPost(`/factory/shipments/${createRes.data.id}/confirm`, {})
    setSubmitting(false)
    if (confirmRes.success) {
      toast.success('출하 등록 + 재고 차감 완료')
      reset()
      onChange()
    } else {
      toast.error(confirmRes.error?.message || '출하 확정 실패 — 지시서는 생성됨')
      reset()
      onChange()
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2 justify-between">
          <span className="flex items-center gap-2"><Truck className="w-4 h-4 text-blue-500" /> 출하 등록</span>
          <Button size="sm" onClick={() => setOpen(!open)} disabled={isClosed} variant="outline">
            <Plus className="w-3 h-3 mr-1" /> 추가
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {/* 당일 출하 요약 */}
        {shipmentsByChannel.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
            {shipmentsByChannel.map((c) => (
              <div key={c.channel} className="p-2 bg-blue-50 rounded">
                <p className="text-slate-600">{c.channel}</p>
                <p className="font-black">{c.shipped_qty || 0}개 · {fmtMoney(c.shipped_amount || 0)}</p>
              </div>
            ))}
          </div>
        )}

        {/* SKU별 출하 */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 text-xs text-slate-600">
          {shipmentsBySku.map((s) => (
            <div key={s.sku_id} className="flex justify-between p-1.5 bg-slate-50 rounded">
              <span>{s.code}</span>
              <span className="font-bold">{s.shipped_qty}개</span>
            </div>
          ))}
        </div>

        {/* 입력 폼 */}
        {open && (
          <div className="border rounded-lg p-3 space-y-2 bg-slate-50">
            <div className="grid grid-cols-2 gap-2">
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
                className="px-2 py-1.5 border rounded text-sm"
              >
                {CHANNELS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
              {channel === 'B2B' && (
                <select
                  value={partnerId}
                  onChange={(e) => setPartnerId(e.target.value)}
                  className="px-2 py-1.5 border rounded text-sm"
                >
                  <option value="">거래처 선택</option>
                  {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              )}
              {channel === 'SMARTSTORE' && (
                <select
                  value={orderId}
                  onChange={(e) => setOrderId(e.target.value)}
                  className="px-2 py-1.5 border rounded text-sm"
                >
                  <option value="">주문 선택</option>
                  {openOrders.map((o) => <option key={o.id} value={o.id}>#{o.order_number} · {o.customer_name}</option>)}
                </select>
              )}
            </div>

            {items.map((it, idx) => (
              <div key={idx} className="grid grid-cols-3 gap-1">
                <select
                  value={it.sku_id}
                  onChange={(e) => {
                    const next = [...items]
                    next[idx] = { ...next[idx], sku_id: e.target.value }
                    setItems(next)
                  }}
                  className="px-2 py-1.5 border rounded text-sm col-span-2"
                >
                  <option value="">SKU 선택</option>
                  {skuOpts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <input
                  type="number"
                  placeholder="수량"
                  value={it.quantity}
                  onChange={(e) => {
                    const next = [...items]
                    next[idx] = { ...next[idx], quantity: e.target.value }
                    setItems(next)
                  }}
                  className="px-2 py-1.5 border rounded text-sm"
                />
              </div>
            ))}
            <button
              onClick={() => setItems([...items, { sku_id: '', quantity: '', unit_price: 0 }])}
              className="text-xs text-blue-600 hover:underline"
            >
              + 항목 추가
            </button>

            <div className="flex gap-2 pt-2">
              <Button onClick={submit} disabled={submitting} className="flex-1">
                출하 + 재고 차감
              </Button>
              <Button onClick={reset} variant="outline">취소</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
