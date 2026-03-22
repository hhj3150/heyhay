/**
 * @fileoverview 일일 착유량 + 2곳 납유 기록 + 월말 정산
 * 착유량 → 진흥회 납유 + D2O 납유 → 각각 단가 × 납유량 = 월 대금
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
  ResponsiveContainer, ReferenceLine, Legend,
} from 'recharts'
import { cn } from '@/lib/utils'

const DAILY_TARGET = 550
const LOSS_RATE = 0.02

export default function DailyMilkPage() {
  const [todayInput, setTodayInput] = useState('')
  const [dairyInput, setDairyInput] = useState('')
  const [d2oInput, setD2oInput] = useState('')
  const [todaySaved, setTodaySaved] = useState(null)
  const [dairySaved, setDairySaved] = useState(null)
  const [d2oSaved, setD2oSaved] = useState(null)
  const [dailyHistory, setDailyHistory] = useState([])
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  // 납유 단가 (원/L) — 진흥회: 180L까지 정상가, 초과분 -100원
  const [dairyPrice, setDairyPrice] = useState(1130)
  const [dairyOverPrice, setDairyOverPrice] = useState(100) // 초과분 차감 단가
  const DAIRY_QUOTA = 180 // 진흥회 정상유대 기준량
  const [d2oPrice, setD2oPrice] = useState(1200)
  const [showPriceSetting, setShowPriceSetting] = useState(false)
  const [dairyPriceInput, setDairyPriceInput] = useState('')
  const [d2oPriceInput, setD2oPriceInput] = useState('')

  // 월별 정산
  const [monthlyStats, setMonthlyStats] = useState(null)

  const fetchData = useCallback(async () => {
    const [histRes, monthRes, priceRes] = await Promise.all([
      apiGet('/farm/milking/daily?days=30'),
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
        if (todayRecord.d2o_l) setD2oSaved(parseFloat(todayRecord.d2o_l))
      }
    }
    if (monthRes.success) setMonthlyStats(monthRes.data)
    if (priceRes.success) {
      if (priceRes.data?.dairy_price) setDairyPrice(priceRes.data.dairy_price)
      if (priceRes.data?.d2o_price) setD2oPrice(priceRes.data.d2o_price)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const handleSave = async () => {
    const amount = parseFloat(todayInput)
    if (!amount || amount <= 0) return

    setSaving(true)
    const d2oAmount = parseFloat(d2oInput) || 0
    const dairyAmount = Math.max(0, amount - d2oAmount)

    const res = await apiPost('/farm/milking/daily-total', {
      amount_l: amount,
      dairy_assoc_l: dairyAmount,
      d2o_l: d2oAmount,
      date: new Date().toISOString().split('T')[0],
    })
    if (res.success) {
      setTodaySaved(amount)
      setDairySaved(dairyAmount)
      setD2oSaved(d2oAmount)
      setSaveSuccess(true)
      setTodayInput('')
      setDairyInput('')
      setD2oInput('')
      fetchData()
      setTimeout(() => setSaveSuccess(false), 3000)
    }
    setSaving(false)
  }

  const savePrices = async () => {
    const dp = parseInt(dairyPriceInput) || dairyPrice
    const d2p = parseInt(d2oPriceInput) || d2oPrice
    const res = await apiPost('/farm/milking/dairy-price', { dairy_price: dp, d2o_price: d2p })
    if (res.success) {
      setDairyPrice(dp)
      setD2oPrice(d2p)
      setShowPriceSetting(false)
      fetchData()
    }
  }

  /**
   * 진흥회 납유대금 계산 (차등 단가)
   * 180L까지: 정상 단가 (예: 1,130원/L)
   * 180L 초과분: 정상 단가 - 100원 (예: 1,030원/L)
   */
  const calcDairyPayment = (liters) => {
    if (liters <= 0) return 0
    const normalL = Math.min(liters, DAIRY_QUOTA)
    const overL = Math.max(0, liters - DAIRY_QUOTA)
    return Math.round(normalL * dairyPrice + overL * (dairyPrice - dairyOverPrice))
  }

  // 입력 중 자동 계산: 총 착유량 - D2O = 진흥회
  const inputTotal = parseFloat(todayInput) || todaySaved || 0
  const inputD2o = parseFloat(d2oInput) || 0
  const autoDairyL = inputTotal > 0 && inputD2o > 0 ? Math.max(0, inputTotal - inputD2o) : 0

  // 저장된 데이터 기반 계산
  const totalMilk = todaySaved || 0
  const loss = totalMilk * LOSS_RATE
  const d2oDelivery = d2oSaved || 0
  const dairyDelivery = dairySaved || Math.max(0, totalMilk - d2oDelivery)
  const totalDelivery = dairyDelivery + d2oDelivery

  // 어제 대비
  const yesterday = dailyHistory.length >= 2
    ? parseFloat(dailyHistory[dailyHistory.length - 2]?.total_l || 0) : 0
  const changeRate = yesterday > 0
    ? (((todaySaved || 0) - yesterday) / yesterday * 100).toFixed(1) : 0

  // 월 정산
  const mDairyDays = parseInt(monthlyStats?.dairy_days || 0)
  const mDairyTotal = parseFloat(monthlyStats?.total_dairy_l || 0)
  const mD2oDays = parseInt(monthlyStats?.d2o_days || 0)
  const mD2oTotal = parseFloat(monthlyStats?.total_d2o_l || 0)
  // 진흥회: 일별 180L 기준 차등 → 월 합계는 일수 × 기준량으로 근사
  const mDairyNormalL = Math.min(mDairyTotal, DAIRY_QUOTA * mDairyDays)
  const mDairyOverL = Math.max(0, mDairyTotal - mDairyNormalL)
  const mDairyPayment = Math.round(mDairyNormalL * dairyPrice + mDairyOverL * (dairyPrice - dairyOverPrice))
  const mD2oPayment = Math.round(mD2oTotal * d2oPrice)

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
          착유량 → 진흥회 납유 + D2O 납유 → 월말 정산
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* 총 착유량 */}
            <div>
              <p className="text-xs font-medium text-amber-600 mb-1">🐄 총 착유량 (L)</p>
              <div className="flex gap-2 items-center">
                <Input type="number" step="0.1"
                  placeholder={todaySaved ? `${todaySaved}L` : '착유량'}
                  className="text-xl h-12 font-bold text-center border-amber-300"
                  value={todayInput}
                  onChange={(e) => setTodayInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSave()} />
                <span className="text-lg font-bold text-amber-400">L</span>
              </div>
            </div>

            {/* D2O 납유량 */}
            <div>
              <p className="text-xs font-medium text-blue-600 mb-1">🏭 D2O 납유 (L)</p>
              <div className="flex gap-2 items-center">
                <Input type="number" step="0.1"
                  placeholder={d2oSaved ? `${d2oSaved}L` : 'D2O'}
                  className="text-xl h-12 font-bold text-center border-blue-300"
                  value={d2oInput}
                  onChange={(e) => setD2oInput(e.target.value)} />
                <span className="text-lg font-bold text-blue-400">L</span>
              </div>
            </div>

            {/* 진흥회 납유량 — 자동 계산 */}
            <div>
              <p className="text-xs font-medium text-green-600 mb-1">🏛️ 진흥회 (자동계산)</p>
              <div className="flex gap-2 items-center">
                <div className="text-xl h-12 font-bold text-center border border-green-200 bg-green-50 rounded-md flex items-center justify-center w-full">
                  {autoDairyL > 0 ? `${autoDairyL.toFixed(1)}` : '-'}
                </div>
                <span className="text-lg font-bold text-green-400">L</span>
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">착유량 - D2O = 진흥회</p>
            </div>
          </div>

          <Button onClick={handleSave} disabled={saving || !todayInput}
            className="w-full mt-4 h-12 bg-amber-500 hover:bg-amber-600 text-base">
            {saving ? '저장 중...' : saveSuccess ? (
              <><CheckCircle2 className="w-5 h-5" /> 저장됨</>
            ) : (
              <><Save className="w-5 h-5" /> 저장</>
            )}
          </Button>

          {todaySaved && (
            <p className="text-sm text-amber-700 mt-3 font-medium">
              ✅ 착유 {todaySaved}L
              {dairySaved ? ` → 진흥회 ${dairySaved}L` : ''}
              {d2oSaved ? ` → D2O ${d2oSaved}L` : ''}
            </p>
          )}
        </CardContent>
      </Card>

      {/* 배분 현황 */}
      {todaySaved > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
          <Card className="border-l-4 border-l-green-400">
            <CardContent className="p-4">
              <p className="text-[10px] text-green-600 font-medium">🏛️ 진흥회</p>
              <p className="text-xl font-bold text-green-600">{dairyDelivery.toFixed(1)}L</p>
              <p className="text-[10px] text-slate-400">@{dairyPrice.toLocaleString()}원</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-blue-400">
            <CardContent className="p-4">
              <p className="text-[10px] text-blue-600 font-medium">🏭 D2O</p>
              <p className="text-xl font-bold text-blue-600">{d2oDelivery.toFixed(1)}L</p>
              <p className="text-[10px] text-slate-400">@{d2oPrice.toLocaleString()}원</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 원유 흐름도 */}
      {todaySaved > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">오늘 원유 배분</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-center">
              <div className="flex-1 p-3 bg-amber-50 rounded-xl border border-amber-200">
                <Milk className="w-5 h-5 text-amber-500 mx-auto mb-1" />
                <p className="text-[10px] text-slate-500">착유</p>
                <p className="text-lg font-bold text-amber-600">{todaySaved.toFixed(0)}L</p>
              </div>
              <div className="text-slate-300 text-lg shrink-0">→</div>
              <div className="flex-1 p-3 bg-green-50 rounded-xl border border-green-200">
                <p className="text-[10px] text-slate-500">🏛️ 진흥회</p>
                <p className="text-lg font-bold text-green-600">{dairyDelivery.toFixed(0)}L</p>
                <p className="text-[9px] text-green-500">{calcDairyPayment(dairyDelivery).toLocaleString()}원</p>
              </div>
              <div className="text-slate-300 text-lg shrink-0">+</div>
              <div className="flex-1 p-3 bg-blue-50 rounded-xl border border-blue-200">
                <p className="text-[10px] text-slate-500">🏭 D2O</p>
                <p className="text-lg font-bold text-blue-600">{d2oDelivery.toFixed(0)}L</p>
                <p className="text-[9px] text-blue-500">{Math.round(d2oDelivery * d2oPrice).toLocaleString()}원</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 월 납유 정산 */}
      <Card className="border-2 border-green-200">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-green-500" />
              {monthLabel} 납유 정산
            </CardTitle>
            <button onClick={() => {
              setShowPriceSetting(!showPriceSetting)
              setDairyPriceInput(String(dairyPrice))
              setD2oPriceInput(String(d2oPrice))
            }} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 px-2 py-1 rounded hover:bg-slate-100">
              <Settings className="w-3.5 h-3.5" /> 단가 설정
            </button>
          </div>
        </CardHeader>
        <CardContent>
          {/* 단가 설정 */}
          {showPriceSetting && (
            <div className="p-4 bg-slate-50 rounded-lg mb-4 space-y-3">
              <div className="flex gap-3 items-center">
                <span className="text-sm text-green-600 font-medium w-20">🏛️ 진흥회</span>
                <Input type="number" className="w-32 h-9 text-right" value={dairyPriceInput}
                  onChange={(e) => setDairyPriceInput(e.target.value)} />
                <span className="text-sm text-slate-400">원/L</span>
              </div>
              <div className="flex gap-3 items-center">
                <span className="text-sm text-blue-600 font-medium w-20">🏭 D2O</span>
                <Input type="number" className="w-32 h-9 text-right" value={d2oPriceInput}
                  onChange={(e) => setD2oPriceInput(e.target.value)} />
                <span className="text-sm text-slate-400">원/L</span>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={savePrices}>저장</Button>
                <Button size="sm" variant="outline" onClick={() => setShowPriceSetting(false)}>취소</Button>
              </div>
            </div>
          )}

          {/* 진흥회 정산 */}
          <div className="mb-4">
            <h4 className="text-sm font-semibold text-green-700 mb-2">🏛️ 낙농진흥회</h4>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="text-center p-3 bg-green-50 rounded-lg">
                <p className="text-[10px] text-slate-500">정상유대 (≤{DAIRY_QUOTA}L/일)</p>
                <p className="text-sm font-bold text-green-700">{dairyPrice.toLocaleString()}원/L</p>
              </div>
              <div className="text-center p-3 bg-amber-50 rounded-lg">
                <p className="text-[10px] text-slate-500">초과분 (＞{DAIRY_QUOTA}L)</p>
                <p className="text-sm font-bold text-amber-700">{(dairyPrice - dairyOverPrice).toLocaleString()}원/L</p>
              </div>
              <div className="text-center p-3 bg-green-50 rounded-lg">
                <p className="text-[10px] text-slate-500">{mDairyDays}일 총 납유량</p>
                <p className="text-sm font-bold text-green-700">{mDairyTotal.toFixed(1)}L</p>
                {mDairyOverL > 0 && (
                  <p className="text-[9px] text-amber-600">정상 {mDairyNormalL.toFixed(0)}L + 초과 {mDairyOverL.toFixed(0)}L</p>
                )}
              </div>
              <div className="text-center p-3 bg-green-100 rounded-lg border border-green-300 col-span-2 md:col-span-2">
                <p className="text-[10px] text-green-600 font-semibold">납유대금</p>
                <p className="text-xl font-black text-green-800">{mDairyPayment.toLocaleString()}원</p>
                {mDairyOverL > 0 && (
                  <p className="text-[9px] text-slate-500">
                    정상 {Math.round(mDairyNormalL * dairyPrice).toLocaleString()} + 초과 {Math.round(mDairyOverL * (dairyPrice - dairyOverPrice)).toLocaleString()}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* D2O 정산 */}
          <div>
            <h4 className="text-sm font-semibold text-blue-700 mb-2">🏭 D2O 농업회사법인</h4>
            <div className="grid grid-cols-4 gap-3">
              <div className="text-center p-3 bg-blue-50 rounded-lg">
                <p className="text-[10px] text-slate-500">단가</p>
                <p className="text-sm font-bold text-blue-700">{d2oPrice.toLocaleString()}원/L</p>
              </div>
              <div className="text-center p-3 bg-blue-50 rounded-lg">
                <p className="text-[10px] text-slate-500">납유일수</p>
                <p className="text-sm font-bold text-blue-700">{mD2oDays}일</p>
              </div>
              <div className="text-center p-3 bg-blue-50 rounded-lg">
                <p className="text-[10px] text-slate-500">총 납유량</p>
                <p className="text-sm font-bold text-blue-700">{mD2oTotal.toFixed(1)}L</p>
              </div>
              <div className="text-center p-3 bg-blue-100 rounded-lg border border-blue-300">
                <p className="text-[10px] text-blue-600 font-semibold">납유대금</p>
                <p className="text-lg font-black text-blue-800">{mD2oPayment.toLocaleString()}원</p>
              </div>
            </div>
          </div>

          {/* 합계 */}
          <div className="mt-4 p-4 bg-slate-100 rounded-lg flex justify-between items-center">
            <span className="text-sm font-semibold text-slate-600">{monthLabel} 총 납유대금</span>
            <span className="text-2xl font-black text-slate-900">
              {(mDairyPayment + mD2oPayment).toLocaleString()}원
            </span>
          </div>
        </CardContent>
      </Card>

      {/* 30일 트렌드 차트 */}
      <Card>
        <CardHeader><CardTitle className="text-base">30일 추이</CardTitle></CardHeader>
        <CardContent>
          {dailyHistory.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={dailyHistory}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip formatter={(v) => [`${parseFloat(v).toFixed(1)}L`]} />
                <Legend fontSize={11} />
                <ReferenceLine y={DAILY_TARGET} stroke="#94a3b8" strokeDasharray="5 5" />
                <Line type="monotone" dataKey="total_l" name="총 착유량"
                  stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 2 }} />
                <Line type="monotone" dataKey="dairy_assoc_l" name="진흥회"
                  stroke="#22c55e" strokeWidth={2} dot={{ r: 2 }} />
                <Line type="monotone" dataKey="d2o_l" name="D2O"
                  stroke="#3b82f6" strokeWidth={2} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-center text-slate-400 py-12">착유 데이터가 없습니다.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
