/**
 * @fileoverview 개체 관리 목록 페이지
 * 상태별 필터 + 검색 + 등록 모달
 */
import { useState, useEffect, useCallback } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api'
import { Plus, Search, Edit2, Trash2, Milk, X } from 'lucide-react'
import { cn } from '@/lib/utils'

const STATUS_MAP = {
  MILKING: { label: '착유', color: 'bg-green-100 text-green-800' },
  DRY: { label: '건유', color: 'bg-yellow-100 text-yellow-800' },
  PREGNANT: { label: '임신', color: 'bg-pink-100 text-pink-800' },
  HEIFER: { label: '육성', color: 'bg-blue-100 text-blue-800' },
  BULL: { label: '수소', color: 'bg-slate-100 text-slate-800' },
  CULL: { label: '도태', color: 'bg-red-100 text-red-800' },
}

const GENOTYPE_BADGE = {
  A2A2: 'bg-emerald-100 text-emerald-800',
  A2A1: 'bg-amber-100 text-amber-800',
  A1A1: 'bg-red-100 text-red-800',
}

const EMPTY_FORM = {
  cow_id: '', name: '', birthdate: '', breed: 'Jersey',
  a2_genotype: 'A2A2', status: 'HEIFER', sex: 'F',
  sire_info: '', acquisition_source: '', acquisition_cost: '',
  group_tag: '', notes: '',
}

