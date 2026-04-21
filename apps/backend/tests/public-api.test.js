/**
 * @fileoverview 공개 API 테스트 (인증 불필요 엔드포인트)
 * GET /api/v1/public/products
 * POST /api/v1/public/subscribe
 * POST /api/v1/public/payment/verify
 */

/* global jest, describe, test, expect, beforeEach, afterEach */

const request = require('supertest')
const app = require('../src/index')
const database = require('../src/config/database')

jest.mock('../src/config/database')

describe('GET /api/v1/public/products', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('상품 목록 + 단가 반환', async () => {
    database.query.mockResolvedValueOnce({
      rows: [
        { code: 'A2-750', name: 'A2 저지우유 750ml', unit_price: '12000' },
        { code: 'A2-180', name: 'A2 저지우유 180ml', unit_price: '3200' },
        { code: 'YG-500', name: '발효유 500ml', unit_price: '10000' },
      ],
    })

    const res = await request(app).get('/api/v1/public/products')

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.products).toHaveLength(3)
    expect(res.body.data.products[0]).toEqual(expect.objectContaining({
      code: 'A2-750',
      unit_price: 12000,
    }))
    expect(res.body.data.shipping).toHaveProperty('free_threshold')
    expect(res.body.data.shipping).toHaveProperty('base_fee')
  })

  test('DB에 단가가 없으면 0 반환', async () => {
    database.query.mockResolvedValueOnce({
      rows: [
        { code: 'A2-750', name: 'A2 저지우유 750ml', unit_price: '0' },
      ],
    })

    const res = await request(app).get('/api/v1/public/products')

    expect(res.status).toBe(200)
    expect(res.body.data.products[0].unit_price).toBe(0)
  })

  test('DB 에러 시 500 반환', async () => {
    database.query.mockRejectedValueOnce(new Error('DB connection failed'))

    const res = await request(app).get('/api/v1/public/products')

    expect(res.status).toBe(500)
  })
})

describe('POST /api/v1/public/subscribe', () => {
  /** 유효한 구독 신청 바디 */
  const validBody = {
    name: '테스트유저',
    phone: '010-1234-5678',
    address_main: '경기도 안성시 테스트동 123',
    items: [{ sku_code: 'A2-750', quantity: 2 }],
    frequency: '1W',
    delivery_days: ['TUE'],
    pg_provider: 'kakaopay',
    consent_privacy: true,
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('유효한 구독 신청 → 201 + merchant_uid 반환', async () => {
    // calculatePricing DB 조회
    database.query
      .mockResolvedValueOnce({
        rows: [{ code: 'A2-750', name: 'A2 저지우유 750ml', unit_price: '12000' }],
      })
      // 기존 고객 조회 (없음)
      .mockResolvedValueOnce({ rows: [] })
      // 신규 고객 INSERT
      .mockResolvedValueOnce({ rows: [{ id: 'cust-uuid-1' }] })

    // transaction mock
    database.transaction.mockImplementationOnce(async (cb) => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ id: 'sub-uuid-1', created_at: new Date() }] })
          .mockResolvedValueOnce({ rows: [{ id: 'pay-uuid-1' }] }),
      }
      return cb(mockClient)
    })

    const res = await request(app)
      .post('/api/v1/public/subscribe')
      .send(validBody)

    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toHaveProperty('merchant_uid')
    expect(res.body.data.merchant_uid).toMatch(/^SUB-/)
    expect(res.body.data).toHaveProperty('amount')
    expect(res.body.data).toHaveProperty('started_at')
    expect(res.body.data.delivery_days).toEqual(['TUE'])
  })

  test('기존 고객 → 정보 업데이트 후 구독 생성', async () => {
    database.query
      .mockResolvedValueOnce({
        rows: [{ code: 'A2-750', name: 'A2 저지우유 750ml', unit_price: '12000' }],
      })
      .mockResolvedValueOnce({ rows: [{ id: 'existing-cust-id' }] })
      .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE

    database.transaction.mockImplementationOnce(async (cb) => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ id: 'sub-uuid-2', created_at: new Date() }] })
          .mockResolvedValueOnce({ rows: [{ id: 'pay-uuid-2' }] }),
      }
      return cb(mockClient)
    })

    const res = await request(app)
      .post('/api/v1/public/subscribe')
      .send(validBody)

    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
  })

  test('필수 필드 누락 → 400', async () => {
    const res = await request(app)
      .post('/api/v1/public/subscribe')
      .send({ name: '테스트' })

    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  test('유효하지 않은 SKU → 400', async () => {
    const res = await request(app)
      .post('/api/v1/public/subscribe')
      .send({
        ...validBody,
        items: [{ sku_code: 'INVALID-SKU', quantity: 1 }],
      })

    expect(res.status).toBe(400)
    expect(res.body.error.message).toContain('유효하지 않은 상품')
  })

  test('개인정보 동의 미체크 → 400', async () => {
    const res = await request(app)
      .post('/api/v1/public/subscribe')
      .send({ ...validBody, consent_privacy: false })

    expect(res.status).toBe(400)
    expect(res.body.error.message).toContain('개인정보')
  })

  test('잘못된 전화번호 → 400', async () => {
    const res = await request(app)
      .post('/api/v1/public/subscribe')
      .send({ ...validBody, phone: '02-1234-5678' })

    expect(res.status).toBe(400)
  })

  test('배송 주기 오류 → 400', async () => {
    const res = await request(app)
      .post('/api/v1/public/subscribe')
      .send({ ...validBody, frequency: '3W' })

    expect(res.status).toBe(400)
  })

  test('배송비 무료 기준 충족 시 shipping_fee = 0', async () => {
    // 35000원 이상 주문
    database.query
      .mockResolvedValueOnce({
        rows: [{ code: 'A2-750', name: 'A2 저지우유 750ml', unit_price: '12000' }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'cust-uuid-3' }] })

    database.transaction.mockImplementationOnce(async (cb) => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ id: 'sub-uuid-3', created_at: new Date() }] })
          .mockResolvedValueOnce({ rows: [{ id: 'pay-uuid-3' }] }),
      }
      return cb(mockClient)
    })

    const res = await request(app)
      .post('/api/v1/public/subscribe')
      .send({ ...validBody, items: [{ sku_code: 'A2-750', quantity: 3 }] }) // 36000원

    expect(res.status).toBe(201)
    expect(res.body.data.shipping_fee).toBe(0)
    expect(res.body.data.amount).toBe(36000) // 배송비 0
  })
})

