/**
 * @fileoverview 공유 상수 및 유틸리티
 * Frontend / Backend 공통 사용
 */

/** 사용자 역할 */
const ROLES = Object.freeze({
  ADMIN: 'ADMIN',
  FACTORY: 'FACTORY',
  CAFE: 'CAFE',
  FARM: 'FARM',
})

/** 역할별 접근 가능 모듈 */
const ROLE_PERMISSIONS = Object.freeze({
  [ROLES.ADMIN]: ['farm', 'factory', 'market', 'cafe', 'dashboard'],
  [ROLES.FACTORY]: ['factory', 'dashboard'],
  [ROLES.CAFE]: ['cafe', 'dashboard'],
  [ROLES.FARM]: ['farm', 'dashboard'],
})

/** SKU 목록 (6종) */
const SKU = Object.freeze({
  A2_MILK_750: { code: 'A2-750', name: 'A2 저지우유 750ml', volume_ml: 750, type: '살균유', shelf_days: 7 },
  A2_MILK_180: { code: 'A2-180', name: 'A2 저지우유 180ml', volume_ml: 180, type: '살균유', shelf_days: 7 },
  YOGURT_500: { code: 'YG-500', name: '발효유 500ml', volume_ml: 500, type: '발효유', shelf_days: 14 },
  YOGURT_180: { code: 'YG-180', name: '발효유 180ml', volume_ml: 180, type: '발효유', shelf_days: 14 },
  SOFT_ICE: { code: 'SI-001', name: '소프트아이스크림', volume_ml: null, type: '즉석제조', shelf_days: 0 },
  KAYMAK: { code: 'KM-100', name: '카이막 100g', volume_ml: null, type: '크림', shelf_days: 5 },
})

/** 알림 우선순위 */
const ALERT_PRIORITY = Object.freeze({
  P1: { level: 1, label: '즉시', channels: ['push', 'sms'] },
  P2: { level: 2, label: '1시간내', channels: ['push'] },
  P3: { level: 3, label: '당일', channels: ['push'] },
})

/** CCP 기준값 */
const CCP_LIMITS = Object.freeze({
  CCP1_HTST: { min_temp: 72.0, hold_seconds: 15, name: '살균 (HTST)' },
  CCP2_FILTER: { mesh: 120, name: '충진 직전 여과' },
  KAYMAK_HEAT: { min_temp: 85.0, max_temp: 90.0, name: '카이막 가열' },
})

/** 주문 상태 */
const ORDER_STATUS = Object.freeze({
  PENDING: 'PENDING',
  PAID: 'PAID',
  PROCESSING: 'PROCESSING',
  PACKED: 'PACKED',
  SHIPPED: 'SHIPPED',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
  RETURNED: 'RETURNED',
})

/** 판매 채널 */
const CHANNELS = Object.freeze({
  SMARTSTORE: 'SMARTSTORE',
  OWN_MALL: 'OWN_MALL',
  CAFE: 'CAFE',
  B2B: 'B2B',
})

/** 개체 상태 */
const COW_STATUS = Object.freeze({
  MILKING: 'MILKING',
  DRY: 'DRY',
  PREGNANT: 'PREGNANT',
  HEIFER: 'HEIFER',
  BULL: 'BULL',
  CULL: 'CULL',
})

/** API 응답 헬퍼 */
const apiResponse = (data, meta = {}) => ({
  success: true,
  data,
  meta,
})

const apiError = (code, message) => ({
  success: false,
  error: { code, message },
})

/** 공개 랜딩 페이지 노출 상품 (HACCP 인증 전 사전 신청용 3종) */
const PUBLIC_SKUS = Object.freeze([
  { code: 'A2-750', name: '우유 750ml', unit_price: 12000 },
  { code: 'A2-180', name: '우유 180ml', unit_price: 3200 },
  { code: 'YG-500', name: '플레인요거트 500ml', unit_price: 10000 },
])

/** 배송비 정책 */
const SHIPPING = Object.freeze({
  free_threshold: 35000,
  base_fee: 3000,
})

/** 배송 요일 */
const DELIVERY_DAYS = Object.freeze({
  TUE: '화요일',
  FRI: '금요일',
})

/** 결제 상태 */
const PAYMENT_STATUS = Object.freeze({
  PENDING: 'PENDING',
  PAID: 'PAID',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
  REFUNDED: 'REFUNDED',
})

module.exports = {
  ROLES,
  ROLE_PERMISSIONS,
  SKU,
  ALERT_PRIORITY,
  CCP_LIMITS,
  ORDER_STATUS,
  CHANNELS,
  COW_STATUS,
  PUBLIC_SKUS,
  SHIPPING,
  DELIVERY_DAYS,
  PAYMENT_STATUS,
  apiResponse,
  apiError,
}
