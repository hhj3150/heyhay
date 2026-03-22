/**
 * @fileoverview 공장 관리 모듈 라우트
 */
import { Routes, Route } from 'react-router-dom'
import FactoryDashboard from './FactoryDashboard'

export default function FactoryRoutes() {
  return (
    <Routes>
      <Route index element={<FactoryDashboard />} />
    </Routes>
  )
}
