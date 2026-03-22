/**
 * @fileoverview 메인 레이아웃 (사이드바 + 콘텐츠 영역)
 */
import { Outlet, Navigate } from 'react-router-dom'
import Sidebar from './Sidebar'
import useAuthStore from '@/stores/authStore'

export default function AppLayout() {
  const { isAuthenticated } = useAuthStore()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-slate-50 p-6">
        <Outlet />
      </main>
    </div>
  )
}
