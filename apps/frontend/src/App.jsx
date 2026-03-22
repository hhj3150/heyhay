/**
 * @fileoverview 메인 앱 라우터
 */
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import AppLayout from '@/components/layout/AppLayout'
import LoginPage from '@/pages/LoginPage'
import DashboardPage from '@/pages/DashboardPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          {/* Phase 1: 목장 관리 */}
          {/* <Route path="farm/*" element={<FarmRoutes />} /> */}
          {/* Phase 2: 공장 관리 */}
          {/* <Route path="factory/*" element={<FactoryRoutes />} /> */}
          {/* Phase 3: 온라인 마켓 + 카페 */}
          {/* <Route path="market/*" element={<MarketRoutes />} /> */}
          {/* <Route path="cafe/*" element={<CafeRoutes />} /> */}
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
