/**
 * @fileoverview 메인 레이아웃 (사이드바 + 콘텐츠 영역 + AI 비서)
 * 모바일: 상단 햄버거 + 전체 너비 콘텐츠
 * 데스크탑: 고정 사이드바 + 콘텐츠
 */
import { Outlet, Navigate } from 'react-router-dom'
import Sidebar from './Sidebar'
import AiVoiceAssistant from '@/components/AiVoiceAssistant'
import useAuthStore from '@/stores/authStore'

export default function AppLayout() {
  const { isAuthenticated } = useAuthStore()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-slate-50 p-3 pt-14 lg:p-6 lg:pt-6">
        <Outlet />
      </main>
      <AiVoiceAssistant />
    </div>
  )
}
