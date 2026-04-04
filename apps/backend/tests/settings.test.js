/**
 * @fileoverview Settings 모듈 통합 테스트
 * 제품 단가·시스템 설정 API
 */
const { getAdminToken, authGet } = require('./helpers/setup')

let token = ''

beforeAll(async () => {
  token = await getAdminToken()
})

// ============================================================
// 제품 단가
// ============================================================

describe('GET /api/v1/settings/prices', () => {
  test('현재 단가표 반환', async () => {
    const res = await authGet('/api/v1/settings/prices', token)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
  })
})

describe('GET /api/v1/settings/prices/history', () => {
  test('가격 변경 이력 반환', async () => {
    const res = await authGet('/api/v1/settings/prices/history', token)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
  })

  test('SKU 코드 필터 적용', async () => {
    const res = await authGet(
      '/api/v1/settings/prices/history?sku_code=A2-750',
      token,
    )

    expect(res.status).toBe(200)
    if (res.body.data.length > 0) {
      expect(res.body.data.every((p) => p.sku_code === 'A2-750')).toBe(true)
    }
  })
})

// ============================================================
// 시스템 설정
// ============================================================

describe('GET /api/v1/settings/system', () => {
  test('전체 시스템 설정 반환', async () => {
    const res = await authGet('/api/v1/settings/system', token)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
  })

  test('카테고리 필터 적용', async () => {
    const res = await authGet(
      '/api/v1/settings/system?category=production',
      token,
    )

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
  })
})
