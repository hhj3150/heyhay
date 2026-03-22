/**
 * @fileoverview JWT 인증 및 역할 기반 권한 미들웨어
 * 역할: ADMIN, FACTORY, CAFE, FARM
 */
const jwt = require('jsonwebtoken')
const env = require('../config/env')
const { apiError, ROLE_PERMISSIONS } = require('@heyhay/shared')

/**
 * JWT 토큰 검증 미들웨어
 * Authorization: Bearer <token> 헤더에서 토큰 추출
 */
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json(apiError('AUTH_REQUIRED', '인증이 필요합니다'))
  }

  const token = authHeader.split(' ')[1]

  try {
    const decoded = jwt.verify(token, env.jwt.secret)
    req.user = decoded
    next()
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json(apiError('TOKEN_EXPIRED', '토큰이 만료되었습니다'))
    }
    return res.status(401).json(apiError('TOKEN_INVALID', '유효하지 않은 토큰입니다'))
  }
}

/**
 * 역할 기반 접근 제어 미들웨어 팩토리
 * @param {...string} allowedRoles - 허용할 역할 목록
 * @returns {function} Express 미들웨어
 *
 * @example
 * router.get('/financial', authenticate, authorize('ADMIN'), handler)
 * router.get('/milking', authenticate, authorize('ADMIN', 'FARM'), handler)
 */
const authorize = (...allowedRoles) => (req, res, next) => {
  if (!req.user || !req.user.role) {
    return res.status(403).json(apiError('FORBIDDEN', '접근 권한이 없습니다'))
  }

  if (!allowedRoles.includes(req.user.role)) {
    return res.status(403).json(apiError(
      'ROLE_DENIED',
      `이 작업에는 ${allowedRoles.join(' 또는 ')} 역할이 필요합니다`,
    ))
  }

  next()
}

/**
 * 모듈 접근 권한 미들웨어 팩토리
 * ROLE_PERMISSIONS 기반으로 모듈 접근 자동 제어
 * @param {string} moduleName - 모듈명 (farm, factory, market, cafe, dashboard)
 * @returns {function} Express 미들웨어
 */
const authorizeModule = (moduleName) => (req, res, next) => {
  if (!req.user || !req.user.role) {
    return res.status(403).json(apiError('FORBIDDEN', '접근 권한이 없습니다'))
  }

  const allowed = ROLE_PERMISSIONS[req.user.role] || []
  if (!allowed.includes(moduleName)) {
    return res.status(403).json(apiError(
      'MODULE_DENIED',
      `${moduleName} 모듈에 대한 접근 권한이 없습니다`,
    ))
  }

  next()
}

module.exports = { authenticate, authorize, authorizeModule }
