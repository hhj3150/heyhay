/**
 * @fileoverview AI 비서 상수 — 페이지 컨텍스트 제안 문구 및 기본 카테고리
 */
import { Search, ShoppingCart, Settings } from 'lucide-react'

// ─── 페이지 컨텍스트별 빠른 제안 문구 ────────────────────────
export const PAGE_SUGGESTIONS = {
  '/': [
    '오늘 현황 요약해줘',
    '미처리 주문 있어?',
    '내일 생산계획 알려줘',
    '재고 부족 품목',
  ],
  '/market/orders': [
    '결제 대기 주문 알려줘',
    '오늘 발송건 몇 개야?',
    '주문 등록해줘',
    '미처리 주문 있어?',
  ],
  '/market/subscriptions': [
    '구독자 몇 명이야?',
    '이번달 구독 매출은?',
    '구독 관리 현황',
  ],
  '/market/checklist': [
    '오늘 배송 현황',
    '미발송 건수 알려줘',
    '이슈 있는 배송건',
  ],
  '/market/b2b': [
    'B2B 미처리 주문',
    '밀크카페 주문 넣어줘',
    '거래처별 매출 현황',
  ],
  '/factory': [
    '오늘 생산 계획',
    '재고 부족 품목 알려줘',
    '자재 현황 확인',
  ],
  '/farm/milk': [
    '이번달 납유 정산해줘',
    '착유량 입력할게',
    'D2O 추천 납유량은?',
    '오늘 착유량은?',
  ],
  '/settings': [
    '현재 단가 설정 보여줘',
    '배송비 설정 확인',
  ],
}

// ─── 카테고리별 기본 제안 문구 (홈) ──────────────────────────
export const DEFAULT_SUGGESTION_GROUPS = [
  {
    label: '조회',
    icon: Search,
    items: [
      '오늘 전체 현황 요약해줘',
      '오늘 납유량은?',
      '이번달 납유대금은?',
      '구독자 몇 명이야?',
    ],
  },
  {
    label: '주문',
    icon: ShoppingCart,
    items: [
      '밀크카페 우유750 10개 주문해줘',
      '미처리 주문 있어?',
    ],
  },
  {
    label: '관리',
    icon: Settings,
    items: [
      '이번주 분만예정 개체는?',
      '재고 부족 품목 알려줘',
    ],
  },
]

/**
 * 현재 pathname에 맞는 빠른 제안 문구 반환
 * @param {string} pathname - 현재 URL 경로
 * @returns {string[]} 빠른 질문 목록
 */
export function getContextChips(pathname) {
  if (PAGE_SUGGESTIONS[pathname]) {
    return PAGE_SUGGESTIONS[pathname]
  }
  const prefixMatch = Object.keys(PAGE_SUGGESTIONS).find(
    (key) => key !== '/' && pathname.startsWith(key)
  )
  if (prefixMatch) {
    return PAGE_SUGGESTIONS[prefixMatch]
  }
  return PAGE_SUGGESTIONS['/'] || []
}
