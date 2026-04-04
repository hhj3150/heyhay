/**
 * @fileoverview Farm 모듈 통합 테스트
 * 개체관리·착유·번식·사료·건강·센서 API
 */
const request = require('supertest')
const { app, getAdminToken, authGet, authPost, authPut, authDelete } = require('./helpers/setup')

let token = ''

beforeAll(async () => {
  token = await getAdminToken()
})

// ============================================================
// 개체 관리 (Animals)
// ============================================================

describe('GET /api/v1/farm/animals/stats', () => {
  test('개체 현황 통계 반환', async () => {
    const res = await authGet('/api/v1/farm/animals/stats', token)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toHaveProperty('total')
    expect(res.body.data).toHaveProperty('milking')
    expect(res.body.data).toHaveProperty('a2a2_count')
    expect(parseInt(res.body.data.total)).toBeGreaterThanOrEqual(0)
  })
})

describe('GET /api/v1/farm/animals', () => {
  test('개체 목록 조회 (기본 페이지네이션)', async () => {
    const res = await authGet('/api/v1/farm/animals', token)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(Array.isArray(res.body.data)).toBe(true)
    expect(res.body.meta).toHaveProperty('page')
    expect(res.body.meta).toHaveProperty('total')
  })

  test('상태 필터 적용', async () => {
    const res = await authGet('/api/v1/farm/animals?status=MILKING', token)

    expect(res.status).toBe(200)
    if (res.body.data.length > 0) {
      expect(res.body.data.every((a) => a.status === 'MILKING')).toBe(true)
    }
  })

  test('인증 없이 401 반환', async () => {
    const res = await request(app).get('/api/v1/farm/animals')
    expect(res.status).toBe(401)
  })
})

describe('POST /api/v1/farm/animals', () => {
  const testCowId = `TEST-${Date.now()}`

  test('개체 등록 성공', async () => {
    const res = await authPost('/api/v1/farm/animals', {
      cow_id: testCowId,
      name: '테스트소',
      breed: 'Jersey',
      status: 'HEIFER',
      sex: 'F',
    }, token)

    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
    expect(res.body.data.cow_id).toBe(testCowId)
  })

  test('필수 필드 누락 시 400 반환', async () => {
    const res = await authPost('/api/v1/farm/animals', {
      name: '이표번호없음',
    }, token)

    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
  })

  test('중복 이표번호로 409 반환', async () => {
    const res = await authPost('/api/v1/farm/animals', {
      cow_id: testCowId,
      name: '중복테스트',
    }, token)

    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('DUPLICATE')
  })
})

describe('GET /api/v1/farm/animals/:id', () => {
  test('존재하지 않는 UUID로 404 반환', async () => {
    const res = await authGet(
      '/api/v1/farm/animals/00000000-0000-0000-0000-000000000000',
      token,
    )
    expect(res.status).toBe(404)
  })
})

// ============================================================
// 착유 관리 (Milking)
// ============================================================

describe('GET /api/v1/farm/milking/daily', () => {
  test('일별 착유 요약 조회', async () => {
    const res = await authGet('/api/v1/farm/milking/daily', token)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(Array.isArray(res.body.data)).toBe(true)
  })

  test('days 파라미터 적용', async () => {
    const res = await authGet('/api/v1/farm/milking/daily?days=7', token)

    expect(res.status).toBe(200)
    expect(res.body.data.length).toBeLessThanOrEqual(7)
  })
})

describe('GET /api/v1/farm/milking/summary', () => {
  test('월간 착유 통계 반환', async () => {
    const res = await authGet('/api/v1/farm/milking/summary', token)

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveProperty('monthly')
    expect(res.body.data).toHaveProperty('today')
  })
})

describe('GET /api/v1/farm/milking', () => {
  test('착유 기록 목록 조회', async () => {
    const res = await authGet('/api/v1/farm/milking', token)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
    expect(res.body.meta).toHaveProperty('total')
  })
})

describe('GET /api/v1/farm/milking/dairy-price', () => {
  test('납유 단가 조회', async () => {
    const res = await authGet('/api/v1/farm/milking/dairy-price', token)

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveProperty('dairy_price')
    expect(res.body.data).toHaveProperty('d2o_price')
    expect(typeof res.body.data.dairy_price).toBe('number')
  })
})

describe('GET /api/v1/farm/milking/monthly-dairy', () => {
  test('월간 납유 정산 조회', async () => {
    const res = await authGet('/api/v1/farm/milking/monthly-dairy', token)

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveProperty('total_dairy_l')
  })
})

// ============================================================
// 번식 관리 (Breeding)
// ============================================================

describe('GET /api/v1/farm/breeding/upcoming', () => {
  test('분만 예정 목록 조회', async () => {
    const res = await authGet('/api/v1/farm/breeding/upcoming', token)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
  })
})

describe('GET /api/v1/farm/breeding/stats', () => {
  test('번식 지수 통계 반환', async () => {
    const res = await authGet('/api/v1/farm/breeding/stats', token)

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveProperty('conception_rate')
    expect(res.body.data).toHaveProperty('total_inseminated')
    expect(res.body.data).toHaveProperty('avg_open_days')
  })
})

describe('GET /api/v1/farm/breeding', () => {
  test('번식 기록 목록 조회', async () => {
    const res = await authGet('/api/v1/farm/breeding', token)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
  })
})

// ============================================================
// 사료 관리 (Feed)
// ============================================================

describe('GET /api/v1/farm/feed/types', () => {
  test('사료 종류 목록 조회', async () => {
    const res = await authGet('/api/v1/farm/feed/types', token)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
  })
})

describe('GET /api/v1/farm/feed/records', () => {
  test('급여 기록 조회', async () => {
    const res = await authGet('/api/v1/farm/feed/records', token)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
  })
})

describe('GET /api/v1/farm/feed/cost', () => {
  test('두당 사료비 계산 결과', async () => {
    const res = await authGet('/api/v1/farm/feed/cost', token)

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveProperty('total_feed_cost_30d')
    expect(res.body.data).toHaveProperty('avg_daily_cost_per_head')
    expect(res.body.data).toHaveProperty('days_counted')
  })
})

// ============================================================
// 건강 관리 (Health)
// ============================================================

describe('GET /api/v1/farm/health/withdrawal', () => {
  test('휴약 중인 개체 목록 조회', async () => {
    const res = await authGet('/api/v1/farm/health/withdrawal', token)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
  })
})

describe('GET /api/v1/farm/health', () => {
  test('건강 기록 목록 조회', async () => {
    const res = await authGet('/api/v1/farm/health', token)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
  })
})

// ============================================================
// 센서 데이터 (Sensor)
// ============================================================

describe('GET /api/v1/farm/sensor/latest', () => {
  test('최신 센서 데이터 조회', async () => {
    const res = await authGet('/api/v1/farm/sensor/latest', token)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
  })
})

describe('GET /api/v1/farm/sensor/readings', () => {
  test('cow_id 없으면 400 반환', async () => {
    const res = await authGet('/api/v1/farm/sensor/readings', token)

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('MISSING_COW_ID')
  })

  test('잘못된 metric으로 400 반환', async () => {
    const res = await authGet(
      '/api/v1/farm/sensor/readings?cow_id=TEST-001&metric=invalid',
      token,
    )

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_METRIC')
  })
})

describe('GET /api/v1/farm/sensor/status', () => {
  test('센서 연동 상태 반환', async () => {
    const res = await authGet('/api/v1/farm/sensor/status', token)

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveProperty('connected')
    expect(res.body.data).toHaveProperty('total_readings')
    expect(res.body.data).toHaveProperty('monitored_animals')
  })
})
