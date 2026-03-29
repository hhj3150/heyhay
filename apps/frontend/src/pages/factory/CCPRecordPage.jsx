/**
 * @fileoverview CCP 수기 기록 페이지
 * HACCP 일지용 — 공정별 온도/시간/메쉬 기록 + 이탈 자동 감지
 *
 * CCP1: 살균 (HTST 72°C / 15초)
 * CCP2: 충진 직전 여과 (120mesh)
 */
import { useState, useEffect, useCallback } from 'react'
import { apiGet, apiPost } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  Thermometer, Clock, Filter, AlertTriangle, CheckCircle,
  ClipboardList, Plus, RefreshCw,
} from 'lucide-react'

// CCP 기준값
const CCP_LIMITS = {
  CCP1: { min_temp: 72.0, hold_seconds: 15, label: '살균 (HTST)' },
  CCP2: { mesh: 120, label: '충진 직전 여과' },
}

// 공정 단계 옵션
const PROCESS_STEPS = [
  { value: 'RECEIVING', label: '원유 수령' },
  { value: 'QUALITY_CHECK', label: '품질 검사' },
  { value: 'CREAM_SEPARATION', label: '크림 분리' },
  { value: 'FILTRATION_80', label: '바켓여과 (80mesh)' },
  { value: 'PASTEURIZATION', label: '살균 (CCP1)', isCCP: true, ccpId: 'CCP1' },
  { value: 'HOMOGENIZATION', label: '균질' },
  { value: 'COOLING', label: '냉각' },
  { value: 'FINAL_FILTRATION', label: '여과 (CCP2)', isCCP: true, ccpId: 'CCP2' },
  { value: 'FILLING', label: '충진' },
  { value: 'KAYMAK_HEATING', label: '카이막 가열' },
]

// 빈 폼 상태
const EMPTY_FORM = {
  batch_id: '',
  process_step: '',
  is_ccp: false,
  ccp_id: '',
  temperature: '',
  hold_seconds: '',
  mesh_size: '',
  notes: '',
}

