import { Routes, Route, Navigate } from 'react-router-dom'
import CafeDashboard from './CafeDashboard'
import CafePOS from './CafePOS'

export default function CafeRoutes() {
  return (
    <Routes>
      <Route index element={<Navigate to="pos" replace />} />
      <Route path="dashboard" element={<CafeDashboard />} />
      <Route path="pos" element={<CafePOS />} />
    </Routes>
  )
}
