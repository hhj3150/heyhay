/**
 * @fileoverview B2B 거래처 관리 API
 * GET    /api/v1/market/b2b              — 거래처 목록
 * GET    /api/v1/market/b2b/:id          — 거래처 상세 (정기주문 포함)
 * POST   /api/v1/market/b2b              — 거래처 등록
 * PUT    /api/v1/market/b2b/:id          — 거래처 수정
 * GET    /api/v1/market/b2b/:id/orders   — 정기 주문 목록
 * POST   /api/v1/market/b2b/:id/orders   — 정기 주문 추가/수정
 * POST   /api/v1/market/b2b/:id/ship     — 출하 처리
 * GET    /api/v1/market/b2b/demand       — 전체 B2B 수요 요약
 */
const express = require('express')
const { z } = require('zod')
const { query, transaction } = require('../../config/database')
const { validate } = require('../../middleware/validate')
const { apiResponse, apiError } = require('../../lib/shared')

const router = express.Router()

const partnerSchema = z.object({
  name: z.string().min(1),
  contact_name: z.string().optional(),
  contact_phone: z.string().optional(),
  contact_email: z.string().email().optional().or(z.literal('')),
  business_number: z.string().optional(),
  address: z.string().optional(),
  payment_terms: z.enum(['MONTHLY', 'WEEKLY', 'COD']).default('MONTHLY'),
  delivery_day: z.string().default('MON'),
  notes: z.string().optional(),
})

const standingOrderSchema = z.object({
  items: z.array(z.object({
    sku_id: z.string().uuid(),
    quantity: z.number().int().min(0),
    frequency: z.enum(['DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY']).default('WEEKLY'),
    unit_price: z.number().int().min(0),
  })),
})

/** GET /demand — B2B 전체 수요 요약 (생산계획용) */
router.get('/demand', async (req, res, next) => {
  try {
    const result = await query(`
      SELECT p.name AS partner_name, s.code AS sku_code, s.name AS sku_name,
             bso.quantity, bso.frequency, bso.unit_price
      FROM b2b_standing_orders bso
      JOIN b2b_partners p ON bso.partner_id = p.id
      JOIN skus s ON bso.sku_id = s.id
      WHERE bso.is_active = true AND p.is_active = true AND p.deleted_at IS NULL
      ORDER BY p.name, s.code
    `)

    // 주간 환산
    const freqMultiplier = { DAILY: 7, WEEKLY: 1, BIWEEKLY: 0.5, MONTHLY: 0.25 }
    const weeklyDemand = {}

    result.rows.forEach((r) => {
      if (!weeklyDemand[r.sku_code]) {
        weeklyDemand[r.sku_code] = { sku_name: r.sku_name, total_weekly: 0, partners: [] }
      }
      const weekly = Math.ceil(r.quantity * (freqMultiplier[r.frequency] || 1))
      weeklyDemand[r.sku_code].total_weekly += weekly
      weeklyDemand[r.sku_code].partners.push({
        partner: r.partner_name,
        quantity: r.quantity,
        frequency: r.frequency,
        weekly,
      })
    })

    res.json(apiResponse({ by_partner: result.rows, weekly_demand: weeklyDemand }))
  } catch (err) { next(err) }
})

/** GET / — 거래처 목록 */
router.get('/', async (req, res, next) => {
  try {
    const result = await query(`
      SELECT p.*,
        (SELECT COUNT(*) FROM b2b_standing_orders bso
         WHERE bso.partner_id = p.id AND bso.is_active = true) AS active_orders,
        (SELECT COALESCE(SUM(bso.quantity * bso.unit_price), 0)
         FROM b2b_standing_orders bso
         WHERE bso.partner_id = p.id AND bso.is_active = true) AS estimated_monthly
      FROM b2b_partners p
      WHERE p.deleted_at IS NULL
      ORDER BY p.created_at
    `)
    res.json(apiResponse(result.rows))
  } catch (err) { next(err) }
})

/** GET /:id — 거래처 상세 + 정기주문 */
router.get('/:id', async (req, res, next) => {
  try {
    const [partnerRes, ordersRes, shipmentsRes] = await Promise.all([
      query('SELECT * FROM b2b_partners WHERE id = $1 AND deleted_at IS NULL', [req.params.id]),
      query(`
        SELECT bso.*, s.code AS sku_code, s.name AS sku_name, s.volume_ml
        FROM b2b_standing_orders bso
        JOIN skus s ON bso.sku_id = s.id
        WHERE bso.partner_id = $1
        ORDER BY s.code
      `, [req.params.id]),
      query(`
        SELECT bs.*,
          (SELECT json_agg(json_build_object(
            'sku_code', s.code, 'sku_name', s.name, 'quantity', bsi.quantity,
            'unit_price', bsi.unit_price, 'subtotal', bsi.subtotal
          )) FROM b2b_shipment_items bsi JOIN skus s ON bsi.sku_id = s.id WHERE bsi.shipment_id = bs.id
          ) AS items
        FROM b2b_shipments bs
        WHERE bs.partner_id = $1
        ORDER BY bs.shipment_date DESC
        LIMIT 10
      `, [req.params.id]),
    ])

    if (partnerRes.rows.length === 0) {
      return res.status(404).json(apiError('NOT_FOUND', '거래처를 찾을 수 없습니다'))
    }

    res.json(apiResponse({
      ...partnerRes.rows[0],
      standing_orders: ordersRes.rows,
      recent_shipments: shipmentsRes.rows,
    }))
  } catch (err) { next(err) }
})

