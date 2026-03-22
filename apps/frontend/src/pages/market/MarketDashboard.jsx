/**
 * @fileoverview 온라인 마켓 대시보드
 * 주문 현황 + 구독 통계 + 고객 세그먼트
 */
import { useState, useEffect, useCallback } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { apiGet, apiPost } from '@/lib/api'
import { ShoppingCart, Users, CreditCard, TrendingUp, Plus, X, Package } from 'lucide-react'
import { cn } from '@/lib/utils'

const ORDER_STATUS = {
  PENDING: { label: '대기', color: 'bg-slate-100 text-slate-700' },
  PAID: { label: '결제완료', color: 'bg-blue-100 text-blue-700' },
  PROCESSING: { label: '처리중', color: 'bg-amber-100 text-amber-700' },
  PACKED: { label: '포장완료', color: 'bg-indigo-100 text-indigo-700' },
  SHIPPED: { label: '배송중', color: 'bg-violet-100 text-violet-700' },
  DELIVERED: { label: '배송완료', color: 'bg-green-100 text-green-700' },
  CANCELLED: { label: '취소', color: 'bg-red-100 text-red-700' },
  RETURNED: { label: '반품', color: 'bg-red-100 text-red-700' },
}

export default function MarketDashboard() {
  const [orderStats, setOrderStats] = useState(null)
  const [subStats, setSubStats] = useState(null)
  const [custStats, setCustStats] = useState(null)
  const [recentOrders, setRecentOrders] = useState([])
  const [subscriptions, setSubscriptions] = useState([])

  const fetchData = useCallback(async () => {
    const [oRes, sRes, cRes, roRes, subRes] = await Promise.all([
      apiGet('/market/orders/stats'),
      apiGet('/market/subscriptions/stats'),
      apiGet('/market/customers/stats'),
      apiGet('/market/orders?limit=10'),
      apiGet('/market/subscriptions?status=ACTIVE&limit=10'),
    ])
    if (oRes.success) setOrderStats(oRes.data)
    if (sRes.success) setSubStats(sRes.data)
    if (cRes.success) setCustStats(cRes.data)
    if (roRes.success) setRecentOrders(roRes.data)
    if (subRes.success) setSubscriptions(subRes.data)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <ShoppingCart className="w-6 h-6 text-emerald-500" />
          온라인 마켓
        </h1>
        <p className="text-sm text-slate-500 mt-1">스마트스토어 · 자사몰 · 정기구독 통합 관리</p>
      </div>

      {/* KPI 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-500">오늘 주문</p>
            <p className="text-2xl font-bold text-emerald-600">{orderStats?.today_orders || 0}건</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-500">오늘 매출</p>
            <p className="text-xl font-bold">{parseInt(orderStats?.today_revenue || 0).toLocaleString()}원</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-500">월 매출</p>
            <p className="text-xl font-bold text-blue-600">{parseInt(orderStats?.month_revenue || 0).toLocaleString()}원</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-500">활성 구독</p>
            <p className="text-2xl font-bold text-violet-600">{subStats?.active || 0}명</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-500">MRR</p>
            <p className="text-xl font-bold">{parseInt(subStats?.monthly_recurring_revenue || 0).toLocaleString()}원</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-500">총 고객</p>
            <p className="text-2xl font-bold">{custStats?.total || 0}명</p>
            <p className="text-[10px] text-slate-400">VIP {custStats?.vip_count || 0}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 최근 주문 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="w-4 h-4" /> 최근 주문
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentOrders.length > 0 ? (
              <div className="space-y-2">
                {recentOrders.map((o) => (
                  <div key={o.id} className="flex items-center gap-3 p-3 border rounded-lg">
                    <span className="font-mono text-xs text-slate-600">{o.order_number}</span>
                    <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium', ORDER_STATUS[o.status]?.color)}>
                      {ORDER_STATUS[o.status]?.label}
                    </span>
                    <span className="text-sm text-slate-500">{o.customer_name || '-'}</span>
                    <span className="text-sm font-semibold ml-auto">{parseInt(o.total_amount).toLocaleString()}원</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-slate-400 py-8">주문 데이터 없음</p>
            )}
          </CardContent>
        </Card>

        {/* 활성 구독 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CreditCard className="w-4 h-4" /> 활성 구독
            </CardTitle>
          </CardHeader>
          <CardContent>
            {subscriptions.length > 0 ? (
              <div className="space-y-2">
                {subscriptions.map((s) => (
                  <div key={s.id} className="flex items-center gap-3 p-3 border rounded-lg">
                    <span className="text-sm font-medium">{s.customer_name}</span>
                    <span className="text-xs text-slate-400">{s.frequency}</span>
                    <span className="text-sm font-semibold ml-auto">
                      {parseInt(s.price_per_cycle).toLocaleString()}원/회
                    </span>
                    <span className="text-[10px] text-slate-400">
                      다음결제 {s.next_payment_at}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-slate-400 py-8">활성 구독 없음</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
