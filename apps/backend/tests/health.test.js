/**
 * @fileoverview 헬스체크 + 기본 서버 테스트
 */
const request = require('supertest')
const app = require('../src/index')

describe('GET /api/v1/health', () => {
  test('헬스체크 응답 200', async () => {
    const res = await request(app)
      .get('/api/v1/health')

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toHaveProperty('status', 'healthy')
    expect(res.body.data).toHaveProperty('uptime')
  })
})

describe('404 핸들링', () => {
  test('존재하지 않는 라우트에 404 반환', async () => {
    const res = await request(app)
      .get('/api/v1/nonexistent')

    expect(res.status).toBe(404)
  })
})
