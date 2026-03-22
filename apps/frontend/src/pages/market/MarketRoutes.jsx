import { Routes, Route } from 'react-router-dom'
import MarketDashboard from './MarketDashboard'

export default function MarketRoutes() {
  return (
    <Routes>
      <Route index element={<MarketDashboard />} />
    </Routes>
  )
}
