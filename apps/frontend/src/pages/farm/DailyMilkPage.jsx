/**
 * @fileoverview 일일 착유량 + 납유 기록 + 월말 정산
 * 착유량 입력 → 공장/진흥회 배분 → 납유단가 × 납유량 = 월 납유대금
 */
import { useState, useEffect, useCallback } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { apiGet, apiPost } from '@/lib/api'
import {
  Milk, TrendingUp, TrendingDown, Factory, Truck, Save,
  CheckCircle2, Calendar, DollarSign, Settings,
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
  const [dairyInput, setDairyInput] = useState('')
  const [todaySaved, setTodaySaved] = useState(null)
  const [dairySaved, setDairySaved] = useState(null)
  const [dailyHistory, setDailyHistory] = useState([])
  const [demandData, setDemandData] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  // 납유 단가 (원/L)
  const [unitPrice, setUnitPrice] = useState(1130)
  const [showPriceSetting, setShowPriceSetting] = useState(false)
  const [priceInput, setPriceInput] = useState('')

  // 월별 정산
  const [monthlyStats, setMonthlyStats] = useState(null)

  const fetchData = useCallback(async () => {
    const [histRes, demandRes, monthRes, priceRes] = await Promise.all([
      apiGet('/farm/milking/daily?days=30'),
      apiGet('/factory/plan/demand'),
      apiGet('/farm/milking/monthly-dairy'),
      apiGet('/farm/milking/dairy-price'),
    ])

    if (histRes.success) {
      const data = Array.isArray(histRes.data) ? histRes.data.reverse() : []
      setDailyHistory(data)
      const today = new Date().toISOString().split('T')[0]
      const todayRecord = data.find((d) => d.date === today)
      if (todayRecord) {
        setTodaySaved(parseFloat(todayRecord.total_l))
        if (todayRecord.dairy_assoc_l) setDairySaved(parseFloat(todayRecord.dairy_assoc_l))
      }
    }
    if (demandRes.success) setDemandData(demandRes.data)
    if (monthRes.success) setMonthlyStats(monthRes.data)
    if (priceRes.success && priceRes.data?.unit_price) setUnitPrice(priceRes.data.unit_price)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const handleSave = async () => {
    const amount = parseFloat(todayInput)
    if (!amount || amount <= 0) return

    setSaving(true)
    const res = await apiPost('/farm/milking/daily-total', {
      amount_l: amount,
      dairy_assoc_l: dairyInput ? parseFloat(dairyInput) : null,
      date: new Date().toISOString().split('T')[0],
    })
    if (res.success) {
      setTodaySaved(amount)
      if (dairyInput) setDairySaved(parseFloat(dairyInput))
      setSaveSuccess(true)
      setTodayInput('')
      setDairyInput('')
      fetchData()
      setTimeout(() => setSaveSuccess(false), 3000)
    }
    setSaving(false)
  }

  const saveUnitPrice = async () => {
    const price = parseInt(priceInput)
    if (!price || price <= 0) return
    const res = await apiPost('/farm/milking/dairy-price', { unit_price: price })
    if (res.success) {
      setUnitPrice(price)
      setShowPriceSetting(false)
      setPriceInput('')
      fetchData()
    }
  }

  // 주문 기반 계산
  const totalMilk = todaySaved || 0
  const orderDemand = demandData?.total_milk_needed_l || 0
  const loss = totalMilk * LOSS_RATE
  const availableForFactory = Math.max(0, totalMilk - loss)
  const factoryUse = Math.min(availableForFactory, orderDemand)
  const toAssociation = dairySaved || Math.max(0, availableForFactory - factoryUse)

  // 어제 대비
  const yesterday = dailyHistory.length >= 2
    ? parseFloat(dailyHistory[dailyHistory.length - 2]?.total_l || 0)
    : 0
  const changeRate = yesterday > 0
    ? (((todaySaved || 0) - yesterday) / yesterday * 100).toFixed(1)
    : 0

  // 월 정산
  const monthDays = monthlyStats?.days || 0
  const monthTotalDairy = parseFloat(monthlyStats?.total_dairy_l || 0)
  const monthPayment = Math.round(monthTotalDairy * unitPrice)

  const now = new Date()
  const monthLabel = `${now.getFullYear()}년 ${now.getMonth() + 1}월`

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Milk className="w-6 h-6 text-amber-500" />
          오늘 착유량
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          목장 생산량 기록 → 주문 먼저 → 나머지 진흥회 납유 → 월말 정산
        </p>
      </div>

      {/* 착유량 + 납유량 입력 */}
      <Card className="border-2 border-amber-200 bg-amber-50/30">
        <CardContent className="p-6">
          <label className="text-sm font-semibold text-slate-700 mb-3 block">
            <Calendar className="w-4 h-4 inline mr-1" />
            {new Date().toLocaleDateString('ko-KR', {
              year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
            })}
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* 총 착유량 */}
            <div>
              <p className="text-xs font-medium text-slate-500 mb-1">총 착유량 (L)</p>
              <div className="flex gap-2 items-center">
                <Input
                  type="number" step="0.1"
                  placeholder={todaySaved ? `기록됨: ${todaySaved}L` : '총 착유량'}
                  className="text-xl h-12 font-bold text-center"
                  value={todayInput}
                  onChange={(e) => setTodayInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                />
                <span className="text-lg font-bold text-slate-400">L</span>
              </div>
            </div>

            {/* 진흥회 납유량 */}
            <div>
              <p className="text-xs font-medium text-green-600 mb-1">진흥회 납유량 (L)</p>
              <div className="flex gap-2 items-center">
                <Input
                  type="number" step="0.1"
                  placeholder={dairySaved ? `기록됨: ${dairySaved}L` : toAssociation > 0 ? `예상: ${toAssociation.toFixed(1)}L` : '납유량'}
                  className="text-xl h-12 font-bold text-center border-green-300 focus:border-green-500"
                  value={dairyInput}
                  onChange={(e) => setDairyInput(e.target.value)}
                />
                <span className="text-lg font-bold text-green-400">L</span>
              </div>
            </div>
          </div>

          <div className="flex gap-3 mt-4">
            <Button
              onClick={handleSave}
              disabled={saving || !todayInput}
              className="flex-1 h-12 bg-amber-500 hover:bg-amber-600 text-base"
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
              ✅ 착유 {todaySaved}L{dairySaved ? ` / 납유 ${dairySaved}L` : ''} 기록 완료
            </p>
          )}
        </CardContent>
      </Card>

      {/* 배분 현황 */}
      {todaySaved > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card className="border-l-4 border-l-amber-400">
            <CardContent className="p-4">
              <p className="text-[10px] text-slate-500 font-medium">총 착유량</p>
              <p className="text-xl font-bold text-amber-600">{todaySaved.toFixed(1)}L</p>
              <div className={cn('flex items-center gap-1 text-[10px] mt-0.5',
                parseFloat(changeRate) >= 0 ? 'text-green-600' : 'text-red-600')}>
                {parseFloat(changeRate) >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
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
              <p className="text-[10px] text-slate-400">@{unitPrice.toLocaleString()}원/L</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 월 납유 정산 */}
      <Card className="border-2 border-green-200">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-green-500" />
              {monthLabel} 납유 정산
            </CardTitle>
            <button onClick={() => { setShowPriceSetting(!showPriceSetting); setPriceInput(String(unitPrice)) }}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 px-2 py-1 rounded hover:bg-slate-100">
              <Settings className="w-3.5 h-3.5" /> 납유단가
            </button>
          </div>
        </CardHeader>
        <CardContent>
          {/* 단가 설정 */}
          {showPriceSetting && (
            <div className="flex gap-2 items-center mb-4 p-3 bg-slate-50 rounded-lg">
              <span className="text-sm text-slate-600 shrink-0">납유단가:</span>
              <Input type="number" className="w-32 h-9 text-right" value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)} />
              <span className="text-sm text-slate-400 shrink-0">원/L</span>
              <Button size="sm" onClick={saveUnitPrice}>저장</Button>
              <Button size="sm" variant="outline" onClick={() => setShowPriceSetting(false)}>취소</Button>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-green-50 rounded-xl">
              <p className="text-[10px] text-slate-500 mb-1">납유단가</p>
              <p className="text-lg font-bold text-green-700">{unitPrice.toLocaleString()}원/L</p>
            </div>
            <div className="text-center p-4 bg-green-50 rounded-xl">
              <p className="text-[10px] text-slate-500 mb-1">이번달 납유일수</p>
              <p className="text-lg font-bold text-green-700">{monthDays}일</p>
            </div>
            <div className="text-center p-4 bg-green-50 rounded-xl">
              <p className="text-[10px] text-slate-500 mb-1">이번달 총 납유량</p>
              <p className="text-lg font-bold text-green-700">{monthTotalDairy.toFixed(1)}L</p>
            </div>
            <div className="text-center p-4 bg-green-100 rounded-xl border-2 border-green-300">
              <p className="text-[10px] text-green-600 mb-1 font-semibold">이번달 납유대금</p>
              <p className="text-xl font-black text-green-800">{monthPayment.toLocaleString()}원</p>
            </div>
          </div>
        </CardContent>
      </Card>

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
                <p className="text-[10px] text-green-500 font-medium">
                  {Math.round(toAssociation * unitPrice).toLocaleString()}원
                </p>
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
                <Line type="monotone" dataKey="dairy_assoc_l" name="진흥회 납유"
                  stroke="#22c55e" strokeWidth={2} dot={{ r: 2 }} strokeDasharray="4 4" />
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
