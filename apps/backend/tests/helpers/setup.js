/**
 * @fileoverview 테스트 공통 헬퍼
 * 인증 토큰 발급, 공용 상수
 */
const request = require('supertest')
const app = require('../../src/index')

/** 관리자 토큰 캐시 */
let _adminToken = null

/**
 * 관리자 인증 토큰 발급 (세션 내 캐싱)
 * @returns {Promise<string>} JWT accessToken
 */
async function getAdminToken() {
  if (_adminToken) return _adminToken

  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ username: 'admin', password: 'admin1234' })

  if (res.status !== 200) {
    throw new Error(`로그인 실패: ${res.status} ${JSON.stringify(res.body)}`)
  }

  _adminToken = res.body.data.accessToken
  return _adminToken
}

/**
 * 인증 헤더가 포함된 GET 요청
 * @param {string} path - API 경로
 * @param {string} token - JWT 토큰
 * @returns {Promise<import('supertest').Response>}
 */
function authGet(path, token) {
  return request(app)
    .get(path)
    .set('Authorization', `Bearer ${token}`)
}

/**
 * 인증 헤더가 포함된 POST 요청
 * @param {string} path - API 경로
 * @param {object} body - 요청 본문
 * @param {string} token - JWT 토큰
 * @returns {Promise<import('supertest').Response>}
 */
function authPost(path, body, token) {
  return request(app)
    .post(path)
    .set('Authorization', `Bearer ${token}`)
    .send(body)
}

/**
 * 인증 헤더가 포함된 PUT 요청
 * @param {string} path - API 경로
 * @param {object} body - 요청 본문
 * @param {string} token - JWT 토큰
 * @returns {Promise<import('supertest').Response>}
 */
function authPut(path, body, token) {
  return request(app)
    .put(path)
    .set('Authorization', `Bearer ${token}`)
    .send(body)
}

/**
 * 인증 헤더가 포함된 DELETE 요청
 * @param {string} path - API 경로
 * @param {string} token - JWT 토큰
 * @returns {Promise<import('supertest').Response>}
 */
function authDelete(path, token) {
  return request(app)
    .delete(path)
    .set('Authorization', `Bearer ${token}`)
}

module.exports = {
  app,
  getAdminToken,
  authGet,
  authPost,
  authPut,
  authDelete,
}
