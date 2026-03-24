/**
 * @fileoverview 스와이프 액션 훅
 * 리스트 아이템을 좌/우로 스와이프하여 액션 트리거
 * 임계값 초과 시 onSwipeLeft / onSwipeRight 콜백 실행
 */
import { useState, useRef, useCallback } from 'react'

const DEFAULT_THRESHOLD = 80

/**
 * @param {Object} options
 * @param {Function} [options.onSwipeLeft] - 왼쪽 스와이프 콜백
 * @param {Function} [options.onSwipeRight] - 오른쪽 스와이프 콜백
 * @param {number} [options.threshold=80] - 트리거 거리 (px)
 * @returns {{ offsetX: number, isSwiping: boolean, handlers: Object }}
 */
export default function useSwipeAction({
  onSwipeLeft,
  onSwipeRight,
  threshold = DEFAULT_THRESHOLD,
} = {}) {
  const [offsetX, setOffsetX] = useState(0)
  const [isSwiping, setIsSwiping] = useState(false)
  const startXRef = useRef(0)
  const startYRef = useRef(0)
  const isHorizontalRef = useRef(null)

  const onTouchStart = useCallback((e) => {
    startXRef.current = e.touches[0].clientX
    startYRef.current = e.touches[0].clientY
    isHorizontalRef.current = null
    setIsSwiping(true)
  }, [])

  const onTouchMove = useCallback((e) => {
    if (!isSwiping) return

    const diffX = e.touches[0].clientX - startXRef.current
    const diffY = e.touches[0].clientY - startYRef.current

    // 첫 움직임에서 방향 판정 (수평/수직)
    if (isHorizontalRef.current === null) {
      if (Math.abs(diffX) > 10 || Math.abs(diffY) > 10) {
        isHorizontalRef.current = Math.abs(diffX) > Math.abs(diffY)
      }
      return
    }

    // 수직 스크롤이면 스와이프 무시
    if (!isHorizontalRef.current) return

    // 좌측 스와이프만 허용 (onSwipeLeft만 있을 때)
    if (onSwipeLeft && !onSwipeRight && diffX > 0) return
    // 우측 스와이프만 허용 (onSwipeRight만 있을 때)
    if (onSwipeRight && !onSwipeLeft && diffX < 0) return

    const maxSwipe = threshold * 1.5
    const clamped = Math.max(-maxSwipe, Math.min(maxSwipe, diffX))
    setOffsetX(clamped)
  }, [isSwiping, onSwipeLeft, onSwipeRight, threshold])

  const onTouchEnd = useCallback(() => {
    setIsSwiping(false)
    if (offsetX < -threshold && onSwipeLeft) {
      onSwipeLeft()
    } else if (offsetX > threshold && onSwipeRight) {
      onSwipeRight()
    }
    setOffsetX(0)
  }, [offsetX, threshold, onSwipeLeft, onSwipeRight])

  const reset = useCallback(() => {
    setOffsetX(0)
    setIsSwiping(false)
  }, [])

  return {
    offsetX,
    isSwiping,
    reset,
    handlers: {
      onTouchStart,
      onTouchMove,
      onTouchEnd,
    },
  }
}
