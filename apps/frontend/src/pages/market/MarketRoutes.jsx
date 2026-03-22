import { Routes, Route, Navigate } from 'react-router-dom'
import MarketDashboard from './MarketDashboard'
import OrderBoard from './OrderBoard'
import SubscriptionDashboard from './SubscriptionDashboard'
import CustomerCRM from './CustomerCRM'
import DeliverySchedule from './DeliverySchedule'

export default function MarketRoutes() {
  return (
    <Routes>
      <Route index element={<Navigate to="orders" replace />} />
      <Route path="overview" element={<MarketDashboard />} />
      <Route path="orders" element={<OrderBoard />} />
      <Route path="subscriptions" element={<SubscriptionDashboard />} />
      <Route path="customers" element={<CustomerCRM />} />
      <Route path="delivery" element={<DeliverySchedule />} />
    </Routes>
  )
}
