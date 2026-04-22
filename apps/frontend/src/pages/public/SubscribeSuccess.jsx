/**
 * @fileoverview 구독 결제 완료 페이지
 */
import { Link, useLocation } from 'react-router-dom'
import { CheckCircle2, Home, Calendar, Truck, CreditCard } from 'lucide-react'

const DAY_LABELS = { TUE: '화요일', FRI: '금요일' }
const FREQ_LABELS = { '1W': '매주', '2W': '격주', '4W': '월 1회' }

export default function SubscribeSuccess() {
  const location = useLocation()
  const state = location.state || {}

  const deliveryDaysText = (state.delivery_days || []).map((d) => DAY_LABELS[d] || d).join(', ')
  const freqText = FREQ_LABELS[state.frequency] || state.frequency

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 to-white flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-8 h-8" />
        </div>

        <h1 className="text-2xl font-bold text-slate-900 mb-2">결제가 완료되었습니다</h1>
        <p className="text-sm text-slate-600 mb-6">
          HEY HAY MILK 정기구독이 시작됩니다
        </p>

        {state.subscription_id && (
          <div className="bg-slate-50 rounded-lg p-4 mb-6 text-left space-y-3">
            {state.amount && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 flex items-center gap-1">
                  <CreditCard className="w-3 h-3" />결제 금액
                </span>
                <span className="font-bold text-slate-900">₩{state.amount.toLocaleString()}</span>
              </div>
            )}
            {state.pg_provider && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">결제 수단</span>
                <span className="text-sm text-slate-700">
                  {state.pg_provider === 'kakaopay' ? '💛 카카오페이' : '💚 네이버페이'}
                </span>
              </div>
            )}
            {freqText && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 flex items-center gap-1">
                  <Calendar className="w-3 h-3" />배송 주기
                </span>
                <span className="text-sm font-medium text-slate-700">{freqText}</span>
              </div>
            )}
            {deliveryDaysText && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 flex items-center gap-1">
                  <Truck className="w-3 h-3" />배송 요일
                </span>
                <span className="text-sm font-medium text-slate-700">{deliveryDaysText}</span>
              </div>
            )}
            {state.started_at && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">첫 배송일</span>
                <span className="text-sm font-bold text-amber-700">{state.started_at}</span>
              </div>
            )}
            {state.next_payment_at && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">다음 결제일</span>
                <span className="text-sm text-slate-600">{state.next_payment_at}</span>
              </div>
            )}
          </div>
        )}

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 text-left">
          <div className="text-xs text-amber-900 space-y-1">
            <p className="font-semibold">안내사항</p>
            <ul className="text-amber-800 space-y-1">
              <li>· 배송 전일 오후에 준비·출고됩니다</li>
              <li>· 구독 변경·일시정지는 담당자에게 문의하세요</li>
              {import.meta.env.VITE_CUSTOMER_CONTACT && (
                <li>· 문의: {import.meta.env.VITE_CUSTOMER_CONTACT}</li>
              )}
            </ul>
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
