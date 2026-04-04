/**
 * @fileoverview Packaging 모듈 통합 테스트
 * 포장 자재·입출고·발주 API
 */
const { getAdminToken, authGet, authPost } = require('./helpers/setup')

let token = ''

beforeAll(async () => {
  token = await getAdminToken()
})

// ============================================================
// 자재 관리
// ============================================================

describe('GET /api/v1/packaging/materials', () => {
  test('자재 목록 반환', async () => {
    const res = await authGet('/api/v1/packaging/materials', token)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
  })

  test('카테고리 필터 적용', async () => {
    const res = await authGet(
      '/api/v1/packaging/materials?category=PET_BOTTLE',
      token,
    )

    expect(res.status).toBe(200)
    if (res.body.data.length > 0) {
      expect(res.body.data.every((m) => m.category === 'PET_BOTTLE')).toBe(true)
    }
  })
})

describe('POST /api/v1/packaging/materials', () => {
  test('자재 등록 성공', async () => {
    const res = await authPost('/api/v1/packaging/materials', {
      category: 'LABEL',
      name: `테스트라벨_${Date.now()}`,
      unit: '장',
      unit_cost: 50,
      safety_stock: 500,
      current_stock: 1000,
    }, token)

    expect(res.status).toBe(201)
    expect(res.body.data.category).toBe('LABEL')
  })

  test('필수 필드 누락 시 400 반환', async () => {
    const res = await authPost('/api/v1/packaging/materials', {
      unit: '개',
    }, token)

    expect(res.status).toBe(400)
  })
})

describe('GET /api/v1/packaging/materials/:id', () => {
  test('존재하지 않는 UUID로 404 반환', async () => {
    const res = await authGet(
      '/api/v1/packaging/materials/00000000-0000-0000-0000-000000000000',
      token,
    )
    expect(res.status).toBe(404)
  })
})

// ============================================================
// 입출고 이력
// ============================================================

describe('GET /api/v1/packaging/stock-logs', () => {
  test('입출고 이력 반환', async () => {
    const res = await authGet('/api/v1/packaging/stock-logs', token)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
  })
})

// ============================================================
// 발주
// ============================================================

describe('GET /api/v1/packaging/orders', () => {
  test('발주 목록 반환', async () => {
    const res = await authGet('/api/v1/packaging/orders', token)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
  })
})

// ============================================================
// 소요량 예측
// ============================================================

describe('GET /api/v1/packaging/demand-forecast', () => {
  test('소요량 예측 데이터 반환 (또는 테이블 미존재 시 기본값)', async () => {
    const res = await authGet('/api/v1/packaging/demand-forecast', token)

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveProperty('sku_demand')
    expect(res.body.data).toHaveProperty('demand_by_material')
    expect(res.body.data).toHaveProperty('total_materials')
  })
})
