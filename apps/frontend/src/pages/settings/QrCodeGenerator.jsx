/**
 * @fileoverview QR 코드 생성기 (카페 배너·팜플렛용)
 * URL 입력 → QR 이미지 생성 → 다운로드
 * 외부 API 사용: api.qrserver.com (공개 QR 생성 API)
 */
import { useState, useEffect } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { QrCode, Download, Copy, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const SIZE_OPTIONS = [
  { value: 256, label: '256px (모바일)' },
  { value: 512, label: '512px (명함)' },
  { value: 1024, label: '1024px (배너·팜플렛)' },
]

const EC_LEVELS = [
  { value: 'L', label: 'L (7% 복원)' },
  { value: 'M', label: 'M (15% 복원)' },
  { value: 'Q', label: 'Q (25% 복원)' },
  { value: 'H', label: 'H (30% 복원, 권장)' },
]

export default function QrCodeGenerator() {
  const [url, setUrl] = useState('https://d2o.netlify.app/subscribe')
  const [size, setSize] = useState(512)
  const [ecLevel, setEcLevel] = useState('H')
  const [utmSource, setUtmSource] = useState('')
  const [utmMedium, setUtmMedium] = useState('qr')
  const [copyStatus, setCopyStatus] = useState('')

  // UTM 포함 최종 URL
  const finalUrl = (() => {
    if (!utmSource) return url
    const u = new URL(url, window.location.origin)
    u.searchParams.set('utm_source', utmSource)
    u.searchParams.set('utm_medium', utmMedium)
    return u.toString()
  })()

  // QR 이미지 URL (qrserver.com API)
  const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&ecc=${ecLevel}&data=${encodeURIComponent(finalUrl)}`

  const downloadPng = async () => {
    try {
      const res = await fetch(qrApiUrl)
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `qr_${utmSource || 'subscribe'}_${size}.png`
      a.click()
      URL.revokeObjectURL(a.href)
    } catch (err) {
      setCopyStatus('다운로드 실패: ' + err.message)
    }
  }

  const copyUrl = async () => {
    await navigator.clipboard.writeText(finalUrl)
    setCopyStatus('URL 복사 완료')
    setTimeout(() => setCopyStatus(''), 3000)
  }

  return (
    <div className="p-6 space-y-6">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center">
          <QrCode className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">QR 코드 생성기</h1>
          <p className="text-sm text-slate-500">카페 배너·팜플렛 인쇄용 QR 다운로드</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 설정 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">QR 설정</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">연결 URL</label>
              <Input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">크기</label>
                <select
                  value={size}
                  onChange={(e) => setSize(parseInt(e.target.value))}
                  className="w-full h-9 rounded-md border border-slate-300 px-3 text-sm"
                >
                  {SIZE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">에러 정정</label>
                <select
                  value={ecLevel}
                  onChange={(e) => setEcLevel(e.target.value)}
                  className="w-full h-9 rounded-md border border-slate-300 px-3 text-sm"
                >
                  {EC_LEVELS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="border-t border-slate-200 pt-4 space-y-3">
              <p className="text-xs font-semibold text-slate-700">캠페인 추적 (선택)</p>
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">UTM Source</label>
                <Input
                  value={utmSource}
                  onChange={(e) => setUtmSource(e.target.value)}
                  placeholder="예: cafe, pamphlet, banner"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">UTM Medium</label>
                <Input
                  value={utmMedium}
                  onChange={(e) => setUtmMedium(e.target.value)}
                  placeholder="qr"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">최종 URL</label>
              <div className="p-2 bg-slate-50 border border-slate-200 rounded-md text-xs font-mono break-all text-slate-700">
                {finalUrl}
              </div>
            </div>

            {copyStatus && (
              <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 rounded-md px-3 py-2 border border-emerald-200">
                <CheckCircle2 className="w-4 h-4" />
                {copyStatus}
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={copyUrl}>
                <Copy className="w-4 h-4 mr-1" />URL 복사
              </Button>
              <Button variant="default" size="sm" onClick={downloadPng}>
                <Download className="w-4 h-4 mr-1" />PNG 다운로드
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 프리뷰 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">미리보기</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center bg-slate-50 rounded-lg p-6">
              <img
                src={qrApiUrl}
                alt="QR 코드"
                className="max-w-full h-auto border-4 border-white shadow-sm"
                style={{ maxWidth: '300px' }}
              />
              <p className="text-xs text-slate-500 mt-3 text-center">
                스캔하면 <span className="font-mono">{url.split('/').slice(-1)[0] || 'subscribe'}</span> 페이지로 이동합니다
              </p>
            </div>

            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900">
              <p className="font-semibold mb-1">💡 인쇄 팁</p>
              <ul className="list-disc pl-4 space-y-1 text-amber-800">
                <li>카페 배너 (A4+): 1024px + 에러 정정 H</li>
                <li>명함·테이블 POP: 512px + 에러 정정 M~Q</li>
                <li>로고 삽입 필요시 포토샵에서 QR 중앙 덮어쓰기</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
