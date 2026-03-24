/**
 * @fileoverview 모바일 하단 네비게이션 바
 * 768px 이하에서만 표시, 엄지 접근성 최적화
 * safe-area-inset-bottom 적용 (아이폰 노치 대응)
 *
 * AI 비서 탭은 라우트 이동이 아닌 커스텀 이벤트로 FloatingButton 열기
 */
import { NavLink, useLocation } from 'react-router-dom'
import { Home, Package, Truck, Milk, Bot } from 'lucide-react'
import { cn } from '@/lib/utils'

/** 라우트 이동하는 일반 탭 */
const NAV_TABS = [
  { path: '/', label: '홈', icon: Home, exact: true },
  { path: '/market/orders', label: '주문', icon: Package },
  { path: '/market/checklist', label: '배송', icon: Truck },
  { path: '/farm/milk', label: '착유', icon: Milk },
]

export default function MobileBottomNav() {
  const location = useLocation()

  /** 현재 경로가 탭 경로와 일치하는지 판별 */
  const isActive = (tab) => {
    if (tab.exact) {
      return location.pathname === tab.path
    }
    return location.pathname.startsWith(tab.path)
  }

  /** AI 비서 열기 — 라우트 이동 대신 커스텀 이벤트 발행 */
  const handleOpenAi = () => {
    window.dispatchEvent(new CustomEvent('open-ai-assistant'))
  }

  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-slate-200 shadow-[0_-2px_10px_rgba(0,0,0,0.06)]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      aria-label="모바일 하단 네비게이션"
    >
      <div className="flex items-center justify-around h-[60px]">
        {NAV_TABS.map((tab) => {
          const active = isActive(tab)
          return (
            <NavLink
              key={tab.path}
              to={tab.path}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5',
                'min-w-[44px] min-h-[44px] px-2 py-1',
                'rounded-lg transition-colors active:scale-95',
                active
                  ? 'text-blue-600'
                  : 'text-slate-400 hover:text-slate-600',
              )}
              aria-label={tab.label}
              aria-current={active ? 'page' : undefined}
            >
              <tab.icon className={cn('w-5 h-5', active && 'stroke-[2.5]')} />
              <span className={cn(
                'text-[10px] leading-tight',
                active ? 'font-bold' : 'font-medium',
              )}>
                {tab.label}
              </span>
            </NavLink>
          )
        })}

        {/* AI 비서 — 컴포넌트 상태 변경 (라우트 이동 아님) */}
        <button
          onClick={handleOpenAi}
          className={cn(
            'flex flex-col items-center justify-center gap-0.5',
            'min-w-[44px] min-h-[44px] px-2 py-1',
            'rounded-lg transition-colors active:scale-95',
            'text-slate-400 hover:text-slate-600',
          )}
          aria-label="AI비서"
        >
          <Bot className="w-5 h-5" />
          <span className="text-[10px] leading-tight font-medium">AI비서</span>
        </button>
      </div>
    </nav>
  )
}
