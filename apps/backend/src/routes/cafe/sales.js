/**
 * @fileoverview 밀크카페 POS 매출 + 메뉴 + 정산 API
 * GET    /api/v1/cafe/menus              — 메뉴 목록
 * POST   /api/v1/cafe/menus              — 메뉴 등록
 * POST   /api/v1/cafe/sales/import       — POS 매출 일괄 Import
 * GET    /api/v1/cafe/sales              — 매출 조회
 * GET    /api/v1/cafe/sales/stats        — 매출 통계
 * POST   /api/v1/cafe/settlements        — 정산서 생성
 * GET    /api/v1/cafe/settlements        — 정산 목록
 */
const express = require('express')
const { z } = require('zod')
const { query, transaction } = require('../../config/database')
const { validate } = require('../../middleware/validate')
const { apiResponse, apiError } = require('@heyhay/shared')

const router = express.Router()

// --- 메뉴 ---

const menuSchema = z.object({
  name: z.string().min(1),
  category: z.string().optional(),
  price: z.number().int().positive(),
  is_seasonal: z.boolean().default(false),
  season_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  season_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

router.get('/menus', async (req, res, next) => {
  try {
    const result = await query(
      'SELECT * FROM cafe_menus WHERE deleted_at IS NULL AND is_active = true ORDER BY category, name',
    )
    res.json(apiResponse(result.rows))
  } catch (err) { next(err) }
})

router.post('/menus', validate(menuSchema), async (req, res, next) => {
  try {
    const m = req.body
    const result = await query(`
      INSERT INTO cafe_menus (name, category, price, is_seasonal, season_start, season_end)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING *
    `, [m.name, m.category, m.price, m.is_seasonal, m.season_start, m.season_end])
    res.status(201).json(apiResponse(result.rows[0]))
  } catch (err) { next(err) }
})

// --- POS 매출 ---

const salesImportSchema = z.object({
  records: z.array(z.object({
    sale_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    sale_time: z.string().optional(),
    menu_name: z.string(),
    quantity: z.number().int().positive().default(1),
    unit_price: z.number().int().positive(),
    total_amount: z.number().int().positive(),
    payment_method: z.enum(['CASH', 'CARD', 'KAKAO_PAY', 'OTHER']).default('CARD'),
    pos_ref: z.string().optional(),
  })).min(1),
})

/** POST /sales/import — POS 매출 일괄 Import */
router.post('/sales/import', validate(salesImportSchema), async (req, res, next) => {
  try {
    const { records } = req.body

    const inserted = await transaction(async (client) => {
      const results = []
      for (const r of records) {
        // 메뉴명으로 메뉴 ID 자동 매칭
        const menuRes = await client.query(
          `SELECT id FROM cafe_menus WHERE name = $1 AND deleted_at IS NULL LIMIT 1`,
          [r.menu_name],
        )
        const menuId = menuRes.rows.length > 0 ? menuRes.rows[0].id : null

        const ins = await client.query(`
          INSERT INTO cafe_sales (
            sale_date, sale_time, menu_id, menu_name, quantity,
            unit_price, total_amount, payment_method, pos_ref
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
          RETURNING *
        `, [
          r.sale_date, r.sale_time, menuId, r.menu_name, r.quantity,
          r.unit_price, r.total_amount, r.payment_method, r.pos_ref,
        ])
        results.push(ins.rows[0])
      }
      return results
    })

    res.status(201).json(apiResponse(inserted, { count: inserted.length }))
  } catch (err) { next(err) }
})

/** GET /sales — 매출 조회 */
router.get('/sales', async (req, res, next) => {
  try {
    const { date_from, date_to, page = 1, limit = 50 } = req.query
    const conditions = []
    const params = []
    let idx = 1

    if (date_from) { conditions.push(`sale_date >= $${idx++}`); params.push(date_from) }
    if (date_to) { conditions.push(`sale_date <= $${idx++}`); params.push(date_to) }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const offset = (parseInt(page) - 1) * parseInt(limit)

    const result = await query(`
      SELECT cs.*, cm.name AS menu_display_name, cm.category
      FROM cafe_sales cs
      LEFT JOIN cafe_menus cm ON cs.menu_id = cm.id
      ${where}
      ORDER BY cs.sale_date DESC, cs.sale_time DESC
      LIMIT $${idx++} OFFSET $${idx++}
    `, [...params, parseInt(limit), offset])

    res.json(apiResponse(result.rows))
  } catch (err) { next(err) }
})

/** GET /sales/stats — 매출 통계 */
router.get('/sales/stats', async (req, res, next) => {
  try {
    const [today, monthly, byMenu] = await Promise.all([
      query(`
        SELECT COALESCE(SUM(total_amount), 0) AS revenue, COUNT(*) AS transactions
        FROM cafe_sales WHERE sale_date = CURRENT_DATE
      `),
      query(`
        SELECT COALESCE(SUM(total_amount), 0) AS revenue, COUNT(*) AS transactions
        FROM cafe_sales WHERE sale_date >= DATE_TRUNC('month', CURRENT_DATE)
      `),
      query(`
        SELECT COALESCE(menu_name, '기타') AS menu, SUM(total_amount) AS revenue, SUM(quantity) AS qty
        FROM cafe_sales
        WHERE sale_date >= DATE_TRUNC('month', CURRENT_DATE)
        GROUP BY menu_name ORDER BY revenue DESC LIMIT 10
      `),
    ])

    res.json(apiResponse({
      today: today.rows[0],
      monthly: monthly.rows[0],
      top_menus: byMenu.rows,
    }))
  } catch (err) { next(err) }
})

// --- 정산 ---

const settlementSchema = z.object({
  period_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  period_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  commission_rate: z.number().min(0).max(100),
})

/** POST /settlements — 정산서 생성 */
router.post('/settlements', validate(settlementSchema), async (req, res, next) => {
  try {
    const { period_start, period_end, commission_rate } = req.body

    // 기간 매출 합산
    const salesSum = await query(`
      SELECT COALESCE(SUM(total_amount), 0) AS total
      FROM cafe_sales
      WHERE sale_date >= $1 AND sale_date <= $2 AND is_settled = false
    `, [period_start, period_end])

    const totalSales = parseInt(salesSum.rows[0].total)
    const commission = Math.round(totalSales * commission_rate / 100)
    const netAmount = totalSales - commission

    const result = await transaction(async (client) => {
      const settleRes = await client.query(`
        INSERT INTO cafe_settlements (period_start, period_end, total_sales, commission_rate, commission, net_amount)
        VALUES ($1,$2,$3,$4,$5,$6) RETURNING *
      `, [period_start, period_end, totalSales, commission_rate, commission, netAmount])

      // 매출 기록 정산 완료 처리
      await client.query(`
        UPDATE cafe_sales SET is_settled = true, settlement_id = $1, updated_at = NOW()
        WHERE sale_date >= $2 AND sale_date <= $3 AND is_settled = false
      `, [settleRes.rows[0].id, period_start, period_end])

      return settleRes.rows[0]
    })

    res.status(201).json(apiResponse(result))
  } catch (err) { next(err) }
})

/** GET /settlements — 정산 목록 */
router.get('/settlements', async (req, res, next) => {
  try {
    const result = await query('SELECT * FROM cafe_settlements ORDER BY period_start DESC LIMIT 20')
    res.json(apiResponse(result.rows))
  } catch (err) { next(err) }
})

module.exports = router