/** POST / — 거래처 등록 */
router.post('/', validate(partnerSchema), async (req, res, next) => {
  try {
    const p = req.body
    const result = await query(`
      INSERT INTO b2b_partners (name, contact_name, contact_phone, contact_email,
        business_number, address, payment_terms, delivery_day, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *
    `, [p.name, p.contact_name, p.contact_phone, p.contact_email,
        p.business_number, p.address, p.payment_terms, p.delivery_day, p.notes])

    res.status(201).json(apiResponse(result.rows[0]))
  } catch (err) { next(err) }
})

/** PUT /:id — 거래처 수정 */
router.put('/:id', validate(partnerSchema.partial()), async (req, res, next) => {
  try {
    const fields = req.body
    const keys = Object.keys(fields)
    if (keys.length === 0) return res.status(400).json(apiError('NO_FIELDS', '수정할 항목이 없습니다'))

    const setClauses = keys.map((k, i) => `${k} = $${i + 1}`)
    setClauses.push('updated_at = NOW()')
    const values = keys.map((k) => fields[k])

    const result = await query(
      `UPDATE b2b_partners SET ${setClauses.join(', ')} WHERE id = $${keys.length + 1} AND deleted_at IS NULL RETURNING *`,
      [...values, req.params.id],
    )
    if (result.rows.length === 0) return res.status(404).json(apiError('NOT_FOUND', '거래처를 찾을 수 없습니다'))
    res.json(apiResponse(result.rows[0]))
  } catch (err) { next(err) }
})

/** POST /:id/orders — 정기 주문 일괄 설정 (기존 비활성화 → 새로 삽입) */
router.post('/:id/orders', validate(standingOrderSchema), async (req, res, next) => {
  try {
    const partnerId = req.params.id
    const { items } = req.body

    await transaction(async (client) => {
      // 기존 정기주문 비활성화
      await client.query(
        'UPDATE b2b_standing_orders SET is_active = false, updated_at = NOW() WHERE partner_id = $1',
        [partnerId],
      )

      // 새 정기주문 삽입 (수량 0 제외)
      for (const item of items.filter((i) => i.quantity > 0)) {
        await client.query(`
          INSERT INTO b2b_standing_orders (partner_id, sku_id, quantity, frequency, unit_price)
          VALUES ($1, $2, $3, $4, $5)
        `, [partnerId, item.sku_id, item.quantity, item.frequency, item.unit_price])
      }
    })

    // 업데이트된 주문 반환
    const result = await query(`
      SELECT bso.*, s.code AS sku_code, s.name AS sku_name
      FROM b2b_standing_orders bso
      JOIN skus s ON bso.sku_id = s.id
      WHERE bso.partner_id = $1 AND bso.is_active = true
      ORDER BY s.code
    `, [partnerId])

    res.json(apiResponse(result.rows))
  } catch (err) { next(err) }
})

/** POST /:id/ship — 출하 처리 (정기주문 기반 자동 or 수동) */
router.post('/:id/ship', async (req, res, next) => {
  try {
    const partnerId = req.params.id
    const { items, notes } = req.body || {}

    // items가 없으면 정기주문 기반 자동 생성
    let shipItems = items
    if (!shipItems) {
      const orders = await query(`
        SELECT bso.sku_id, bso.quantity, bso.unit_price
        FROM b2b_standing_orders bso
        WHERE bso.partner_id = $1 AND bso.is_active = true
      `, [partnerId])
      shipItems = orders.rows
    }

    if (!shipItems || shipItems.length === 0) {
      return res.status(400).json(apiError('NO_ITEMS', '출하할 상품이 없습니다'))
    }

    const totalAmount = shipItems.reduce((sum, i) => sum + (i.quantity * i.unit_price), 0)

    const result = await transaction(async (client) => {
      const shipRes = await client.query(`
        INSERT INTO b2b_shipments (partner_id, total_amount, notes)
        VALUES ($1, $2, $3) RETURNING *
      `, [partnerId, totalAmount, notes || null])

      const shipmentId = shipRes.rows[0].id

      for (const item of shipItems) {
        await client.query(`
          INSERT INTO b2b_shipment_items (shipment_id, sku_id, quantity, unit_price, subtotal)
          VALUES ($1, $2, $3, $4, $5)
        `, [shipmentId, item.sku_id, item.quantity, item.unit_price, item.quantity * item.unit_price])
      }

      return shipRes.rows[0]
    })

    res.status(201).json(apiResponse(result))
  } catch (err) { next(err) }
})

module.exports = router
