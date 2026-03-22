/**
 * @fileoverview 통합 대시보드 페이지 (Phase 0 초기 버전)
 */
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Milk, Factory, ShoppingCart, Coffee, TrendingUp, AlertTriangle } from 'lucide-react'

const KPI_CARDS = [
  { label: '오늘 착유량', value: '— L', icon: Milk, color: 'text-amber-500', bg: 'bg-amber-50' },
  { label: '공장 가동', value: '대기', icon: Factory, color: 'text-blue-500', bg: 'bg-blue-50' },
  { label: '오늘 주문', value: '— 건', icon: ShoppingCart, color: 'text-emerald-500', bg: 'bg-emerald-50' },
  { label: '카페 매출', value: '— 원', icon: Coffee, color: 'text-violet-500', bg: 'bg-violet-50' },
  { label: '월 매출 합계', value: '— 원', icon: TrendingUp, color: 'text-slate-600', bg: 'bg-slate-50' },
  { label: '알림', value: '0건', icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-50' },
]

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">경영 대시보드</h1>
        <p className="text-sm text-slate-500 mt-1">HEY HAY MILK 통합 현황</p>
      </div>

      {/* KPI 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {KPI_CARDS.map(({ label, value, icon: Icon, color, bg }) => (
          <Card key={label} className="hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className={`w-10 h-10 rounded-lg ${bg} flex items-center justify-center mb-3`}>
                <Icon className={`w-5 h-5 ${color}`} />
              </div>
              <p className="text-xs text-slate-500">{label}</p>
              <p className="text-lg font-bold text-slate-800 mt-0.5">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 모듈 현황 (Phase 1~4에서 채워짐) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Milk className="w-5 h-5 text-amber-500" />
              목장 현황
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-400">Phase 1에서 착유량 차트, 개체 현황이 표시됩니다.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Factory className="w-5 h-5 text-blue-500" />
              공장 현황
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-400">Phase 2에서 생산 배치, CCP 상태가 표시됩니다.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-emerald-500" />
              판매 현황
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-400">Phase 3에서 주문 현황, 구독자 통계가 표시됩니다.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Coffee className="w-5 h-5 text-violet-500" />
              카페 현황
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-400">Phase 3에서 매출 트렌드, 정산 현황이 표시됩니다.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
