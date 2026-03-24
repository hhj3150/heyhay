/**
 * @fileoverview 풀투리프레시 시각적 인디케이터
 * 당김 거리에 따라 스피너 + 텍스트 표시
 */
import { RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * @param {Object} props
 * @param {number} props.pullDistance - 현재 당김 거리 (px)
 * @param {boolean} props.isRefreshing - 새로고침 진행 중 여부
 * @param {number} [props.threshold=60] - 트리거 임계값 (px)
 */
export default function PullToRefreshIndicator({ pullDistance, isRefreshing, threshold = 60 }) {
  if (pullDistance <= 0 && !isRefreshing) return null

  const isReady = pullDistance >= threshold
  const progress = Math.min(pullDistance / threshold, 1)

  return (
    <div
      className="flex items-center justify-center overflow-hidden transition-[height] duration-200"
      style={{ height: `${pullDistance}px` }}
    >
      <div className="flex items-center gap-2">
        <RefreshCw
          className={cn(
            'w-5 h-5 transition-transform duration-200',
            isRefreshing ? 'animate-spin text-blue-500' : isReady ? 'text-blue-500' : 'text-slate-400',
          )}
          style={{ transform: isRefreshing ? undefined : `rotate(${progress * 360}deg)` }}
        />
        <span className={cn(
          'text-xs font-medium transition-colors',
          isRefreshing ? 'text-blue-500' : isReady ? 'text-blue-500' : 'text-slate-400',
        )}>
          {isRefreshing ? '새로고침 중...' : isReady ? '놓으면 새로고침' : '당겨서 새로고침'}
        </span>
      </div>
    </div>
  )
}
