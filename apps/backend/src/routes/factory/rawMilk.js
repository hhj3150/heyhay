/**
 * @fileoverview 원유 입고 및 품질 검사 API
 * POST   /api/v1/factory/raw-milk     — 원유 입고 등록
 * GET    /api/v1/factory/raw-milk     — 입고 기록 조회
 * GET    /api/v1/factory/raw-milk/today — 당일 입고 현황
 */
const express = require('express')
const { z } = require('zod')
const { query } = require('../../config/database')
const { validate } = require('../../middleware/validate')
const { apiResponse, apiError } = require('@heyhay/shared')

const router = express.Router()

const rawMilkSchema = z.object({
  received_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount_l: z.number().positive(),
  source: z.enum(['INTERNAL', 'EXTERNAL']).default('INTERNAL'),
  fat_pct: z.number().min(0).max(15).optional(),
  protein_pct: z.number().min(0).max(10).optional(),
  scc: z.number().int().min(0).optional(),
  bacteria_count: z.number().int().min(0).optional(),
  grade: z.string().optional(),
  inspection_doc_url: z.string().url().optional(),
  is_rejected: z.boolean().default(false),
  reject_reason: z.string().optional(),
})

/** GET /today — 당일 입고 현황 */
router.get('/today', async (req, res, next) => {
  try {
    const result = await query(`
      SELECT
        COALESCE(SUM(amount_l), 0) AS total_l,
        COUNT(*) AS receipt_count,
        COALESCE(SUM(amount_l) FILTER (WHERE is_rejected = false), 0) AS accepted_l,
        COALESCE(SUM(amount_l) FILTER (WHERE is_rejected = true), 0) AS rejected_l
      FROM raw_milk_receipts
      WHERE received_date = CURRENT_DATE AND deleted_at IS NULL
    `)
    res.json(apiResponse(result.rows[0]))
  } catch (err) {
    next(err)
  }
})

/** POST / — 원유 입고 등록 */
router.post('/', validate(rawMilkSchema), async (req, res, next) => {
  try {
    const r = req.body
    const result = await query(`
      INSERT INTO raw_milk_receipts (
        received_date, amount_l, source, fat_pct, protein_pct,
        scc, bacteria_count, grade, inspection_doc_url,
        is_rejected, reject_reason, recorded_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING *
    `, [
      r.received_date, r.amount_l, r.source, r.fat_pct, r.protein_pct,
      r.scc, r.bacteria_count, r.grade, r.inspection_doc_url,
      r.is_rejected, r.reject_reason, req.user?.id,
    ])

    res.status(201).json(apiResponse(result.rows[0]))
  } catch (err) {
    next(err)
  }
})

/** GET / — 입고 기록 조회 */
router.get('/', async (req, res, next) => {
  try {
    const { date_from, date_to, page = 1, limit = 30 } = req.query
    const conditions = ['deleted_at IS NULL']
    const params = []
    let idx = 1

    if (date_from) { conditions.push(`received_date >= $${idx++}`); params.push(date_from) }
    if (date_to) { conditions.push(`received_date <= $${idx++}`); params.push(date_to) }

    const offset = (parseInt(page) - 1) * parseInt(limit)
    const where = conditions.join(' AND ')

    const result = await query(`
      SELECT * FROM raw_milk_receipts
      WHERE ${where}
      ORDER BY received_date DESC, created_at DESC
      LIMIT $${idx++} OFFSET $${idx++}
    `, [...params, parseInt(limit), offset])

    res.json(apiResponse(result.rows))
  } catch (err) {
    next(err)
  }
})

module.exports = router
