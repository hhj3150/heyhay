/**
 * @fileoverview 시스템 설정 페이지
 * 원유 매입 단가 / 배송비 / 생산 설정
 * 카테고리별 카드 레이아웃 + 인라인 수정
 */
import { useState, useEffect, useCallback } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { apiGet, apiPut } from '@/lib/api'
import { Cog, Save, X, Milk, Truck, Factory } from 'lucide-react'
import { cn } from '@/lib/utils'

/** 카테고리 메타 정보 */
const CATEGORY_META = {
  MILK_PRICE: {
    label: '원유 매입 단가',
    icon: Milk,
    color: 'bg-amber-100 text-amber-600',
    description: '낙농진흥회 유대 및 D2O 자체 매입 단가',
  },
  SHIPPING: {
    label: '배송비 설정',
    icon: Truck,
    color: 'bg-blue-100 text-blue-600',
    description: '온라인 주문 및 B2B 배송비',
  },
  PRODUCTION: {
    label: '생산 설정',
    icon: Factory,
    color: 'bg-violet-100 text-violet-600',
    description: '로스율 및 제품별 원유 소요량',
  },
}

/** 카테고리 표시 순서 */
const CATEGORY_ORDER = ['MILK_PRICE', 'SHIPPING', 'PRODUCTION']

/**
 * 설정 데이터를 카테고리별로 그룹화
 * @param {Array} settings - API 응답 설정 배열
 * @returns {Object} { [category]: Array<setting> }
 */
const groupByCategory = (settings) => {
  const groups = {}
  for (const s of settings) {
    const cat = s.category || 'OTHER'
    if (!groups[cat]) groups[cat] = []
    groups[cat] = [...groups[cat], s]
  }
  return groups
}

export default function SystemSettings() {
  const [groups, setGroups] = useState({})
  const [loading, setLoading] = useState(true)
  const [editKey, setEditKey] = useState(null)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving] = useState(false)

  /** 설정값 전체 조회 */
  const fetchSettings = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiGet('/settings/system')
      if (res.success) {
        setGroups(groupByCategory(res.data))
      }
    } catch (err) {
      console.error('시스템 설정 조회 실패:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchSettings() }, [fetchSettings])

  /** 편집 시작 */
  const startEdit = (key, currentValue) => {
    setEditKey(key)
    setEditValue(currentValue)
  }

  /** 편집 취소 */
  const cancelEdit = () => {
    setEditKey(null)
    setEditValue('')
  }

  /** 설정값 저장 */
  const saveSetting = async () => {
    if (!editKey || !editValue.trim()) return

    setSaving(true)
    try {
      const res = await apiPut(`/settings/system/${editKey}`, { value: editValue.trim() })
      if (res.success) {
        cancelEdit()
        await fetchSettings()
      }
    } catch (err) {
      console.error('설정 저장 실패:', err)
    } finally {
      setSaving(false)
    }
  }

  /** Enter 키로 저장, Escape 로 취소 */
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      saveSetting()
    } else if (e.key === 'Escape') {
      cancelEdit()
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-slate-200 rounded w-48" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="h-64 bg-slate-200 rounded" />
            <div className="h-64 bg-slate-200 rounded" />
            <div className="h-64 bg-slate-200 rounded" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center">
          <Cog className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">시스템 설정</h1>
          <p className="text-sm text-slate-500">원유 매입 단가, 배송비, 생산 설정을 관리합니다.</p>
        </div>
      </div>

      {/* 카테고리별 카드 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {CATEGORY_ORDER.map((cat) => {
          const meta = CATEGORY_META[cat]
          const items = groups[cat] || []
          if (items.length === 0) return null

          const IconComp = meta.icon

          return (
            <Card key={cat}>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', meta.color)}>
                    <IconComp className="w-4 h-4" />
                  </div>
                  <div>
                    <CardTitle className="text-base">{meta.label}</CardTitle>
                    <p className="text-xs text-slate-400 mt-0.5">{meta.description}</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {items.map((item) => {
                    const isEditing = editKey === item.key

                    return (
                      <div
                        key={item.key}
                        className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-slate-50 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-700 truncate">
                            {item.label || item.key}
                          </p>
                          {item.description && (
                            <p className="text-xs text-slate-400 truncate">{item.description}</p>
                          )}
                        </div>
                        <div className="ml-4 shrink-0">
                          {isEditing ? (
                            <div className="flex items-center gap-1">
                              <Input
                                type="text"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onKeyDown={handleKeyDown}
                                className="w-28 h-8 text-right text-sm"
                                autoFocus
                              />
                              <button
                                onClick={saveSetting}
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
                              onClick={() => startEdit(item.key, item.value)}
                              className="px-3 py-1 rounded-md bg-slate-100 text-slate-700 font-mono text-sm font-medium hover:bg-emerald-50 hover:text-emerald-700 transition-colors tabular-nums"
                              title="클릭하여 수정"
                            >
                              {Number(item.value).toLocaleString()}
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
                {items[0]?.updated_by && (
                  <p className="text-xs text-slate-400 mt-3 text-right">
                    마지막 수정: {items[0].updated_by}
                  </p>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
