/**
 * @fileoverview 공장 관리 메인 대시보드
 * 원유입고 + CCP 상태 + SKU 재고 + 생산배치 통합 뷰
 */
import { useState, useEffect, useCallback } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { apiGet, apiPost } from '@/lib/api'
import { getKSTToday } from '@/lib/date'
import {
  Factory, Droplets, Thermometer, Package, AlertTriangle, Plus, X,
  CheckCircle2, XCircle,
} from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { cn } from '@/lib/utils'

const PROCESS_STEPS = [
  { value: 'RECEIVING', label: '원유수령' },
  { value: 'QUALITY_CHECK', label: '품질검사' },
  { value: 'CREAM_SEPARATION', label: '크림분리' },
  { value: 'FILTRATION_80', label: '바켓여과 80mesh' },
  { value: 'FILTRATION_120', label: '바켓여과 120mesh' },
  { value: 'PASTEURIZATION', label: '살균 (CCP1)', ccp: true, ccp_id: 'CCP1' },
  { value: 'HOMOGENIZATION', label: '균질' },
  { value: 'COOLING', label: '냉각' },
  { value: 'FINAL_FILTRATION', label: '충진 여과 (CCP2)', ccp: true, ccp_id: 'CCP2' },
  { value: 'FILLING', label: '충진/포장' },
  { value: 'KAYMAK_HEATING', label: '카이막 가열' },
]

