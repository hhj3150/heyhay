/**
 * @fileoverview 밀크카페 POS (태블릿 터치 최적화)
 * 메뉴 터치 → 수량 조절 → 결제 → 자동 매출 기록
 * 큰 버튼 + 큰 글씨 → 현장 직원이 빠르게 사용
 */
import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { apiPost } from '@/lib/api'
import {
  Milk, IceCreamCone, Plus, Minus, Trash2, ShoppingCart,
  CreditCard, Banknote, CheckCircle2, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const MENU_ITEMS = [
  { id: 'A2-750', name: 'A2 우유 750ml', price: 9000, icon: '🥛', category: '우유', color: 'bg-amber-50 border-amber-200 hover:bg-amber-100' },
  { id: 'A2-180', name: 'A2 우유 180ml', price: 4000, icon: '🥛', category: '우유', color: 'bg-amber-50 border-amber-200 hover:bg-amber-100' },
  { id: 'YG-500', name: '발효유 500ml', price: 7000, icon: '🫙', category: '발효유', color: 'bg-green-50 border-green-200 hover:bg-green-100' },
  { id: 'YG-180', name: '발효유 180ml', price: 3500, icon: '🫙', category: '발효유', color: 'bg-green-50 border-green-200 hover:bg-green-100' },
  { id: 'SI-001', name: '소프트아이스크림', price: 5000, icon: '🍦', category: '디저트', color: 'bg-pink-50 border-pink-200 hover:bg-pink-100' },
  { id: 'KM-100', name: '카이막 100g', price: 12000, icon: '🧈', category: '디저트', color: 'bg-violet-50 border-violet-200 hover:bg-violet-100' },
]

export default function CafePOS() {
  const [cart, setCart] = useState([])
  const [payMethod, setPayMethod] = useState('CARD')
  const [showSuccess, setShowSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  // 장바구니에 추가
  const addToCart = useCallback((item) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.id === item.id)
      if (existing) {
        return prev.map((c) => c.id === item.id ? { ...c, qty: c.qty + 1 } : c)
      }
      return [...prev, { ...item, qty: 1 }]
    })
  }, [])

  // 수량 변경
  const updateQty = useCallback((id, delta) => {
    setCart((prev) =>
      prev
        .map((c) => c.id === id ? { ...c, qty: c.qty + delta } : c)
        .filter((c) => c.qty > 0),
    )
  }, [])

  // 장바구니 비우기
  const clearCart = useCallback(() => setCart([]), [])

  // 총액
  const total = cart.reduce((sum, c) => sum + c.price * c.qty, 0)
  const totalQty = cart.reduce((sum, c) => sum + c.qty, 0)

  // 결제 처리
  const handlePay = async () => {
    if (cart.length === 0) return
    setLoading(true)

    const items = cart.map((c) => ({
      sku_code: c.id,
      menu_name: c.name,
      quantity: c.qty,
      unit_price: c.price,
      subtotal: c.price * c.qty,
    }))

    const res = await apiPost('/cafe/sales', {
      items,
      total_amount: total,
      payment_method: payMethod,
      sale_date: new Date().toISOString().split('T')[0],
    })

    setLoading(false)

    if (res.success) {
      setShowSuccess(true)
      setCart([])
      setTimeout(() => setShowSuccess(false), 2000)
    }
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-[calc(100vh-5rem)]">
      {/* 왼쪽: 메뉴 그리드 */}
      <div className="flex-1 overflow-y-auto">
        <h2 className="text-lg font-bold text-slate-800 mb-3">메뉴 선택</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {MENU_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => addToCart(item)}
              className={cn(
                'flex flex-col items-center justify-center p-4 sm:p-6 rounded-2xl border-2 transition-all active:scale-95',
                item.color,
              )}
            >
              <span className="text-3xl sm:text-4xl mb-2">{item.icon}</span>
              <span className="text-sm sm:text-base font-bold text-slate-800 text-center leading-tight">{item.name}</span>
              <span className="text-base sm:text-lg font-bold text-slate-900 mt-1">
                {item.price.toLocaleString()}원
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* 오른쪽: 장바구니 + 결제 */}
      <div className="w-full lg:w-80 bg-white rounded-2xl border shadow-sm flex flex-col">
        {/* 장바구니 헤더 */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-violet-500" />
            <span className="font-bold">주문 내역</span>
            {totalQty > 0 && (
              <span className="bg-violet-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
                {totalQty}
              </span>
            )}
          </div>
          {cart.length > 0 && (
            <button onClick={clearCart} className="text-xs text-red-400 hover:text-red-600">
              전체 삭제
            </button>
          )}
        </div>

        {/* 장바구니 아이템 */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {cart.length === 0 ? (
            <p className="text-center text-slate-300 py-8">메뉴를 선택하세요</p>
          ) : (
            cart.map((item) => (
              <div key={item.id} className="flex items-center gap-2 p-2 bg-slate-50 rounded-xl">
                <span className="text-xl">{item.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.name}</p>
                  <p className="text-xs text-slate-500">{item.price.toLocaleString()}원</p>
                </div>
                {/* 수량 조절 — 큰 터치 영역 */}
                <div className="flex items-center gap-1">
                  <button onClick={() => updateQty(item.id, -1)}
                    className="w-8 h-8 rounded-lg bg-slate-200 flex items-center justify-center active:bg-slate-300">
                    {item.qty === 1 ? <Trash2 className="w-3.5 h-3.5 text-red-400" /> : <Minus className="w-3.5 h-3.5" />}
                  </button>
                  <span className="w-8 text-center font-bold">{item.qty}</span>
                  <button onClick={() => updateQty(item.id, 1)}
                    className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center active:bg-violet-200">
                    <Plus className="w-3.5 h-3.5 text-violet-600" />
                  </button>
                </div>
                <span className="text-sm font-bold w-16 text-right">
                  {(item.price * item.qty).toLocaleString()}
                </span>
              </div>
            ))
          )}
        </div>

        {/* 결제 영역 */}
        <div className="border-t p-4 space-y-3">
          {/* 총액 */}
          <div className="flex items-center justify-between">
            <span className="text-slate-500 font-medium">합계</span>
            <span className="text-2xl font-black text-slate-900">{total.toLocaleString()}원</span>
          </div>

          {/* 결제 수단 */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setPayMethod('CARD')}
              className={cn(
                'flex items-center justify-center gap-2 p-3 rounded-xl border-2 font-bold text-sm transition-all',
                payMethod === 'CARD'
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-slate-200 text-slate-400',
              )}
            >
              <CreditCard className="w-4 h-4" /> 카드
            </button>
            <button
              onClick={() => setPayMethod('CASH')}
              className={cn(
                'flex items-center justify-center gap-2 p-3 rounded-xl border-2 font-bold text-sm transition-all',
                payMethod === 'CASH'
                  ? 'border-green-500 bg-green-50 text-green-700'
                  : 'border-slate-200 text-slate-400',
              )}
            >
              <Banknote className="w-4 h-4" /> 현금
            </button>
          </div>

          {/* 결제 버튼 */}
          <button
            onClick={handlePay}
            disabled={cart.length === 0 || loading}
            className={cn(
              'w-full py-4 rounded-2xl text-white font-black text-lg transition-all active:scale-[0.98]',
              cart.length > 0 ? 'bg-violet-500 hover:bg-violet-600 shadow-lg' : 'bg-slate-200 cursor-not-allowed',
            )}
          >
            {loading ? '처리중...' : `${total.toLocaleString()}원 결제`}
          </button>
        </div>
      </div>

      {/* 결제 성공 토스트 */}
      {showSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-3xl shadow-2xl p-10 text-center animate-bounce-once">
            <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-3" />
            <p className="text-2xl font-black text-slate-900">결제 완료!</p>
          </div>
        </div>
      )}
    </div>
  )
}
