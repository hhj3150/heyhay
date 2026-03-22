/**
 * @fileoverview 목장 관리 모듈 라우트
 */
import { Routes, Route, Navigate } from 'react-router-dom'
import AnimalListPage from './AnimalListPage'
import MilkingPage from './MilkingPage'
import BreedingPage from './BreedingPage'

export default function FarmRoutes() {
  return (
    <Routes>
      <Route index element={<Navigate to="animals" replace />} />
      <Route path="animals" element={<AnimalListPage />} />
      <Route path="milking" element={<MilkingPage />} />
      <Route path="breeding" element={<BreedingPage />} />
    </Routes>
  )
}
