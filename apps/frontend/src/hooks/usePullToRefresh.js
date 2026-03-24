/**
 * @fileoverview 풀투리프레시 훅
 * 상단에서 아래로 당기면 onRefresh 콜백 실행
 * 임계값(threshold) 초과 시 트리거, 스피너 표시
 */
import { useState, useRef, useCallback, useEffect } from 'react'

const DEFAULT_THRESHOLD = 60

/**
 * @param {Object} options
 * @param {Function} options.onRefresh - 새로고침 콜백 (async 가능)
 * @param {number} [options.threshold=60] - 트리거 거리 (px)
 * @returns {{ pullDistance: number, isRefreshing: boolean, handlers: Object }}
 */
export default function usePullToRefresh({ onRefresh, threshold = DEFAULT_THRESHOLD }) {
  const [pullDistance, setPullDistance] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const startYRef = useRef(0)
  const pullingRef = useRef(false)

  const onTouchStart = useCallback((e) => {
    // 스크롤이 맨 위일 때만 활성화
    const scrollTop = window.scrollY || document.documentElement.scrollTop
    if (scrollTop > 0) return
    startYRef.current = e.touches[0].clientY
    pullingRef.current = true
  }, [])

  const onTouchMove = useCallback((e) => {
    if (!pullingRef.current || isRefreshing) return
    const diff = e.touches[0].clientY - startYRef.current
    if (diff > 0) {
      // 감속 효과 (당길수록 저항 증가)
      const dampened = Math.min(diff * 0.4, threshold * 1.8)
      setPullDistance(dampened)
    }
  }, [isRefreshing, threshold])

  const onTouchEnd = useCallback(async () => {
    if (!pullingRef.current) return
    pullingRef.current = false

    if (pullDistance >= threshold && !isRefreshing) {
      setIsRefreshing(true)
      setPullDistance(threshold * 0.6)
      try {
        await onRefresh()
      } finally {
        setIsRefreshing(false)
        setPullDistance(0)
      }
    } else {
      setPullDistance(0)
    }
  }, [pullDistance, threshold, isRefreshing, onRefresh])

  // 클린업
  useEffect(() => {
    return () => {
      pullingRef.current = false
    }
  }, [])

  return {
    pullDistance,
    isRefreshing,
    handlers: {
      onTouchStart,
      onTouchMove,
      onTouchEnd,
    },
  }
}
