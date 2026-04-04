import { Routes, Route, Navigate } from 'react-router-dom'
import FactoryDashboard from './FactoryDashboard'
import ProductionPlan from './ProductionPlan'
import InventoryPage from './InventoryPage'
import PackagingPage from './PackagingPage'
import PackagingOrders from './PackagingOrders'
import CCPRecordPage from './CCPRecordPage'

export default function FactoryRoutes() {
  return (
    <Routes>
      <Route index element={<Navigate to="plan" replace />} />
      <Route path="dashboard" element={<FactoryDashboard />} />
      <Route path="plan" element={<ProductionPlan />} />
      <Route path="inventory" element={<InventoryPage />} />
      <Route path="ccp" element={<CCPRecordPage />} />
      <Route path="packaging" element={<PackagingPage />} />
      <Route path="packaging/orders" element={<PackagingOrders />} />
    </Routes>
  )
}
