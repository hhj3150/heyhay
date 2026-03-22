/**
 * @fileoverview 목장 관리 — 착유량 입력 + smaXtec 센서
 */
import { Routes, Route, Navigate } from 'react-router-dom'
import DailyMilkPage from './DailyMilkPage'

export default function FarmRoutes() {
  return (
    <Routes>
      <Route index element={<Navigate to="milk" replace />} />
      <Route path="milk" element={<DailyMilkPage />} />
    </Routes>
  )
}
