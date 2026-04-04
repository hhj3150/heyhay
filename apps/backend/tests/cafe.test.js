/**
 * @fileoverview Cafe 모듈 통합 테스트
 * 메뉴·POS매출·통계·정산 API
 */
const { getAdminToken, authGet, authPost } = require('./helpers/setup')

let token = ''

beforeAll(async () => {
  token = await getAdminToken()
})

// ============================================================
// 메뉴
// ============================================================

describe('GET /api/v1/cafe/menus', () => {
  test('활성 메뉴 목록 반환', async () => {
    const res = await authGet('/api/v1/cafe/menus', token)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(Array.isArray(res.body.data)).toBe(true)
  })
})

describe('POST /api/v1/cafe/menus', () => {
  test('메뉴 등록 성공', async () => {
    const res = await authPost('/api/v1/cafe/menus', {
      name: `테스트메뉴_${Date.now()}`,
      category: '음료',
      price: 5500,
    }, token)

    expect(res.status).toBe(201)
    expect(res.body.data).toHaveProperty('name')
    expect(parseInt(res.body.data.price)).toBe(5500)
  })

  test('필수 필드 누락 시 400 반환', async () => {
    const res = await authPost('/api/v1/cafe/menus', {
      category: '음료',
    }, token)

    expect(res.status).toBe(400)
  })
})

// ============================================================
// 매출
// ============================================================

describe('GET /api/v1/cafe/sales', () => {
  test('매출 기록 조회', async () => {
    const res = await authGet('/api/v1/cafe/sales', token)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
  })
})

describe('GET /api/v1/cafe/sales/stats', () => {
  test('매출 통계 반환', async () => {
    const res = await authGet('/api/v1/cafe/sales/stats', token)

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveProperty('today')
    expect(res.body.data).toHaveProperty('monthly')
    expect(res.body.data).toHaveProperty('top_menus')
    expect(res.body.data.today).toHaveProperty('revenue')
  })
})

// ============================================================
// 정산
// ============================================================

describe('GET /api/v1/cafe/settlements', () => {
  test('정산 목록 조회', async () => {
    const res = await authGet('/api/v1/cafe/settlements', token)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
  })
})