export default function AnimalListPage() {
  const [animals, setAnimals] = useState([])
  const [stats, setStats] = useState(null)
  const [meta, setMeta] = useState({ page: 1, total: 0, totalPages: 0 })
  const [filter, setFilter] = useState({ status: '', search: '' })
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [loading, setLoading] = useState(false)

  const fetchAnimals = useCallback(async (page = 1) => {
    setLoading(true)
    const params = new URLSearchParams({ page, limit: 20 })
    if (filter.status) params.set('status', filter.status)
    if (filter.search) params.set('search', filter.search)

    const res = await apiGet(`/farm/animals?${params}`)
    if (res.success) {
      setAnimals(res.data)
      setMeta(res.meta)
    }
    setLoading(false)
  }, [filter])

  const fetchStats = useCallback(async () => {
    const res = await apiGet('/farm/animals/stats')
    if (res.success) setStats(res.data)
  }, [])

  useEffect(() => { fetchAnimals(); fetchStats() }, [fetchAnimals, fetchStats])

  const handleSubmit = async (e) => {
    e.preventDefault()
    const payload = {
      ...form,
      acquisition_cost: form.acquisition_cost ? parseInt(form.acquisition_cost) : undefined,
    }
    // 빈 문자열 제거
    Object.keys(payload).forEach((k) => {
      if (payload[k] === '' || payload[k] === undefined) delete payload[k]
    })

    const res = editId
      ? await apiPut(`/farm/animals/${editId}`, payload)
      : await apiPost('/farm/animals', payload)

    if (res.success) {
      setShowModal(false)
      setEditId(null)
      setForm(EMPTY_FORM)
      fetchAnimals(meta.page)
      fetchStats()
    }
  }

  const handleEdit = (animal) => {
    setEditId(animal.id)
    setForm({
      cow_id: animal.cow_id || '',
      name: animal.name || '',
      birthdate: animal.birthdate?.split('T')[0] || '',
      breed: animal.breed || 'Jersey',
      a2_genotype: animal.a2_genotype || 'A2A2',
      status: animal.status || 'HEIFER',
      sex: animal.sex || 'F',
      sire_info: animal.sire_info || '',
      acquisition_source: animal.acquisition_source || '',
      acquisition_cost: animal.acquisition_cost || '',
      group_tag: animal.group_tag || '',
      notes: animal.notes || '',
    })
    setShowModal(true)
  }

  const handleDelete = async (id, cowId) => {
    if (!confirm(`${cowId} 개체를 삭제하시겠습니까?`)) return
    const res = await apiDelete(`/farm/animals/${id}`)
    if (res.success) {
      fetchAnimals(meta.page)
      fetchStats()
    }
  }

  const updateForm = (key, value) => setForm((prev) => ({ ...prev, [key]: value }))

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Milk className="w-6 h-6 text-amber-500" />
            개체 관리
          </h1>
          <p className="text-sm text-slate-500 mt-1">송영신목장 A2 저지 전 두수 관리</p>
        </div>
        <Button variant="farm" onClick={() => { setEditId(null); setForm(EMPTY_FORM); setShowModal(true) }}>
          <Plus className="w-4 h-4" /> 개체 등록
        </Button>
      </div>

      {/* 현황 카드 */}
      {stats && (
        <div className="grid grid-cols-4 md:grid-cols-8 gap-3">
          {Object.entries(STATUS_MAP).map(([key, { label, color }]) => (
            <div key={key} className="text-center p-3 bg-white rounded-lg border">
              <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full', color)}>{label}</span>
              <p className="text-xl font-bold mt-1">{stats[key.toLowerCase()] || 0}</p>
            </div>
          ))}
          <div className="text-center p-3 bg-amber-50 rounded-lg border border-amber-200">
            <span className="text-[10px] font-bold text-amber-700">전체</span>
            <p className="text-xl font-bold mt-1 text-amber-700">{stats.total || 0}</p>
          </div>
          <div className="text-center p-3 bg-emerald-50 rounded-lg border border-emerald-200">
            <span className="text-[10px] font-bold text-emerald-700">A2A2</span>
            <p className="text-xl font-bold mt-1 text-emerald-700">{stats.a2a2_count || 0}</p>
          </div>
        </div>
      )}

      {/* 필터 */}
      <Card>
        <CardContent className="p-4">
          <div className="flex gap-3 items-center flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <Input
                placeholder="이표번호 또는 이름 검색"
                className="pl-9"
                value={filter.search}
                onChange={(e) => setFilter((f) => ({ ...f, search: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && fetchAnimals()}
              />
            </div>
            <select
              className="h-10 px-3 border rounded-md text-sm"
              value={filter.status}
              onChange={(e) => setFilter((f) => ({ ...f, status: e.target.value }))}
            >
              <option value="">전체 상태</option>
              {Object.entries(STATUS_MAP).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            <Button variant="outline" onClick={() => fetchAnimals()}>조회</Button>
          </div>
        </CardContent>
      </Card>

      {/* 테이블 */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50">
                  <th className="text-left p-3 font-semibold">이표번호</th>
                  <th className="text-left p-3 font-semibold">이름</th>
                  <th className="text-center p-3 font-semibold">상태</th>
                  <th className="text-center p-3 font-semibold">유전자형</th>
                  <th className="text-center p-3 font-semibold">품종</th>
                  <th className="text-center p-3 font-semibold">생년월일</th>
                  <th className="text-center p-3 font-semibold">그룹</th>
                  <th className="text-center p-3 font-semibold">작업</th>
                </tr>
              </thead>
              <tbody>
                {animals.map((a) => (
                  <tr key={a.id} className="border-b hover:bg-slate-50 transition-colors">
                    <td className="p-3 font-mono font-semibold">{a.cow_id}</td>
                    <td className="p-3">{a.name || '-'}</td>
                    <td className="p-3 text-center">
                      <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', STATUS_MAP[a.status]?.color)}>
                        {STATUS_MAP[a.status]?.label}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      {a.a2_genotype && (
                        <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', GENOTYPE_BADGE[a.a2_genotype])}>
                          {a.a2_genotype}
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-center text-slate-500">{a.breed}</td>
                    <td className="p-3 text-center text-slate-500">{a.birthdate?.split('T')[0] || '-'}</td>
                    <td className="p-3 text-center text-slate-500">{a.group_tag || '-'}</td>
                    <td className="p-3 text-center">
                      <div className="flex justify-center gap-1">
                        <button onClick={() => handleEdit(a)} className="p-1.5 hover:bg-slate-100 rounded">
                          <Edit2 className="w-3.5 h-3.5 text-slate-500" />
                        </button>
                        <button onClick={() => handleDelete(a.id, a.cow_id)} className="p-1.5 hover:bg-red-50 rounded">
                          <Trash2 className="w-3.5 h-3.5 text-red-400" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {animals.length === 0 && (
                  <tr><td colSpan={8} className="p-8 text-center text-slate-400">
                    {loading ? '불러오는 중...' : '등록된 개체가 없습니다'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* 페이지네이션 */}
          {meta.totalPages > 1 && (
            <div className="flex justify-center gap-2 p-4 border-t">
              {Array.from({ length: meta.totalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => fetchAnimals(p)}
                  className={cn(
                    'w-8 h-8 rounded text-sm font-medium',
                    p === meta.page ? 'bg-amber-500 text-white' : 'hover:bg-slate-100',
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 등록/수정 모달 */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto mx-4">
            <div className="flex justify-between items-center p-5 border-b">
              <h2 className="text-lg font-bold">{editId ? '개체 수정' : '개체 등록'}</h2>
              <button onClick={() => setShowModal(false)}><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-600">이표번호 *</label>
                  <Input value={form.cow_id} onChange={(e) => updateForm('cow_id', e.target.value)} required />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">이름</label>
                  <Input value={form.name} onChange={(e) => updateForm('name', e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">생년월일</label>
                  <Input type="date" value={form.birthdate} onChange={(e) => updateForm('birthdate', e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">품종</label>
                  <Input value={form.breed} onChange={(e) => updateForm('breed', e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">A2 유전자형</label>
                  <select className="w-full h-10 px-3 border rounded-md text-sm" value={form.a2_genotype} onChange={(e) => updateForm('a2_genotype', e.target.value)}>
                    <option value="A2A2">A2A2</option>
                    <option value="A2A1">A2A1</option>
                    <option value="A1A1">A1A1</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">상태</label>
                  <select className="w-full h-10 px-3 border rounded-md text-sm" value={form.status} onChange={(e) => updateForm('status', e.target.value)}>
                    {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">성별</label>
                  <select className="w-full h-10 px-3 border rounded-md text-sm" value={form.sex} onChange={(e) => updateForm('sex', e.target.value)}>
                    <option value="F">암</option>
                    <option value="M">수</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">그룹 태그</label>
                  <Input value={form.group_tag} onChange={(e) => updateForm('group_tag', e.target.value)} placeholder="에코축산단지 등" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">부(정액) 정보</label>
                <Input value={form.sire_info} onChange={(e) => updateForm('sire_info', e.target.value)} placeholder="정액 카탈로그 정보" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-600">도입처</label>
                  <Input value={form.acquisition_source} onChange={(e) => updateForm('acquisition_source', e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">취득가액 (원)</label>
                  <Input type="number" value={form.acquisition_cost} onChange={(e) => updateForm('acquisition_cost', e.target.value)} />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">비고</label>
                <textarea className="w-full p-2 border rounded-md text-sm resize-none h-20" value={form.notes} onChange={(e) => updateForm('notes', e.target.value)} />
              </div>
              <div className="flex gap-2 pt-2">
                <Button type="submit" variant="farm" className="flex-1">{editId ? '수정' : '등록'}</Button>
                <Button type="button" variant="outline" onClick={() => setShowModal(false)}>취소</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
