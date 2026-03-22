/**
 * @fileoverview 밀크카페 대시보드
 * 매출 현황 + 정산 + 메뉴별 분석
 */
import { useState, useEffect, useCallback } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { apiGet, apiPost } from '@/lib/api'
import { Coffee, DollarSign, FileText, Plus, X } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { cn } from '@/lib/utils'

export default function CafeDashboard() {
  const [stats, setStats] = useState(null)
  const [settlements, setSettlements] = useState([])
  const [showSettle, setShowSettle] = useState(false)
  const [settleForm, setSettleForm] = useState({
    period_start: '', period_end: '', commission_rate: '15',
  })

  const fetchData = useCallback(async () => {
    const [stRes, seRes] = await Promise.all([
      apiGet('/cafe/sales/stats'),
      apiGet('/cafe/settlements'),
    ])
    if (stRes.success) setStats(stRes.data)
    if (seRes.success) setSettlements(seRes.data)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const submitSettlement = async (e) => {
    e.preventDefault()
    const res = await apiPost('/cafe/settlements', {
      ...settleForm,
      commission_rate: parseFloat(settleForm.commission_rate),
    })
    if (res.success) { setShowSettle(false); fetchData() }
  }

  const SETTLE_STATUS = {
    PENDING: { label: '대기', color: 'bg-amber-100 text-amber-700' },
    CONFIRMED: { label: '확인', color: 'bg-blue-100 text-blue-700' },
    PAID: { label: '입금완료', color: 'bg-green-100 text-green-700' },
    DISPUTED: { label: '이의', color: 'bg-red-100 text-red-700' },
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Coffee className="w-6 h-6 text-violet-500" />
            밀크카페
          </h1>
          <p className="text-sm text-slate-500 mt-1">안성팜랜드 위탁 운영 — POS · 정산 · 재고</p>
        </div>
        <Button variant="cafe" onClick={() => setShowSettle(true)}>
          <FileText className="w-4 h-4" /> 정산서 생성
        </Button>
      </div>

      {/* 매출 현황 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-500">오늘 매출</p>
            <p className="text-2xl font-bold text-violet-600">
              {parseInt(stats?.today?.revenue || 0).toLocaleString()}원
            </p>
            <p className="text-[10px] text-slate-400">{stats?.today?.transactions || 0}건</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-500">이번달 매출</p>
            <p className="text-2xl font-bold">
              {parseInt(stats?.monthly?.revenue || 0).toLocaleString()}원
            </p>
            <p className="text-[10px] text-slate-400">{stats?.monthly?.transactions || 0}건</p>
          </CardContent>
        </Card>
        <Card className="col-span-2">
          <CardContent className="p-4">
            <p className="text-xs text-slate-500 mb-2">메뉴별 매출 TOP</p>
            {stats?.top_menus?.length > 0 ? (
              <ResponsiveContainer width="100%" height={120}>
                <BarChart data={stats.top_menus} layout="vertical">
                  <XAxis type="number" fontSize={10} />
                  <YAxis type="category" dataKey="menu" width={80} fontSize={10} />
                  <Tooltip formatter={(v) => `${parseInt(v).toLocaleString()}원`} />
                  <Bar dataKey="revenue" fill="#8b5cf6" radius={[0,4,4,0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-slate-400 py-4">데이터 없음</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 정산 이력 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <DollarSign className="w-4 h-4" /> 정산 이력
          </CardTitle>
        </CardHeader>
        <CardContent>
          {settlements.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-slate-50">
                    <th className="text-left p-2 font-semibold">기간</th>
                    <th className="text-right p-2 font-semibold">총 매출</th>
                    <th className="text-center p-2 font-semibold">수수료율</th>
                    <th className="text-right p-2 font-semibold">수수료</th>
                    <th className="text-right p-2 font-semibold">D2O 수취액</th>
                    <th className="text-center p-2 font-semibold">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {settlements.map((s) => (
                    <tr key={s.id} className="border-b">
                      <td className="p-2">{s.period_start} ~ {s.period_end}</td>
                      <td className="p-2 text-right font-mono">{parseInt(s.total_sales).toLocaleString()}</td>
                      <td className="p-2 text-center">{s.commission_rate}%</td>
                      <td className="p-2 text-right font-mono text-red-600">-{parseInt(s.commission).toLocaleString()}</td>
                      <td className="p-2 text-right font-mono font-bold text-emerald-600">{parseInt(s.net_amount).toLocaleString()}</td>
                      <td className="p-2 text-center">
                        <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium', SETTLE_STATUS[s.status]?.color)}>
                          {SETTLE_STATUS[s.status]?.label}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-center text-slate-400 py-8">정산 기록 없음</p>
          )}
        </CardContent>
      </Card>

      {/* 정산서 생성 모달 */}
      {showSettle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4">
            <div className="flex justify-between items-center p-5 border-b">
              <h2 className="text-lg font-bold">정산서 생성</h2>
              <button onClick={() => setShowSettle(false)}><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={submitSettlement} className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-600">시작일 *</label>
                  <Input type="date" value={settleForm.period_start}
                    onChange={(e) => setSettleForm((f) => ({ ...f, period_start: e.target.value }))} required />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">종료일 *</label>
                  <Input type="date" value={settleForm.period_end}
                    onChange={(e) => setSettleForm((f) => ({ ...f, period_end: e.target.value }))} required />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">수수료율 (%) *</label>
                <Input type="number" step="0.1" value={settleForm.commission_rate}
                  onChange={(e) => setSettleForm((f) => ({ ...f, commission_rate: e.target.value }))} required />
              </div>
              <div className="flex gap-2 pt-2">
                <Button type="submit" variant="cafe" className="flex-1">생성</Button>
                <Button type="button" variant="outline" onClick={() => setShowSettle(false)}>취소</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
