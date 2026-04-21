/**
 * @fileoverview PortOne 결제 검증 서비스 테스트
 */

/* global jest, describe, test, expect, beforeEach, afterEach */

const portone = require('../src/services/portone')

/** fetch mock */
const mockFetch = jest.fn()
global.fetch = mockFetch

describe('PortOne 서비스', () => {
  const ORIGINAL_ENV = process.env

  beforeEach(() => {
    process.env = {
      ...ORIGINAL_ENV,
      PORTONE_API_KEY: 'test_key',
      PORTONE_API_SECRET: 'test_secret',
    }
    mockFetch.mockReset()
  })

  afterEach(() => {
    process.env = ORIGINAL_ENV
  })

  describe('getAccessToken', () => {
    test('토큰 발급 성공', async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => ({
          code: 0,
          response: { access_token: 'test_access_token' },
        }),
      })

      const token = await portone.getAccessToken()

      expect(token).toBe('test_access_token')
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.iamport.kr/users/getToken',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ imp_key: 'test_key', imp_secret: 'test_secret' }),
        }),
      )
    })

    test('API 키 미설정 시 에러', async () => {
      delete process.env.PORTONE_API_KEY

      await expect(portone.getAccessToken())
        .rejects.toThrow('설정되지 않았습니다')
    })

    test('인증 실패 시 에러', async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => ({ code: -1, message: 'Unauthorized' }),
      })

      await expect(portone.getAccessToken())
        .rejects.toThrow('PortOne 인증 실패: Unauthorized')
    })
  })

  describe('getPaymentInfo', () => {
    test('결제 정보 조회 성공', async () => {
      // 토큰 발급 mock
      mockFetch.mockResolvedValueOnce({
        json: async () => ({
          code: 0,
          response: { access_token: 'token123' },
        }),
      })
      // 결제 조회 mock
      mockFetch.mockResolvedValueOnce({
        json: async () => ({
          code: 0,
          response: { imp_uid: 'imp_123', amount: 15000, status: 'paid' },
        }),
      })

      const payment = await portone.getPaymentInfo('imp_123')

      expect(payment.imp_uid).toBe('imp_123')
      expect(payment.amount).toBe(15000)
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    test('결제 조회 실패 시 에러', async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => ({
          code: 0,
          response: { access_token: 'token123' },
        }),
      })
      mockFetch.mockResolvedValueOnce({
        json: async () => ({ code: -1, message: 'Not found' }),
      })

      await expect(portone.getPaymentInfo('imp_invalid'))
        .rejects.toThrow('결제 조회 실패: Not found')
    })
  })

  describe('verifyPayment', () => {
    /** 토큰 + 결제 조회 mock 헬퍼 */
    const mockPaymentLookup = (payment) => {
      mockFetch.mockResolvedValueOnce({
        json: async () => ({
          code: 0,
          response: { access_token: 'token123' },
        }),
      })
      mockFetch.mockResolvedValueOnce({
        json: async () => ({
          code: 0,
          response: payment,
        }),
      })
    }

    test('금액 일치 + paid 상태 → verified: true', async () => {
      mockPaymentLookup({ imp_uid: 'imp_123', amount: 15000, status: 'paid' })

      const result = await portone.verifyPayment('imp_123', 15000)

      expect(result.verified).toBe(true)
      expect(result.payment.amount).toBe(15000)
    })

    test('금액 불일치 → verified: false', async () => {
      mockPaymentLookup({ imp_uid: 'imp_123', amount: 10000, status: 'paid' })

      const result = await portone.verifyPayment('imp_123', 15000)

      expect(result.verified).toBe(false)
      expect(result.reason).toContain('금액 불일치')
    })

    test('결제 상태 이상 → verified: false', async () => {
      mockPaymentLookup({ imp_uid: 'imp_123', amount: 15000, status: 'cancelled' })

      const result = await portone.verifyPayment('imp_123', 15000)

      expect(result.verified).toBe(false)
      expect(result.reason).toContain('paid')
    })
  })
})
