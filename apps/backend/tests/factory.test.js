/**
 * @fileoverview Factory 모듈 통합 테스트
 * 원유입고·생산배치·재고·CCP 공정 API
 */
const { getAdminToken, authGet, authPost } = require('./helpers/setup')

let token = ''

beforeAll(async () => {
  token = await getAdminToken()
})

// ============================================================
// 원유 입고 (Raw Milk)
// ============================================================

describe('GET /api/v1/factory/raw-milk/today', () => {
  test('당일 입고 현황 반환', async () => {
    const res = await authGet('/api/v1/factory/raw-milk/today', token)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toHaveProperty('total_l')
    expect(res.body.data).toHaveProperty('receipt_count')
    expect(res.body.data).toHaveProperty('accepted_l')
    expect(res.body.data).toHaveProperty('rejected_l')
  })
})

describe('POST /api/v1/factory/raw-milk', () => {
  test('원유 입고 등록 성공', async () => {
    const today = new Date().toISOString().split('T')[0]
    const res = await authPost('/api/v1/factory/raw-milk', {
      received_date: today,
      amount_l: 150.5,
      source: 'INTERNAL',
      fat_pct: 4.8,
      protein_pct: 3.9,
    }, token)

    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
    expect(parseFloat(res.body.data.amount_l)).toBe(150.5)
  })

  test('필수 필드 누락 시 400 반환', async () => {
    const res = await authPost('/api/v1/factory/raw-milk', {
      source: 'INTERNAL',
    }, token)

    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
  })
})

describe('GET /api/v1/factory/raw-milk', () => {
  test('입고 기록 목록 조회', async () => {
    const res = await authGet('/api/v1/factory/raw-milk', token)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
  })
})

// ============================================================
// 생산 배치 & 재고 (Production)
// ============================================================

describe('GET /api/v1/factory/skus', () => {
  test('SKU 마스터 목록 반환', async () => {
    const res = await authGet('/api/v1/factory/skus', token)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
    expect(res.body.data.length).toBeGreaterThan(0)

    // 6종 SKU 확인
    const codes = res.body.data.map((s) => s.code)
    expect(codes).toContain('A2-750')
  })
})

describe('GET /api/v1/factory/batches', () => {
  test('생산 배치 목록 조회', async () => {
    const res = await authGet('/api/v1/factory/batches', token)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
  })
})

describe('GET /api/v1/factory/inventory', () => {
  test('SKU별 재고 현황 반환', async () => {
    const res = await authGet('/api/v1/factory/inventory', token)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)

    if (res.body.data.length > 0) {
      const item = res.body.data[0]
      expect(item).toHaveProperty('code')
      expect(item).toHaveProperty('total_qty')
      expect(item).toHaveProperty('factory_qty')
    }
  })
})

describe('GET /api/v1/factory/inventory/alerts', () => {
  test('안전재고 미달 알림 반환', async () => {
    const res = await authGet('/api/v1/factory/inventory/alerts', token)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
  })
})

// ============================================================
// CCP 공정 (Process)
// ============================================================

describe('GET /api/v1/factory/process/ccp-log', () => {
  test('오늘 CCP 기록 조회', async () => {
    const res = await authGet('/api/v1/factory/process/ccp-log', token)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
  })

  test('날짜 지정 CCP 기록 조회', async () => {
    const res = await authGet(
      '/api/v1/factory/process/ccp-log?date=2025-01-01',
      token,
    )

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
  })
})

describe('POST /api/v1/factory/process', () => {
  test('정상 공정 기록 등록', async () => {
    const res = await authPost('/api/v1/factory/process', {
      batch_id: 'TEST-BATCH-001',
      process_step: 'PASTEURIZATION',
      started_at: new Date().toISOString(),
      is_ccp: true,
      ccp_id: 'CCP1',
      temperature: 73.5,
      hold_seconds: 16,
    }, token)

    expect(res.status).toBe(201)
    expect(res.body.data.is_deviated).toBe(false)
    expect(res.body.data._ccp_alert).toBeNull()
  })

  test('CCP 이탈 시 알림 생성', async () => {
    const res = await authPost('/api/v1/factory/process', {
      batch_id: 'TEST-BATCH-002',
      process_step: 'PASTEURIZATION',
      started_at: new Date().toISOString(),
      is_ccp: true,
      ccp_id: 'CCP1',
      temperature: 70.0,
      hold_seconds: 15,
    }, token)

    expect(res.status).toBe(201)
    expect(res.body.data.is_deviated).toBe(true)
    expect(res.body.data._ccp_alert).not.toBeNull()
    expect(res.body.data._ccp_alert.priority).toBe('P1')
  })

  test('필수 필드 누락 시 400 반환', async () => {
    const res = await authPost('/api/v1/factory/process', {
      batch_id: 'TEST',
    }, token)

    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
  })
})

describe('GET /api/v1/factory/process/:batchId', () => {
  test('배치별 공정 이력 조회', async () => {
    const res = await authGet(
      '/api/v1/factory/process/TEST-BATCH-001',
      token,
    )

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
  })
})
