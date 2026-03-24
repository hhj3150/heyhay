/**
 * @fileoverview 모바일 하단 네비게이션 바
 * 768px 이하에서만 표시, 엄지 접근성 최적화
 * safe-area-inset-bottom 적용 (아이폰 노치 대응)
 */
import { NavLink, useLocation } from 'react-router-dom'
import { Home, Package, Truck, Milk, Bot } from 'lucide-react'
import { cn } from '@/lib/utils'

const TABS = [
  { path: '/', label: '홈', icon: Home, exact: true },
  { path: '/market/orders', label: '주문', icon: Package },
  { path: '/market/checklist', label: '배송', icon: Truck },
  { path: '/farm/milk', label: '착유', icon: Milk },
  { path: '/ai-assistant', label: 'AI비서', icon: Bot },
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

  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-slate-200 shadow-[0_-2px_10px_rgba(0,0,0,0.06)]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      aria-label="모바일 하단 네비게이션"
    >
      <div className="flex items-center justify-around h-[60px]">
        {TABS.map((tab) => {
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
      </div>
    </nav>
  )
}
