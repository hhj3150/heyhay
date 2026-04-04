/**
 * @fileoverview 미들웨어 단위 테스트
 * auth(authenticate, authorize, authorizeModule), validate, errorHandler
 */
const request = require('supertest')
const { app, getAdminToken } = require('./helpers/setup')

// ============================================================
// authenticate 미들웨어
// ============================================================

describe('authenticate 미들웨어', () => {
  test('Authorization 헤더 없으면 401', async () => {
    const res = await request(app).get('/api/v1/farm/animals')
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('AUTH_REQUIRED')
  })

  test('잘못된 토큰 형식이면 401', async () => {
    const res = await request(app)
      .get('/api/v1/farm/animals')
      .set('Authorization', 'Bearer invalid.token.here')

    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('TOKEN_INVALID')
  })

  test('유효한 토큰이면 통과', async () => {
    const token = await getAdminToken()
    const res = await request(app)
      .get('/api/v1/farm/animals')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
  })
})

// ============================================================
// authorizeModule 미들웨어
// ============================================================

describe('authorizeModule 미들웨어', () => {
  test('ADMIN은 모든 모듈 접근 가능', async () => {
    const token = await getAdminToken()

    const modules = ['farm', 'factory', 'market', 'cafe', 'dashboard']
    for (const mod of modules) {
      const path = mod === 'dashboard' ? '/api/v1/dashboard/kpi' : `/api/v1/${mod}`
      const res = await request(app)
        .get(path)
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).not.toBe(403)
    }
  })
})

// ============================================================
// validate 미들웨어
// ============================================================

describe('validate 미들웨어', () => {
  let token = ''
  beforeAll(async () => { token = await getAdminToken() })

  test('유효한 데이터면 통과 (200/201)', async () => {
    const res = await request(app)
      .post('/api/v1/farm/animals')
      .set('Authorization', `Bearer ${token}`)
      .send({
        cow_id: `VALID-${Date.now()}`,
        breed: 'Jersey',
      })

    expect([200, 201]).toContain(res.status)
  })

  test('Zod 스키마 위반 시 VALIDATION_ERROR 반환', async () => {
    const res = await request(app)
      .post('/api/v1/farm/animals')
      .set('Authorization', `Bearer ${token}`)
      .send({ cow_id: '' })

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })
})

// ============================================================
// errorHandler 미들웨어
// ============================================================

describe('errorHandler 미들웨어', () => {
  test('존재하지 않는 라우트에 404 반환', async () => {
    const res = await request(app).get('/api/v1/nonexistent')
    expect(res.status).toBe(404)
    expect(res.body.success).toBe(false)
  })
})
