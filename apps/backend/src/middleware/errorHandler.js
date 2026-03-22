/**
 * @fileoverview 글로벌 에러 핸들링 미들웨어
 */
const { apiError } = require('../lib/shared')

/**
 * 404 핸들러
 */
const notFound = (req, res, next) => {
  const error = new Error(`경로를 찾을 수 없습니다: ${req.originalUrl}`)
  error.status = 404
  next(error)
}

/**
 * 글로벌 에러 핸들러
 */
const errorHandler = (err, req, res, _next) => {
  const status = err.status || 500
  const message = status === 500 && process.env.NODE_ENV === 'production'
    ? '서버 내부 오류가 발생했습니다'
    : err.message

  if (status >= 500) {
    console.error(`[ERROR] ${req.method} ${req.originalUrl}:`, err)
  }

  res.status(status).json(apiError(
    err.code || `ERR_${status}`,
    message,
  ))
}

module.exports = { notFound, errorHandler }
