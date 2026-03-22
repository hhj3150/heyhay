import { Routes, Route, Navigate } from 'react-router-dom'
import FactoryDashboard from './FactoryDashboard'
import ProductionPlan from './ProductionPlan'

export default function FactoryRoutes() {
  return (
    <Routes>
      <Route index element={<Navigate to="plan" replace />} />
      <Route path="dashboard" element={<FactoryDashboard />} />
      <Route path="plan" element={<ProductionPlan />} />
    </Routes>
  )
}
