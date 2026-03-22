/**
 * @fileoverview 마켓 모듈 API 테스트
 * 고객·주문·구독 CRUD + 통계
 */
const request = require('supertest')
const app = require('../src/index')

let token = ''

beforeAll(async () => {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ username: 'admin', password: 'admin1234' })

  token = res.body.data.accessToken
})

// ============================================================
// 고객 API
// ============================================================
describe('GET /api/v1/market/customers', () => {
  test('전체 고객 목록 조회', async () => {
    const res = await request(app)
      .get('/api/v1/market/customers')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(Array.isArray(res.body.data)).toBe(true)
    expect(res.body.data.length).toBeGreaterThan(0)
  })

  test('세그먼트 필터 (VIP)', async () => {
    const res = await request(app)
      .get('/api/v1/market/customers?segment=VIP')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data.every((c) => c.segment === 'VIP')).toBe(true)
  })

  test('검색 필터', async () => {
    const res = await request(app)
      .get('/api/v1/market/customers?search=김서연')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data.length).toBeGreaterThan(0)
    expect(res.body.data[0].name).toBe('김서연')
  })

  test('인증 없이 401 반환', async () => {
    const res = await request(app)
      .get('/api/v1/market/customers')

    expect(res.status).toBe(401)
  })
})

describe('GET /api/v1/market/customers/stats', () => {
  test('세그먼트별 통계 반환', async () => {
    const res = await request(app)
      .get('/api/v1/market/customers/stats')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveProperty('total')
    expect(res.body.data).toHaveProperty('vip_count')
    expect(res.body.data).toHaveProperty('active_count')
    expect(res.body.data).toHaveProperty('avg_ltv')
    expect(parseInt(res.body.data.total)).toBeGreaterThan(0)
  })
})

// ============================================================
// 주문 API
// ============================================================
describe('GET /api/v1/market/orders', () => {
  test('전체 주문 목록 조회', async () => {
    const res = await request(app)
      .get('/api/v1/market/orders')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
    expect(res.body.data.length).toBeGreaterThan(0)
  })

  test('상태 필터 (PENDING)', async () => {
    const res = await request(app)
      .get('/api/v1/market/orders?status=PENDING')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data.every((o) => o.status === 'PENDING')).toBe(true)
  })
})

describe('GET /api/v1/market/orders/stats', () => {
  test('주문 통계 반환', async () => {
    const res = await request(app)
      .get('/api/v1/market/orders/stats')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveProperty('today_orders')
    expect(res.body.data).toHaveProperty('pending')
    expect(res.body.data).toHaveProperty('month_revenue')
  })
})

// ============================================================
// 구독 API
// ============================================================
describe('GET /api/v1/market/subscriptions', () => {
  test('전체 구독 목록 조회', async () => {
    const res = await request(app)
      .get('/api/v1/market/subscriptions')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
    expect(res.body.data.length).toBeGreaterThan(0)
  })

  test('상태 필터 (ACTIVE)', async () => {
    const res = await request(app)
      .get('/api/v1/market/subscriptions?status=ACTIVE')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data.every((s) => s.status === 'ACTIVE')).toBe(true)
  })
})

describe('GET /api/v1/market/subscriptions/stats', () => {
  test('구독 통계 반환', async () => {
    const res = await request(app)
      .get('/api/v1/market/subscriptions/stats')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveProperty('active')
    expect(res.body.data).toHaveProperty('paused')
    expect(res.body.data).toHaveProperty('cancelled')
    expect(res.body.data).toHaveProperty('monthly_recurring_revenue')
    expect(parseInt(res.body.data.active)).toBeGreaterThan(0)
  })
})

// ============================================================
// 네이버 연동 상태
// ============================================================
describe('GET /api/v1/market/naver/status', () => {
  test('연동 상태 반환', async () => {
    const res = await request(app)
      .get('/api/v1/market/naver/status')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveProperty('connected')
    expect(res.body.data).toHaveProperty('total_synced')
  })
})
