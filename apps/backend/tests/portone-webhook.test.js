/**
 * @fileoverview PortOne 웹훅 엔드포인트 테스트
 * POST /api/v1/public/portone/webhook
 */

/* global jest, describe, test, expect, beforeEach, afterEach */

const request = require('supertest')
const app = require('../src/index')
const database = require('../src/config/database')

jest.mock('../src/config/database')

describe('POST /api/v1/public/portone/webhook', () => {
  const ORIGINAL_ENV = process.env

  beforeEach(() => {
    jest.clearAllMocks()
    process.env = { ...ORIGINAL_ENV, NODE_ENV: 'test' }
    delete process.env.PORTONE_API_KEY
    delete process.env.PORTONE_API_SECRET
  })

  afterEach(() => {
    process.env = ORIGINAL_ENV
  })

  test('paid 이벤트 → payments PAID 로 갱신', async () => {
    // 결제 레코드 조회
    database.query.mockResolvedValueOnce({
      rows: [{
        id: 'pay-1',
        subscription_id: 'sub-1',
        amount: 27000,
        current_status: 'PENDING',
      }],
    })
    // payments UPDATE
    database.query.mockResolvedValueOnce({ rowCount: 1 })

    const res = await request(app)
      .post('/api/v1/public/portone/webhook')
      .send({ imp_uid: 'imp_123', merchant_uid: 'SUB-abc-1234', status: 'paid' })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.status).toBe('PAID')

    const updateCall = database.query.mock.calls[1]
    expect(updateCall[0]).toContain('UPDATE payments')
    expect(updateCall[1][0]).toBe('PAID')
  })

  test('cancelled 이벤트 → payments CANCELLED + 구독 PAUSED + 알림', async () => {
    database.query
      // payments SELECT
      .mockResolvedValueOnce({
        rows: [{
          id: 'pay-2',
          subscription_id: 'sub-2',
          amount: 15000,
          current_status: 'PAID',
        }],
      })
      // payments UPDATE
      .mockResolvedValueOnce({ rowCount: 1 })
      // subscriptions UPDATE (PAUSED)
      .mockResolvedValueOnce({ rowCount: 1 })
      // alerts INSERT
      .mockResolvedValueOnce({ rowCount: 1 })

    const res = await request(app)
      .post('/api/v1/public/portone/webhook')
      .send({ imp_uid: 'imp_456', merchant_uid: 'SUB-xyz', status: 'cancelled' })

    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('CANCELLED')

    const subCall = database.query.mock.calls[2]
    expect(subCall[0]).toContain('UPDATE subscriptions')
    expect(subCall[0]).toContain("status = 'PAUSED'")

    const alertCall = database.query.mock.calls[3]
    expect(alertCall[0]).toContain('INSERT INTO alerts')
    expect(alertCall[1][0]).toContain('SUB-xyz')
  })

  test('알 수 없는 merchant_uid → skipped', async () => {
    database.query.mockResolvedValueOnce({ rows: [] })

    const res = await request(app)
      .post('/api/v1/public/portone/webhook')
      .send({ imp_uid: 'imp_999', merchant_uid: 'SUB-unknown', status: 'paid' })

    expect(res.status).toBe(200)
    expect(res.body.data.skipped).toBe(true)
    expect(res.body.data.reason).toBe('unknown merchant_uid')
  })

  test('동일 상태 중복 웹훅 → skipped (no change)', async () => {
    database.query.mockResolvedValueOnce({
      rows: [{ id: 'pay-3', subscription_id: 'sub-3', amount: 10000, current_status: 'PAID' }],
    })

    const res = await request(app)
      .post('/api/v1/public/portone/webhook')
      .send({ imp_uid: 'imp_777', merchant_uid: 'SUB-dup', status: 'paid' })

    expect(res.status).toBe(200)
    expect(res.body.data.skipped).toBe(true)
    expect(res.body.data.reason).toBe('no change')
  })

  test('필수 필드 누락 → 400', async () => {
    const res = await request(app)
      .post('/api/v1/public/portone/webhook')
      .send({ imp_uid: 'imp_1' })

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })
})
