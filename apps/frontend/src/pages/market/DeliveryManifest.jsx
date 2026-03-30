/**
 * @fileoverview 배송원장 일괄 출력 페이지
 * 인쇄 최적화 — 날짜별 배송 목록을 표 형태로 출력
 * 브라우저 인쇄(Ctrl+P) 또는 PDF 저장 가능
 */
import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { apiGet } from '@/lib/api'
import { Printer, ArrowLeft, FileDown, Filter } from 'lucide-react'

const SOURCE_LABEL = {
  SUBSCRIPTION: '정기구독',
  ORDER: '일반주문',
  B2B: 'B2B',
}

const FILTER_OPTIONS = [
  { value: 'all', label: '전체' },
  { value: 'SUBSCRIPTION', label: '정기구독' },
  { value: 'ORDER', label: '일반주문' },
  { value: 'B2B', label: 'B2B' },
]

/** KST 기준 오늘 날짜 */
function getKstToday() {
  const now = new Date()
  const y = now.toLocaleDateString('ko-KR', { year: 'numeric', timeZone: 'Asia/Seoul' }).replace(/[^0-9]/g, '')
  const m = now.toLocaleDateString('ko-KR', { month: '2-digit', timeZone: 'Asia/Seoul' }).replace(/[^0-9]/g, '').padStart(2, '0')
  const d = now.toLocaleDateString('ko-KR', { day: '2-digit', timeZone: 'Asia/Seoul' }).replace(/[^0-9]/g, '').padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** 날짜를 한글 형식으로 */
function formatDateKR(dateStr) {
  const d = new Date(dateStr + 'T00:00:00+09:00')
  return d.toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  })
}

/** items JSON 파싱 (안전 처리) */
function parseItems(items) {
  if (!items) return []
  try {
    return typeof items === 'string' ? JSON.parse(items) : (items || [])
  } catch { return [] }
}

/** 제품 목록을 한 줄 텍스트로 */
function itemsSummary(items) {
  const parsed = parseItems(items)
  return parsed.map((p) => `${p.sku_name || p.sku_code} x${p.quantity}`).join(', ')
}

