/**
 * @fileoverview 사이드바 네비게이션
 * 역할별 메뉴 필터링 포함
 */
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Milk, Factory, ShoppingCart, Coffee,
  LogOut, ChevronLeft, ChevronRight, Baby, Heart, Wheat,
  Package, CreditCard, BarChart3,
} from 'lucide-react'
import { useState } from 'react'
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
    { label: '현황 요약', icon: BarChart3, path: '/market/overview' },
  ]},
  { id: 'cafe', label: '밀크카페', icon: Coffee, path: '/cafe', color: 'text-violet-500' },
]

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const { user, logout } = useAuthStore()
  const allowed = ROLE_PERMISSIONS[user?.role] || []

  const visibleItems = NAV_ITEMS.filter((item) => allowed.includes(item.id))

  return (
    <aside
      className={cn(
        'flex flex-col bg-white border-r border-slate-200 transition-all duration-200',
        collapsed ? 'w-16' : 'w-56',
      )}
    >
      {/* 로고 */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-slate-100">
        <div className="w-8 h-8 rounded-lg bg-amber-500 text-white flex items-center justify-center font-black text-sm shrink-0">
          H
        </div>
        {!collapsed && (
          <div>
            <p className="font-bold text-sm leading-tight">HEY HAY MILK</p>
            <p className="text-[10px] text-slate-400">ERP System</p>
          </div>
        )}
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
              {!collapsed && <span>{label}</span>}
            </NavLink>
            {!collapsed && children && (
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
        {!collapsed && user && (
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
            {!collapsed && '로그아웃'}
          </button>
          <button
            onClick={() => setCollapsed((prev) => !prev)}
            className="p-1 text-slate-300 hover:text-slate-500"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </aside>
  )
}
