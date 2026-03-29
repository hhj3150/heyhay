/**
 * @fileoverview 배송 체크리스트 — 구독자 주문 누락 절대 방지
 * 매일 아침: 체크리스트 생성 → 수량 검증 → 포장 → 발송 → 완료
 * 제3자 직원이 이 화면만 따라가면 실수 없이 배송 처리
 * 모바일: 큰 체크박스 + 스와이프 액션 + 풀너비 버튼
 */
import { useState, useEffect, useCallback } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { apiGet, apiPost, apiPut } from '@/lib/api'
import { useNavigate } from 'react-router-dom'
import {
  ClipboardCheck, PackageCheck, Truck, CheckCircle2, AlertTriangle,
  RefreshCw, ChevronLeft, ChevronRight, Search, Package, Shield,
  Snowflake, Phone, MapPin, Printer,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import SwipeableItem from '@/components/mobile/SwipeableItem'

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
  const navigate = useNavigate()

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
    <div className="space-y-3 sm:space-y-4 max-w-5xl mx-auto px-3 sm:px-0">
      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-500" />
            배송 체크리스트
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            구독·주문·B2B — 하나도 빠짐없이
          </p>
        </div>
        <div className="flex gap-1.5 sm:gap-2 items-center w-full sm:w-auto">
          <Button variant="outline" size="sm" className="touch-target touch-feedback" onClick={() => setDateOffset((d) => d - 1)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" className="touch-target touch-feedback" onClick={() => setDateOffset(0)}>오늘</Button>
          <Button variant="outline" size="sm" className="touch-target touch-feedback" onClick={() => setDateOffset((d) => d + 1)}>
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button size="sm" variant="outline" className="h-10 touch-feedback" onClick={() => navigate(`/market/manifest?date=${dateStr}`)}>
            <Printer className="w-4 h-4 mr-1" />
            <span className="hidden sm:inline">배송원장</span>
          </Button>
          <Button size="sm" className="flex-1 sm:flex-none h-10 touch-feedback" onClick={generateChecklist}>
            <RefreshCw className="w-4 h-4 mr-1" />
            체크리스트 생성
          </Button>
        </div>
      </div>

      {/* 날짜 + 진행률 */}
      <Card className={cn('border-2', completionPct === 100 ? 'border-green-300 bg-green-50' : 'border-slate-200')}>
        <CardContent className="p-3 sm:p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-base sm:text-lg font-bold">
              {today.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
            </span>
            <span className={cn('text-xl sm:text-2xl font-black', completionPct === 100 ? 'text-green-600' : 'text-blue-600')}>
              {completionPct}%
            </span>
          </div>

          {/* 진행바 */}
          <div className="h-3 bg-slate-200 rounded-full overflow-hidden mb-3">
            <div className="h-full bg-gradient-to-r from-blue-500 to-green-500 rounded-full transition-all"
              style={{ width: `${completionPct}%` }} />
          </div>

          {/* 통계 바 — 모바일에서 2줄 (3+3) */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 sm:gap-2 text-center">
            <div className="p-1.5 sm:p-2 bg-white rounded-lg">
              <p className="text-[9px] sm:text-[10px] text-slate-400">전체</p>
              <p className="text-lg sm:text-xl font-black">{stats?.total || 0}</p>
            </div>
            <div className="p-1.5 sm:p-2 bg-amber-50 rounded-lg">
              <p className="text-[9px] sm:text-[10px] text-amber-500">포장</p>
              <p className="text-lg sm:text-xl font-black text-amber-600">{stats?.packed || 0}</p>
            </div>
            <div className="p-1.5 sm:p-2 bg-blue-50 rounded-lg">
              <p className="text-[9px] sm:text-[10px] text-blue-500">발송</p>
              <p className="text-lg sm:text-xl font-black text-blue-600">{stats?.shipped || 0}</p>
            </div>
            <div className="p-1.5 sm:p-2 bg-green-50 rounded-lg">
              <p className="text-[9px] sm:text-[10px] text-green-500">검증</p>
              <p className="text-lg sm:text-xl font-black text-green-600">{stats?.verified || 0}</p>
            </div>
            <div className="p-1.5 sm:p-2 bg-red-50 rounded-lg">
              <p className="text-[9px] sm:text-[10px] text-red-500">이슈</p>
              <p className="text-lg sm:text-xl font-black text-red-600">{stats?.issues || 0}</p>
            </div>
            <div className="p-1.5 sm:p-2 bg-slate-50 rounded-lg">
              <p className="text-[9px] sm:text-[10px] text-slate-400">금액</p>
              <p className="text-xs sm:text-sm font-black">{(stats?.total_amount || 0).toLocaleString()}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 필터 + 검색 */}
      <div className="flex flex-col sm:flex-row justify-between gap-2">
        <div className="flex gap-1 overflow-x-auto snap-scroll-x -mx-3 px-3 sm:mx-0 sm:px-0">
          {FILTER_TABS.map((tab) => (
            <button key={tab.key} onClick={() => setFilter(tab.key)}
              className={cn('px-3 py-2 rounded-full text-xs font-medium whitespace-nowrap transition-colors touch-target touch-feedback',
                filter === tab.key ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-100')}>
              {tab.label}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <Input placeholder="고객명/전화 검색" className="pl-9 h-10 text-sm w-full sm:w-48"
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {/* 체크리스트 항목 */}
      <div className="space-y-2 scroll-momentum">
        {filtered.map((item) => {
          const items_ = typeof item.items === 'string' ? JSON.parse(item.items) : item.items
          const badge = SOURCE_BADGE[item.source_type] || SOURCE_BADGE.ORDER
          const allDone = item.is_shipped
          const hasIssue = item.has_issue

          // 스와이프 액션
          const swipeAction = !allDone ? (
            !item.is_packed ? (
              <div
                className="bg-blue-500 h-full w-full flex items-center justify-center cursor-pointer"
                onClick={() => packItem(item.id)}
              >
                <div className="text-white text-center">
                  <PackageCheck className="w-5 h-5 mx-auto mb-0.5" />
                  <span className="text-[10px] font-bold">포장</span>
                </div>
              </div>
            ) : !item.is_shipped ? (
              <div
                className="bg-emerald-500 h-full w-full flex items-center justify-center cursor-pointer"
                onClick={() => setShipModal(item.id)}
              >
                <div className="text-white text-center">
                  <Truck className="w-5 h-5 mx-auto mb-0.5" />
                  <span className="text-[10px] font-bold">발송</span>
                </div>
              </div>
            ) : null
          ) : null

          return (
            <SwipeableItem key={item.id} rightAction={swipeAction}>
              <div className={cn(
                'border rounded-xl p-3 sm:p-4 transition-all',
                hasIssue ? 'bg-red-50 border-red-200' :
                allDone ? 'bg-green-50/50 border-green-200' :
                item.is_packed ? 'bg-blue-50/50 border-blue-200' : 'bg-white border-slate-200',
              )}>
                {/* 상단: 고객 + 뱃지 + 체크 */}
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
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
                  <div className="flex items-center gap-1.5">
                    {item.qty_verified && <Shield className="w-4 h-4 text-green-500" title="수량 검증됨" />}
                    {item.is_packed && <PackageCheck className="w-4 h-4 text-blue-500" title="포장 완료" />}
                    {item.is_shipped && <Truck className="w-4 h-4 text-violet-500" title="발송 완료" />}
                    {item.is_delivered && <CheckCircle2 className="w-4 h-4 text-green-500" title="배송 완료" />}
                    {hasIssue && <AlertTriangle className="w-4 h-4 text-red-500" title="이슈" />}
                  </div>
                </div>

                {/* 모바일 전화번호 */}
                {item.customer_phone && (
                  <p className="text-[10px] text-slate-400 mb-1.5 sm:hidden">
                    <Phone className="w-3 h-3 inline mr-0.5" />{item.customer_phone}
                  </p>
                )}

                {/* 제품 목록 */}
                <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-2">
                  {items_?.map((p, i) => (
                    <div key={i} className="flex items-center gap-1 bg-white px-2 py-1 rounded border text-xs">
                      <span className="font-medium">{p.sku_name || p.sku_code}</span>
                      <span className="text-blue-600 font-bold">x{p.quantity}</span>
                    </div>
                  ))}
                  <div className="flex items-center gap-1 text-xs text-emerald-600 font-bold">
                    {parseInt(item.total_amount).toLocaleString()}원
                  </div>
                  {item.ice_pack_count > 0 && (
                    <div className="flex items-center gap-0.5 text-[10px] text-blue-400">
                      <Snowflake className="w-3 h-3" />x{item.ice_pack_count}
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

                {/* 액션 버튼 — h-12 풀너비 */}
                {!allDone && (
                  <div className="flex gap-2 mt-2">
                    {!item.qty_verified && (
                      <Button size="sm" variant="outline" className="flex-1 h-12 text-sm font-semibold touch-feedback"
                        onClick={() => verifyItem(item.id)}>
                        <Shield className="w-4 h-4 mr-1.5" />수량 검증
                      </Button>
                    )}
                    {!item.is_packed && (
                      <Button size="sm" variant="outline" className="flex-1 h-12 text-sm font-semibold touch-feedback"
                        onClick={() => packItem(item.id)}>
                        <PackageCheck className="w-4 h-4 mr-1.5" />포장 완료
                      </Button>
                    )}
                    {item.is_packed && !item.is_shipped && (
                      <Button size="sm" className="flex-1 h-12 text-sm font-semibold touch-feedback"
                        onClick={() => setShipModal(item.id)}>
                        <Truck className="w-4 h-4 mr-1.5" />발송 처리
                      </Button>
                    )}
                    {!hasIssue && (
                      <Button size="sm" variant="ghost" className="h-12 text-sm text-red-400 touch-feedback"
                        onClick={() => reportIssue(item.id)}>
                        <AlertTriangle className="w-4 h-4 mr-1" />이슈
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </SwipeableItem>
          )
        })}

        {filtered.length === 0 && (
          <div className="text-center py-12">
            <p className="text-slate-400 mb-3">체크리스트가 비어있습니다</p>
            <Button onClick={generateChecklist} className="h-12 px-6 touch-feedback">
              <RefreshCw className="w-4 h-4 mr-1" />
              오늘 체크리스트 생성
            </Button>
          </div>
        )}

        {/* 스와이프 힌트 */}
        {filtered.length > 0 && filtered.some((i) => !i.is_shipped) && (
          <p className="text-[10px] text-slate-400 text-center pt-1">
            ← 왼쪽으로 밀어 빠른 처리
          </p>
        )}
      </div>

      {/* 발송 모달 */}
      {shipModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40">
          <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-xl w-full sm:max-w-sm mx-0 sm:mx-4 p-5 pb-8 sm:pb-5">
            <div className="w-10 h-1 bg-slate-300 rounded-full mx-auto mb-4 sm:hidden" />
            <h3 className="text-lg font-bold mb-4">발송 처리</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-600">택배사</label>
                <select className="w-full h-12 px-3 border rounded-md text-sm" value={shipForm.courier}
                  onChange={(e) => setShipForm((f) => ({ ...f, courier: e.target.value }))}>
                  <option>CJ대한통운</option><option>롯데택배</option>
                  <option>한진택배</option><option>우체국</option><option>로젠택배</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">운송장 번호</label>
                <Input value={shipForm.tracking_number} placeholder="운송장 번호" className="h-12"
                  onChange={(e) => setShipForm((f) => ({ ...f, tracking_number: e.target.value }))} />
              </div>
              <div className="flex gap-2 pt-2">
                <Button onClick={shipItem} className="flex-1 h-12 text-sm font-semibold touch-feedback">발송 완료</Button>
                <Button variant="outline" onClick={() => setShipModal(null)} className="h-12 touch-feedback">취소</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
