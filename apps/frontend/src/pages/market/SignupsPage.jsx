/**
 * @fileoverview 사전신청자 관리 페이지
 * PENDING_SIGNUP 구독 목록 + 일괄 문자 발송
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { apiGet, apiPut, apiPost } from '@/lib/api'
import { formatDateTime } from '@/lib/date'
import {
  Users, MessageSquare, Copy, Download, CheckCircle2,
  RefreshCw, Send,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export default function SignupsPage() {
  const [signups, setSignups] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(new Set())
  const [message, setMessage] = useState('[송영신목장] {이름}님, HACCP 인증이 완료되어 정기구독이 오픈되었습니다. 담당자가 곧 연락드리겠습니다.')
  const [copyStatus, setCopyStatus] = useState('')
  const [logging, setLogging] = useState(false)

  const fetchSignups = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiGet('/market/subscriptions?status=PENDING_SIGNUP&limit=100')
      if (res.success) setSignups(res.data)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchSignups() }, [fetchSignups])

  const selectedList = useMemo(
    () => signups.filter((s) => selected.has(s.id)),
    [signups, selected],
  )

  const toggleOne = (id) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (selected.size === signups.length) setSelected(new Set())
    else setSelected(new Set(signups.map((s) => s.id)))
  }

  const byteLength = new TextEncoder().encode(message).length
  const isLMS = byteLength > 90

  /** 전화번호 목록 복사 (쉼표 구분) */
  const copyPhones = async () => {
    const phones = selectedList.map((s) => s.customer_phone).filter(Boolean).join(', ')
    await navigator.clipboard.writeText(phones)
    setCopyStatus(`${selectedList.length}명 번호 복사 완료`)
    setTimeout(() => setCopyStatus(''), 3000)
  }

  /** CSV 내보내기 */
  const exportCsv = () => {
    const rows = [['이름', '전화번호', '메시지']]
    for (const s of selectedList) {
      const personalized = message.replace(/\{이름\}/g, s.customer_name || '')
      rows.push([s.customer_name, s.customer_phone, personalized])
    }
    const csv = rows.map((r) => r.map((c) => `"${(c || '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sms_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  /** 발송 기록 저장 */
  const logSent = async () => {
    if (selectedList.length === 0 || !message.trim()) return
    setLogging(true)
    try {
      const res = await apiPost('/market/sms/log', {
        recipient_count: selectedList.length,
        message,
        memo: `사전신청자 ${selectedList.length}명`,
      })
      if (res.success) {
        setCopyStatus('발송 기록 저장 완료')
        setTimeout(() => setCopyStatus(''), 3000)
      }
    } finally {
      setLogging(false)
    }
  }

  /** 신청자를 ACTIVE 구독으로 전환 */
  const activate = async (id) => {
    const res = await apiPut(`/market/subscriptions/${id}`, { status: 'ACTIVE' })
    if (res.success) await fetchSignups()
  }

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 w-48 bg-slate-200 rounded animate-pulse" />
        <div className="h-64 bg-slate-200 rounded-xl animate-pulse" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">사전신청자 관리</h1>
            <p className="text-sm text-slate-500">HACCP 인증 대기 중인 정기구독 사전신청자</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={fetchSignups}>
          <RefreshCw className="w-4 h-4 mr-1" />새로고침
        </Button>
      </div>

      {/* 요약 */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">총 신청자</p>
              <p className="text-2xl font-bold text-slate-900">
                {signups.length}<span className="text-sm font-normal text-slate-400 ml-1">명</span>
              </p>
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <span className="text-slate-500">선택: </span>
              <span className="font-semibold text-emerald-600">{selected.size}명</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 일괄 문자 패널 */}
      {selected.size > 0 && (
        <Card className="border-emerald-200 bg-emerald-50/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-emerald-600" />
              일괄 문자 발송 ({selected.size}명)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">
                메시지 (변수: <code className="bg-white px-1 rounded">{'{이름}'}</code>)
              </label>
              <textarea
                rows={4}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm resize-y"
                placeholder="발송할 메시지를 입력하세요..."
              />
              <div className="flex items-center justify-between mt-1 text-xs">
                <span className={cn(isLMS ? 'text-amber-600' : 'text-slate-500')}>
                  {byteLength} bytes {isLMS ? '(LMS 장문)' : '(SMS 단문)'}
                </span>
                <span className="text-slate-400">최대 2000 bytes</span>
              </div>
            </div>

            {copyStatus && (
              <div className="flex items-center gap-2 text-xs text-emerald-700 bg-white rounded-md px-3 py-2 border border-emerald-200">
                <CheckCircle2 className="w-4 h-4" />
                {copyStatus}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={copyPhones}>
                <Copy className="w-4 h-4 mr-1" />번호 복사
              </Button>
              <Button variant="outline" size="sm" onClick={exportCsv}>
                <Download className="w-4 h-4 mr-1" />CSV 내보내기
              </Button>
              <Button variant="market" size="sm" onClick={logSent} disabled={logging || !message.trim()}>
                <Send className="w-4 h-4 mr-1" />
                {logging ? '기록 중...' : '발송 기록 저장'}
              </Button>
            </div>
            <p className="text-xs text-slate-500">
              💡 번호를 복사해서 문자 앱에 붙여넣고 발송한 뒤, &quot;발송 기록 저장&quot; 버튼으로 이력을 남기세요.
            </p>
          </CardContent>
        </Card>
      )}

      {/* 신청자 목록 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">신청자 목록</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={selected.size > 0 && selected.size === signups.length}
                      onChange={toggleAll}
                      className="w-4 h-4"
                    />
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500">이름</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500">전화번호</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500">주기</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-500">예상 금액</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500">신청 일시</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-500">작업</th>
                </tr>
              </thead>
              <tbody>
                {signups.map((s) => (
                  <tr key={s.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(s.id)}
                        onChange={() => toggleOne(s.id)}
                        className="w-4 h-4"
                      />
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">{s.customer_name || '-'}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-700">{s.customer_phone || '-'}</td>
                    <td className="px-4 py-3 text-xs">
                      <span className="bg-slate-100 px-2 py-0.5 rounded">{s.frequency}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      ₩{parseInt(s.price_per_cycle).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{formatDateTime(s.created_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => activate(s.id)}
                      >
                        활성화
                      </Button>
                    </td>
                  </tr>
                ))}
                {signups.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                      사전신청자가 없습니다
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
