/**
 * @fileoverview 메인 앱 라우터 + 에러 바운더리 + 코드 스플리팅
 */
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import ErrorBoundary from '@/components/ErrorBoundary'
import AppLayout from '@/components/layout/AppLayout'
import LoadingScreen from '@/components/ui/LoadingScreen'

const LoginPage = lazy(() => import('@/pages/LoginPage'))
const TodayOpsPage = lazy(() => import('@/pages/TodayOpsPage'))
const DashboardPage = lazy(() => import('@/pages/DashboardPage'))
const FarmRoutes = lazy(() => import('@/pages/farm/FarmRoutes'))
const FactoryRoutes = lazy(() => import('@/pages/factory/FactoryRoutes'))
const MarketRoutes = lazy(() => import('@/pages/market/MarketRoutes'))
const CafeRoutes = lazy(() => import('@/pages/cafe/CafeRoutes'))
const SettingsRoutes = lazy(() => import('@/pages/settings/SettingsRoutes'))

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Suspense fallback={<LoadingScreen />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<AppLayout />}>
              <Route index element={<ErrorBoundary><TodayOpsPage /></ErrorBoundary>} />
              <Route path="dashboard/overview" element={<ErrorBoundary><DashboardPage /></ErrorBoundary>} />
              <Route path="farm/*" element={<ErrorBoundary><FarmRoutes /></ErrorBoundary>} />
              <Route path="factory/*" element={<ErrorBoundary><FactoryRoutes /></ErrorBoundary>} />
              <Route path="market/*" element={<ErrorBoundary><MarketRoutes /></ErrorBoundary>} />
              <Route path="cafe/*" element={<ErrorBoundary><CafeRoutes /></ErrorBoundary>} />
              <Route path="settings/*" element={<ErrorBoundary><SettingsRoutes /></ErrorBoundary>} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