describe('POST /api/v1/public/payment/verify', () => {
  const ORIGINAL_ENV = process.env

  beforeEach(() => {
    jest.clearAllMocks()
    process.env = { ...ORIGINAL_ENV, NODE_ENV: 'test' }
  })

  afterEach(() => {
    process.env = ORIGINAL_ENV
  })

  test('유효한 결제 검증 → 구독 활성화', async () => {
    // payments 조회
    database.query.mockResolvedValueOnce({
      rows: [{
        id: 'pay-1', subscription_id: 'sub-1', customer_id: 'cust-1',
        merchant_uid: 'SUB-abc-1234', amount: 27000, pg_provider: 'kakaopay',
      }],
    })

    // transaction mock
    database.transaction.mockImplementationOnce(async (cb) => {
      const mockClient = {
        query: jest.fn()
          // payments UPDATE
          .mockResolvedValueOnce({ rowCount: 1 })
          // subscriptions SELECT
          .mockResolvedValueOnce({
            rows: [{
              id: 'sub-1', started_at: '2026-05-01', frequency: '1W',
              delivery_days: ['TUE'], status: 'PAYMENT_PENDING',
            }],
          })
          // subscriptions UPDATE
          .mockResolvedValueOnce({ rowCount: 1 })
          // customers UPDATE
          .mockResolvedValueOnce({ rowCount: 1 }),
      }
      return cb(mockClient)
    })

    const res = await request(app)
      .post('/api/v1/public/payment/verify')
      .send({ imp_uid: 'imp_test_123', merchant_uid: 'SUB-abc-1234' })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.status).toBe('ACTIVE')
    expect(res.body.data).toHaveProperty('next_payment_at')
    expect(res.body.data).toHaveProperty('message')
  })

  test('결제 레코드 없음 → 404', async () => {
    database.query.mockResolvedValueOnce({ rows: [] })

    const res = await request(app)
      .post('/api/v1/public/payment/verify')
      .send({ imp_uid: 'imp_test_123', merchant_uid: 'SUB-nonexistent' })

    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('PAYMENT_NOT_FOUND')
  })

  test('필수 필드 누락 → 400', async () => {
    const res = await request(app)
      .post('/api/v1/public/payment/verify')
      .send({ imp_uid: '' })

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  test('imp_uid 없이 요청 → 400', async () => {
    const res = await request(app)
      .post('/api/v1/public/payment/verify')
      .send({ merchant_uid: 'SUB-abc' })

    expect(res.status).toBe(400)
  })
})
