/**
 * @fileoverview 공개 랜딩 페이지 상수 (백엔드 shared.js와 동기화 필요)
 */

export const PUBLIC_SKUS = [
  { code: 'A2-750', name: '우유 750ml', unit_price: 12000, description: '저지종 A2 원유 100%' },
  { code: 'A2-180', name: '우유 180ml', unit_price: 3200, description: '1회 섭취 사이즈' },
  { code: 'YG-500', name: '플레인요거트 500ml', unit_price: 10000, description: '저지종 원유 요거트' },
]

export const SHIPPING = {
  free_threshold: 35000,
  base_fee: 3000,
}

export const FREQUENCY_OPTIONS = [
  { value: '1W', label: '매주' },
  { value: '2W', label: '격주 (2주)' },
  { value: '4W', label: '월 1회 (4주)' },
]

/** 배송 안내 */
export const DELIVERY_NOTE = '매주 화요일·금요일 배송'
