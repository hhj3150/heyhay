/**
 * @fileoverview 확인 대화 상자
 * 주문 상태 변경 등 중요 작업 전 확인
 */
import { Button } from '@/components/ui/button'

export default function ConfirmDialog({ open, title, description, onConfirm, onCancel, confirmText = '확인', variant = 'default' }) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-5">
        <h3 className="text-lg font-bold text-slate-900 mb-2">{title}</h3>
        {description && <p className="text-sm text-slate-500 mb-4">{description}</p>}
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={onCancel}>취소</Button>
          <Button onClick={onConfirm}
            className={variant === 'danger' ? 'bg-red-500 hover:bg-red-600' : ''}>
            {confirmText}
          </Button>
        </div>
      </div>
    </div>
  )
}
