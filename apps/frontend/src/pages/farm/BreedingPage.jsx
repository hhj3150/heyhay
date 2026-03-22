/**
 * @fileoverview 번식 관리 페이지
 * 번식 이벤트 타임라인 + 분만 예정 알림 + 번식 지수
 */
import { useState, useEffect, useCallback } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { apiGet, apiPost } from '@/lib/api'
import { Baby, Calendar, Plus, X, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

const EVENT_TYPES = {
  HEAT: { label: '발정', color: 'bg-pink-100 text-pink-800' },
  AI: { label: '인공수정', color: 'bg-blue-100 text-blue-800' },
  ET: { label: '수정란이식', color: 'bg-violet-100 text-violet-800' },
  IVF: { label: '체외수정', color: 'bg-purple-100 text-purple-800' },
  PREG_CHECK: { label: '임신감정', color: 'bg-amber-100 text-amber-800' },
  CALVING: { label: '분만', color: 'bg-green-100 text-green-800' },
}

const EMPTY_FORM = {
  animal_id: '', event_type: 'AI', event_date: new Date().toISOString().split('T')[0],
  semen_code: '', veterinarian: '하원장', preg_result: '', preg_method: '',
  calving_ease: '', notes: '',
}

export default function BreedingPage() {
  const [upcoming, setUpcoming] = useState([])
  const [stats, setStats] = useState(null)
  const [records, setRecords] = useState([])
  const [animals, setAnimals] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)

  const fetchData = useCallback(async () => {
    const [upRes, stRes, recRes, anRes] = await Promise.all([
      apiGet('/farm/breeding/upcoming?days=30'),
      apiGet('/farm/breeding/stats'),
      apiGet('/farm/breeding?limit=50'),
      apiGet('/farm/animals?limit=100'),
    ])
    if (upRes.success) setUpcoming(upRes.data)
    if (stRes.success) setStats(stRes.data)
    if (recRes.success) setRecords(recRes.data)
    if (anRes.success) setAnimals(anRes.data)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const handleSubmit = async (e) => {
    e.preventDefault()
    const payload = { ...form }
    Object.keys(payload).forEach((k) => { if (payload[k] === '') delete payload[k] })

    const res = await apiPost('/farm/breeding', payload)
    if (res.success) {
      setShowModal(false)
      setForm(EMPTY_FORM)
      fetchData()
    }
  }

  const updateForm = (key, value) => setForm((prev) => ({ ...prev, [key]: value }))

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Baby className="w-6 h-6 text-pink-500" />
            번식 관리
          </h1>
          <p className="text-sm text-slate-500 mt-1">AI / ET / IVF 기록 및 분만 예정 관리</p>
        </div>
        <Button variant="farm" onClick={() => setShowModal(true)}>
          <Plus className="w-4 h-4" /> 번식 이벤트 등록
        </Button>
      </div>

      {/* 번식 지수 + 분만 예정 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 번식 지수 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">번식 지수 (최근 12개월)</CardTitle>
          </CardHeader>
          <CardContent>
            {stats ? (
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-4 bg-slate-50 rounded-lg">
                  <p className="text-xs text-slate-500">수태율</p>
                  <p className="text-2xl font-bold text-blue-600">
                    {stats.conception_rate ? `${stats.conception_rate}%` : '-'}
                  </p>
                </div>
                <div className="text-center p-4 bg-slate-50 rounded-lg">
                  <p className="text-xs text-slate-500">평균 공태일수</p>
                  <p className="text-2xl font-bold text-amber-600">
                    {stats.avg_open_days ? `${stats.avg_open_days}일` : '-'}
                  </p>
                </div>
                <div className="text-center p-4 bg-slate-50 rounded-lg">
                  <p className="text-xs text-slate-500">수정 두수</p>
                  <p className="text-xl font-bold">{stats.total_inseminated}</p>
                </div>
                <div className="text-center p-4 bg-slate-50 rounded-lg">
                  <p className="text-xs text-slate-500">임신 확인</p>
                  <p className="text-xl font-bold text-green-600">{stats.total_confirmed}</p>
                </div>
              </div>
            ) : (
              <p className="text-center text-slate-400 py-8">데이터 없음</p>
            )}
          </CardContent>
        </Card>

        {/* 분만 예정 알림 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              분만 예정 (30일 이내)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {upcoming.length > 0 ? (
              <div className="space-y-2">
                {upcoming.map((u) => (
                  <div key={u.id} className="flex justify-between items-center p-3 bg-amber-50 rounded-lg border border-amber-100">
                    <div>
                      <span className="font-mono font-semibold text-sm">{u.cow_id}</span>
                      <span className="text-slate-500 text-sm ml-2">{u.cow_name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5 text-amber-600" />
                      <span className="text-sm font-medium text-amber-700">{u.expected_calving}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-slate-400 py-8">30일 내 분만 예정 개체 없음</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 번식 기록 타임라인 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">최근 번식 이벤트</CardTitle>
        </CardHeader>
        <CardContent>
          {records.length > 0 ? (
            <div className="space-y-2">
              {records.map((r) => (
                <div key={r.id} className="flex items-center gap-3 p-3 border rounded-lg hover:bg-slate-50">
                  <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', EVENT_TYPES[r.event_type]?.color)}>
                    {EVENT_TYPES[r.event_type]?.label}
                  </span>
                  <span className="font-mono text-sm font-semibold">{r.cow_id}</span>
                  <span className="text-sm text-slate-500">{r.cow_name}</span>
                  <span className="text-xs text-slate-400 ml-auto">{r.event_date}</span>
                  {r.semen_code && <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded">{r.semen_code}</span>}
                  {r.preg_result && (
                    <span className={cn('text-xs px-2 py-0.5 rounded font-medium',
                      r.preg_result === 'POSITIVE' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800')}>
                      {r.preg_result === 'POSITIVE' ? '임신+' : r.preg_result === 'NEGATIVE' ? '비임신' : '재검'}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-slate-400 py-8">번식 기록이 없습니다</p>
          )}
        </CardContent>
      </Card>

      {/* 등록 모달 */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto mx-4">
            <div className="flex justify-between items-center p-5 border-b">
              <h2 className="text-lg font-bold">번식 이벤트 등록</h2>
              <button onClick={() => setShowModal(false)}><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-600">개체 *</label>
                <select className="w-full h-10 px-3 border rounded-md text-sm" value={form.animal_id}
                  onChange={(e) => updateForm('animal_id', e.target.value)} required>
                  <option value="">선택</option>
                  {animals.filter(a => a.sex === 'F').map((a) => (
                    <option key={a.id} value={a.id}>{a.cow_id} {a.name || ''}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-600">이벤트 유형 *</label>
                  <select className="w-full h-10 px-3 border rounded-md text-sm" value={form.event_type}
                    onChange={(e) => updateForm('event_type', e.target.value)}>
                    {Object.entries(EVENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">날짜 *</label>
                  <Input type="date" value={form.event_date} onChange={(e) => updateForm('event_date', e.target.value)} required />
                </div>
              </div>
              {['AI', 'ET', 'IVF'].includes(form.event_type) && (
                <div>
                  <label className="text-xs font-medium text-slate-600">정액 코드</label>
                  <Input value={form.semen_code} onChange={(e) => updateForm('semen_code', e.target.value)} />
                </div>
              )}
              {form.event_type === 'PREG_CHECK' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-slate-600">결과</label>
                    <select className="w-full h-10 px-3 border rounded-md text-sm" value={form.preg_result}
                      onChange={(e) => updateForm('preg_result', e.target.value)}>
                      <option value="">선택</option>
                      <option value="POSITIVE">임신</option>
                      <option value="NEGATIVE">비임신</option>
                      <option value="RECHECK">재검</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600">방법</label>
                    <select className="w-full h-10 px-3 border rounded-md text-sm" value={form.preg_method}
                      onChange={(e) => updateForm('preg_method', e.target.value)}>
                      <option value="">선택</option>
                      <option value="RECTAL">직장검사</option>
                      <option value="ULTRASOUND">초음파</option>
                    </select>
                  </div>
                </div>
              )}
              {form.event_type === 'CALVING' && (
                <div>
                  <label className="text-xs font-medium text-slate-600">분만 난이도</label>
                  <select className="w-full h-10 px-3 border rounded-md text-sm" value={form.calving_ease}
                    onChange={(e) => updateForm('calving_ease', e.target.value)}>
                    <option value="">선택</option>
                    <option value="NORMAL">정상</option>
                    <option value="ASSISTED">보조</option>
                    <option value="DYSTOCIA">난산</option>
                  </select>
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-slate-600">수의사</label>
                <Input value={form.veterinarian} onChange={(e) => updateForm('veterinarian', e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">비고</label>
                <textarea className="w-full p-2 border rounded-md text-sm resize-none h-16" value={form.notes}
                  onChange={(e) => updateForm('notes', e.target.value)} />
              </div>
              <div className="flex gap-2 pt-2">
                <Button type="submit" variant="farm" className="flex-1">등록</Button>
                <Button type="button" variant="outline" onClick={() => setShowModal(false)}>취소</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
