/**
 * @fileoverview React Query 커스텀 훅
 * 데이터 캐싱 + 자동 갱신 + 에러 처리
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPut, apiDelete } from './api'

/** 대시보드 KPI (30초 캐시) */
export const useDashboardKPI = () =>
  useQuery({
    queryKey: ['dashboard', 'kpi'],
    queryFn: () => apiGet('/dashboard/kpi'),
    staleTime: 30 * 1000,
  })

/** 알림 목록 (30초 캐시) */
export const useAlerts = (resolved = false) =>
  useQuery({
    queryKey: ['dashboard', 'alerts', resolved],
    queryFn: () => apiGet(`/dashboard/alerts?resolved=${resolved}`),
    staleTime: 30 * 1000,
  })

/** 주문 목록 */
export const useOrders = (params = {}) => {
  const searchParams = new URLSearchParams(params).toString()
  return useQuery({
    queryKey: ['orders', params],
    queryFn: () => apiGet(`/market/orders?${searchParams}`),
    staleTime: 10 * 1000,
  })
}

/** 주문 상태 변경 */
export const useUpdateOrder = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }) => apiPut(`/market/orders/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

/** 구독자 목록 */
export const useSubscriptions = (params = {}) => {
  const searchParams = new URLSearchParams(params).toString()
  return useQuery({
    queryKey: ['subscriptions', params],
    queryFn: () => apiGet(`/market/subscriptions?${searchParams}`),
    staleTime: 30 * 1000,
  })
}

/** 고객 목록 */
export const useCustomers = (params = {}) => {
  const searchParams = new URLSearchParams(params).toString()
  return useQuery({
    queryKey: ['customers', params],
    queryFn: () => apiGet(`/market/customers?${searchParams}`),
    staleTime: 60 * 1000,
  })
}

/** SKU 목록 (5분 캐시 — 거의 안 바뀜) */
export const useSkus = () =>
  useQuery({
    queryKey: ['skus'],
    queryFn: () => apiGet('/factory/skus'),
    staleTime: 5 * 60 * 1000,
  })
