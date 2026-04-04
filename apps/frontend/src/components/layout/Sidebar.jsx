/**
 * @fileoverview 사이드바 네비게이션 — 다크 프리미엄 테마
 * 모바일: 햄버거 → 오버레이 슬라이드
 * 데스크탑: 고정 사이드바 (접기 가능)
 */
import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Milk, Factory, ShoppingCart,
  LogOut, ChevronLeft, ChevronRight, Menu, X,
  Package, CreditCard, BarChart3, Users, Calendar,
  DollarSign, ClipboardList, Gauge, Building2, ClipboardCheck,
  Settings, Cog, Boxes, Thermometer,
} from 'lucide-react'
import { useState, useEffect } from 'react'
import useAuthStore from '@/stores/authStore'
import { cn } from '@/lib/utils'

const ROLE_PERMISSIONS = {
  ADMIN: ['home', 'production', 'orders', 'customers', 'analytics', 'settings'],
  FACTORY: ['home', 'production'],
  FARM: ['home', 'production'],
}

const NAV_ITEMS = [
  { id: 'home', label: '오늘의 운영', icon: LayoutDashboard, path: '/', accent: 'amber' },
  { id: 'production', label: '착유·생산', icon: Factory, path: '/farm', accent: 'blue', children: [
    { label: '오늘 착유량', icon: Milk, path: '/farm/milk' },
    { label: '생산 계획', icon: ClipboardList, path: '/factory/plan' },
    { label: 'CCP 기록', icon: Thermometer, path: '/factory/ccp' },
    { label: '재고 현황', icon: Package, path: '/factory/inventory' },
    { label: '공정 현황', icon: Gauge, path: '/factory/dashboard' },
    { label: '자재 관리', icon: Boxes, path: '/factory/packaging' },
  ]},
  { id: 'orders', label: '주문·배송', icon: Package, path: '/market', accent: 'emerald', children: [
    { label: '주문 관리', icon: ShoppingCart, path: '/market/orders' },
    { label: '배송 체크', icon: ClipboardCheck, path: '/market/checklist' },
    { label: '배송 스케줄', icon: Calendar, path: '/market/delivery' },
  ]},
  { id: 'customers', label: '고객·거래처', icon: Users, path: '/market/customers', accent: 'violet', children: [
    { label: '고객 관리', icon: Users, path: '/market/customers' },
    { label: '구독 관리', icon: CreditCard, path: '/market/subscriptions' },
    { label: 'B2B 거래처', icon: Building2, path: '/market/b2b' },
  ]},
  { id: 'analytics', label: '경영 분석', icon: BarChart3, path: '/dashboard/overview', accent: 'amber', children: [
    { label: '경영 대시보드', icon: BarChart3, path: '/dashboard/overview' },
    { label: '현황 요약', icon: BarChart3, path: '/market/overview' },
  ]},
  { id: 'settings', label: '설정', icon: Settings, path: '/settings', accent: 'slate', children: [
    { label: '제품 단가', icon: DollarSign, path: '/settings/prices' },
    { label: '시스템 설정', icon: Cog, path: '/settings/system' },
  ]},
]

const ACCENT_COLORS = {
  amber:   { icon: 'text-amber-400',  active: 'bg-amber-500/15 text-amber-300',  bar: 'bg-amber-400',  sub: 'text-amber-400' },
  blue:    { icon: 'text-blue-400',   active: 'bg-blue-500/15 text-blue-300',    bar: 'bg-blue-400',   sub: 'text-blue-400' },
  emerald: { icon: 'text-emerald-400',active: 'bg-emerald-500/15 text-emerald-300', bar: 'bg-emerald-400', sub: 'text-emerald-400' },
  violet:  { icon: 'text-violet-400', active: 'bg-violet-500/15 text-violet-300', bar: 'bg-violet-400', sub: 'text-violet-400' },
  slate:   { icon: 'text-slate-400',  active: 'bg-slate-500/20 text-slate-300',  bar: 'bg-slate-400',  sub: 'text-slate-400' },
}

