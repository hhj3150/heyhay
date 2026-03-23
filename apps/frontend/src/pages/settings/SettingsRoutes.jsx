/**
 * @fileoverview 설정 모듈 라우트
 */
import { Routes, Route, Navigate } from 'react-router-dom'
import PriceSettings from './PriceSettings'
import SystemSettings from './SystemSettings'

export default function SettingsRoutes() {
  return (
    <Routes>
      <Route index element={<Navigate to="prices" replace />} />
      <Route path="prices" element={<PriceSettings />} />
      <Route path="system" element={<SystemSettings />} />
    </Routes>
  )
}
