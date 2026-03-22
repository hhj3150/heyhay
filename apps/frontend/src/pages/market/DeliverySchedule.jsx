/**
 * @fileoverview 배송 스케줄 캘린더
 * 이번주 월~일 누구에게 / 무엇을 / 보내야 하는지 한눈에
 * 제3자 직원이 매일 아침 이 화면을 보고 포장 시작
 */
import { useState, useEffect, useCallback } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { apiGet } from '@/lib/api'
import {
  Calendar, ChevronLeft, ChevronRight, Truck, Package,
  Snowflake, Clock, User, MapPin, Phone, CreditCard,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토']

/**
 * 주간 날짜 배열 생성
 * @param {Date} baseDate - 기준일
 * @returns {Date[]} 월~일 7일
 */
const getWeekDates = (baseDate) => {
  const d = new Date(baseDate)
  const day = d.getDay()
  const monday = new Date(d)
  monday.setDate(d.getDate() - (day === 0 ? 6 : day - 1))

  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(monday)
    date.setDate(monday.getDate() + i)
    return date
  })
}

const formatDate = (d) => d.toISOString().split('T')[0]
const isToday = (d) => formatDate(d) === formatDate(new Date())

export default function DeliverySchedule() {
  const [weekOffset, setWeekOffset] = useState(0)
  const [orders, setOrders] = useState({})
  const [subscriptionDeliveries, setSubscriptionDeliveries] = useState({})
  const [expandedDay, setExpandedDay] = useState(null)

  const baseDate = new Date()
  baseDate.setDate(baseDate.getDate() + weekOffset * 7)
  const weekDates = getWeekDates(baseDate)

  const fetchSchedule = useCallback(async () => {
    const from = formatDate(weekDates[0])
    const to = formatDate(weekDates[6])

    // 배송 대기 주문 (PAID + PROCESSING + PACKED 상태)
    const [paidRes, procRes, packRes, subRes] = await Promise.all([
      apiGet(`/market/orders?status=PAID&date_from=${from}&date_to=${to}&limit=100`),
      apiGet(`/market/orders?status=PROCESSING&date_from=${from}&date_to=${to}&limit=100`),
      apiGet(`/market/orders?status=PACKED&date_from=${from}&date_to=${to}&limit=100`),
      apiGet(`/market/subscriptions?status=ACTIVE&limit=100`),
    ])

    // 날짜별 주문 그루핑
    const allOrders = [
      ...(paidRes.success ? paidRes.data : []),
      ...(procRes.success ? procRes.data : []),
      ...(packRes.success ? packRes.data : []),
    ]

    const grouped = {}
    weekDates.forEach((d) => { grouped[formatDate(d)] = [] })

    allOrders.forEach((o) => {
      const date = formatDate(new Date(o.created_at))
      if (grouped[date]) {
        grouped[date].push({ ...o, type: 'order' })
      }
    })

    setOrders(grouped)

    // 구독 배송 스케줄 계산
    const subDeliveries = {}
    weekDates.forEach((d) => { subDeliveries[formatDate(d)] = [] })

    if (subRes.success) {
      const freqDays = { '1W': 7, '2W': 14, '4W': 28 }

      subRes.data.forEach((s) => {
        if (!s.next_payment_at) return
        const nextDate = new Date(s.next_payment_at)
        const freq = freqDays[s.frequency] || 7

        // 이번주에 해당하는 배송일 계산
        weekDates.forEach((wd) => {
          const diff = Math.round((wd - nextDate) / (1000 * 60 * 60 * 24))
          if (diff % freq === 0 || formatDate(wd) === formatDate(nextDate)) {
            const key = formatDate(wd)
            if (subDeliveries[key]) {
              const items = typeof s.items === 'string' ? JSON.parse(s.items) : s.items
              subDeliveries[key].push({
                ...s,
                type: 'subscription',
                items,
              })
            }
          }
        })
      })
    }

    setSubscriptionDeliveries(subDeliveries)
  }, [weekOffset])

  useEffect(() => { fetchSchedule() }, [fetchSchedule])

  // 하루 총 건수
  const getDayTotal = (dateStr) => {
    return (orders[dateStr]?.length || 0) + (subscriptionDeliveries[dateStr]?.length || 0)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Calendar className="w-6 h-6 text-blue-500" />
            배송 스케줄
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            이번주 배송 계획 · 구독 배송 + 일반 주문
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setWeekOffset((w) => w - 1)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setWeekOffset(0)}>
            이번주
          </Button>
          <Button variant="outline" size="sm" onClick={() => setWeekOffset((w) => w + 1)}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* 주간 캘린더 헤더 */}
      <div className="text-center text-sm font-medium text-slate-500 mb-2">
        {weekDates[0].toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' })} —{' '}
        {weekDates[0].getDate()}일 ~ {weekDates[6].getDate()}일
      </div>

      {/* 주간 그리드 */}
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-2">
        {weekDates.map((date, idx) => {
          const dateStr = formatDate(date)
          const dayOrders = orders[dateStr] || []
          const daySubs = subscriptionDeliveries[dateStr] || []
          const total = getDayTotal(dateStr)
          const today = isToday(date)
          const isExpanded = expandedDay === dateStr
          const isWeekend = idx >= 5

          return (
            <div key={dateStr}
              onClick={() => setExpandedDay(isExpanded ? null : dateStr)}
              className={cn(
                'rounded-xl border cursor-pointer transition-all min-h-[140px]',
                today ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-200' :
                isWeekend ? 'bg-slate-50 border-slate-200' : 'bg-white border-slate-200',
                isExpanded && 'ring-2 ring-blue-400',
              )}>
              {/* 날짜 헤더 */}
              <div className={cn('text-center py-2 border-b',
                today ? 'border-blue-200' : 'border-slate-100')}>
                <p className={cn('text-[10px] font-medium',
                  isWeekend ? 'text-red-400' : 'text-slate-400')}>
                  {DAY_NAMES[date.getDay()]}
                </p>
                <p className={cn('text-lg font-bold',
                  today ? 'text-blue-600' : 'text-slate-700')}>
                  {date.getDate()}
                </p>
              </div>

              {/* 배송 건수 요약 */}
              <div className="p-2">
                {total > 0 ? (
                  <>
                    {/* 구독 배송 */}
                    {daySubs.length > 0 && (
                      <div className="flex items-center gap-1 mb-1">
                        <div className="w-2 h-2 rounded-full bg-violet-400" />
                        <span className="text-[10px] font-medium text-violet-600">
                          구독 {daySubs.length}건
                        </span>
                      </div>
                    )}

                    {/* 일반 주문 */}
                    {dayOrders.length > 0 && (
                      <div className="flex items-center gap-1 mb-1">
                        <div className="w-2 h-2 rounded-full bg-emerald-400" />
                        <span className="text-[10px] font-medium text-emerald-600">
                          주문 {dayOrders.length}건
                        </span>
                      </div>
                    )}

                    {/* 미니 리스트 */}
                    <div className="mt-2 space-y-1">
                      {[...daySubs.slice(0, 2), ...dayOrders.slice(0, 2)].map((item, i) => (
                        <div key={i} className="text-[9px] bg-white/80 px-1.5 py-1 rounded border border-slate-100 truncate">
                          <span className="font-medium">{item.customer_name || item.recipient_name}</span>
                          {item.type === 'subscription' && (
                            <span className="text-violet-500 ml-1">
                              {item.items?.map((it) => it.sku_code).join('+')}
                            </span>
                          )}
                        </div>
                      ))}
                      {total > 4 && (
                        <p className="text-[9px] text-slate-400 text-center">+{total - 4}건 더</p>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="text-center text-[10px] text-slate-300 mt-4">배송 없음</p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* 확장된 날짜 상세 */}
      {expandedDay && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Truck className="w-4 h-4 text-blue-500" />
              {new Date(expandedDay).toLocaleDateString('ko-KR', {
                month: 'long', day: 'numeric', weekday: 'long',
              })} 배송 상세
              <span className="text-xs font-normal text-slate-400">
                ({getDayTotal(expandedDay)}건)
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {/* 구독 배송 */}
              {(subscriptionDeliveries[expandedDay] || []).map((s, i) => (
                <div key={`sub-${i}`} className="flex items-center gap-4 p-3 border rounded-lg bg-violet-50/50">
                  <div className="w-8 h-8 bg-violet-100 rounded-full flex items-center justify-center shrink-0">
                    <CreditCard className="w-4 h-4 text-violet-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{s.customer_name}</span>
                      <span className="text-[9px] px-1.5 py-0.5 bg-violet-100 text-violet-700 rounded font-medium">정기구독</span>
                      <span className="text-[10px] text-slate-400">
                        {s.frequency === '1W' ? '주 1회' : s.frequency === '2W' ? '격주' : '월 1회'}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      {s.items?.map((it) => `${it.sku_code} × ${it.quantity}`).join(' · ')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-slate-400 shrink-0">
                    <Phone className="w-3 h-3" />
                    {s.customer_phone}
                  </div>
                  <span className="text-sm font-bold text-violet-600 shrink-0">
                    {parseInt(s.price_per_cycle).toLocaleString()}원
                  </span>
                </div>
              ))}

              {/* 일반 주문 */}
              {(orders[expandedDay] || []).map((o) => (
                <div key={o.id} className="flex items-center gap-4 p-3 border rounded-lg bg-emerald-50/50">
                  <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center shrink-0">
                    <Package className="w-4 h-4 text-emerald-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{o.recipient_name || o.customer_name}</span>
                      <span className="font-mono text-[10px] text-slate-400">{o.order_number}</span>
                    </div>
                    {o.shipping_address && (
                      <div className="flex items-center gap-1 text-[10px] text-slate-500 mt-0.5">
                        <MapPin className="w-3 h-3" />
                        <span className="truncate">{o.shipping_address}</span>
                      </div>
                    )}
                    {o.shipping_memo && (
                      <p className="text-[10px] text-amber-600 mt-0.5">📌 {o.shipping_memo}</p>
                    )}
                  </div>
                  {o.ice_pack_count > 0 && (
                    <div className="flex items-center gap-0.5 text-[10px] text-blue-500 shrink-0">
                      <Snowflake className="w-3 h-3" />
                      ×{o.ice_pack_count}
                    </div>
                  )}
                  <span className="text-sm font-bold text-emerald-600 shrink-0">
                    {parseInt(o.total_amount).toLocaleString()}원
                  </span>
                </div>
              ))}

              {getDayTotal(expandedDay) === 0 && (
                <p className="text-center text-slate-400 py-6">이 날은 배송이 없습니다</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 범례 */}
      <div className="flex items-center gap-6 text-xs text-slate-500">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-violet-400" />
          <span>정기구독 배송</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-emerald-400" />
          <span>일반 주문 배송</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-blue-50 border border-blue-300" />
          <span>오늘</span>
        </div>
      </div>
    </div>
  )
}

