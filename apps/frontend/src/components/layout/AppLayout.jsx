/**
 * @fileoverview 메인 레이아웃 (사이드바 + 콘텐츠 + 뒤로가기 + AI 비서)
 */
import { Outlet, Navigate, useNavigate, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import AiVoiceAssistant from '@/components/AiVoiceAssistant'
import useAuthStore from '@/stores/authStore'
import { ArrowLeft, Home } from 'lucide-react'
import { Toaster } from 'sonner'

export default function AppLayout() {
  const { isAuthenticated } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  // 대시보드(홈)가 아닐 때만 뒤로가기 표시
  const isHome = location.pathname === '/'

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-slate-50 p-3 pt-14 lg:p-6 lg:pt-6">
        {!isHome && (
          <div className="flex items-center gap-2 mb-4">
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-500 hover:text-slate-700 hover:bg-white rounded-lg transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              뒤로
            </button>
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-400 hover:text-slate-600 hover:bg-white rounded-lg transition-colors"
            >
              <Home className="w-4 h-4" />
              대시보드
            </button>
          </div>
        )}
        <Outlet />
      </main>
      <Toaster richColors position="top-right" />
      <AiVoiceAssistant />
    </div>
  )
}
