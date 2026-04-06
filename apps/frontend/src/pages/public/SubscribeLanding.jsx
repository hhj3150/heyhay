/**
 * @fileoverview 정기구독 신청 랜딩 페이지
 * QR 코드로 접속 → 상품 담기 → 배송 주기/요일 → 결제 → 구독 시작
 */
import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { publicPost } from '@/lib/api'
import {
  Minus, Plus, Truck, Calendar, CheckCircle2, AlertCircle,
  ShoppingBag, Search, CreditCard, Loader2,
} from 'lucide-react'
import {
  PUBLIC_SKUS as FALLBACK_SKUS,
  SHIPPING as FALLBACK_SHIPPING,
  FREQUENCY_OPTIONS,
  DELIVERY_DAY_OPTIONS,
  PORTONE_MERCHANT_ID,
  PG_OPTIONS,
} from './constants'

/** 전화번호 자동 하이픈 포맷 */
const formatPhone = (v) => {
  const digits = v.replace(/\D/g, '').slice(0, 11)
  if (digits.length <= 3) return digits
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
}

export default function SubscribeLanding() {
  const navigate = useNavigate()

  // 서버에서 가져온 상품 목록 + 배송비 정책
  const [products, setProducts] = useState(FALLBACK_SKUS)
  const [shipping, setShipping] = useState(FALLBACK_SHIPPING)

  useEffect(() => {
    fetch('/api/v1/public/products')
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data.products?.length > 0) {
          setProducts(res.data.products)
          setShipping(res.data.shipping)
        }
      })
      .catch(() => { /* 폴백 유지 */ })
  }, [])

  // 장바구니
  const [cart, setCart] = useState({})
  const [frequency, setFrequency] = useState('2W')
  const [deliveryDays, setDeliveryDays] = useState(['TUE'])
  const [pgProvider, setPgProvider] = useState('kakaopay')
  const [form, setForm] = useState({
    name: '', phone: '', address_zip: '', address_main: '', address_detail: '',
    consent_privacy: false, consent_sms: false,
  })
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  /** 다음 카카오 우편번호 검색 */
  const openPostcodeSearch = useCallback(() => {
    if (!window.daum?.Postcode) {
      setErrorMsg('주소 검색을 불러오는 중입니다. 잠시 후 다시 시도하세요.')
      return
    }
    new window.daum.Postcode({
      oncomplete: (data) => {
        setForm((prev) => ({
          ...prev,
          address_zip: data.zonecode,
          address_main: data.roadAddress || data.jibunAddress,
        }))
      },
    }).open()
  }, [])

  // 가격 계산
  const pricing = useMemo(() => {
    const items = Object.entries(cart)
      .filter(([, qty]) => qty > 0)
      .map(([sku_code, quantity]) => {
        const sku = products.find((s) => s.code === sku_code)
        return { sku_code, quantity, unit_price: sku?.unit_price || 0, line_total: (sku?.unit_price || 0) * quantity }
      })
    const subtotal = items.reduce((sum, i) => sum + i.line_total, 0)
    const shipping_fee = subtotal >= shipping.free_threshold ? 0 : (subtotal > 0 ? shipping.base_fee : 0)
    const total = subtotal + shipping_fee
    const remaining_to_free = Math.max(0, shipping.free_threshold - subtotal)
    const progress_pct = Math.min(100, (subtotal / shipping.free_threshold) * 100)
    return { items, subtotal, shipping_fee, total, remaining_to_free, progress_pct }
  }, [cart, products, shipping])

  const updateCart = (sku_code, delta) => {
    setCart((prev) => {
      const next = { ...prev }
      const newQty = Math.max(0, (next[sku_code] || 0) + delta)
      if (newQty === 0) delete next[sku_code]
      else next[sku_code] = newQty
      return next
    })
  }

  /** 배송 요일 토글 */
  const toggleDay = (day) => {
    setDeliveryDays((prev) => {
      if (prev.includes(day)) {
        const next = prev.filter((d) => d !== day)
        return next.length === 0 ? prev : next // 최소 1개 유지
      }
      return [...prev, day]
    })
  }

  // 모든 필수 입력 완료 여부
  const isFormValid = pricing.items.length > 0
    && form.name.trim()
    && form.phone.replace(/-/g, '').length >= 10
    && form.address_main.trim()
    && form.consent_privacy
    && deliveryDays.length > 0

  /** 결제 실행 */
  const handlePayment = async () => {
    setErrorMsg('')
    if (!isFormValid) return

    setSubmitting(true)
    try {
      // 1) 구독 생성 (PAYMENT_PENDING)
      const subRes = await publicPost('/public/subscribe', {
        name: form.name,
        phone: form.phone,
        address_zip: form.address_zip || undefined,
        address_main: form.address_main,
        address_detail: form.address_detail || undefined,
        items: pricing.items.map((i) => ({ sku_code: i.sku_code, quantity: i.quantity })),
        frequency,
        delivery_days: deliveryDays,
        pg_provider: pgProvider,
        consent_privacy: true,
        consent_sms: form.consent_sms,
      })

      if (!subRes.success) {
        setErrorMsg(subRes.error?.message || '신청 중 오류가 발생했습니다')
        setSubmitting(false)
        return
      }

      const { merchant_uid, amount } = subRes.data

      // 2) PortOne 결제창 오픈
      const IMP = window.IMP
      if (!IMP) {
        setErrorMsg('결제 모듈을 불러오는 중입니다. 잠시 후 다시 시도하세요.')
        setSubmitting(false)
        return
      }

      IMP.init(PORTONE_MERCHANT_ID)
      IMP.request_pay({
        pg: pgProvider,
        pay_method: 'card',
        merchant_uid,
        name: 'HEY HAY MILK 정기구독',
        amount,
        buyer_name: form.name,
        buyer_tel: form.phone,
        buyer_addr: form.address_main,
        buyer_postcode: form.address_zip,
      }, async (rsp) => {
        if (rsp.success) {
          // 3) 결제 검증
          const verifyRes = await publicPost('/public/payment/verify', {
            imp_uid: rsp.imp_uid,
            merchant_uid,
          })
          if (verifyRes.success) {
            navigate('/subscribe/success', { state: verifyRes.data })
          } else {
            setErrorMsg(verifyRes.error?.message || '결제 검증에 실패했습니다')
          }
        } else {
          setErrorMsg(rsp.error_msg || '결제가 취소되었습니다')
        }
        setSubmitting(false)
      })
    } catch (err) {
      setErrorMsg('네트워크 오류. 다시 시도해주세요.')
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
            <p className="text-[10px] text-slate-500 tracking-wider">송영신목장 정기구독 신청</p>
          </div>
        </div>
      </header>

      <div className="max-w-xl mx-auto px-4 py-6 space-y-6">
        {/* 상품 선택 */}
        <section>
          <h2 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 text-amber-600" />
            상품 선택
          </h2>
          <div className="space-y-2">
            {products.map((sku) => {
              const qty = cart[sku.code] || 0
              return (
                <div key={sku.code} className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-slate-900">{sku.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{sku.description}</p>
                    <p className="text-sm font-bold text-amber-700 mt-1">₩{sku.unit_price.toLocaleString()}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => updateCart(sku.code, -1)} disabled={qty === 0}
                      className="w-8 h-8 rounded-lg border border-slate-300 flex items-center justify-center text-slate-600 hover:bg-slate-50 disabled:opacity-30" aria-label="수량 감소">
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="font-mono font-semibold text-slate-900 w-6 text-center">{qty}</span>
                    <button type="button" onClick={() => updateCart(sku.code, 1)}
                      className="w-8 h-8 rounded-lg bg-amber-500 text-white flex items-center justify-center hover:bg-amber-600" aria-label="수량 증가">
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
              <button key={opt.value} type="button" onClick={() => setFrequency(opt.value)}
                className={`py-3 rounded-xl border text-sm font-semibold transition-all ${
                  frequency === opt.value
                    ? 'bg-amber-500 text-white border-amber-500'
                    : 'bg-white text-slate-700 border-slate-300 hover:border-amber-300'
                }`}>
                {opt.label}
              </button>
            ))}
          </div>
        </section>

        {/* 배송 요일 */}
        <section>
          <h2 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
            <Truck className="w-4 h-4 text-amber-600" />
            배송 요일
          </h2>
          <div className="grid grid-cols-2 gap-2">
            {DELIVERY_DAY_OPTIONS.map((opt) => {
              const selected = deliveryDays.includes(opt.value)
              return (
                <button key={opt.value} type="button" onClick={() => toggleDay(opt.value)}
                  className={`py-3 rounded-xl border text-sm font-semibold transition-all ${
                    selected
                      ? 'bg-blue-500 text-white border-blue-500'
                      : 'bg-white text-slate-700 border-slate-300 hover:border-blue-300'
                  }`}>
                  {opt.label}
                </button>
              )
            })}
          </div>
          {deliveryDays.length === 2 && (
            <p className="text-xs text-blue-600 mt-2 font-semibold">주 2회 배송 (화+금)</p>
          )}
        </section>

        {/* 결제 수단 */}
        <section>
          <h2 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-amber-600" />
            결제 수단
          </h2>
          <div className="grid grid-cols-2 gap-2">
            {PG_OPTIONS.map((opt) => (
              <button key={opt.value} type="button" onClick={() => setPgProvider(opt.value)}
                className={`py-3 rounded-xl border text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
                  pgProvider === opt.value
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-slate-300 hover:border-slate-400'
                }`}>
                <span>{opt.icon}</span>
                {opt.label}
              </button>
            ))}
          </div>
        </section>

        {/* 배송 정보 */}
        <div className="space-y-4">
          <section>
            <h2 className="text-sm font-bold text-slate-900 mb-3">배송 정보</h2>
            <div className="space-y-3">
              <input type="text" placeholder="이름" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={50}
                className="w-full h-11 px-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500" />
              <input type="tel" placeholder="휴대전화 (010-0000-0000)" value={form.phone}
                onChange={(e) => setForm({ ...form, phone: formatPhone(e.target.value) })}
                className="w-full h-11 px-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500" />
              <div className="flex gap-2">
                <input type="text" placeholder="우편번호" value={form.address_zip}
                  onChange={(e) => setForm({ ...form, address_zip: e.target.value })}
                  className="w-24 h-11 px-3 rounded-lg border border-slate-300 text-sm bg-slate-50 text-slate-700" />
                <button type="button" onClick={openPostcodeSearch}
                  className="h-11 px-4 rounded-lg bg-slate-800 text-white text-sm font-medium hover:bg-slate-700 flex items-center gap-1 shrink-0">
                  <Search className="w-4 h-4" /> 주소 검색
                </button>
              </div>
              <input type="text" placeholder="기본 주소 (주소 검색 또는 직접 입력)" value={form.address_main}
                onChange={(e) => setForm({ ...form, address_main: e.target.value })}
                className="w-full h-11 px-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500" />
              <input type="text" placeholder="상세 주소 (동·호수 등, 선택)" value={form.address_detail}
                onChange={(e) => setForm({ ...form, address_detail: e.target.value })}
                className="w-full h-11 px-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
            </div>
          </section>

          {/* 동의 */}
          <section className="space-y-2">
            <label className="flex items-start gap-2 cursor-pointer">
              <input type="checkbox" checked={form.consent_privacy}
                onChange={(e) => setForm({ ...form, consent_privacy: e.target.checked })}
                className="mt-0.5 w-4 h-4" />
              <span className="text-xs text-slate-700">
                <span className="text-red-600 font-semibold">[필수]</span> 개인정보 수집·이용에 동의합니다
                <span className="block text-slate-500 mt-0.5">— 구독 접수·결제·배송을 위해 이름/연락처/주소를 사용합니다</span>
              </span>
            </label>
            <label className="flex items-start gap-2 cursor-pointer">
              <input type="checkbox" checked={form.consent_sms}
                onChange={(e) => setForm({ ...form, consent_sms: e.target.checked })}
                className="mt-0.5 w-4 h-4" />
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
        </div>
      </div>

      {/* Sticky Bottom */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 shadow-lg">
        <div className="max-w-xl mx-auto px-4 py-3">
          {pricing.subtotal > 0 && pricing.remaining_to_free > 0 && (
            <div className="mb-2">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-slate-600">무료배송까지</span>
                <span className="font-semibold text-amber-700">₩{pricing.remaining_to_free.toLocaleString()}</span>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-amber-500 rounded-full transition-all" style={{ width: `${pricing.progress_pct}%` }} />
              </div>
            </div>
          )}
          {pricing.subtotal >= shipping.free_threshold && (
            <div className="mb-2 text-xs text-emerald-600 font-semibold flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> 무료배송 적용
            </div>
          )}

          <div className="flex items-center justify-between">
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
            <button type="button" onClick={handlePayment} disabled={submitting || !isFormValid}
              className="px-6 py-3 rounded-xl bg-amber-500 text-white font-semibold text-sm hover:bg-amber-600 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors flex items-center gap-2">
              {submitting ? <><Loader2 className="w-4 h-4 animate-spin" />결제 중...</> : '결제하기'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
