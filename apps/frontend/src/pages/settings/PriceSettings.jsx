/**
 * @fileoverview 제품 단가 관리 페이지
 * 행=SKU(6종), 열=채널(소비자/구독/B2B/카페) 테이블
 * 각 셀 클릭 → 인라인 편집 → 저장
 * 변경 이력 보기 토글
 */
import { useState, useEffect, useCallback } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { apiGet, apiPut } from '@/lib/api'
import { DollarSign, Save, X, History, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'

/** 채널 표시 라벨 */
const CHANNEL_LABELS = {
  RETAIL: '소비자',
  SUBSCRIPTION: '구독',
  B2B: 'B2B',
  CAFE: '카페',
}

/** 채널 순서 */
const CHANNELS = ['RETAIL', 'SUBSCRIPTION', 'B2B', 'CAFE']

/**
 * 가격 데이터를 SKU별 → 채널별 맵으로 변환
 * @param {Array} prices - API 응답 가격 배열
 * @returns {Object} { [sku_code]: { name, prices: { [channel]: { id, unit_price } } } }
 */
const buildPriceMap = (prices) => {
  const map = {}
  for (const row of prices) {
    if (!map[row.sku_code]) {
      map[row.sku_code] = { name: row.sku_name, prices: {} }
    }
    map[row.sku_code].prices[row.channel] = {
      id: row.id,
      unit_price: row.unit_price,
    }
  }
  return map
}

export default function PriceSettings() {
  const [priceMap, setPriceMap] = useState({})
  const [skuCodes, setSkuCodes] = useState([])
  const [loading, setLoading] = useState(true)
  const [editCell, setEditCell] = useState(null)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)

  /** 단가표 조회 */
  const fetchPrices = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiGet('/settings/prices')
      if (res.success) {
        const map = buildPriceMap(res.data)
        setPriceMap(map)
        setSkuCodes(Object.keys(map).sort())
      }
    } catch (err) {
      console.error('단가 조회 실패:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  /** 변경 이력 조회 */
  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const res = await apiGet('/settings/prices/history')
      if (res.success) {
        setHistory(res.data)
      }
    } catch (err) {
      console.error('가격 이력 조회 실패:', err)
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  useEffect(() => { fetchPrices() }, [fetchPrices])

  /** 셀 클릭 → 편집 모드 */
  const startEdit = (skuCode, channel, currentPrice) => {
    setEditCell({ skuCode, channel })
    setEditValue(String(currentPrice))
  }

  /** 편집 취소 */
  const cancelEdit = () => {
    setEditCell(null)
    setEditValue('')
  }

  /** 단가 저장 */
  const savePrice = async () => {
    if (!editCell) return
    const price = parseInt(editValue, 10)
    if (isNaN(price) || price < 0) return

    setSaving(true)
    try {
      const res = await apiPut('/settings/prices', {
        sku_code: editCell.skuCode,
        channel: editCell.channel,
        unit_price: price,
      })
      if (res.success) {
        cancelEdit()
        await fetchPrices()
        if (showHistory) await fetchHistory()
      }
    } catch (err) {
      console.error('단가 저장 실패:', err)
    } finally {
      setSaving(false)
    }
  }

  /** Enter 키로 저장, Escape 로 취소 */
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      savePrice()
    } else if (e.key === 'Escape') {
      cancelEdit()
    }
  }

  /** 이력 토글 */
  const toggleHistory = async () => {
    const next = !showHistory
    setShowHistory(next)
    if (next && history.length === 0) {
      await fetchHistory()
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-slate-200 rounded w-48" />
          <div className="h-64 bg-slate-200 rounded" />
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center">
            <DollarSign className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">제품 단가 관리</h1>
            <p className="text-sm text-slate-500">채널별 제품 단가를 설정합니다. 셀을 클릭해서 수정하세요.</p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={toggleHistory}
          className="flex items-center gap-1"
        >
          <History className="w-4 h-4" />
          변경 이력
          {showHistory ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </Button>
      </div>

      {/* 단가 테이블 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">채널별 단가표</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 px-4 font-semibold text-slate-600">제품</th>
                  {CHANNELS.map((ch) => (
                    <th key={ch} className="text-right py-3 px-4 font-semibold text-slate-600">
                      {CHANNEL_LABELS[ch]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {skuCodes.map((code) => {
                  const sku = priceMap[code]
                  return (
                    <tr key={code} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-800">{sku.name}</div>
                        <div className="text-xs text-slate-400">{code}</div>
                      </td>
                      {CHANNELS.map((ch) => {
                        const price = sku.prices[ch]
                        const isEditing = editCell?.skuCode === code && editCell?.channel === ch

                        return (
                          <td key={ch} className="py-3 px-4 text-right">
                            {isEditing ? (
                              <div className="flex items-center justify-end gap-1">
                                <Input
                                  type="number"
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  onKeyDown={handleKeyDown}
                                  className="w-24 h-8 text-right text-sm"
                                  autoFocus
                                  min="0"
                                />
                                <button
                                  onClick={savePrice}
                                  disabled={saving}
                                  className="p-1 text-emerald-600 hover:text-emerald-700"
                                  aria-label="저장"
                                >
                                  <Save className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={cancelEdit}
                                  className="p-1 text-slate-400 hover:text-slate-600"
                                  aria-label="취소"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => startEdit(code, ch, price?.unit_price || 0)}
                                className={cn(
                                  'px-2 py-1 rounded hover:bg-emerald-50 hover:text-emerald-700 transition-colors',
                                  'text-slate-700 font-medium tabular-nums',
                                )}
                                title="클릭하여 수정"
                              >
                                {price ? price.unit_price.toLocaleString() : '-'}
                              </button>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* 변경 이력 */}
      {showHistory && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">가격 변경 이력</CardTitle>
          </CardHeader>
          <CardContent>
            {historyLoading ? (
              <div className="animate-pulse h-32 bg-slate-100 rounded" />
            ) : history.length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">변경 이력이 없습니다</p>
            ) : (
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white">
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-2 px-3 font-semibold text-slate-500 text-xs">제품</th>
                      <th className="text-left py-2 px-3 font-semibold text-slate-500 text-xs">채널</th>
                      <th className="text-right py-2 px-3 font-semibold text-slate-500 text-xs">단가</th>
                      <th className="text-left py-2 px-3 font-semibold text-slate-500 text-xs">적용 시작</th>
                      <th className="text-left py-2 px-3 font-semibold text-slate-500 text-xs">적용 종료</th>
                      <th className="text-left py-2 px-3 font-semibold text-slate-500 text-xs">수정자</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((row) => (
                      <tr
                        key={row.id}
                        className={cn(
                          'border-b border-slate-50',
                          row.effective_to ? 'text-slate-400' : 'text-slate-700',
                        )}
                      >
                        <td className="py-2 px-3">{row.sku_name}</td>
                        <td className="py-2 px-3">{CHANNEL_LABELS[row.channel] || row.channel}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{row.unit_price.toLocaleString()}</td>
                        <td className="py-2 px-3">{row.effective_from}</td>
                        <td className="py-2 px-3">{row.effective_to || '현재'}</td>
                        <td className="py-2 px-3">{row.created_by || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