export default function FactoryDashboard() {
  const [rawMilkToday, setRawMilkToday] = useState(null)
  const [inventory, setInventory] = useState([])
  const [batches, setBatches] = useState([])
  const [ccpLog, setCcpLog] = useState([])
  const [alerts, setAlerts] = useState([])
  const [showRawMilk, setShowRawMilk] = useState(false)
  const [showBatch, setShowBatch] = useState(false)
  const [showCcp, setShowCcp] = useState(false)
  const [skus, setSkus] = useState([])

  // 원유 입고 폼
  const [rawForm, setRawForm] = useState({
    received_date: getKSTToday(),
    amount_l: '', fat_pct: '', protein_pct: '', scc: '',
  })

  // 생산 배치 폼
  const [batchForm, setBatchForm] = useState({
    sku_id: '', produced_at: getKSTToday(),
    quantity: '', raw_milk_used_l: '',
    material_cost: '', labor_cost: '', overhead_cost: '',
  })

  // CCP 기록 폼
  const [ccpForm, setCcpForm] = useState({
    batch_id: '', process_step: 'PASTEURIZATION',
    started_at: new Date().toISOString(),
    temperature: '', hold_seconds: '', mesh_size: '', notes: '',
  })

  const fetchData = useCallback(async () => {
    const [rmRes, invRes, bRes, ccpRes, alertRes, skuRes] = await Promise.all([
      apiGet('/factory/raw-milk/today'),
      apiGet('/factory/inventory'),
      apiGet('/factory/batches?limit=10'),
      apiGet('/factory/process/ccp-log'),
      apiGet('/factory/inventory/alerts'),
      apiGet('/factory/skus'),
    ])
    if (rmRes.success) setRawMilkToday(rmRes.data)
    if (invRes.success) setInventory(invRes.data)
    if (bRes.success) setBatches(bRes.data)
    if (ccpRes.success) setCcpLog(ccpRes.data)
    if (alertRes.success) setAlerts(alertRes.data)
    if (skuRes.success) setSkus(skuRes.data)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const submitRawMilk = async (e) => {
    e.preventDefault()
    const payload = {
      ...rawForm,
      amount_l: parseFloat(rawForm.amount_l),
      fat_pct: rawForm.fat_pct ? parseFloat(rawForm.fat_pct) : undefined,
      protein_pct: rawForm.protein_pct ? parseFloat(rawForm.protein_pct) : undefined,
      scc: rawForm.scc ? parseInt(rawForm.scc) : undefined,
    }
    const res = await apiPost('/factory/raw-milk', payload)
    if (res.success) { setShowRawMilk(false); fetchData() }
  }

  const submitBatch = async (e) => {
    e.preventDefault()
    const payload = {
      ...batchForm,
      quantity: parseInt(batchForm.quantity),
      raw_milk_used_l: parseFloat(batchForm.raw_milk_used_l),
      material_cost: batchForm.material_cost ? parseInt(batchForm.material_cost) : undefined,
      labor_cost: batchForm.labor_cost ? parseInt(batchForm.labor_cost) : undefined,
      overhead_cost: batchForm.overhead_cost ? parseInt(batchForm.overhead_cost) : undefined,
    }
    const res = await apiPost('/factory/batches', payload)
    if (res.success) { setShowBatch(false); fetchData() }
  }

  const submitCcp = async (e) => {
    e.preventDefault()
    const step = PROCESS_STEPS.find((s) => s.value === ccpForm.process_step)
    const payload = {
      ...ccpForm,
      is_ccp: !!step?.ccp,
      ccp_id: step?.ccp_id,
      temperature: ccpForm.temperature ? parseFloat(ccpForm.temperature) : undefined,
      hold_seconds: ccpForm.hold_seconds ? parseInt(ccpForm.hold_seconds) : undefined,
      mesh_size: ccpForm.mesh_size ? parseInt(ccpForm.mesh_size) : undefined,
    }
    Object.keys(payload).forEach((k) => { if (payload[k] === '' || payload[k] === undefined) delete payload[k] })
    const res = await apiPost('/factory/process', payload)
    if (res.success) {
      setShowCcp(false)
      fetchData()
      if (res.data._ccp_alert) {
        alert(`CCP 이탈 경보: ${res.data._ccp_alert.reason}`)
      }
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Factory className="w-6 h-6 text-blue-500" />
            공장 관리
          </h1>
          <p className="text-sm text-slate-500 mt-1">D2O 유가공 — 원유입고 · CCP · 생산 · 재고</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowRawMilk(true)}>
            <Droplets className="w-4 h-4" /> 원유 입고
          </Button>
          <Button variant="outline" onClick={() => setShowCcp(true)}>
            <Thermometer className="w-4 h-4" /> CCP 기록
          </Button>
          <Button variant="factory" onClick={() => setShowBatch(true)}>
            <Plus className="w-4 h-4" /> 생산 등록
          </Button>
        </div>
      </div>

      {/* 상단 현황 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Droplets className="w-4 h-4 text-blue-500" />
              <span className="text-xs text-slate-500">오늘 원유 입고</span>
            </div>
            <p className="text-2xl font-bold text-blue-600">
              {parseFloat(rawMilkToday?.accepted_l || 0).toFixed(1)}L
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Thermometer className="w-4 h-4 text-red-500" />
              <span className="text-xs text-slate-500">오늘 CCP 기록</span>
            </div>
            <p className="text-2xl font-bold">{ccpLog.length}건</p>
            {ccpLog.some((c) => c.is_deviated) && (
              <span className="text-xs text-red-600 font-semibold">이탈 발생!</span>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Package className="w-4 h-4 text-emerald-500" />
              <span className="text-xs text-slate-500">오늘 생산</span>
            </div>
            <p className="text-2xl font-bold">
              {batches.filter((b) => b.produced_at?.startsWith(getKSTToday())).length}배치
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <span className="text-xs text-slate-500">재고 부족</span>
            </div>
            <p className={cn('text-2xl font-bold', alerts.length > 0 ? 'text-red-600' : 'text-slate-400')}>
              {alerts.length}건
            </p>
          </CardContent>
        </Card>
      </div>

      {/* SKU 재고 현황 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">SKU별 재고 현황</CardTitle>
        </CardHeader>
        <CardContent>
          {inventory.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={inventory}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="code" fontSize={11} />
                  <YAxis fontSize={11} />
                  <Tooltip />
                  <Bar dataKey="factory_qty" name="공장" fill="#3b82f6" radius={[4,4,0,0]} />
                  <Bar dataKey="cafe_qty" name="카페" fill="#8b5cf6" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="overflow-x-auto mt-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50">
                      <th className="text-left p-2 font-semibold">SKU</th>
                      <th className="text-center p-2 font-semibold">유형</th>
                      <th className="text-center p-2 font-semibold">공장</th>
                      <th className="text-center p-2 font-semibold">카페</th>
                      <th className="text-center p-2 font-semibold">합계</th>
                      <th className="text-center p-2 font-semibold">최근소비기한</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inventory.map((i) => (
                      <tr key={i.sku_id} className="border-b">
                        <td className="p-2 font-medium">{i.name}</td>
                        <td className="p-2 text-center text-xs text-slate-500">{i.product_type}</td>
                        <td className="p-2 text-center font-mono">{i.factory_qty}</td>
                        <td className="p-2 text-center font-mono">{i.cafe_qty}</td>
                        <td className="p-2 text-center font-mono font-bold">{i.total_qty}</td>
                        <td className="p-2 text-center text-xs text-slate-500">{i.earliest_expiry || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="text-center text-slate-400 py-8">재고 데이터 없음</p>
          )}
        </CardContent>
      </Card>

      {/* 최근 생산 배치 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">최근 생산 배치</CardTitle>
        </CardHeader>
        <CardContent>
          {batches.length > 0 ? (
            <div className="space-y-2">
              {batches.map((b) => (
                <div key={b.id} className="flex items-center gap-3 p-3 border rounded-lg hover:bg-slate-50">
                  <span className="font-mono text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded">{b.batch_id}</span>
                  <span className="text-sm font-medium">{b.sku_name}</span>
                  <span className="text-sm text-slate-500">{b.quantity}개</span>
                  <span className="text-xs text-slate-400">{b.raw_milk_used_l}L 투입</span>
                  <span className="text-xs text-slate-400 ml-auto">{b.produced_at}</span>
                  {b.unit_cost > 0 && (
                    <span className="text-xs bg-slate-100 px-2 py-0.5 rounded">개당 {b.unit_cost?.toLocaleString()}원</span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-slate-400 py-8">생산 기록 없음</p>
          )}
        </CardContent>
      </Card>

      {/* 원유 입고 모달 */}
      {showRawMilk && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
            <div className="flex justify-between items-center p-5 border-b">
              <h2 className="text-lg font-bold">원유 입고 등록</h2>
              <button onClick={() => setShowRawMilk(false)}><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={submitRawMilk} className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-600">입고일 *</label>
                  <Input type="date" value={rawForm.received_date}
                    onChange={(e) => setRawForm((f) => ({ ...f, received_date: e.target.value }))} required />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">수령량 (L) *</label>
                  <Input type="number" step="0.1" value={rawForm.amount_l}
                    onChange={(e) => setRawForm((f) => ({ ...f, amount_l: e.target.value }))} required />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">유지방 %</label>
                  <Input type="number" step="0.01" value={rawForm.fat_pct}
                    onChange={(e) => setRawForm((f) => ({ ...f, fat_pct: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">유단백 %</label>
                  <Input type="number" step="0.01" value={rawForm.protein_pct}
                    onChange={(e) => setRawForm((f) => ({ ...f, protein_pct: e.target.value }))} />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <Button type="submit" variant="factory" className="flex-1">등록</Button>
                <Button type="button" variant="outline" onClick={() => setShowRawMilk(false)}>취소</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 생산 배치 모달 */}
      {showBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
            <div className="flex justify-between items-center p-5 border-b">
              <h2 className="text-lg font-bold">생산 배치 등록</h2>
              <button onClick={() => setShowBatch(false)}><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={submitBatch} className="p-5 space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-600">SKU *</label>
                <select className="w-full h-10 px-3 border rounded-md text-sm" value={batchForm.sku_id}
                  onChange={(e) => setBatchForm((f) => ({ ...f, sku_id: e.target.value }))} required>
                  <option value="">선택</option>
                  {skus.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-600">생산일 *</label>
                  <Input type="date" value={batchForm.produced_at}
                    onChange={(e) => setBatchForm((f) => ({ ...f, produced_at: e.target.value }))} required />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">수량 *</label>
                  <Input type="number" value={batchForm.quantity}
                    onChange={(e) => setBatchForm((f) => ({ ...f, quantity: e.target.value }))} required />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">원유(L) *</label>
                  <Input type="number" step="0.1" value={batchForm.raw_milk_used_l}
                    onChange={(e) => setBatchForm((f) => ({ ...f, raw_milk_used_l: e.target.value }))} required />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <Button type="submit" variant="factory" className="flex-1">등록</Button>
                <Button type="button" variant="outline" onClick={() => setShowBatch(false)}>취소</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CCP 기록 모달 */}
      {showCcp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
            <div className="flex justify-between items-center p-5 border-b">
              <h2 className="text-lg font-bold">공정 / CCP 기록</h2>
              <button onClick={() => setShowCcp(false)}><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={submitCcp} className="p-5 space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-600">배치 ID *</label>
                <Input value={ccpForm.batch_id} placeholder="YYYYMMDD-SKU-seq"
                  onChange={(e) => setCcpForm((f) => ({ ...f, batch_id: e.target.value }))} required />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">공정 단계 *</label>
                <select className="w-full h-10 px-3 border rounded-md text-sm" value={ccpForm.process_step}
                  onChange={(e) => setCcpForm((f) => ({ ...f, process_step: e.target.value }))}>
                  {PROCESS_STEPS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}{s.ccp ? ' ★' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-600">온도 (°C)</label>
                  <Input type="number" step="0.1" value={ccpForm.temperature}
                    onChange={(e) => setCcpForm((f) => ({ ...f, temperature: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">유지시간 (초)</label>
                  <Input type="number" value={ccpForm.hold_seconds}
                    onChange={(e) => setCcpForm((f) => ({ ...f, hold_seconds: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">메쉬</label>
                  <Input type="number" value={ccpForm.mesh_size}
                    onChange={(e) => setCcpForm((f) => ({ ...f, mesh_size: e.target.value }))} />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <Button type="submit" variant="factory" className="flex-1">기록</Button>
                <Button type="button" variant="outline" onClick={() => setShowCcp(false)}>취소</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
