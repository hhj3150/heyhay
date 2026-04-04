/**
 * @fileoverview subscriptionPayment 서비스 통합 테스트
 * 구독 결제 배치 로직 검증
 */
const {
  getDueSubscriptions,
  handlePaymentFailure,
} = require('../../src/services/subscriptionPayment')

describe('getDueSubscriptions', () => {
  test('만기 구독 목록 조회 (빈 배열도 정상)', async () => {
    const subs = await getDueSubscriptions()

    expect(Array.isArray(subs)).toBe(true)
    // 만기 구독이 있으면 필수 필드 검증
    if (subs.length > 0) {
      expect(subs[0]).toHaveProperty('id')
      expect(subs[0]).toHaveProperty('customer_id')
    }
  })
})

describe('handlePaymentFailure', () => {
  test('1차 실패 시 1시간 후 재시도', async () => {
    const mockSub = { id: '00000000-0000-0000-0000-000000000000', customer_id: 'test' }
    const result = await handlePaymentFailure(mockSub, 0, '테스트 실패')

    expect(result.action).toBe('RETRY')
    expect(result.retryCount).toBe(1)
  })

  test('3차 실패 시 구독 일시정지', async () => {
    const mockSub = { id: '00000000-0000-0000-0000-000000000000', customer_id: 'test' }
    const result = await handlePaymentFailure(mockSub, 3, '3차 실패')

    expect(result.action).toBe('PAUSED')
  })
})
