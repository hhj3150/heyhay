/**
 * @fileoverview 설정 모듈 라우트
 */
import { Routes, Route, Navigate } from 'react-router-dom'
import PriceSettings from './PriceSettings'
import SystemSettings from './SystemSettings'
import NaverIntegration from './NaverIntegration'
import QrCodeGenerator from './QrCodeGenerator'

export default function SettingsRoutes() {
  return (
    <Routes>
      <Route index element={<Navigate to="prices" replace />} />
      <Route path="prices" element={<PriceSettings />} />
      <Route path="system" element={<SystemSettings />} />
      <Route path="naver" element={<NaverIntegration />} />
      <Route path="qr" element={<QrCodeGenerator />} />
    </Routes>
  )
}