export default function CCPRecordPage() {
  const [batches, setBatches] = useState([])
  const [ccpLog, setCcpLog] = useState([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [deviationWarning, setDeviationWarning] = useState(null)

  // 오늘 배치 목록 + CCP 로그 조회
  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [batchRes, logRes] = await Promise.all([
        apiGet('/factory/production?limit=50').catch(() => ({ data: [] })),
        apiGet('/factory/process/ccp-log').catch(() => ({ data: [] })),
      ])
      setBatches(Array.isArray(batchRes.data) ? batchRes.data : [])
      setCcpLog(Array.isArray(logRes.data) ? logRes.data : [])
    } catch {
      toast.error('데이터 로딩 실패')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // 폼 필드 변경 (불변성 패턴)
  const updateForm = (field, value) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value }

      // 공정 단계 변경 시 CCP 자동 설정
      if (field === 'process_step') {
        const step = PROCESS_STEPS.find((s) => s.value === value)
        return {
          ...next,
          is_ccp: step?.isCCP || false,
          ccp_id: step?.ccpId || '',
          temperature: '',
          hold_seconds: '',
          mesh_size: '',
        }
      }

      // CCP 이탈 실시간 체크
      if (field === 'temperature' || field === 'hold_seconds' || field === 'mesh_size') {
        checkDeviation({ ...next, [field]: value })
      }

      return next
    })
  }

  // CCP 이탈 실시간 감지
  const checkDeviation = (data) => {
    if (data.ccp_id === 'CCP1') {
      const temp = parseFloat(data.temperature)
      const hold = parseInt(data.hold_seconds)
      if (temp && temp < CCP_LIMITS.CCP1.min_temp) {
        setDeviationWarning(`살균 온도 ${temp}°C — 기준 ${CCP_LIMITS.CCP1.min_temp}°C 미달!`)
        return
      }
      if (hold && hold < CCP_LIMITS.CCP1.hold_seconds) {
        setDeviationWarning(`유지 시간 ${hold}초 — 기준 ${CCP_LIMITS.CCP1.hold_seconds}초 미달!`)
        return
      }
    }
    if (data.ccp_id === 'CCP2') {
      const mesh = parseInt(data.mesh_size)
      if (mesh && mesh < CCP_LIMITS.CCP2.mesh) {
        setDeviationWarning(`여과 메쉬 ${mesh} — 기준 ${CCP_LIMITS.CCP2.mesh}mesh 미달!`)
        return
      }
    }
    setDeviationWarning(null)
  }

  // 기록 제출
  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.batch_id || !form.process_step) {
      toast.error('배치와 공정 단계를 선택하세요')
      return
    }

    setSubmitting(true)
    try {
      const now = new Date().toISOString()
      const payload = {
        batch_id: form.batch_id,
        process_step: form.process_step,
        started_at: now,
        is_ccp: form.is_ccp,
        ccp_id: form.ccp_id || undefined,
        temperature: form.temperature ? parseFloat(form.temperature) : undefined,
        hold_seconds: form.hold_seconds ? parseInt(form.hold_seconds) : undefined,
        mesh_size: form.mesh_size ? parseInt(form.mesh_size) : undefined,
        notes: form.notes || undefined,
      }

      const result = await apiPost('/factory/process', payload)

      if (result.data?._ccp_alert) {
        toast.error(`CCP 이탈 감지! ${result.data._ccp_alert.reason}`, { duration: 10000 })
      } else {
        toast.success('공정 기록 완료')
      }

      setForm(EMPTY_FORM)
      setDeviationWarning(null)
      loadData()
    } catch (err) {
      toast.error(`기록 실패: ${err.message}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">CCP 기록</h1>
          <p className="text-sm text-slate-500 mt-1">HACCP 공정 점검 — 살균 온도, 여과 메쉬 수기 기록</p>
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-slate-100 rounded-lg text-sm hover:bg-slate-200 transition-colors"
        >
          <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          새로고침
        </button>
      </div>

      {/* CCP 기준값 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-500 text-white flex items-center justify-center">
                <Thermometer className="w-5 h-5" />
              </div>
              <div>
                <p className="font-bold text-amber-900">CCP1 — 살균 (HTST)</p>
                <p className="text-sm text-amber-700">72°C 이상 / 15초 이상 유지</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500 text-white flex items-center justify-center">
                <Filter className="w-5 h-5" />
              </div>
              <div>
                <p className="font-bold text-blue-900">CCP2 — 충진 직전 여과</p>
                <p className="text-sm text-blue-700">120mesh 이상</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 기록 입력 폼 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="w-5 h-5" />
            공정 기록 입력
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* 배치 선택 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">생산 배치</label>
                <select
                  value={form.batch_id}
                  onChange={(e) => updateForm('batch_id', e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                >
                  <option value="">배치 선택...</option>
                  {batches.map((b) => (
                    <option key={b.id} value={b.batch_id}>
                      {b.batch_id} ({b.sku_name || b.sku_code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">공정 단계</label>
                <select
                  value={form.process_step}
                  onChange={(e) => updateForm('process_step', e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                >
                  <option value="">공정 선택...</option>
                  {PROCESS_STEPS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* CCP1: 살균 필드 */}
            {form.ccp_id === 'CCP1' && (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg space-y-3">
                <p className="font-bold text-amber-800 flex items-center gap-2">
                  <Thermometer className="w-4 h-4" />
                  CCP1 — 살균 기록
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      살균 온도 (°C) <span className="text-slate-400">기준: 72°C 이상</span>
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={form.temperature}
                      onChange={(e) => updateForm('temperature', e.target.value)}
                      placeholder="72.0"
                      className="w-full px-3 py-2 border rounded-lg text-lg font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      유지 시간 (초) <span className="text-slate-400">기준: 15초 이상</span>
                    </label>
                    <input
                      type="number"
                      value={form.hold_seconds}
                      onChange={(e) => updateForm('hold_seconds', e.target.value)}
                      placeholder="15"
                      className="w-full px-3 py-2 border rounded-lg text-lg font-mono"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* CCP2: 여과 필드 */}
            {form.ccp_id === 'CCP2' && (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-3">
                <p className="font-bold text-blue-800 flex items-center gap-2">
                  <Filter className="w-4 h-4" />
                  CCP2 — 여과 기록
                </p>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    여과 메쉬 <span className="text-slate-400">기준: 120mesh 이상</span>
                  </label>
                  <input
                    type="number"
                    value={form.mesh_size}
                    onChange={(e) => updateForm('mesh_size', e.target.value)}
                    placeholder="120"
                    className="w-full px-3 py-2 border rounded-lg text-lg font-mono"
                  />
                </div>
              </div>
            )}

            {/* 일반 공정: 온도/압력 (선택) */}
            {form.process_step && !form.is_ccp && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">온도 (°C, 선택)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={form.temperature}
                    onChange={(e) => updateForm('temperature', e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">비고</label>
                  <input
                    type="text"
                    value={form.notes}
                    onChange={(e) => updateForm('notes', e.target.value)}
                    placeholder="특이사항 기록"
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
              </div>
            )}

            {/* CCP일 때 비고 */}
            {form.is_ccp && (
              <div>
                <label className="block text-sm font-medium mb-1">비고 / 시정 조치</label>
                <input
                  type="text"
                  value={form.notes}
                  onChange={(e) => updateForm('notes', e.target.value)}
                  placeholder={deviationWarning ? '시정 조치 내용을 기록하세요' : '특이사항 기록'}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
              </div>
            )}

            {/* 이탈 경고 */}
            {deviationWarning && (
              <div className="p-4 bg-red-50 border-2 border-red-400 rounded-lg flex items-start gap-3">
                <AlertTriangle className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-red-800">CCP 이탈 감지!</p>
                  <p className="text-sm text-red-700">{deviationWarning}</p>
                  <p className="text-xs text-red-500 mt-1">기록 시 P1 알림이 자동 생성됩니다</p>
                </div>
              </div>
            )}

            {/* 제출 버튼 */}
            <button
              type="submit"
              disabled={submitting || !form.batch_id || !form.process_step}
              className={cn(
                'w-full py-3 rounded-lg font-bold text-white transition-colors',
                deviationWarning
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-amber-600 hover:bg-amber-700',
                (submitting || !form.batch_id || !form.process_step) && 'opacity-50 cursor-not-allowed',
              )}
            >
              {submitting ? '기록 중...' : deviationWarning ? '이탈 상태로 기록' : '공정 기록'}
            </button>
          </form>
        </CardContent>
      </Card>

      {/* 오늘 CCP 로그 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5" />
            오늘의 CCP 기록
            <span className="text-sm font-normal text-slate-500">({ccpLog.length}건)</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {ccpLog.length === 0 ? (
            <p className="text-center text-slate-400 py-8">오늘 기록된 CCP 데이터가 없습니다</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-slate-500">
                    <th className="pb-2 font-medium">시간</th>
                    <th className="pb-2 font-medium">배치</th>
                    <th className="pb-2 font-medium">CCP</th>
                    <th className="pb-2 font-medium">온도</th>
                    <th className="pb-2 font-medium">시간/메쉬</th>
                    <th className="pb-2 font-medium">결과</th>
                    <th className="pb-2 font-medium">비고</th>
                  </tr>
                </thead>
                <tbody>
                  {ccpLog.map((log) => (
                    <tr key={log.id} className={cn('border-b', log.is_deviated && 'bg-red-50')}>
                      <td className="py-2 font-mono text-xs">
                        {new Date(log.started_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-2 font-mono text-xs">{log.batch_id}</td>
                      <td className="py-2">
                        <span className={cn(
                          'px-2 py-0.5 rounded-full text-xs font-bold',
                          log.ccp_id === 'CCP1' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800',
                        )}>
                          {log.ccp_id}
                        </span>
                      </td>
                      <td className="py-2 font-mono">{log.temperature ? `${log.temperature}°C` : '-'}</td>
                      <td className="py-2 font-mono">
                        {log.hold_seconds ? `${log.hold_seconds}초` : ''}
                        {log.mesh_size ? `${log.mesh_size}mesh` : ''}
                        {!log.hold_seconds && !log.mesh_size && '-'}
                      </td>
                      <td className="py-2">
                        {log.is_deviated ? (
                          <span className="flex items-center gap-1 text-red-600 font-bold">
                            <AlertTriangle className="w-3.5 h-3.5" /> 이탈
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-green-600">
                            <CheckCircle className="w-3.5 h-3.5" /> 적합
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-xs text-slate-500 max-w-[200px] truncate">
                        {log.deviation_reason || log.notes || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
