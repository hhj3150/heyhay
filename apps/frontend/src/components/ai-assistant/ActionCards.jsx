/**
 * @fileoverview AI 비서 액션 확인 카드 — 주문 확인, 착유량 입력 확인
 */
import { memo } from 'react'
import { ShoppingCart, Check, XCircle, Droplets } from 'lucide-react'

// ─── 주문 확인 카드 ─────────────────────────────────────────
export const OrderConfirmCard = memo(function OrderConfirmCard({ order, onConfirm, onCancel }) {
  if (!order) return null

  const items = order.items || [order]
  const totalAmount = items.reduce((sum, item) => {
    const price = item.unit_price ?? item.unitPrice ?? 0
    const qty = item.quantity ?? 0
    return sum + price * qty
  }, 0)

  return (
    <div className="mx-2 my-2 border border-violet-200 rounded-xl overflow-hidden bg-white shadow-sm">
      {/* 카드 헤더 */}
      <div className="bg-violet-50 px-4 py-2.5 border-b border-violet-100 flex items-center gap-2">
        <ShoppingCart className="w-4 h-4 text-violet-600" />
        <span className="text-sm font-semibold text-violet-700">주문 확인</span>
      </div>

      {/* 상품 테이블 */}
      <div className="px-4 py-3">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-400 border-b">
              <th className="text-left pb-2 font-medium">상품명</th>
              <th className="text-right pb-2 font-medium">수량</th>
              <th className="text-right pb-2 font-medium">단가</th>
              <th className="text-right pb-2 font-medium">소계</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => {
              const price = item.unit_price ?? item.unitPrice ?? 0
              const qty = item.quantity ?? 0
              return (
                <tr key={idx} className="border-b border-slate-50 last:border-0">
                  <td className="py-2 text-slate-700 font-medium">
                    {item.product_name ?? item.productName ?? item.name ?? '상품'}
                  </td>
                  <td className="py-2 text-right text-slate-600">{qty}</td>
                  <td className="py-2 text-right text-slate-600">
                    {price.toLocaleString()}원
                  </td>
                  <td className="py-2 text-right text-slate-800 font-semibold">
                    {(price * qty).toLocaleString()}원
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {/* 합계 */}
        <div className="flex justify-between items-center mt-3 pt-3 border-t border-slate-100">
          <span className="text-xs text-slate-500">합계</span>
          <span className="text-base font-bold text-violet-700">
            {totalAmount.toLocaleString()}원
          </span>
        </div>
      </div>

      {/* 확인/취소 버튼 */}
      <div className="px-4 pb-3 flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 h-10 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 active:scale-[0.97] transition-all flex items-center justify-center gap-1.5"
        >
          <XCircle className="w-4 h-4" />
          취소
        </button>
        <button
          onClick={onConfirm}
          className="flex-1 h-10 rounded-lg bg-violet-500 text-white text-sm font-medium hover:bg-violet-600 active:scale-[0.97] transition-all flex items-center justify-center gap-1.5 shadow-sm"
        >
          <Check className="w-4 h-4" />
          주문하기
        </button>
      </div>
    </div>
  )
})

// ─── 착유량 입력 확인 카드 ───────────────────────────────────
export const MilkInputCard = memo(function MilkInputCard({ data, onConfirm, onCancel }) {
  if (!data) return null

  return (
    <div className="mx-2 my-2 border border-blue-200 rounded-xl overflow-hidden bg-white shadow-sm">
      {/* 카드 헤더 */}
      <div className="bg-blue-50 px-4 py-2.5 border-b border-blue-100 flex items-center gap-2">
        <Droplets className="w-4 h-4 text-blue-600" />
        <span className="text-sm font-semibold text-blue-700">착유량 입력 확인</span>
      </div>

      {/* 입력 내용 */}
      <div className="px-4 py-3 space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-sm text-slate-500">총 착유량</span>
          <span className="text-lg font-bold text-blue-700">{data.total_l}L</span>
        </div>
        {data.dairy_assoc_l != null && (
          <div className="flex justify-between items-center">
            <span className="text-sm text-slate-500">진흥회 납유</span>
            <span className="text-sm font-semibold text-slate-700">{data.dairy_assoc_l}L</span>
          </div>
        )}
        {data.d2o_l != null && (
          <div className="flex justify-between items-center">
            <span className="text-sm text-slate-500">D2O 공장</span>
            <span className="text-sm font-semibold text-slate-700">{data.d2o_l}L</span>
          </div>
        )}
      </div>

      {/* 확인/취소 버튼 */}
      <div className="px-4 pb-3 flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 h-10 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 active:scale-[0.97] transition-all flex items-center justify-center gap-1.5"
        >
          <XCircle className="w-4 h-4" />
          취소
        </button>
        <button
          onClick={onConfirm}
          className="flex-1 h-10 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 active:scale-[0.97] transition-all flex items-center justify-center gap-1.5 shadow-sm"
        >
          <Check className="w-4 h-4" />
          입력하기
        </button>
      </div>
    </div>
  )
})
