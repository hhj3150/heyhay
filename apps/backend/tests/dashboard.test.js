/**
 * @fileoverview Dashboard 모듈 통합 테스트
 * KPI·알림·오늘현황 API
 */
const { getAdminToken, authGet, authPut } = require('./helpers/setup')

let token = ''

beforeAll(async () => {
  token = await getAdminToken()
})

describe('GET /api/v1/dashboard/kpi', () => {
  test('전 모듈 KPI 데이터 반환', async () => {
    const res = await authGet('/api/v1/dashboard/kpi', token)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toHaveProperty('farm')
    expect(res.body.data).toHaveProperty('factory')
    expect(res.body.data).toHaveProperty('market')
    expect(res.body.data).toHaveProperty('cafe')
    expect(res.body.data).toHaveProperty('alerts')

    // farm KPI 세부 검증
    expect(res.body.data.farm).toHaveProperty('today_milk_l')
    expect(res.body.data.farm).toHaveProperty('milk_change_pct')

    // market KPI 세부 검증
    expect(res.body.data.market).toHaveProperty('today_orders')
    expect(res.body.data.market).toHaveProperty('active_subscribers')
  })
})

describe('GET /api/v1/dashboard/alerts', () => {
  test('알림 목록 조회', async () => {
    const res = await authGet('/api/v1/dashboard/alerts', token)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
  })

  test('우선순위 필터 적용', async () => {
    const res = await authGet('/api/v1/dashboard/alerts?priority=P1', token)

    expect(res.status).toBe(200)
    if (res.body.data.length > 0) {
      expect(res.body.data.every((a) => a.priority === 'P1')).toBe(true)
    }
  })

  test('미해결 알림 필터', async () => {
    const res = await authGet('/api/v1/dashboard/alerts?resolved=false', token)

    expect(res.status).toBe(200)
    if (res.body.data.length > 0) {
      expect(res.body.data.every((a) => a.is_resolved === false)).toBe(true)
    }
  })
})

describe('GET /api/v1/dashboard/today-ops', () => {
  test('오늘 운영 현황 반환', async () => {
    const res = await authGet('/api/v1/dashboard/today-ops', token)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })
})
