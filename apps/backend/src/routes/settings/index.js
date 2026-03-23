/**
 * @fileoverview 통합 설정 API
 * 제품 단가 관리 + 시스템 설정 (원유단가, 배송비, 생산설정)
 *
 * GET  /api/v1/settings/prices                — 현재 적용 중인 전체 단가표
 * PUT  /api/v1/settings/prices                — 단가 수정 (이력 보존)
 * GET  /api/v1/settings/prices/history        — 가격 변경 이력
 * GET  /api/v1/settings/system                — 시스템 설정 조회
 * PUT  /api/v1/settings/system/:key           — 개별 설정값 수정
 * PUT  /api/v1/settings/system                — 일괄 설정값 수정
 */
const express = require('express')
const { z } = require('zod')
const { query, transaction } = require('../../config/database')
const { validate } = require('../../middleware/validate')
const { authorize } = require('../../middleware/auth')
const { apiResponse, apiError } = require('../../lib/shared')

const router = express.Router()

// --- 스키마 ---

/** 단가 수정 요청 */
const updatePriceSchema = z.object({
  sku_code: z.string().min(1, 'SKU 코드가 필요합니다'),
  channel: z.enum(['RETAIL', 'SUBSCRIPTION', 'B2B', 'CAFE'], {
    errorMap: () => ({ message: '유효한 채널: RETAIL, SUBSCRIPTION, B2B, CAFE' }),
  }),
  unit_price: z.number().int().min(0, '단가는 0 이상이어야 합니다'),
  effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '날짜 형식: YYYY-MM-DD').optional(),
})

/** 가격 이력 쿼리 파라미터 */
const priceHistoryQuerySchema = z.object({
  sku_code: z.string().optional(),
  channel: z.string().optional(),
})

/** 개별 설정값 수정 */
const updateSettingSchema = z.object({
  value: z.string().min(1, '설정값이 필요합니다'),
})

/** 일괄 설정값 수정 */
const bulkUpdateSettingsSchema = z.array(
  z.object({
    key: z.string().min(1, '설정 키가 필요합니다'),
    value: z.string().min(1, '설정값이 필요합니다'),
  }),
)

// ============================================================
// 제품 단가 API
// ============================================================

/** GET /prices — 현재 적용 중인 전체 단가표 */
router.get('/prices', async (req, res, next) => {
  try {
    const result = await query(`
      SELECT
        sp.id,
        sp.sku_id,
        sp.sku_code,
        s.name AS sku_name,
        sp.channel,
        sp.unit_price,
        sp.effective_from,
        sp.created_by,
        sp.updated_at
      FROM sku_prices sp
      JOIN skus s ON s.code = sp.sku_code
      WHERE sp.effective_to IS NULL
      ORDER BY s.code, sp.channel
    `)

    res.json(apiResponse(result.rows))
  } catch (err) {
    next(err)
  }
})

