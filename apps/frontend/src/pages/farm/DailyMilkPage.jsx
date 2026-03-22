/**
 * @fileoverview 일일 착유량 기록 페이지
 * 목장 전체 오늘 총 생산량을 수동 입력
 * 주문량 → 공장 투입 / 나머지 → 진흥회 납유 자동 계산
 */
import { useState, useEffect, useCallback } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { apiGet, apiPost } from '@/lib/api'
import {
  Milk, TrendingUp, TrendingDown, Factory, Truck, Save,
  CheckCircle2, Calendar,
} from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { cn } from '@/lib/utils'

const DAILY_TARGET = 550
const LOSS_RATE = 0.02

export default function DailyMilkPage() {
  const [todayInput, setTodayInput] = useState('')
  const [todaySaved, setTodaySaved] = useState(null)
  const [dailyHistory, setDailyHistory] = useState([])
  const [demandData, setDemandData] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  const fetchData = useCallback(async () => {
    const [histRes, demandRes] = await Promise.all([
      apiGet('/farm/milking/daily?days=30'),
      apiGet('/factory/plan/demand'),
    ])

    if (histRes.success) {
      const data = Array.isArray(histRes.data) ? histRes.data.reverse() : []
      setDailyHistory(data)
      // 오늘 데이터가 있으면 표시
      const today = new Date().toISOString().split('T')[0]
      const todayRecord = data.find((d) => d.date === today)
      if (todayRecord) {
        setTodaySaved(parseFloat(todayRecord.total_l))
      }
    }
    if (demandRes.success) setDemandData(demandRes.data)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const handleSave = async () => {
    const amount = parseFloat(todayInput)
    if (!amount || amount <= 0) return

    setSaving(true)
    const res = await apiPost('/farm/milking/daily-total', {
      amount_l: amount,
      date: new Date().toISOString().split('T')[0],
    })
    if (res.success) {
      setTodaySaved(amount)
      setSaveSuccess(true)
      setTodayInput('')
      fetchData()
      setTimeout(() => setSaveSuccess(false), 3000)
    }
    setSaving(false)
  }

  // 주문 기반 계산
  const totalMilk = todaySaved || 0
  const orderDemand = demandData?.total_milk_needed_l || 0
  const loss = totalMilk * LOSS_RATE
  const availableForFactory = Math.max(0, totalMilk - loss)
  const factoryUse = Math.min(availableForFactory, orderDemand)
  const toAssociation = Math.max(0, availableForFactory - factoryUse)

  // 어제 대비
  const yesterday = dailyHistory.length >= 2
    ? parseFloat(dailyHistory[dailyHistory.length - 2]?.total_l || 0)
    : 0
  const changeRate = yesterday > 0
    ? (((todaySaved || 0) - yesterday) / yesterday * 100).toFixed(1)
    : 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Milk className="w-6 h-6 text-amber-500" />
          오늘 착유량
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          목장 전체 생산량 기록 → 주문 먼저, 나머지 진흥회 납유
        </p>
      </div>

      {/* 착유량 입력 */}
      <Card className="border-2 border-amber-200 bg-amber-50/30">
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
            <div className="flex-1 w-full">
              <label className="text-sm font-semibold text-slate-700 mb-2 block">
                <Calendar className="w-4 h-4 inline mr-1" />
                {new Date().toLocaleDateString('ko-KR', {
                  year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
                })}
              </label>
              <div className="flex gap-3 items-center">
                <Input
                  type="number"
                  step="0.1"
                  placeholder={todaySaved ? `기록됨: ${todaySaved}L` : '오늘 총 착유량 (L)'}
                  className="text-2xl h-14 font-bold text-center"
                  value={todayInput}
                  onChange={(e) => setTodayInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                />
                <span className="text-2xl font-bold text-slate-400 shrink-0">L</span>
              </div>
            </div>
            <Button
              onClick={handleSave}
              disabled={saving || !todayInput}
              className="h-14 px-8 bg-amber-500 hover:bg-amber-600 text-lg shrink-0"
            >
              {saving ? '저장 중...' : saveSuccess ? (
                <><CheckCircle2 className="w-5 h-5" /> 저장됨</>
              ) : (
                <><Save className="w-5 h-5" /> 저장</>
              )}
            </Button>
          </div>

          {todaySaved && (
            <p className="text-sm text-amber-700 mt-3 font-medium">
              ✅ 오늘 {todaySaved}L 기록 완료
              {todayInput && ' — 새 값으로 수정하려면 저장 클릭'}
            </p>
          )}
        </CardContent>
      </Card>

      {/* 배분 현황 (착유량 입력 후) */}
      {todaySaved > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card className="border-l-4 border-l-amber-400">
            <CardContent className="p-4">
              <p className="text-[10px] text-slate-500 font-medium">총 착유량</p>
              <p className="text-xl font-bold text-amber-600">{todaySaved.toFixed(1)}L</p>
              <div className={cn('flex items-center gap-1 text-[10px] mt-0.5',
                parseFloat(changeRate) >= 0 ? 'text-green-600' : 'text-red-600')}>
                {parseFloat(changeRate) >= 0
                  ? <TrendingUp className="w-3 h-3" />
                  : <TrendingDown className="w-3 h-3" />}
                전일 대비 {changeRate > 0 ? '+' : ''}{changeRate}%
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-red-300">
            <CardContent className="p-4">
              <p className="text-[10px] text-slate-500 font-medium">Loss (2%)</p>
              <p className="text-xl font-bold text-red-400">{loss.toFixed(1)}L</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-blue-400">
            <CardContent className="p-4">
              <p className="text-[10px] text-slate-500 font-medium">주문 필요량</p>
              <p className="text-xl font-bold text-blue-600">{orderDemand.toFixed(1)}L</p>
              <p className="text-[10px] text-slate-400">구독+주문+B2B</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-indigo-400">
            <CardContent className="p-4">
              <div className="flex items-center gap-1 mb-1">
                <Factory className="w-3 h-3 text-indigo-500" />
                <p className="text-[10px] text-slate-500 font-medium">공장 투입</p>
              </div>
              <p className="text-xl font-bold text-indigo-600">{factoryUse.toFixed(1)}L</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-green-400">
            <CardContent className="p-4">
              <div className="flex items-center gap-1 mb-1">
                <Truck className="w-3 h-3 text-green-500" />
                <p className="text-[10px] text-slate-500 font-medium">진흥회 납유</p>
              </div>
              <p className="text-xl font-bold text-green-600">{toAssociation.toFixed(1)}L</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 원유 흐름도 */}
      {todaySaved > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">오늘 원유 배분</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-center">
              <div className="flex-1 p-4 bg-amber-50 rounded-xl border border-amber-200">
                <Milk className="w-6 h-6 text-amber-500 mx-auto mb-1" />
                <p className="text-[10px] text-slate-500">목장 착유</p>
                <p className="text-xl font-bold text-amber-600">{todaySaved.toFixed(0)}L</p>
              </div>
              <div className="text-slate-300 text-xl shrink-0">→</div>
              <div className="flex-1 p-4 bg-red-50 rounded-xl border border-red-200">
                <p className="text-[10px] text-slate-500">Loss 2%</p>
                <p className="text-lg font-bold text-red-400">-{loss.toFixed(1)}L</p>
              </div>
              <div className="text-slate-300 text-xl shrink-0">→</div>
              <div className="flex-1 p-4 bg-blue-50 rounded-xl border border-blue-200">
                <Factory className="w-6 h-6 text-blue-500 mx-auto mb-1" />
                <p className="text-[10px] text-slate-500">D2O 공장</p>
                <p className="text-xl font-bold text-blue-600">{factoryUse.toFixed(0)}L</p>
              </div>
              <div className="text-slate-300 text-xl shrink-0">+</div>
              <div className="flex-1 p-4 bg-green-50 rounded-xl border border-green-200">
                <Truck className="w-6 h-6 text-green-500 mx-auto mb-1" />
                <p className="text-[10px] text-slate-500">진흥회 납유</p>
                <p className="text-xl font-bold text-green-600">{toAssociation.toFixed(0)}L</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 30일 트렌드 차트 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">30일 착유량 추이</CardTitle>
        </CardHeader>
        <CardContent>
          {dailyHistory.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={dailyHistory}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip formatter={(v) => [`${parseFloat(v).toFixed(1)}L`]} />
                <ReferenceLine y={DAILY_TARGET} stroke="#94a3b8" strokeDasharray="5 5"
                  label={{ value: `목표 ${DAILY_TARGET}L`, fill: '#94a3b8', fontSize: 10 }} />
                <Line type="monotone" dataKey="total_l" name="총 착유량"
                  stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-center text-slate-400 py-12">착유 데이터가 없습니다. 위에서 오늘 착유량을 입력하세요.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
