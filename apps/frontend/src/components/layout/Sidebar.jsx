/**
 * @fileoverview 사이드바 네비게이션
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

// 사이드바 메뉴 — 업무 흐름 순서: 착유→생산→주문→배송→관리
const NAV_ITEMS = [
  // 1. 홈: 오늘 할 일 전체 보기
  { id: 'home', label: '오늘의 운영', icon: LayoutDashboard, path: '/', color: 'text-slate-600' },
  // 2. 착유 → 생산 (원재료 흐름)
  { id: 'production', label: '착유·생산', icon: Factory, path: '/farm', color: 'text-blue-500', children: [
    { label: '오늘 착유량', icon: Milk, path: '/farm/milk' },
    { label: '생산 계획', icon: ClipboardList, path: '/factory/plan' },
    { label: 'CCP 기록', icon: Thermometer, path: '/factory/ccp' },
    { label: '공정 현황', icon: Gauge, path: '/factory/dashboard' },
    { label: '자재 관리', icon: Boxes, path: '/factory/packaging' },
  ]},
  // 3. 주문 → 배송 (판매 흐름)
  { id: 'orders', label: '주문·배송', icon: Package, path: '/market', color: 'text-emerald-500', children: [
    { label: '주문 관리', icon: ShoppingCart, path: '/market/orders' },
    { label: '배송 체크', icon: ClipboardCheck, path: '/market/checklist' },
    { label: '배송 스케줄', icon: Calendar, path: '/market/delivery' },
  ]},
  // 4. 고객·거래처 (관계 관리)
  { id: 'customers', label: '고객·거래처', icon: Users, path: '/market/customers', color: 'text-violet-500', children: [
    { label: '고객 관리', icon: Users, path: '/market/customers' },
    { label: '구독 관리', icon: CreditCard, path: '/market/subscriptions' },
    { label: 'B2B 거래처', icon: Building2, path: '/market/b2b' },
  ]},
  // 5. 경영 분석
  { id: 'analytics', label: '경영 분석', icon: BarChart3, path: '/dashboard/overview', color: 'text-amber-500', children: [
    { label: '경영 대시보드', icon: BarChart3, path: '/dashboard/overview' },
    { label: '현황 요약', icon:BarChart3, path: '/market/overview' },
  ]},
  // 6. 설정
  { id: 'settings', label: '설정', icon: Settings, path: '/settings', color: 'text-slate-400', children: [
    { label: '제품 단가', icon: DollarSign, path: '/settings/prices' },
    { label: '시스템 설정', icon: Cog, path: '/settings/system' },
  ]},
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
        <button onClick={() => setMobileOpen(false)} className="lg:hidden p-1 text-slate-400 hover:text-slate-600" aria-label="메뉴 닫기">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* 메뉴 */}
      <nav className="flex-1 py-4 space-y-1 px-2 overflow-y-auto" aria-label="메인 네비게이션">
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
            aria-label="로그아웃"
          >
            <LogOut className="w-4 h-4" />
            {(!collapsed || mobileOpen) && '로그아웃'}
          </button>
          {/* 데스크탑 접기 버튼 */}
          <button
            onClick={() => setCollapsed((prev) => !prev)}
            className="hidden lg:block p-1 text-slate-300 hover:text-slate-500"
            aria-label={collapsed ? '사이드바 펼치기' : '사이드바 접기'}
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
        aria-label="메뉴 열기"
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
