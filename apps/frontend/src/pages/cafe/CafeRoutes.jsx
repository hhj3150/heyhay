import { Routes, Route } from 'react-router-dom'
import CafeDashboard from './CafeDashboard'

export default function CafeRoutes() {
  return (
    <Routes>
      <Route index element={<CafeDashboard />} />
    </Routes>
  )
}
