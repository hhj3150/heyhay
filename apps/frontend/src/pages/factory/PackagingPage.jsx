/**
 * @fileoverview 포장 자재 현황 페이지
 * KPI 요약 + 카테고리 탭 + 자재 카드 목록 + 인라인 수정 + 입고 등록
 */
import { useState, useEffect, useCallback } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { apiGet, apiPost, apiPut } from '@/lib/api'
import {
  Boxes, AlertTriangle, Package, Plus, Save, X,
  TrendingDown, Truck, Edit3, ArrowDownToLine,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/** 카테고리 탭 구성 */
const CATEGORY_TABS = [
  { key: 'ALL', label: '전체', filter: null },
  { key: 'CONTAINER', label: '용기', filter: ['PET_BOTTLE', 'CAP', 'LABEL'] },
  { key: 'PACKAGE', label: '포장', filter: ['BOX', 'ICE_PACK'] },
  { key: 'OTHER', label: '기타', filter: ['TAPE', 'CUP', 'LID', 'OTHER'] },
]

/** 카테고리 한글 라벨 */
const CATEGORY_LABEL = {
  PET_BOTTLE: '페트병',
  CUP: '컵',
  LID: '뚜껑',
  CAP: '캡',
  LABEL: '라벨',
  BOX: '박스',
  ICE_PACK: '아이스팩',
  TAPE: '테이프',
  OTHER: '기타',
}

/** 카테고리 옵션 */
const CATEGORY_OPTIONS = Object.entries(CATEGORY_LABEL).map(([value, label]) => ({ value, label }))

export default function PackagingPage() {
  const [materials, setMaterials] = useState([])
  const [activeTab, setActiveTab] = useState('ALL')
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [showAdd, setShowAdd] = useState(false)
  const [showInbound, setShowInbound] = useState(false)
  const [inboundForm, setInboundForm] = useState({ material_id: '', quantity: '', reason: '' })
  const [addForm, setAddForm] = useState({
    category: 'PET_BOTTLE', name: '', spec: '', unit: '개',
    safety_stock: 0, supplier_name: '', supplier_contact: '',
  })

  const fetchMaterials = useCallback(async () => {
    const res = await apiGet('/packaging/materials')
    if (res.success) setMaterials(res.data)
  }, [])

  useEffect(() => { fetchMaterials() }, [fetchMaterials])

  // 탭별 필터링
  const tabConfig = CATEGORY_TABS.find((t) => t.key === activeTab)
  const filtered = tabConfig?.filter
    ? materials.filter((m) => tabConfig.filter.includes(m.category))
    : materials

  // KPI 계산
  const totalCount = materials.length
  const belowSafety = materials.filter((m) => m.current_stock < m.safety_stock).length
  const needsOrder = materials.filter((m) => m.current_stock < m.safety_stock).length

  // 인라인 수정 시작
  const startEdit = (mat) => {
    setEditingId(mat.id)
    setEditForm({
      unit_cost: mat.unit_cost,
      safety_stock: mat.safety_stock,
      supplier_name: mat.supplier_name || '',
      supplier_contact: mat.supplier_contact || '',
    })
  }

  // 인라인 수정 저장
  const saveEdit = async (id) => {
    const res = await apiPut(`/packaging/materials/${id}`, {
      unit_cost: parseInt(editForm.unit_cost) || 0,
      safety_stock: parseInt(editForm.safety_stock) || 0,
      supplier_name: editForm.supplier_name || undefined,
      supplier_contact: editForm.supplier_contact || undefined,
    })
    if (res.success) {
      setEditingId(null)
      fetchMaterials()
    }
  }

  // 자재 등록
  const handleAdd = async () => {
    if (!addForm.name.trim()) return
    const res = await apiPost('/packaging/materials', {
      ...addForm,
      safety_stock: parseInt(addForm.safety_stock) || 0,
    })
    if (res.success) {
      setShowAdd(false)
      setAddForm({
        category: 'PET_BOTTLE', name: '', spec: '', unit: '개',
        safety_stock: 0, supplier_name: '', supplier_contact: '',
      })
      fetchMaterials()
    }
  }

  // 입고 등록
  const handleInbound = async () => {
    if (!inboundForm.material_id || !inboundForm.quantity) return
    const res = await apiPost('/packaging/stock-logs', {
      material_id: inboundForm.material_id,
      type: 'IN',
      quantity: parseInt(inboundForm.quantity),
      reason: inboundForm.reason || '수동 입고',
    })
    if (res.success) {
      setShowInbound(false)
      setInboundForm({ material_id: '', quantity: '', reason: '' })
      fetchMaterials()
    }
  }

  return (
    <div className="space-y-6">
      {/* 페이지 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">포장 자재 관리</h1>
          <p className="text-sm text-slate-500 mt-1">자재 현황, 입출고, 안전재고 관리</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowInbound(true)}>
            <ArrowDownToLine className="w-4 h-4 mr-1" /> 입고 등록
          </Button>
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <Plus className="w-4 h-4 mr-1" /> 자재 등록
          </Button>
        </div>
      </div>

      {/* KPI 카드 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
                <Boxes className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <p className="text-xs text-slate-500">총 자재 종류</p>
                <p className="text-xl font-bold">{totalCount}종</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className={cn(
                'w-10 h-10 rounded-lg flex items-center justify-center',
                belowSafety > 0 ? 'bg-red-50' : 'bg-green-50',
              )}>
                <AlertTriangle className={cn(
                  'w-5 h-5',
                  belowSafety > 0 ? 'text-red-500' : 'text-green-500',
                )} />
              </div>
              <div>
                <p className="text-xs text-slate-500">안전재고 미달</p>
                <p className={cn('text-xl font-bold', belowSafety > 0 && 'text-red-600')}>
                  {belowSafety}건
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className={cn(
                'w-10 h-10 rounded-lg flex items-center justify-center',
                needsOrder > 0 ? 'bg-amber-50' : 'bg-green-50',
              )}>
                <Truck className={cn(
                  'w-5 h-5',
                  needsOrder > 0 ? 'text-amber-500' : 'text-green-500',
                )} />
              </div>
              <div>
                <p className="text-xs text-slate-500">발주 필요</p>
                <p className={cn('text-xl font-bold', needsOrder > 0 && 'text-amber-600')}>
                  {needsOrder}건
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 카테고리 탭 */}
      <div className="flex gap-2 border-b pb-2">
        {CATEGORY_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'px-4 py-2 text-sm font-medium rounded-t-lg transition-colors',
              activeTab === tab.key
                ? 'bg-white border border-b-0 border-slate-200 text-slate-900'
                : 'text-slate-500 hover:text-slate-700',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 자재 카드 목록 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((mat) => {
          const isEditing = editingId === mat.id
          const belowSafetyLine = mat.current_stock < mat.safety_stock

          return (
            <Card key={mat.id} className={cn(belowSafetyLine && 'border-red-200 bg-red-50/30')}>
              <CardContent className="pt-4 pb-4 space-y-3">
                {/* 자재명 + 카테고리 */}
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                      {CATEGORY_LABEL[mat.category]}
                    </span>
                    <p className="font-semibold text-sm mt-1">{mat.name}</p>
                    {mat.spec && <p className="text-xs text-slate-400">{mat.spec}</p>}
                  </div>
                  {!isEditing && (
                    <button onClick={() => startEdit(mat)} className="text-slate-400 hover:text-slate-600">
                      <Edit3 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* 재고 현황 */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-500">현재재고</p>
                    <p className={cn(
                      'text-lg font-bold',
                      belowSafetyLine ? 'text-red-600' : 'text-slate-900',
                    )}>
                      {mat.current_stock.toLocaleString()}{mat.unit}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500">안전재고</p>
                    <p className="text-sm font-medium text-slate-600">
                      {mat.safety_stock.toLocaleString()}{mat.unit}
                    </p>
                  </div>
                </div>

                {belowSafetyLine && (
                  <div className="flex items-center gap-1 text-xs text-red-600 bg-red-100 rounded px-2 py-1">
                    <TrendingDown className="w-3 h-3" />
                    <span>안전재고 미달 ({(mat.safety_stock - mat.current_stock).toLocaleString()}개 부족)</span>
                  </div>
                )}

                {/* 인라인 수정 폼 */}
                {isEditing && (
                  <div className="space-y-2 border-t pt-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-slate-500">단가 (원)</label>
                        <Input
                          type="number"
                          value={editForm.unit_cost}
                          onChange={(e) => setEditForm({ ...editForm, unit_cost: e.target.value })}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500">안전재고</label>
                        <Input
                          type="number"
                          value={editForm.safety_stock}
                          onChange={(e) => setEditForm({ ...editForm, safety_stock: e.target.value })}
                          className="h-8 text-sm"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-500">공급업체</label>
                      <Input
                        value={editForm.supplier_name}
                        onChange={(e) => setEditForm({ ...editForm, supplier_name: e.target.value })}
                        className="h-8 text-sm"
                        placeholder="업체명"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-500">연락처</label>
                      <Input
                        value={editForm.supplier_contact}
                        onChange={(e) => setEditForm({ ...editForm, supplier_contact: e.target.value })}
                        className="h-8 text-sm"
                        placeholder="전화번호"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" className="h-7 text-xs" onClick={() => saveEdit(mat.id)}>
                        <Save className="w-3 h-3 mr-1" /> 저장
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditingId(null)}>
                        <X className="w-3 h-3 mr-1" /> 취소
                      </Button>
                    </div>
                  </div>
                )}

                {/* 추가 정보 (비편집 시) */}
                {!isEditing && (
                  <div className="text-xs text-slate-400 border-t pt-2 space-y-0.5">
                    {mat.unit_cost > 0 && <p>단가: {mat.unit_cost.toLocaleString()}원</p>}
                    {mat.supplier_name && <p>공급: {mat.supplier_name}</p>}
                    {mat.sku_mapping?.length > 0 && <p>SKU: {mat.sku_mapping.join(', ')}</p>}
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* 자재 등록 모달 */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-lg">자재 등록</h2>
              <button onClick={() => setShowAdd(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-600 font-medium">카테고리</label>
                <select
                  value={addForm.category}
                  onChange={(e) => setAddForm({ ...addForm, category: e.target.value })}
                  className="w-full h-9 border rounded-md px-3 text-sm"
                >
                  {CATEGORY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-600 font-medium">자재명</label>
                <Input value={addForm.name} onChange={(e) => setAddForm({ ...addForm, name: e.target.value })} placeholder="예: PET병 750ml" />
              </div>
              <div>
                <label className="text-xs text-slate-600 font-medium">규격</label>
                <Input value={addForm.spec} onChange={(e) => setAddForm({ ...addForm, spec: e.target.value })} placeholder="예: 투명 PET, 750ml" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-600 font-medium">단위</label>
                  <Input value={addForm.unit} onChange={(e) => setAddForm({ ...addForm, unit: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-slate-600 font-medium">안전재고</label>
                  <Input type="number" value={addForm.safety_stock} onChange={(e) => setAddForm({ ...addForm, safety_stock: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-600 font-medium">공급업체</label>
                <Input value={addForm.supplier_name} onChange={(e) => setAddForm({ ...addForm, supplier_name: e.target.value })} placeholder="업체명" />
              </div>
              <div>
                <label className="text-xs text-slate-600 font-medium">공급업체 연락처</label>
                <Input value={addForm.supplier_contact} onChange={(e) => setAddForm({ ...addForm, supplier_contact: e.target.value })} placeholder="010-0000-0000" />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowAdd(false)}>취소</Button>
              <Button onClick={handleAdd}>등록</Button>
            </div>
          </div>
        </div>
      )}

      {/* 입고 등록 모달 */}
      {showInbound && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-lg">입고 등록</h2>
              <button onClick={() => setShowInbound(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-600 font-medium">자재 선택</label>
                <select
                  value={inboundForm.material_id}
                  onChange={(e) => setInboundForm({ ...inboundForm, material_id: e.target.value })}
                  className="w-full h-9 border rounded-md px-3 text-sm"
                >
                  <option value="">선택하세요</option>
                  {materials.map((m) => (
                    <option key={m.id} value={m.id}>
                      [{CATEGORY_LABEL[m.category]}] {m.name} (현재: {m.current_stock})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-600 font-medium">입고 수량</label>
                <Input
                  type="number"
                  value={inboundForm.quantity}
                  onChange={(e) => setInboundForm({ ...inboundForm, quantity: e.target.value })}
                  placeholder="수량"
                />
              </div>
              <div>
                <label className="text-xs text-slate-600 font-medium">사유</label>
                <Input
                  value={inboundForm.reason}
                  onChange={(e) => setInboundForm({ ...inboundForm, reason: e.target.value })}
                  placeholder="예: 정기 발주 입고"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowInbound(false)}>취소</Button>
              <Button onClick={handleInbound}>입고 등록</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
