/**
 * @fileoverview Zod 스키마 기반 요청 검증 미들웨어
 */
const { apiError } = require('@heyhay/shared')

/**
 * 요청 바디/쿼리/파라미터 검증 미들웨어 팩토리
 * @param {import('zod').ZodSchema} schema - Zod 스키마
 * @param {'body'|'query'|'params'} source - 검증 대상
 * @returns {function} Express 미들웨어
 *
 * @example
 * router.post('/animals', validate(createAnimalSchema), handler)
 */
const validate = (schema, source = 'body') => (req, res, next) => {
  const result = schema.safeParse(req[source])

  if (!result.success) {
    const messages = result.error.issues.map(
      (issue) => `${issue.path.join('.')}: ${issue.message}`,
    )
    return res.status(400).json(apiError(
      'VALIDATION_ERROR',
      messages.join(', '),
    ))
  }

  // 검증된 데이터로 교체 (기본값 적용 포함)
  req[source] = result.data
  next()
}

module.exports = { validate }
