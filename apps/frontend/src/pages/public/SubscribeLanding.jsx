/**
 * @fileoverview 공개 정기구독 신청 랜딩 페이지
 * QR 코드로 접속 → 상품 담기 → 배송 주기/정보 입력 → 제출
 */
import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { publicPost } from '@/lib/api'
import {
  Minus, Plus, Truck, Calendar, CheckCircle2, AlertCircle, ShoppingBag,
} from 'lucide-react'
import { PUBLIC_SKUS, SHIPPING, FREQUENCY_OPTIONS, DELIVERY_NOTE } from './constants'

/** 전화번호 자동 하이픈 포맷 */
const formatPhone = (v) => {
  const digits = v.replace(/\D/g, '').slice(0, 11)
  if (digits.length <= 3) return digits
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
}

export default function SubscribeLanding() {
  const navigate = useNavigate()

  // 장바구니 (sku_code -> quantity)
  const [cart, setCart] = useState({})
  const [frequency, setFrequency] = useState('2W')
  const [form, setForm] = useState({
    name: '', phone: '', address_zip: '', address_main: '', address_detail: '',
    consent_privacy: false, consent_sms: false,
  })
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  // 가격 계산 (메모이제이션)
  const pricing = useMemo(() => {
    const items = Object.entries(cart)
      .filter(([, qty]) => qty > 0)
      .map(([sku_code, quantity]) => {
        const sku = PUBLIC_SKUS.find((s) => s.code === sku_code)
        return { sku_code, quantity, unit_price: sku.unit_price, line_total: sku.unit_price * quantity }
      })
    const subtotal = items.reduce((sum, i) => sum + i.line_total, 0)
    const shipping_fee = subtotal >= SHIPPING.free_threshold ? 0 : (subtotal > 0 ? SHIPPING.base_fee : 0)
    const total = subtotal + shipping_fee
    const remaining_to_free = Math.max(0, SHIPPING.free_threshold - subtotal)
    const progress_pct = Math.min(100, (subtotal / SHIPPING.free_threshold) * 100)
    return { items, subtotal, shipping_fee, total, remaining_to_free, progress_pct }
  }, [cart])

  const updateCart = (sku_code, delta) => {
    setCart((prev) => {
      const next = { ...prev }
      const newQty = Math.max(0, (next[sku_code] || 0) + delta)
      if (newQty === 0) delete next[sku_code]
      else next[sku_code] = newQty
      return next
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErrorMsg('')

    if (pricing.items.length === 0) {
      setErrorMsg('상품을 1개 이상 담아주세요')
      return
    }
    if (!form.consent_privacy) {
      setErrorMsg('개인정보 수집·이용 동의는 필수입니다')
      return
    }

    setSubmitting(true)
    try {
      const res = await publicPost('/public/subscribe', {
        name: form.name,
        phone: form.phone,
        address_zip: form.address_zip || undefined,
        address_main: form.address_main,
        address_detail: form.address_detail || undefined,
        items: pricing.items.map((i) => ({ sku_code: i.sku_code, quantity: i.quantity })),
        frequency,
        consent_privacy: true,
        consent_sms: form.consent_sms,
      })

      if (res.success) {
        navigate('/subscribe/success', { state: res.data })
      } else {
        setErrorMsg(res.error?.message || '신청 중 오류가 발생했습니다')
      }
    } catch (err) {
      setErrorMsg('네트워크 오류. 다시 시도해주세요.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50/40 to-white pb-32">
      {/* 헤더 */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center">
            <span className="font-black text-white leading-none">H</span>
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900">HEY HAY MILK</h1>
            <p className="text-[10px] text-slate-500 tracking-wider">송영신목장 정기구독 사전신청</p>
          </div>
        </div>
      </header>

      <div className="max-w-xl mx-auto px-4 py-6 space-y-6">
        {/* 안내 배너 */}
        <div className="bg-amber-100/60 border border-amber-200 rounded-xl p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" />
            <div className="text-xs text-amber-900">
              <p className="font-semibold mb-1">사전 신청 안내</p>
              <p className="text-amber-800 leading-relaxed">
                HACCP 인증 완료 후 담당자가 연락드려 결제·배송 일정을 안내해드립니다.
                지금은 신청만 받고 있습니다.
              </p>
            </div>
          </div>
        </div>

        {/* 상품 선택 */}
        <section>
          <h2 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 text-amber-600" />
            상품 선택
          </h2>
          <div className="space-y-2">
            {PUBLIC_SKUS.map((sku) => {
              const qty = cart[sku.code] || 0
              return (
                <div key={sku.code} className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-slate-900">{sku.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{sku.description}</p>
                    <p className="text-sm font-bold text-amber-700 mt-1">₩{sku.unit_price.toLocaleString()}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => updateCart(sku.code, -1)}
                      disabled={qty === 0}
                      className="w-8 h-8 rounded-lg border border-slate-300 flex items-center justify-center text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed"
                      aria-label="수량 감소"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="font-mono font-semibold text-slate-900 w-6 text-center">{qty}</span>
                    <button
                      type="button"
                      onClick={() => updateCart(sku.code, 1)}
                      className="w-8 h-8 rounded-lg bg-amber-500 text-white flex items-center justify-center hover:bg-amber-600"
                      aria-label="수량 증가"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* 배송 주기 */}
        <section>
          <h2 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-amber-600" />
            배송 주기
          </h2>
          <div className="grid grid-cols-3 gap-2">
            {FREQUENCY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setFrequency(opt.value)}
                className={`py-3 rounded-xl border text-sm font-semibold transition-all ${
                  frequency === opt.value
                    ? 'bg-amber-500 text-white border-amber-500'
                    : 'bg-white text-slate-700 border-slate-300 hover:border-amber-300'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
            <Truck className="w-3 h-3" />
            {DELIVERY_NOTE}
          </p>
        </section>

        {/* 고객 정보 폼 */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <section>
            <h2 className="text-sm font-bold text-slate-900 mb-3">배송 정보</h2>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="이름"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                maxLength={50}
                className="w-full h-11 px-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              />
              <input
                type="tel"
                placeholder="휴대전화 (010-0000-0000)"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: formatPhone(e.target.value) })}
                required
                className="w-full h-11 px-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              />
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="우편번호 (선택)"
                  value={form.address_zip}
                  onChange={(e) => setForm({ ...form, address_zip: e.target.value })}
                  maxLength={10}
                  className="w-32 h-11 px-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <input
                  type="text"
                  placeholder="기본 주소"
                  value={form.address_main}
                  onChange={(e) => setForm({ ...form, address_main: e.target.value })}
                  required
                  className="flex-1 h-11 px-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <input
                type="text"
                placeholder="상세 주소 (동·호수 등, 선택)"
                value={form.address_detail}
                onChange={(e) => setForm({ ...form, address_detail: e.target.value })}
                className="w-full h-11 px-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </section>

          {/* 동의 */}
          <section className="space-y-2">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.consent_privacy}
                onChange={(e) => setForm({ ...form, consent_privacy: e.target.checked })}
                className="mt-0.5 w-4 h-4"
              />
              <span className="text-xs text-slate-700">
                <span className="text-red-600 font-semibold">[필수]</span> 개인정보 수집·이용에 동의합니다
                <span className="block text-slate-500 mt-0.5">— 신청 접수·배송을 위해 이름/연락처/주소를 사용합니다</span>
              </span>
            </label>
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.consent_sms}
                onChange={(e) => setForm({ ...form, consent_sms: e.target.checked })}
                className="mt-0.5 w-4 h-4"
              />
              <span className="text-xs text-slate-700">
                <span className="text-slate-500">[선택]</span> 배송·신제품 안내 문자 수신에 동의합니다
              </span>
            </label>
          </section>

          {errorMsg && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
        </form>
      </div>

      {/* Sticky Bottom Summary */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 shadow-lg">
        <div className="max-w-xl mx-auto px-4 py-3">
          {/* 무료배송 진행바 */}
          {pricing.subtotal > 0 && pricing.remaining_to_free > 0 && (
            <div className="mb-2">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-slate-600">무료배송까지</span>
                <span className="font-semibold text-amber-700">₩{pricing.remaining_to_free.toLocaleString()}</span>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-500 rounded-full transition-all"
                  style={{ width: `${pricing.progress_pct}%` }}
                />
              </div>
            </div>
          )}
          {pricing.subtotal >= SHIPPING.free_threshold && (
            <div className="mb-2 text-xs text-emerald-600 font-semibold flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              무료배송 적용
            </div>
          )}

          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-xs text-slate-500">
                상품 ₩{pricing.subtotal.toLocaleString()}
                {pricing.shipping_fee > 0 && ` + 배송비 ₩${pricing.shipping_fee.toLocaleString()}`}
              </p>
              <p className="text-lg font-bold text-slate-900">
                ₩{pricing.total.toLocaleString()}
                <span className="text-xs font-normal text-slate-500 ml-1">/ 회</span>
              </p>
            </div>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || pricing.items.length === 0}
              className="px-6 py-3 rounded-xl bg-amber-500 text-white font-semibold text-sm hover:bg-amber-600 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? '신청 중...' : '신청하기'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
