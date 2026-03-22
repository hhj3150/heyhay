/**
 * @fileoverview 정기구독 관리 API
 * POST   /api/v1/market/subscriptions       — 구독 등록
 * GET    /api/v1/market/subscriptions       — 구독 목록
 * PUT    /api/v1/market/subscriptions/:id   — 구독 수정 (일시정지/재개/해지)
 * GET    /api/v1/market/subscriptions/stats — 구독 통계 (유지율, 코호트)
 */
const express = require('express')
const { z } = require('zod')
const { query } = require('../../config/database')
const { validate } = require('../../middleware/validate')
const { apiResponse, apiError } = require('../../lib/shared')

const router = express.Router()

const subscriptionSchema = z.object({
  customer_id: z.string().uuid(),
  plan_name: z.string().optional(),
  frequency: z.enum(['1W', '2W', '4W']),
  duration_months: z.number().int().min(1).optional(),
  items: z.array(z.object({
    sku_code: z.string(),
    quantity: z.number().int().positive(),
  })).min(1),
  price_per_cycle: z.number().int().positive(),
  payment_method: z.string().optional(),
  started_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

/** GET /stats — 구독 통계 */
router.get('/stats', async (req, res, next) => {
  try {
    const result = await query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'ACTIVE') AS active,
        COUNT(*) FILTER (WHERE status = 'PAUSED') AS paused,
        COUNT(*) FILTER (WHERE status = 'CANCELLED') AS cancelled,
        COUNT(*) FILTER (WHERE status = 'ACTIVE' AND created_at >= DATE_TRUNC('week', NOW())) AS new_this_week,
        COALESCE(SUM(price_per_cycle) FILTER (WHERE status = 'ACTIVE'), 0) AS monthly_recurring_revenue
      FROM subscriptions
      WHERE deleted_at IS NULL
    `)
    res.json(apiResponse(result.rows[0]))
  } catch (err) {
    next(err)
  }
})

/** POST / — 구독 등록 */
router.post('/', validate(subscriptionSchema), async (req, res, next) => {
  try {
    const s = req.body
    const cohortMonth = s.started_at.substring(0, 7) + '-01'

    // 만료일 계산
    let expiresAt = null
    if (s.duration_months) {
      const d = new Date(s.started_at)
      d.setMonth(d.getMonth() + s.duration_months)
      expiresAt = d.toISOString().split('T')[0]
    }

    // 다음 결제일 계산
    const freqDays = { '1W': 7, '2W': 14, '4W': 28 }
    const nextPayment = new Date(s.started_at)
    nextPayment.setDate(nextPayment.getDate() + (freqDays[s.frequency] || 7))

    const result = await query(`
      INSERT INTO subscriptions (
        customer_id, plan_name, frequency, duration_months, items,
        price_per_cycle, payment_method, started_at, expires_at,
        next_payment_at, cohort_month
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING *
    `, [
      s.customer_id, s.plan_name, s.frequency, s.duration_months,
      JSON.stringify(s.items), s.price_per_cycle, s.payment_method,
      s.started_at, expiresAt, nextPayment.toISOString().split('T')[0], cohortMonth,
    ])

    // 고객 세그먼트 업데이트 → ACTIVE
    await query(
      `UPDATE customers SET segment = 'ACTIVE', updated_at = NOW() WHERE id = $1`,
      [s.customer_id],
    )

    res.status(201).json(apiResponse(result.rows[0]))
  } catch (err) {
    next(err)
  }
})

/** GET / — 구독 목록 */
router.get('/', async (req, res, next) => {
  try {
    const { status, customer_id, page = 1, limit = 30 } = req.query
    const conditions = ['s.deleted_at IS NULL']
    const params = []
    let idx = 1

    if (status) { conditions.push(`s.status = $${idx++}`); params.push(status) }
    if (customer_id) { conditions.push(`s.customer_id = $${idx++}`); params.push(customer_id) }

    const offset = (parseInt(page) - 1) * parseInt(limit)
    const where = conditions.join(' AND ')

    const result = await query(`
      SELECT s.*, c.name AS customer_name, c.phone AS customer_phone
      FROM subscriptions s
      JOIN customers c ON s.customer_id = c.id
      WHERE ${where}
      ORDER BY s.created_at DESC
      LIMIT $${idx++} OFFSET $${idx++}
    `, [...params, parseInt(limit), offset])

    res.json(apiResponse(result.rows))
  } catch (err) {
    next(err)
  }
})

/** PUT /:id — 구독 상태 변경 */
router.put('/:id', async (req, res, next) => {
  try {
    const { status, pause_reason, pause_until, cancel_reason } = req.body

    const updates = ['updated_at = NOW()']
    const params = []
    let idx = 1

    if (status) { updates.push(`status = $${idx++}`); params.push(status) }
    if (pause_reason) { updates.push(`pause_reason = $${idx++}`); params.push(pause_reason) }
    if (pause_until) { updates.push(`pause_until = $${idx++}`); params.push(pause_until) }
    if (status === 'CANCELLED') {
      updates.push(`cancelled_at = NOW()`)
      if (cancel_reason) { updates.push(`cancel_reason = $${idx++}`); params.push(cancel_reason) }
    }

    const result = await query(
      `UPDATE subscriptions SET ${updates.join(', ')} WHERE id = $${idx++} AND deleted_at IS NULL RETURNING *`,
      [...params, req.params.id],
    )

    if (result.rows.length === 0) return res.status(404).json(apiError('NOT_FOUND', '구독을 찾을 수 없습니다'))
    res.json(apiResponse(result.rows[0]))
  } catch (err) {
    next(err)
  }
})

/** POST /batch-payment — 구독 결제 배치 실행 (ADMIN 전용) */
router.post('/batch-payment', async (req, res, next) => {
  try {
    const { runPaymentBatch } = require('../../services/subscriptionPayment')
    const result = await runPaymentBatch()
    res.json(apiResponse(result))
  } catch (err) {
    next(err)
  }
})

module.exports = router
