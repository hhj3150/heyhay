/**
 * @fileoverview 스와이프 가능한 리스트 아이템 래퍼
 * 좌로 스와이프 시 액션 영역 노출
 */
import { useState, useRef, useCallback } from 'react'
import { cn } from '@/lib/utils'

const SWIPE_THRESHOLD = 80

/**
 * @param {Object} props
 * @param {React.ReactNode} props.children - 메인 콘텐츠
 * @param {React.ReactNode} [props.leftAction] - 우측 스와이프 시 노출할 액션
 * @param {React.ReactNode} [props.rightAction] - 좌측 스와이프 시 노출할 액션
 * @param {string} [props.className] - 추가 클래스
 */
export default function SwipeableItem({ children, leftAction, rightAction, className }) {
  const [offsetX, setOffsetX] = useState(0)
  const startXRef = useRef(0)
  const startYRef = useRef(0)
  const isHorizontalRef = useRef(null)
  const swipingRef = useRef(false)

  const onTouchStart = useCallback((e) => {
    startXRef.current = e.touches[0].clientX
    startYRef.current = e.touches[0].clientY
    isHorizontalRef.current = null
    swipingRef.current = true
  }, [])

  const onTouchMove = useCallback((e) => {
    if (!swipingRef.current) return

    const diffX = e.touches[0].clientX - startXRef.current
    const diffY = e.touches[0].clientY - startYRef.current

    if (isHorizontalRef.current === null) {
      if (Math.abs(diffX) > 8 || Math.abs(diffY) > 8) {
        isHorizontalRef.current = Math.abs(diffX) > Math.abs(diffY)
      }
      return
    }

    if (!isHorizontalRef.current) return

    // 양쪽 모두 허용하되, 해당 방향 액션이 있는 경우만
    const maxLeft = rightAction ? -SWIPE_THRESHOLD * 1.3 : 0
    const maxRight = leftAction ? SWIPE_THRESHOLD * 1.3 : 0
    const clamped = Math.max(maxLeft, Math.min(maxRight, diffX))
    setOffsetX(clamped)
  }, [leftAction, rightAction])

  const onTouchEnd = useCallback(() => {
    swipingRef.current = false
    // 스냅: 임계값 초과 시 유지, 미만이면 복귀
    if (offsetX < -SWIPE_THRESHOLD && rightAction) {
      setOffsetX(-SWIPE_THRESHOLD)
    } else if (offsetX > SWIPE_THRESHOLD && leftAction) {
      setOffsetX(SWIPE_THRESHOLD)
    } else {
      setOffsetX(0)
    }
  }, [offsetX, leftAction, rightAction])

  const close = useCallback(() => setOffsetX(0), [])

  return (
    <div className={cn('relative overflow-hidden rounded-xl', className)}>
      {/* 좌측 배경 (우측 스와이프 시 노출) */}
      {leftAction && (
        <div
          className="absolute inset-y-0 left-0 flex items-center justify-center"
          style={{ width: `${SWIPE_THRESHOLD}px` }}
          onClick={close}
        >
          {leftAction}
        </div>
      )}
      {/* 우측 배경 (좌측 스와이프 시 노출) */}
      {rightAction && (
        <div
          className="absolute inset-y-0 right-0 flex items-center justify-center"
          style={{ width: `${SWIPE_THRESHOLD}px` }}
          onClick={close}
        >
          {rightAction}
        </div>
      )}
      {/* 메인 콘텐츠 */}
      <div
        className="relative bg-white transition-transform duration-200 ease-out"
        style={{
          transform: `translateX(${offsetX}px)`,
          transitionDuration: swipingRef.current ? '0ms' : '200ms',
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {children}
      </div>
    </div>
  )
}