const ROLE_LABELS = { ADMIN: '관리자', FACTORY: '공장', FARM: '목장', CAFE: '카페' }

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const { user, logout } = useAuthStore()
  const location = useLocation()
  const allowed = ROLE_PERMISSIONS[user?.role] || []
  const visibleItems = NAV_ITEMS.filter((item) => allowed.includes(item.id))

  useEffect(() => { setMobileOpen(false) }, [location.pathname])

  const sidebarContent = (
    <div className="flex flex-col h-full bg-gradient-to-b from-slate-900 via-slate-900 to-slate-800">

      {/* 로고 */}
      <div className="flex items-center justify-between px-4 py-5 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/20 shrink-0">
            <span className="font-black text-white text-base leading-none">H</span>
          </div>
          {(!collapsed || mobileOpen) && (
            <div>
              <p className="font-bold text-sm text-white leading-tight tracking-wide">HEY HAY MILK</p>
              <p className="text-[10px] text-slate-500 tracking-widest uppercase">ERP System</p>
            </div>
          )}
        </div>
        <button onClick={() => setMobileOpen(false)} className="lg:hidden p-1 text-slate-500 hover:text-slate-300" aria-label="메뉴 닫기">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* 네비게이션 */}
      <nav className="flex-1 py-4 px-2 space-y-0.5 overflow-y-auto scrollbar-none" aria-label="메인 네비게이션">
        {visibleItems.map(({ id, label, icon: Icon, path, accent, children }) => {
          const colors = ACCENT_COLORS[accent] || ACCENT_COLORS.slate
          return (
            <div key={id}>
              <NavLink
                to={path}
                end={path === '/' || !!children}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 group relative',
                    isActive
                      ? cn(colors.active, 'shadow-sm')
                      : 'text-slate-400 hover:text-slate-200 hover:bg-white/5',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <span className={cn('absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r', colors.bar)} />
                    )}
                    <Icon className={cn('w-5 h-5 shrink-0 transition-colors', isActive ? colors.icon : 'text-slate-500 group-hover:text-slate-300')} />
                    {(!collapsed || mobileOpen) && <span>{label}</span>}
                  </>
                )}
              </NavLink>

              {/* 서브메뉴 */}
              {(!collapsed || mobileOpen) && children && (
                <div className="ml-4 mt-0.5 mb-1 space-y-0.5 pl-3 border-l border-white/5">
                  {children.map((sub) => (
                    <NavLink
                      key={sub.path}
                      to={sub.path}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-all duration-150',
                          isActive
                            ? cn('font-semibold', ACCENT_COLORS[accent]?.sub || 'text-amber-400', 'bg-white/5')
                            : 'text-slate-500 hover:text-slate-300 hover:bg-white/5',
                        )
                      }
                    >
                      <sub.icon className="w-3.5 h-3.5 shrink-0" />
                      <span>{sub.label}</span>
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      {/* 하단: 사용자 + 로그아웃 */}
      <div className="border-t border-white/5 p-3">
        {(!collapsed || mobileOpen) && user && (
          <div className="mb-2 px-2 flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center shrink-0">
              <span className="text-xs font-bold text-white">{user.name?.[0] || 'U'}</span>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-200 truncate">{user.name}</p>
              <p className="text-[10px] text-amber-500 font-medium">{ROLE_LABELS[user.role] || user.role}</p>
            </div>
          </div>
        )}
        <div className="flex items-center justify-between">
          <button
            onClick={logout}
            className="flex items-center gap-2 px-2 py-1.5 text-xs text-slate-500 hover:text-red-400 transition-colors rounded-lg hover:bg-red-500/10"
            aria-label="로그아웃"
          >
            <LogOut className="w-4 h-4" />
            {(!collapsed || mobileOpen) && '로그아웃'}
          </button>
          <button
            onClick={() => setCollapsed((prev) => !prev)}
            className="hidden lg:flex p-1.5 text-slate-600 hover:text-slate-400 transition-colors rounded-lg hover:bg-white/5"
            aria-label={collapsed ? '사이드바 펼치기' : '사이드바 접기'}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <>
      {/* 모바일 햄버거 */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-3 left-3 z-50 w-10 h-10 bg-slate-900 border border-white/10 rounded-xl flex items-center justify-center shadow-lg"
        aria-label="메뉴 열기"
      >
        <Menu className="w-5 h-5 text-slate-300" />
      </button>

      {/* 모바일 오버레이 */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
      )}

      {/* 모바일 슬라이드 사이드바 */}
      <aside className={cn(
        'lg:hidden fixed inset-y-0 left-0 z-50 w-64 flex flex-col transition-transform duration-300 shadow-2xl',
        mobileOpen ? 'translate-x-0' : '-translate-x-full',
      )}>
        {sidebarContent}
      </aside>

      {/* 데스크탑 사이드바 */}
      <aside className={cn(
        'hidden lg:flex flex-col transition-all duration-200 shadow-xl',
        collapsed ? 'w-16' : 'w-56',
      )}>
        {sidebarContent}
      </aside>
    </>
  )
}
