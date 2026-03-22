/**
 * @fileoverview 사료·사양 관리 API
 * CRUD /api/v1/farm/feed/types   — 사료 종류 관리
 * POST /api/v1/farm/feed/records — 급여 기록 등록
 * GET  /api/v1/farm/feed/records — 급여 기록 조회
 * GET  /api/v1/farm/feed/cost    — 두당 사료비 계산
 */
const express = require('express')
const { z } = require('zod')
const { query } = require('../../config/database')
const { validate } = require('../../middleware/validate')
const { apiResponse, apiError } = require('@heyhay/shared')

const router = express.Router()

const feedTypeSchema = z.object({
  name: z.string().min(1),
  category: z.string().optional(),
  unit_price: z.number().int().min(0).optional(),
  supplier: z.string().optional(),
})

const feedRecordSchema = z.object({
  feed_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  feed_type_id: z.string().uuid(),
  group_tag: z.string().optional(),
  amount_kg: z.number().positive(),
  dm_intake_kg: z.number().positive().optional(),
  head_count: z.number().int().positive().optional(),
})

// --- 사료 종류 ---

router.post('/types', validate(feedTypeSchema), async (req, res, next) => {
  try {
    const { name, category, unit_price, supplier } = req.body
    const result = await query(
      `INSERT INTO feed_types (name, category, unit_price, supplier) VALUES ($1,$2,$3,$4) RETURNING *`,
      [name, category, unit_price, supplier],
    )
    res.status(201).json(apiResponse(result.rows[0]))
  } catch (err) {
    next(err)
  }
})

router.get('/types', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT * FROM feed_types WHERE deleted_at IS NULL ORDER BY name`,
    )
    res.json(apiResponse(result.rows))
  } catch (err) {
    next(err)
  }
})

// --- 급여 기록 ---

router.post('/records', validate(feedRecordSchema), async (req, res, next) => {
  try {
    const { feed_date, feed_type_id, group_tag, amount_kg, dm_intake_kg, head_count } = req.body
    const result = await query(`
      INSERT INTO feed_records (feed_date, feed_type_id, group_tag, amount_kg, dm_intake_kg, head_count, recorded_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *
    `, [feed_date, feed_type_id, group_tag, amount_kg, dm_intake_kg, head_count, req.user?.id])

    res.status(201).json(apiResponse(result.rows[0]))
  } catch (err) {
    next(err)
  }
})

router.get('/records', async (req, res, next) => {
  try {
    const { date_from, date_to, group_tag } = req.query
    const conditions = []
    const params = []
    let idx = 1

    if (date_from) {
      conditions.push(`fr.feed_date >= $${idx++}`)
      params.push(date_from)
    }
    if (date_to) {
      conditions.push(`fr.feed_date <= $${idx++}`)
      params.push(date_to)
    }
    if (group_tag) {
      conditions.push(`fr.group_tag = $${idx++}`)
      params.push(group_tag)
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const result = await query(`
      SELECT fr.*, ft.name AS feed_name, ft.unit_price, ft.category
      FROM feed_records fr
      JOIN feed_types ft ON fr.feed_type_id = ft.id
      ${where}
      ORDER BY fr.feed_date DESC
      LIMIT 200
    `, params)

    res.json(apiResponse(result.rows))
  } catch (err) {
    next(err)
  }
})

/** GET /cost — 두당 일사료비 (최근 30일 평균) */
router.get('/cost', async (req, res, next) => {
  try {
    const result = await query(`
      SELECT
        SUM(fr.amount_kg * COALESCE(ft.unit_price, 0)) AS total_feed_cost,
        SUM(fr.head_count) AS total_head_days,
        COUNT(DISTINCT fr.feed_date) AS days
      FROM feed_records fr
      JOIN feed_types ft ON fr.feed_type_id = ft.id
      WHERE fr.feed_date >= CURRENT_DATE - 30
    `)

    const row = result.rows[0]
    const totalCost = parseFloat(row.total_feed_cost || 0)
    const totalHeadDays = parseInt(row.total_head_days || 0)

    res.json(apiResponse({
      total_feed_cost_30d: totalCost,
      avg_daily_cost_per_head: totalHeadDays > 0
        ? Math.round(totalCost / totalHeadDays)
        : null,
      days_counted: parseInt(row.days || 0),
    }))
  } catch (err) {
    next(err)
  }
})

module.exports = router
