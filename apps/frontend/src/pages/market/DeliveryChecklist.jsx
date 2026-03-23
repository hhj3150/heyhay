/**
 * @fileoverview 배송 체크리스트 — 구독자 주문 누락 절대 방지
 * 매일 아침: 체크리스트 생성 → 수량 검증 → 포장 → 발송 → 완료
 * 제3자 직원이 이 화면만 따라가면 실수 없이 배송 처리
 */
import { useState, useEffect, useCallback } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { apiGet, apiPost, apiPut } from '@/lib/api'
import {
  ClipboardCheck, PackageCheck, Truck, CheckCircle2, AlertTriangle,
  RefreshCw, ChevronLeft, ChevronRight, Search, Package, Shield,
  Snowflake, Phone, MapPin,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const SOURCE_BADGE = {
  SUBSCRIPTION: { label: '정기구독', color: 'bg-violet-100 text-violet-700' },
  ORDER: { label: '일반주문', color: 'bg-blue-100 text-blue-700' },
  B2B: { label: 'B2B', color: 'bg-indigo-100 text-indigo-700' },
}

const FILTER_TABS = [
  { key: 'all', label: '전체' },
  { key: 'unpacked', label: '미포장' },
  { key: 'packed', label: '포장완료' },
  { key: 'done', label: '발송완료' },
  { key: 'issue', label: '이슈' },
]

export default function DeliveryChecklist() {
  const [items, setItems] = useState([])
  const [stats, setStats] = useState(null)
  const [filter, setFilter] = useState('all')
  const [dateOffset, setDateOffset] = useState(0)
  const [search, setSearch] = useState('')
  const [shipModal, setShipModal] = useState(null)
  const [shipForm, setShipForm] = useState({ courier: 'CJ대한통운', tracking_number: '' })

  // KST 기준 오늘 날짜 계산 (toISOString은 UTC 기준이라 KST에서 날짜가 달라질 수 있음)
  const getKstDateStr = (offsetDays = 0) => {
    const now = new Date()
    now.setDate(now.getDate() + offsetDays)
    const y = now.toLocaleDateString('ko-KR', { year: 'numeric', timeZone: 'Asia/Seoul' }).replace(/[^0-9]/g, '')
    const m = now.toLocaleDateString('ko-KR', { month: '2-digit', timeZone: 'Asia/Seoul' }).replace(/[^0-9]/g, '').padStart(2, '0')
    const d = now.toLocaleDateString('ko-KR', { day: '2-digit', timeZone: 'Asia/Seoul' }).replace(/[^0-9]/g, '').padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  const dateStr = getKstDateStr(dateOffset)
  const today = new Date(dateStr + 'T00:00:00+09:00')

  const fetchData = useCallback(async () => {
    const statusParam = filter === 'all' ? '' : `&status=${filter}`
    const [itemsRes, statsRes] = await Promise.all([
      apiGet(`/market/checklist?date=${dateStr}${statusParam}`),
      apiGet(`/market/checklist/stats?date=${dateStr}`),
    ])
    if (itemsRes.success) {
      if (itemsRes.data.length === 0) {
        // 체크리스트가 비어있으면 자동 생성 시도
        const genRes = await apiPost('/market/checklist/generate', { date: dateStr })
        if (genRes.success) {
          const [reItemsRes, reStatsRes] = await Promise.all([
            apiGet(`/market/checklist?date=${dateStr}${statusParam}`),
            apiGet(`/market/checklist/stats?date=${dateStr}`),
          ])
          if (reItemsRes.success) setItems(reItemsRes.data)
          if (reStatsRes.success) setStats(reStatsRes.data)
          return
        }
      }
      setItems(itemsRes.data)
    }
    if (statsRes.success) setStats(statsRes.data)
  }, [dateStr, filter])

  useEffect(() => { fetchData() }, [fetchData])

  const generateChecklist = async () => {
    const res = await apiPost('/market/checklist/generate', { date: dateStr })
    if (res.success) fetchData()
  }

  const packItem = async (id) => {
    await apiPut(`/market/checklist/${id}/pack`, {})
    fetchData()
  }

  const verifyItem = async (id) => {
    await apiPut(`/market/checklist/${id}/verify`, {})
    fetchData()
  }

  const shipItem = async () => {
    if (!shipModal) return
    await apiPut(`/market/checklist/${shipModal}/ship`, shipForm)
    setShipModal(null)
    setShipForm({ courier: 'CJ대한통운', tracking_number: '' })
    fetchData()
  }

  const reportIssue = async (id) => {
    const note = prompt('이슈 내용을 입력하세요:')
    if (!note) return
    await apiPut(`/market/checklist/${id}/issue`, { issue_note: note })
    fetchData()
  }

  // 검색
  const filtered = items.filter((item) => {
    if (!search) return true
    const q = search.toLowerCase()
    return item.customer_name?.toLowerCase().includes(q) ||
           item.customer_phone?.includes(q)
  })

  const completionPct = stats?.completion_pct || 0

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <ClipboardCheck className="w-6 h-6 text-emerald-500" />
            배송 체크리스트
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            구독·주문·B2B — 하나도 빠짐없이
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <Button variant="outline" size="sm" onClick={() => setDateOffset((d) => d - 1)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setDateOffset(0)}>오늘</Button>
          <Button variant="outline" size="sm" onClick={() => setDateOffset((d) => d + 1)}>
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button size="sm" onClick={generateChecklist}>
            <RefreshCw className="w-4 h-4 mr-1" />
            체크리스트 생성
          </Button>
        </div>
      </div>

      {/* 날짜 + 진행률 */}
      <Card className={cn('border-2', completionPct === 100 ? 'border-green-300 bg-green-50' : 'border-slate-200')}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-lg font-bold">
              {today.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
            </span>
            <span className={cn('text-2xl font-black', completionPct === 100 ? 'text-green-600' : 'text-blue-600')}>
              {completionPct}%
            </span>
          </div>

          {/* 진행바 */}
          <div className="h-3 bg-slate-200 rounded-full overflow-hidden mb-3">
            <div className="h-full bg-gradient-to-r from-blue-500 to-green-500 rounded-full transition-all"
              style={{ width: `${completionPct}%` }} />
          </div>

          {/* 요약 숫자 */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center">
            <div className="p-2 bg-white rounded-lg">
              <p className="text-[10px] text-slate-400">전체</p>
              <p className="text-xl font-black">{stats?.total || 0}</p>
            </div>
            <div className="p-2 bg-amber-50 rounded-lg">
              <p className="text-[10px] text-amber-500">포장</p>
              <p className="text-xl font-black text-amber-600">{stats?.packed || 0}</p>
            </div>
            <div className="p-2 bg-blue-50 rounded-lg">
              <p className="text-[10px] text-blue-500">발송</p>
              <p className="text-xl font-black text-blue-600">{stats?.shipped || 0}</p>
            </div>
            <div className="p-2 bg-green-50 rounded-lg">
              <p className="text-[10px] text-green-500">검증</p>
              <p className="text-xl font-black text-green-600">{stats?.verified || 0}</p>
            </div>
            <div className="p-2 bg-red-50 rounded-lg">
              <p className="text-[10px] text-red-500">이슈</p>
              <p className="text-xl font-black text-red-600">{stats?.issues || 0}</p>
            </div>
            <div className="p-2 bg-slate-50 rounded-lg">
              <p className="text-[10px] text-slate-400">금액</p>
              <p className="text-sm font-black">{(stats?.total_amount || 0).toLocaleString()}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 필터 + 검색 */}
      <div className="flex flex-col sm:flex-row justify-between gap-2">
        <div className="flex gap-1 overflow-x-auto">
          {FILTER_TABS.map((tab) => (
            <button key={tab.key} onClick={() => setFilter(tab.key)}
              className={cn('px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors',
                filter === tab.key ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-100')}>
              {tab.label}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-2 w-4 h-4 text-slate-400" />
          <Input placeholder="고객명/전화 검색" className="pl-9 h-8 text-xs w-48"
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {/* 체크리스트 항목 */}
      <div className="space-y-2">
        {filtered.map((item) => {
          const items_ = typeof item.items === 'string' ? JSON.parse(item.items) : item.items
          const badge = SOURCE_BADGE[item.source_type] || SOURCE_BADGE.ORDER
          const allDone = item.is_shipped
          const hasIssue = item.has_issue

          return (
            <div key={item.id} className={cn(
              'border rounded-xl p-4 transition-all',
              hasIssue ? 'bg-red-50 border-red-200' :
              allDone ? 'bg-green-50/50 border-green-200' :
              item.is_packed ? 'bg-blue-50/50 border-blue-200' : 'bg-white border-slate-200',
            )}>
              {/* 상단: 고객 + 뱃지 + 체크 */}
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className={cn('text-[9px] px-2 py-0.5 rounded-full font-bold', badge.color)}>
                    {badge.label}
                  </span>
                  <span className="font-semibold text-sm">{item.customer_name}</span>
                  {item.customer_phone && (
                    <span className="text-[10px] text-slate-400 hidden sm:inline">
                      <Phone className="w-3 h-3 inline mr-0.5" />{item.customer_phone}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {item.qty_verified && <Shield className="w-4 h-4 text-green-500" title="수량 검증됨" />}
                  {item.is_packed && <PackageCheck className="w-4 h-4 text-blue-500" title="포장 완료" />}
                  {item.is_shipped && <Truck className="w-4 h-4 text-violet-500" title="발송 완료" />}
                  {item.is_delivered && <CheckCircle2 className="w-4 h-4 text-green-500" title="배송 완료" />}
                  {hasIssue && <AlertTriangle className="w-4 h-4 text-red-500" title="이슈" />}
                </div>
              </div>

              {/* 제품 목록 */}
              <div className="flex flex-wrap gap-2 mb-2">
                {items_?.map((p, i) => (
                  <div key={i} className="flex items-center gap-1 bg-white px-2 py-1 rounded border text-xs">
                    <span className="font-medium">{p.sku_name || p.sku_code}</span>
                    <span className="text-blue-600 font-bold">×{p.quantity}</span>
                  </div>
                ))}
                <div className="flex items-center gap-1 text-xs text-emerald-600 font-bold">
                  {parseInt(item.total_amount).toLocaleString()}원
                </div>
                {item.ice_pack_count > 0 && (
                  <div className="flex items-center gap-0.5 text-[10px] text-blue-400">
                    <Snowflake className="w-3 h-3" />×{item.ice_pack_count}
                  </div>
                )}
              </div>

              {/* 주소 + 메모 */}
              {item.shipping_address && (
                <div className="text-[10px] text-slate-400 flex items-start gap-1 mb-1">
                  <MapPin className="w-3 h-3 mt-0.5 shrink-0" />
                  <span className="line-clamp-1">{item.shipping_address}</span>
                </div>
              )}
              {item.shipping_memo && (
                <div className="text-[10px] bg-amber-50 text-amber-700 px-2 py-1 rounded font-medium mb-2">
                  {item.shipping_memo}
                </div>
              )}

              {/* 이슈 */}
              {item.issue_note && (
                <div className="text-[10px] bg-red-100 text-red-700 px-2 py-1 rounded font-medium mb-2">
                  {item.issue_note}
                </div>
              )}

              {/* 운송장 */}
              {item.tracking_number && (
                <div className="text-[10px] bg-violet-50 text-violet-700 px-2 py-1 rounded mb-2">
                  {item.courier} {item.tracking_number}
                </div>
              )}

              {/* 액션 버튼 */}
              {!allDone && (
                <div className="flex gap-2 mt-2">
                  {!item.qty_verified && (
                    <Button size="sm" variant="outline" className="text-xs h-7"
                      onClick={() => verifyItem(item.id)}>
                      <Shield className="w-3 h-3 mr-1" />수량 검증
                    </Button>
                  )}
                  {!item.is_packed && (
                    <Button size="sm" variant="outline" className="text-xs h-7"
                      onClick={() => packItem(item.id)}>
                      <PackageCheck className="w-3 h-3 mr-1" />포장 완료
                    </Button>
                  )}
                  {item.is_packed && !item.is_shipped && (
                    <Button size="sm" className="text-xs h-7"
                      onClick={() => setShipModal(item.id)}>
                      <Truck className="w-3 h-3 mr-1" />발송 처리
                    </Button>
                  )}
                  {!hasIssue && (
                    <Button size="sm" variant="ghost" className="text-xs h-7 text-red-400"
                      onClick={() => reportIssue(item.id)}>
                      <AlertTriangle className="w-3 h-3 mr-1" />이슈
                    </Button>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {filtered.length === 0 && (
          <div className="text-center py-12">
            <p className="text-slate-400 mb-3">체크리스트가 비어있습니다</p>
            <Button onClick={generateChecklist}>
              <RefreshCw className="w-4 h-4 mr-1" />
              오늘 체크리스트 생성
            </Button>
          </div>
        )}
      </div>

      {/* 발송 모달 */}
      {shipModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-5">
            <h3 className="text-lg font-bold mb-4">발송 처리</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-600">택배사</label>
                <select className="w-full h-10 px-3 border rounded-md text-sm" value={shipForm.courier}
                  onChange={(e) => setShipForm((f) => ({ ...f, courier: e.target.value }))}>
                  <option>CJ대한통운</option><option>롯데택배</option>
                  <option>한진택배</option><option>우체국</option><option>로젠택배</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">운송장 번호</label>
                <Input value={shipForm.tracking_number} placeholder="운송장 번호"
                  onChange={(e) => setShipForm((f) => ({ ...f, tracking_number: e.target.value }))} />
              </div>
              <div className="flex gap-2 pt-2">
                <Button onClick={shipItem} className="flex-1">발송 완료</Button>
                <Button variant="outline" onClick={() => setShipModal(null)}>취소</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
