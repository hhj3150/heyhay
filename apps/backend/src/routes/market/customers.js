/**
 * @fileoverview 고객 CRM API
 * POST   /api/v1/market/customers       — 고객 등록
 * GET    /api/v1/market/customers       — 고객 목록 (세그먼트/채널 필터)
 * GET    /api/v1/market/customers/:id   — 고객 상세
 * PUT    /api/v1/market/customers/:id   — 고객 수정
 * GET    /api/v1/market/customers/stats — 세그먼트별 통계
 */
const express = require('express')
const { z } = require('zod')
const { query } = require('../../config/database')
const { validate } = require('../../middleware/validate')
const { apiResponse, apiError } = require('@heyhay/shared')

const router = express.Router()

const customerSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  channel: z.enum(['SMARTSTORE', 'OWN_MALL', 'CAFE', 'B2B']),
  external_id: z.string().optional(),
  address_zip: z.string().optional(),
  address_main: z.string().optional(),
  address_detail: z.string().optional(),
  marketing_sms: z.boolean().default(false),
  marketing_email: z.boolean().default(false),
  notes: z.string().optional(),
})

/** GET /stats — 세그먼트별 통계 */
router.get('/stats', async (req, res, next) => {
  try {
    const result = await query(`
      SELECT
        COUNT(*) FILTER (WHERE deleted_at IS NULL) AS total,
        COUNT(*) FILTER (WHERE segment = 'NEW' AND deleted_at IS NULL) AS new_count,
        COUNT(*) FILTER (WHERE segment = 'ACTIVE' AND deleted_at IS NULL) AS active_count,
        COUNT(*) FILTER (WHERE segment = 'VIP' AND deleted_at IS NULL) AS vip_count,
        COUNT(*) FILTER (WHERE segment = 'DORMANT' AND deleted_at IS NULL) AS dormant_count,
        COUNT(*) FILTER (WHERE segment = 'CHURNED' AND deleted_at IS NULL) AS churned_count,
        COALESCE(SUM(total_spent) FILTER (WHERE deleted_at IS NULL), 0) AS total_revenue,
        COALESCE(AVG(ltv) FILTER (WHERE deleted_at IS NULL), 0) AS avg_ltv
      FROM customers
    `)
    res.json(apiResponse(result.rows[0]))
  } catch (err) {
    next(err)
  }
})

/** POST / */
router.post('/', validate(customerSchema), async (req, res, next) => {
  try {
    const c = req.body
    const result = await query(`
      INSERT INTO customers (name, phone, email, channel, external_id,
        address_zip, address_main, address_detail,
        marketing_sms, marketing_email, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING *
    `, [c.name, c.phone, c.email, c.channel, c.external_id,
        c.address_zip, c.address_main, c.address_detail,
        c.marketing_sms, c.marketing_email, c.notes])

    res.status(201).json(apiResponse(result.rows[0]))
  } catch (err) {
    next(err)
  }
})

/** GET / */
router.get('/', async (req, res, next) => {
  try {
    const { segment, channel, search, page = 1, limit = 30 } = req.query
    const conditions = ['deleted_at IS NULL']
    const params = []
    let idx = 1

    if (segment) { conditions.push(`segment = $${idx++}`); params.push(segment) }
    if (channel) { conditions.push(`channel = $${idx++}`); params.push(channel) }
    if (search) {
      conditions.push(`(name ILIKE $${idx} OR phone ILIKE $${idx} OR email ILIKE $${idx})`)
      params.push(`%${search}%`); idx++
    }

    const offset = (parseInt(page) - 1) * parseInt(limit)
    const where = conditions.join(' AND ')

    const result = await query(`
      SELECT * FROM customers WHERE ${where}
      ORDER BY created_at DESC
      LIMIT $${idx++} OFFSET $${idx++}
    `, [...params, parseInt(limit), offset])

    const count = await query(`SELECT COUNT(*) FROM customers WHERE ${where}`, params)
    const total = parseInt(count.rows[0].count)

    res.json(apiResponse(result.rows, { page: parseInt(page), limit: parseInt(limit), total, totalPages: Math.ceil(total / parseInt(limit)) }))
  } catch (err) {
    next(err)
  }
})

/** GET /:id */
router.get('/:id', async (req, res, next) => {
  try {
    const result = await query('SELECT * FROM customers WHERE id = $1 AND deleted_at IS NULL', [req.params.id])
    if (result.rows.length === 0) return res.status(404).json(apiError('NOT_FOUND', '고객을 찾을 수 없습니다'))
    res.json(apiResponse(result.rows[0]))
  } catch (err) { next(err) }
})

/** PUT /:id */
router.put('/:id', validate(customerSchema.partial()), async (req, res, next) => {
  try {
    const fields = req.body
    const keys = Object.keys(fields)
    if (keys.length === 0) return res.status(400).json(apiError('NO_FIELDS', '수정할 항목이 없습니다'))

    const setClauses = keys.map((k, i) => `${k} = $${i + 1}`)
    setClauses.push('updated_at = NOW()')
    const values = keys.map((k) => fields[k])

    const result = await query(
      `UPDATE customers SET ${setClauses.join(', ')} WHERE id = $${keys.length + 1} AND deleted_at IS NULL RETURNING *`,
      [...values, req.params.id],
    )
    if (result.rows.length === 0) return res.status(404).json(apiError('NOT_FOUND', '고객을 찾을 수 없습니다'))
    res.json(apiResponse(result.rows[0]))
  } catch (err) { next(err) }
})

module.exports = router