export default function DeliveryManifest() {
  const [searchParams] = useSearchParams()
  const dateParam = searchParams.get('date') || getKstToday()
  const [items, setItems] = useState([])
  const [stats, setStats] = useState(null)
  const [sourceFilter, setSourceFilter] = useState('all')
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [itemsRes, statsRes] = await Promise.all([
      apiGet(`/market/checklist?date=${dateParam}`),
      apiGet(`/market/checklist/stats?date=${dateParam}`),
    ])
    if (itemsRes.success) setItems(itemsRes.data)
    if (statsRes.success) setStats(statsRes.data)
    setLoading(false)
  }, [dateParam])

  useEffect(() => { fetchData() }, [fetchData])

  const filtered = sourceFilter === 'all'
    ? items
    : items.filter((item) => item.source_type === sourceFilter)

  const totalAmount = filtered.reduce((sum, item) => sum + (parseInt(item.total_amount) || 0), 0)
  const totalItems = filtered.reduce((sum, item) => {
    const parsed = parseItems(item.items)
    return sum + parsed.reduce((s, p) => s + (parseInt(p.quantity) || 0), 0)
  }, 0)

  const handlePrint = () => window.print()

  const handleBack = () => window.history.back()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-slate-400">배송원장 불러오는 중...</p>
      </div>
    )
  }

  return (
    <>
      {/* 인쇄 시 숨김 — 화면 조작 영역 */}
      <div className="print:hidden max-w-5xl mx-auto px-4 py-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={handleBack}>
              <ArrowLeft className="w-4 h-4 mr-1" /> 돌아가기
            </Button>
            <h1 className="text-lg font-bold text-slate-800">배송원장 출력</h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 border rounded-md px-2 py-1">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select
                className="text-sm bg-transparent border-none outline-none"
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
              >
                {FILTER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <Button onClick={handlePrint} className="h-9">
              <Printer className="w-4 h-4 mr-1.5" />
              인쇄 / PDF 저장
            </Button>
          </div>
        </div>
        <p className="text-xs text-slate-400">
          <FileDown className="w-3 h-3 inline mr-1" />
          인쇄 대화상자에서 "PDF로 저장"을 선택하면 파일로 저장됩니다
        </p>
      </div>

      {/* 인쇄 대상 영역 */}
      <div className="manifest-print max-w-5xl mx-auto px-4 print:px-0 print:max-w-none">
        {/* 헤더 */}
        <div className="text-center mb-4 print:mb-6">
          <h1 className="text-xl print:text-2xl font-bold">배 송 원 장</h1>
          <p className="text-sm text-slate-600 mt-1">HEY HAY MILK (D2O 농업회사법인)</p>
          <p className="text-base font-semibold mt-2">{formatDateKR(dateParam)}</p>
        </div>

        {/* 요약 정보 */}
        <div className="flex justify-between items-center border-t border-b border-slate-800 py-2 mb-4 text-sm">
          <div className="flex gap-6">
            <span>총 건수: <strong>{filtered.length}건</strong></span>
            <span>총 수량: <strong>{totalItems}개</strong></span>
            <span>총 금액: <strong>{totalAmount.toLocaleString()}원</strong></span>
          </div>
          <div className="flex gap-4 text-xs text-slate-500">
            {sourceFilter === 'all' && stats && (
              <>
                <span>구독 {stats.by_source?.subscription || 0}</span>
                <span>주문 {stats.by_source?.order || 0}</span>
                <span>B2B {stats.by_source?.b2b || 0}</span>
              </>
            )}
            {sourceFilter !== 'all' && (
              <span>{FILTER_OPTIONS.find((o) => o.value === sourceFilter)?.label} 필터 적용</span>
            )}
          </div>
        </div>

        {/* 배송 목록 테이블 */}
        <table className="w-full border-collapse text-sm manifest-table">
          <thead>
            <tr className="bg-slate-100 print:bg-slate-200">
              <th className="manifest-th w-8">No</th>
              <th className="manifest-th w-16">구분</th>
              <th className="manifest-th w-20">고객명</th>
              <th className="manifest-th w-28">연락처</th>
              <th className="manifest-th">배송지</th>
              <th className="manifest-th">제품 / 수량</th>
              <th className="manifest-th w-20 text-right">금액</th>
              <th className="manifest-th w-20">배송사</th>
              <th className="manifest-th w-28">운송장</th>
              <th className="manifest-th w-14 print:w-16">확인</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item, idx) => (
              <tr key={item.id} className="manifest-row">
                <td className="manifest-td text-center">{idx + 1}</td>
                <td className="manifest-td text-center">
                  <span className="text-xs">{SOURCE_LABEL[item.source_type] || '-'}</span>
                </td>
                <td className="manifest-td font-medium">{item.customer_name}</td>
                <td className="manifest-td text-xs">{item.customer_phone || '-'}</td>
                <td className="manifest-td text-xs leading-tight">
                  {item.shipping_address || '-'}
                  {item.shipping_memo && (
                    <div className="text-[10px] text-amber-700 mt-0.5">[{item.shipping_memo}]</div>
                  )}
                </td>
                <td className="manifest-td text-xs">{itemsSummary(item.items)}</td>
                <td className="manifest-td text-right text-xs">
                  {(parseInt(item.total_amount) || 0).toLocaleString()}
                </td>
                <td className="manifest-td text-xs text-center">{item.courier || ''}</td>
                <td className="manifest-td text-xs">{item.tracking_number || ''}</td>
                <td className="manifest-td">
                  {/* 인쇄 시 수기 체크용 빈 칸 */}
                  <div className="w-5 h-5 border border-slate-400 rounded mx-auto print:border-slate-800" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div className="text-center py-8 text-slate-400">
            해당 날짜에 배송 건이 없습니다
          </div>
        )}

        {/* 하단 서명란 */}
        <div className="mt-8 print:mt-12 flex justify-end gap-12 text-sm">
          <div className="text-center">
            <p className="text-xs text-slate-500 mb-6">작성자</p>
            <div className="w-24 border-b border-slate-400" />
          </div>
          <div className="text-center">
            <p className="text-xs text-slate-500 mb-6">확인자</p>
            <div className="w-24 border-b border-slate-400" />
          </div>
        </div>

        {/* 인쇄 시 푸터 */}
        <div className="hidden print:block mt-8 text-center text-[10px] text-slate-400">
          출력일시: {new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}
        </div>
      </div>

      {/* 인쇄 전용 스타일 */}
      <style>{`
        @media print {
          /* 사이드바, 헤더 등 레이아웃 숨김 */
          nav, aside, header, footer,
          [data-sidebar], [data-topbar], .print\\:hidden {
            display: none !important;
          }

          /* 메인 콘텐츠 전체 너비 */
          main, [role="main"], .flex-1 {
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
          }

          body {
            background: white !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .manifest-print {
            padding: 10mm !important;
            max-width: 100% !important;
          }

          @page {
            size: A4 landscape;
            margin: 8mm;
          }
        }

        .manifest-th {
          border: 1px solid #94a3b8;
          padding: 6px 8px;
          text-align: left;
          font-size: 12px;
          font-weight: 600;
          white-space: nowrap;
        }

        .manifest-td {
          border: 1px solid #cbd5e1;
          padding: 5px 8px;
          vertical-align: top;
        }

        .manifest-row:nth-child(even) {
          background-color: #f8fafc;
        }

        @media print {
          .manifest-th {
            background-color: #e2e8f0 !important;
            border-color: #64748b !important;
          }
          .manifest-row:nth-child(even) {
            background-color: #f1f5f9 !important;
          }
        }
      `}</style>
    </>
  )
}
