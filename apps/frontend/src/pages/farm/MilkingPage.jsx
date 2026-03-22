/**
 * @fileoverview 착유 관리 페이지
 * 일별 착유 입력 + 트렌드 차트 + 통계
 */
import { useState, useEffect, useCallback } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { apiGet, apiPost } from '@/lib/api'
import { Milk, TrendingUp, TrendingDown, Plus, X } from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { cn } from '@/lib/utils'

export default function MilkingPage() {
  const [summary, setSummary] = useState(null)
  const [dailyData, setDailyData] = useState([])
  const [animals, setAnimals] = useState([])
  const [showInput, setShowInput] = useState(false)
  const [records, setRecords] = useState([])

  const fetchData = useCallback(async () => {
    const [sumRes, dailyRes, animRes] = await Promise.all([
      apiGet('/farm/milking/summary'),
      apiGet('/farm/milking/daily?days=30'),
      apiGet('/farm/animals?status=MILKING&limit=100'),
    ])
    if (sumRes.success) setSummary(sumRes.data)
    if (dailyRes.success) setDailyData(dailyRes.data.reverse())
    if (animRes.success) setAnimals(animRes.data)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const addRecord = () => {
    setRecords((prev) => [...prev, {
      animal_id: '', session: 'AM', amount_l: '', fat_pct: '', protein_pct: '', scc: '',
    }])
  }

  const updateRecord = (idx, key, value) => {
    setRecords((prev) => prev.map((r, i) => i === idx ? { ...r, [key]: value } : r))
  }

  const removeRecord = (idx) => {
    setRecords((prev) => prev.filter((_, i) => i !== idx))
  }

  const submitRecords = async () => {
    const payload = records
      .filter((r) => r.animal_id && r.amount_l)
      .map((r) => ({
        animal_id: r.animal_id,
        session: r.session,
        amount_l: parseFloat(r.amount_l),
        fat_pct: r.fat_pct ? parseFloat(r.fat_pct) : undefined,
        protein_pct: r.protein_pct ? parseFloat(r.protein_pct) : undefined,
        scc: r.scc ? parseInt(r.scc) : undefined,
      }))

    if (payload.length === 0) return

    const res = await apiPost('/farm/milking', { records: payload })
    if (res.success) {
      setRecords([])
      setShowInput(false)
      fetchData()
    }
  }

  const today = summary?.today || {}
  const changeRate = parseFloat(today.change_rate || 0)

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Milk className="w-6 h-6 text-amber-500" />
            착유 관리
          </h1>
          <p className="text-sm text-slate-500 mt-1">일일 착유 기록 및 유량 트렌드</p>
        </div>
        <Button variant="farm" onClick={() => { setShowInput(true); addRecord() }}>
          <Plus className="w-4 h-4" /> 착유 입력
        </Button>
      </div>

      {/* 오늘 현황 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-500">오늘 착유량</p>
            <p className="text-2xl font-bold text-amber-600">
              {parseFloat(today.today_total || 0).toFixed(1)}L
            </p>
            {today.change_rate && (
              <div className={cn('flex items-center gap-1 text-xs mt-1',
                changeRate >= 0 ? 'text-green-600' : 'text-red-600')}>
                {changeRate >= 0
                  ? <TrendingUp className="w-3 h-3" />
                  : <TrendingDown className="w-3 h-3" />}
                전일 대비 {changeRate > 0 ? '+' : ''}{changeRate}%
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-500">공장 투입</p>
            <p className="text-2xl font-bold text-blue-600">
              {parseFloat(today.today_factory || 0).toFixed(1)}L
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-500">착유 두수</p>
            <p className="text-2xl font-bold">{today.today_heads || 0}두</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-500">월 누계</p>
            <p className="text-2xl font-bold">
              {parseFloat(summary?.monthly?.total_l || 0).toFixed(0)}L
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 30일 트렌드 차트 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">30일 착유량 트렌드</CardTitle>
        </CardHeader>
        <CardContent>
          {dailyData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip
                  formatter={(v) => [`${parseFloat(v).toFixed(1)}L`]}
                  labelFormatter={(d) => d}
                />
                <Line
                  type="monotone" dataKey="total_l" name="총 착유량"
                  stroke="#f59e0b" strokeWidth={2} dot={false}
                />
                <Line
                  type="monotone" dataKey="factory_l" name="공장 투입"
                  stroke="#3b82f6" strokeWidth={2} dot={false} strokeDasharray="4 4"
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-center text-slate-400 py-12">착유 데이터가 없습니다</p>
          )}
        </CardContent>
      </Card>

      {/* 착유 입력 모달 */}
      {showInput && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto mx-4">
            <div className="flex justify-between items-center p-5 border-b">
              <h2 className="text-lg font-bold">착유 기록 입력</h2>
              <button onClick={() => { setShowInput(false); setRecords([]) }}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              {records.map((r, idx) => (
                <div key={idx} className="flex gap-2 items-end bg-slate-50 p-3 rounded-lg">
                  <div className="flex-1">
                    <label className="text-[10px] font-medium text-slate-500">개체</label>
                    <select
                      className="w-full h-9 px-2 border rounded text-sm"
                      value={r.animal_id}
                      onChange={(e) => updateRecord(idx, 'animal_id', e.target.value)}
                    >
                      <option value="">선택</option>
                      {animals.map((a) => (
                        <option key={a.id} value={a.id}>{a.cow_id} {a.name || ''}</option>
                      ))}
                    </select>
                  </div>
                  <div className="w-20">
                    <label className="text-[10px] font-medium text-slate-500">AM/PM</label>
                    <select className="w-full h-9 px-2 border rounded text-sm" value={r.session}
                      onChange={(e) => updateRecord(idx, 'session', e.target.value)}>
                      <option value="AM">AM</option>
                      <option value="PM">PM</option>
                    </select>
                  </div>
                  <div className="w-24">
                    <label className="text-[10px] font-medium text-slate-500">착유량(L)</label>
                    <Input type="number" step="0.1" className="h-9" value={r.amount_l}
                      onChange={(e) => updateRecord(idx, 'amount_l', e.target.value)} />
                  </div>
                  <div className="w-20">
                    <label className="text-[10px] font-medium text-slate-500">유지방%</label>
                    <Input type="number" step="0.1" className="h-9" value={r.fat_pct}
                      onChange={(e) => updateRecord(idx, 'fat_pct', e.target.value)} />
                  </div>
                  <div className="w-20">
                    <label className="text-[10px] font-medium text-slate-500">유단백%</label>
                    <Input type="number" step="0.1" className="h-9" value={r.protein_pct}
                      onChange={(e) => updateRecord(idx, 'protein_pct', e.target.value)} />
                  </div>
                  <button onClick={() => removeRecord(idx)} className="p-1.5 hover:bg-red-50 rounded">
                    <Trash2 className="w-4 h-4 text-red-400" />
                  </button>
                </div>
              ))}
              <div className="flex gap-2 pt-3">
                <Button variant="outline" onClick={addRecord} className="flex-1">
                  <Plus className="w-4 h-4" /> 행 추가
                </Button>
                <Button variant="farm" onClick={submitRecords} className="flex-1">
                  저장 ({records.filter(r => r.animal_id && r.amount_l).length}건)
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