/** PUT /prices — 단가 수정 (이력 보존: 기존 가격 종료 → 새 레코드 생성) */
router.put('/prices', authorize('ADMIN'), validate(updatePriceSchema), async (req, res, next) => {
  try {
    const { sku_code, channel, unit_price, effective_from } = req.body
    const effectiveDate = effective_from || new Date().toISOString().slice(0, 10)
    const updatedBy = req.user.name || req.user.username

    const result = await transaction(async (client) => {
      // SKU 존재 확인
      const skuResult = await client.query(
        'SELECT id FROM skus WHERE code = $1',
        [sku_code],
      )
      if (skuResult.rows.length === 0) {
        throw { status: 404, code: 'SKU_NOT_FOUND', message: `SKU '${sku_code}'를 찾을 수 없습니다` }
      }
      const skuId = skuResult.rows[0].id

      // 기존 활성 가격 종료
      await client.query(
        `UPDATE sku_prices
         SET effective_to = $1, updated_at = NOW()
         WHERE sku_code = $2 AND channel = $3 AND effective_to IS NULL`,
        [effectiveDate, sku_code, channel],
      )

      // 새 가격 레코드 생성
      const insertResult = await client.query(
        `INSERT INTO sku_prices (sku_id, sku_code, channel, unit_price, effective_from, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [skuId, sku_code, channel, unit_price, effectiveDate, updatedBy],
      )

      return insertResult.rows[0]
    })

    res.json(apiResponse(result, { message: '단가가 수정되었습니다' }))
  } catch (err) {
    if (err.status === 404) {
      return res.status(404).json(apiError(err.code, err.message))
    }
    next(err)
  }
})

/** GET /prices/history — 가격 변경 이력 */
router.get('/prices/history', validate(priceHistoryQuerySchema, 'query'), async (req, res, next) => {
  try {
    const { sku_code, channel } = req.query
    const conditions = []
    const params = []

    if (sku_code) {
      params.push(sku_code)
      conditions.push(`sp.sku_code = $${params.length}`)
    }
    if (channel) {
      params.push(channel)
      conditions.push(`sp.channel = $${params.length}`)
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : ''

    const result = await query(
      `SELECT
        sp.id,
        sp.sku_code,
        s.name AS sku_name,
        sp.channel,
        sp.unit_price,
        sp.effective_from,
        sp.effective_to,
        sp.created_by,
        sp.created_at
      FROM sku_prices sp
      JOIN skus s ON s.code = sp.sku_code
      ${whereClause}
      ORDER BY sp.sku_code, sp.channel, sp.effective_from DESC`,
      params,
    )

    res.json(apiResponse(result.rows))
  } catch (err) {
    next(err)
  }
})

// ============================================================
// 시스템 설정 API
// ============================================================

/** GET /system — 설정값 조회 (카테고리 필터 가능) */
router.get('/system', async (req, res, next) => {
  try {
    const { category } = req.query

    const sql = category
      ? 'SELECT * FROM system_settings WHERE category = $1 ORDER BY category, key'
      : 'SELECT * FROM system_settings ORDER BY category, key'
    const params = category ? [category] : []

    const result = await query(sql, params)
    res.json(apiResponse(result.rows))
  } catch (err) {
    next(err)
  }
})

/** PUT /system/:key — 개별 설정값 수정 */
router.put('/system/:key', authorize('ADMIN'), validate(updateSettingSchema), async (req, res, next) => {
  try {
    const { key } = req.params
    const { value } = req.body
    const updatedBy = req.user.name || req.user.username

    const result = await query(
      `UPDATE system_settings
       SET value = $1, updated_by = $2, updated_at = NOW()
       WHERE key = $3
       RETURNING *`,
      [value, updatedBy, key],
    )

    if (result.rows.length === 0) {
      return res.status(404).json(apiError('SETTING_NOT_FOUND', `설정 '${key}'를 찾을 수 없습니다`))
    }

    res.json(apiResponse(result.rows[0], { message: '설정이 수정되었습니다' }))
  } catch (err) {
    next(err)
  }
})

/** PUT /system — 일괄 설정값 수정 */
router.put('/system', authorize('ADMIN'), async (req, res, next) => {
  try {
    const parsed = bulkUpdateSettingsSchema.safeParse(req.body)
    if (!parsed.success) {
      const messages = parsed.error.issues.map(
        (issue) => `${issue.path.join('.')}: ${issue.message}`,
      )
      return res.status(400).json(apiError('VALIDATION_ERROR', messages.join(', ')))
    }

    const items = parsed.data
    const updatedBy = req.user.name || req.user.username

    const results = await transaction(async (client) => {
      const updated = []
      for (const item of items) {
        const result = await client.query(
          `UPDATE system_settings
           SET value = $1, updated_by = $2, updated_at = NOW()
           WHERE key = $3
           RETURNING *`,
          [item.value, updatedBy, item.key],
        )
        if (result.rows.length > 0) {
          updated.push(result.rows[0])
        }
      }
      return updated
    })

    res.json(apiResponse(results, { message: `${results.length}개 설정이 수정되었습니다` }))
  } catch (err) {
    next(err)
  }
})

module.exports = router
