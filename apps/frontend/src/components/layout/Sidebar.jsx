/**
 * @fileoverview 사이드바 네비게이션
 * 모바일: 햄버거 → 오버레이 슬라이드
 * 데스크탑: 고정 사이드바 (접기 가능)
 */
import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Milk, Factory, ShoppingCart, Coffee,
  LogOut, ChevronLeft, ChevronRight, Baby, Heart, Wheat,
  Package, CreditCard, BarChart3, Users, Calendar, Menu, X,
} from 'lucide-react'
import { useState, useEffect } from 'react'
import useAuthStore from '@/stores/authStore'
import { cn } from '@/lib/utils'

const ROLE_PERMISSIONS = {
  ADMIN: ['dashboard', 'farm', 'factory', 'market', 'cafe'],
  FACTORY: ['dashboard', 'factory'],
  CAFE: ['dashboard', 'cafe'],
  FARM: ['dashboard', 'farm'],
}

const NAV_ITEMS = [
  { id: 'dashboard', label: '대시보드', icon: LayoutDashboard, path: '/', color: 'text-slate-600' },
  { id: 'farm', label: '목장 관리', icon: Milk, path: '/farm', color: 'text-amber-500', children: [
    { label: '개체 관리', icon: Milk, path: '/farm/animals' },
    { label: '착유 관리', icon: Milk, path: '/farm/milking' },
    { label: '번식 관리', icon: Baby, path: '/farm/breeding' },
  ]},
  { id: 'factory', label: '공장 관리', icon: Factory, path: '/factory', color: 'text-blue-500' },
  { id: 'market', label: '온라인 마켓', icon: ShoppingCart, path: '/market', color: 'text-emerald-500', children: [
    { label: '주문 관리', icon: Package, path: '/market/orders' },
    { label: '구독 관리', icon: CreditCard, path: '/market/subscriptions' },
    { label: '고객 관리', icon: Users, path: '/market/customers' },
    { label: '배송 스케줄', icon: Calendar, path: '/market/delivery' },
    { label: '현황 요약', icon: BarChart3, path: '/market/overview' },
  ]},
  { id: 'cafe', label: '밀크카페', icon: Coffee, path: '/cafe', color: 'text-violet-500' },
]

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const { user, logout } = useAuthStore()
  const location = useLocation()
  const allowed = ROLE_PERMISSIONS[user?.role] || []
  const visibleItems = NAV_ITEMS.filter((item) => allowed.includes(item.id))

  // 경로 변경 시 모바일 메뉴 닫기
  useEffect(() => { setMobileOpen(false) }, [location.pathname])

  const sidebarContent = (
    <>
      {/* 로고 */}
      <div className="flex items-center justify-between px-4 py-5 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-500 text-white flex items-center justify-center font-black text-sm shrink-0">
            H
          </div>
          {(!collapsed || mobileOpen) && (
            <div>
              <p className="font-bold text-sm leading-tight">HEY HAY MILK</p>
              <p className="text-[10px] text-slate-400">ERP System</p>
            </div>
          )}
        </div>
        {/* 모바일 닫기 버튼 */}
        <button onClick={() => setMobileOpen(false)} className="lg:hidden p-1 text-slate-400 hover:text-slate-600">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* 메뉴 */}
      <nav className="flex-1 py-4 space-y-1 px-2 overflow-y-auto">
        {visibleItems.map(({ id, label, icon: Icon, path, color, children }) => (
          <div key={id}>
            <NavLink
              to={path}
              end={path === '/' || !!children}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-slate-100 text-slate-900'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700',
                )
              }
            >
              <Icon className={cn('w-5 h-5 shrink-0', color)} />
              {(!collapsed || mobileOpen) && <span>{label}</span>}
            </NavLink>
            {(!collapsed || mobileOpen) && children && (
              <div className="ml-6 mt-0.5 space-y-0.5">
                {children.map((sub) => (
                  <NavLink
                    key={sub.path}
                    to={sub.path}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-2 px-3 py-1.5 rounded-md text-xs transition-colors',
                        isActive
                          ? 'bg-amber-50 text-amber-700 font-semibold'
                          : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50',
                      )
                    }
                  >
                    <sub.icon className="w-3.5 h-3.5" />
                    <span>{sub.label}</span>
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>

      {/* 하단: 사용자 정보 + 로그아웃 */}
      <div className="border-t border-slate-100 p-3">
        {(!collapsed || mobileOpen) && user && (
          <div className="mb-2 px-2">
            <p className="text-xs font-semibold text-slate-700">{user.name}</p>
            <p className="text-[10px] text-slate-400">{user.role}</p>
          </div>
        )}
        <div className="flex items-center justify-between">
          <button
            onClick={logout}
            className="flex items-center gap-2 px-2 py-1.5 text-xs text-slate-400 hover:text-red-500 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            {(!collapsed || mobileOpen) && '로그아웃'}
          </button>
          {/* 데스크탑 접기 버튼 */}
          <button
            onClick={() => setCollapsed((prev) => !prev)}
            className="hidden lg:block p-1 text-slate-300 hover:text-slate-500"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </>
  )

  return (
    <>
      {/* 모바일 햄버거 버튼 — 최상단 고정 */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-3 left-3 z-50 w-10 h-10 bg-white border border-slate-200 rounded-lg flex items-center justify-center shadow-sm"
      >
        <Menu className="w-5 h-5 text-slate-600" />
      </button>

      {/* 모바일 오버레이 */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/40" onClick={() => setMobileOpen(false)} />
      )}

      {/* 모바일 슬라이드 사이드바 */}
      <aside className={cn(
        'lg:hidden fixed inset-y-0 left-0 z-50 w-64 bg-white flex flex-col transition-transform duration-300',
        mobileOpen ? 'translate-x-0' : '-translate-x-full',
      )}>
        {sidebarContent}
      </aside>

      {/* 데스크탑 사이드바 */}
      <aside className={cn(
        'hidden lg:flex flex-col bg-white border-r border-slate-200 transition-all duration-200',
        collapsed ? 'w-16' : 'w-56',
      )}>
        {sidebarContent}
      </aside>
    </>
  )
}
