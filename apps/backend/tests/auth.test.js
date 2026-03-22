/**
 * @fileoverview 인증 API 테스트
 * 로그인·토큰갱신·비밀번호변경·로그아웃
 */
const request = require('supertest')
const app = require('../src/index')

describe('POST /api/v1/auth/login', () => {
  test('올바른 자격증명으로 로그인 성공', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'admin', password: 'admin1234' })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toHaveProperty('accessToken')
    expect(res.body.data).toHaveProperty('refreshToken')
    expect(res.body.data.user.role).toBe('ADMIN')
    expect(res.body.data.user.name).toBe('하원장')
  })

  test('잘못된 비밀번호로 401 반환', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'admin', password: 'wrongpassword' })

    expect(res.status).toBe(401)
    expect(res.body.success).toBe(false)
    expect(res.body.error.code).toBe('AUTH_FAILED')
  })

  test('존재하지 않는 사용자로 401 반환', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'nonexistent', password: 'password123' })

    expect(res.status).toBe(401)
    expect(res.body.success).toBe(false)
  })

  test('빈 필드로 400 반환', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: '', password: '' })

    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
  })
})

describe('POST /api/v1/auth/refresh', () => {
  test('유효한 리프레시 토큰으로 새 토큰 발급', async () => {
    // 로그인하여 리프레시 토큰 획득
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'admin', password: 'admin1234' })

    const { refreshToken } = loginRes.body.data

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toHaveProperty('accessToken')
    expect(res.body.data).toHaveProperty('refreshToken')
  })

  test('유효하지 않은 리프레시 토큰으로 401 반환', async () => {
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'invalid.token.here' })

    expect(res.status).toBe(401)
    expect(res.body.success).toBe(false)
  })
})
