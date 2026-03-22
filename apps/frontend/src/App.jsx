/**
 * @fileoverview 메인 앱 라우터 + 에러 바운더리
 */
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import ErrorBoundary from '@/components/ErrorBoundary'
import AppLayout from '@/components/layout/AppLayout'
import LoginPage from '@/pages/LoginPage'
import DashboardPage from '@/pages/DashboardPage'
import FarmRoutes from '@/pages/farm/FarmRoutes'
import FactoryRoutes from '@/pages/factory/FactoryRoutes'
import MarketRoutes from '@/pages/market/MarketRoutes'
import CafeRoutes from '@/pages/cafe/CafeRoutes'

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<AppLayout />}>
            <Route index element={<ErrorBoundary><DashboardPage /></ErrorBoundary>} />
            <Route path="farm/*" element={<ErrorBoundary><FarmRoutes /></ErrorBoundary>} />
            <Route path="factory/*" element={<ErrorBoundary><FactoryRoutes /></ErrorBoundary>} />
            <Route path="market/*" element={<ErrorBoundary><MarketRoutes /></ErrorBoundary>} />
            <Route path="cafe/*" element={<ErrorBoundary><CafeRoutes /></ErrorBoundary>} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
