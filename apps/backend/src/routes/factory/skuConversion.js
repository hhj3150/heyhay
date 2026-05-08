/**
 * @fileoverview SKU 원유 환산비 관리
 *
 * GET    /api/v1/factory/sku-conversion             — 전체 SKU 환산비 (활성)
 * GET    /api/v1/factory/sku-conversion/:sku_id     — 단일 SKU 환산 이력
 * PATCH  /api/v1/factory/sku-conversion/:sku_id     — 환산비 변경 (이전 effective_to 자동 종료)
 *
 * 환산비는 effective_from 기준 시계열로 관리되어 과거 일자 계산 시
 * 그 시점의 환산비가 적용된다.
 */
const express = require('express')
const { z } = require('zod')
const { query } = require('../../config/database')
const { validate } = require('../../middleware/validate')
const { apiResponse, apiError } = require('../../lib/shared')

const router = express.Router()

const updateSchema = z.object({
  milk_per_unit_ml: z.number().int().positive(),
  effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().optional(),
})

/** GET / — 전체 SKU 환산비 (현재 적용분) */
router.get('/', async (req, res, next) => {
  try {
    const result = await query(`
      SELECT s.id AS sku_id, s.code, s.name, s.product_type,
        c.id AS conversion_id,
        c.milk_per_unit_ml,
        c.effective_from,
        c.notes
      FROM skus s
      LEFT JOIN LATERAL (
        SELECT * FROM sku_milk_conversion
        WHERE sku_id = s.id
          AND effective_from <= CURRENT_DATE
          AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
        ORDER BY effective_from DESC
        LIMIT 1
      ) c ON TRUE
      WHERE s.is_active = true
      ORDER BY s.code
    `)
    res.json(apiResponse(result.rows))
  } catch (err) {
    next(err)
  }
})

/** GET /:sku_id — 단일 SKU 환산 이력 */
router.get('/:sku_id', async (req, res, next) => {
  try {
    const skuRes = await query('SELECT id, code, name FROM skus WHERE id = $1', [req.params.sku_id])
    if (skuRes.rows.length === 0) {
      return res.status(404).json(apiError('SKU_NOT_FOUND', 'SKU를 찾을 수 없습니다'))
    }

    const histRes = await query(`
      SELECT id, milk_per_unit_ml, effective_from, effective_to, notes, created_at
      FROM sku_milk_conversion
      WHERE sku_id = $1
      ORDER BY effective_from DESC
    `, [req.params.sku_id])

    res.json(apiResponse({
      sku: skuRes.rows[0],
      history: histRes.rows,
    }))
  } catch (err) {
    next(err)
  }
})

/** PATCH /:sku_id — 환산비 변경 (이전 행 effective_to 자동 종료 + 신규 행 INSERT) */
router.patch('/:sku_id', validate(updateSchema), async (req, res, next) => {
  try {
    const skuId = req.params.sku_id
    const { milk_per_unit_ml, effective_from, notes } = req.body
    const newFrom = effective_from || new Date().toISOString().slice(0, 10)

    const skuCheck = await query('SELECT id FROM skus WHERE id = $1', [skuId])
    if (skuCheck.rows.length === 0) {
      return res.status(404).json(apiError('SKU_NOT_FOUND', 'SKU를 찾을 수 없습니다'))
    }

    // 트랜잭션: 이전 활성 행 effective_to = newFrom - 1, 신규 INSERT
    const { transaction } = require('../../config/database')
    const result = await transaction(async (client) => {
      await client.query(`
        UPDATE sku_milk_conversion
        SET effective_to = ($1::date - INTERVAL '1 day')::date
        WHERE sku_id = $2
          AND effective_to IS NULL
          AND effective_from < $1::date
      `, [newFrom, skuId])

      const insertRes = await client.query(`
        INSERT INTO sku_milk_conversion (sku_id, milk_per_unit_ml, effective_from, notes, created_by)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `, [skuId, milk_per_unit_ml, newFrom, notes || null, req.user?.id || null])

      return insertRes.rows[0]
    })

    res.json(apiResponse(result))
  } catch (err) {
    next(err)
  }
})

module.exports = router
