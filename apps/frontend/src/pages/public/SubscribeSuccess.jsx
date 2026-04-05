/**
 * @fileoverview 신청 완료 페이지
 */
import { Link, useLocation } from 'react-router-dom'
import { CheckCircle2, Home, Calendar } from 'lucide-react'

export default function SubscribeSuccess() {
  const location = useLocation()
  const state = location.state || {}

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 to-white flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-8 h-8" />
        </div>

        <h1 className="text-2xl font-bold text-slate-900 mb-2">신청이 접수되었습니다</h1>
        <p className="text-sm text-slate-600 mb-6">
          HEY HAY MILK 정기구독 사전 신청에 참여해주셔서 감사합니다.
        </p>

        {state.signup_id && (
          <div className="bg-slate-50 rounded-lg p-4 mb-6 text-left">
            <p className="text-xs text-slate-500 mb-1">신청 번호</p>
            <p className="font-mono text-xs text-slate-700 break-all">{state.signup_id}</p>
            {state.total && (
              <>
                <p className="text-xs text-slate-500 mb-1 mt-3">예상 결제 금액</p>
                <p className="font-bold text-slate-900">₩{state.total.toLocaleString()}<span className="text-xs text-slate-500 ml-1">/회</span></p>
              </>
            )}
          </div>
        )}

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 text-left">
          <div className="flex items-start gap-2">
            <Calendar className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <div className="text-xs text-amber-900">
              <p className="font-semibold mb-1">다음 단계</p>
              <ul className="space-y-1 text-amber-800">
                <li>· HACCP 인증 완료 후 담당자가 연락드립니다</li>
                <li>· 결제·배송 일정은 유선으로 안내해드립니다</li>
                <li>· 문의: 010-XXXX-XXXX</li>
              </ul>
            </div>
          </div>
        </div>

        <Link
          to="/subscribe"
          className="inline-flex items-center gap-2 px-4 py-2 text-sm text-slate-600 hover:text-slate-900 transition-colors"
        >
          <Home className="w-4 h-4" />
          첫 화면으로
        </Link>
      </div>
    </div>
  )
}
