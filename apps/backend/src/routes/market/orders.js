/**
 * @fileoverview 주문·배송 관리 API
 * POST   /api/v1/market/orders       — 주문 생성
 * GET    /api/v1/market/orders       — 주문 목록
 * GET    /api/v1/market/orders/:id   — 주문 상세
 * PUT    /api/v1/market/orders/:id   — 주문 상태 변경
 * GET    /api/v1/market/orders/stats — 주문 통계
 */
const express = require('express')
const { z } = require('zod')
const { query, transaction } = require('../../config/database')
const { validate } = require('../../middleware/validate')
const { apiResponse, apiError } = require('../../lib/shared')

const router = express.Router()

/** 주문 상태 전환 맵 — 허용되지 않은 전환은 거부 */
const VALID_TRANSITIONS = {
  PENDING: ['PAID', 'CANCELLED'],
  PAID: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['PACKED', 'CANCELLED'],
  PACKED: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
  RETURNED: [],
}

const orderSchema = z.object({
  customer_id: z.string().uuid().optional(),
  subscription_id: z.string().uuid().optional(),
  channel: z.enum(['SMARTSTORE', 'OWN_MALL', 'B2B', 'PHONE', 'KAKAO', 'VISIT', 'FACTORY_DIRECT', 'SAMPLE', 'OFFLINE']),
  external_order_id: z.string().optional(),
  items: z.array(z.object({
    sku_id: z.string().uuid(),
    quantity: z.number().int().positive(),
    unit_price: z.number().int().positive(),
  })).min(1),
  shipping_fee: z.number().int().min(0).default(0),
  discount: z.number().int().min(0).default(0),
  recipient_name: z.string().optional(),
  recipient_phone: z.string().optional(),
  shipping_zip: z.string().optional(),
  shipping_address: z.string().optional(),
  shipping_memo: z.string().optional(),
  cool_box_size: z.enum(['SMALL', 'MEDIUM', 'LARGE']).optional(),
})

const statusUpdateSchema = z.object({
  status: z.enum(['PAID', 'PROCESSING', 'PACKED', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED']),
  courier: z.string().optional(),
  tracking_number: z.string().optional(),
  return_reason: z.string().optional(),
  return_type: z.enum(['COURIER_FAULT', 'CUSTOMER_FAULT', 'DEFECTIVE']).optional(),
})

/** GET /stats — 주문 통계 */
router.get('/stats', async (req, res, next) => {
  try {
    const result = await query(`
      SELECT
        COUNT(*) FILTER (WHERE DATE(created_at) = CURRENT_DATE AND deleted_at IS NULL) AS today_orders,
        COUNT(*) FILTER (WHERE status = 'PENDING' AND deleted_at IS NULL) AS pending,
        COUNT(*) FILTER (WHERE status = 'PROCESSING' AND deleted_at IS NULL) AS processing,
        COUNT(*) FILTER (WHERE status = 'SHIPPED' AND deleted_at IS NULL) AS shipped,
        COALESCE(SUM(total_amount) FILTER (WHERE DATE(created_at) = CURRENT_DATE AND deleted_at IS NULL), 0) AS today_revenue,
        COALESCE(SUM(total_amount) FILTER (WHERE created_at >= DATE_TRUNC('month', NOW()) AND deleted_at IS NULL), 0) AS month_revenue
      FROM orders
    `)
    res.json(apiResponse(result.rows[0]))
  } catch (err) {
    next(err)
  }
})

/** POST / — 주문 생성 */
router.post('/', validate(orderSchema), async (req, res, next) => {
  try {
    const o = req.body
    const subtotal = o.items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0)
    const totalAmount = subtotal + o.shipping_fee - o.discount

    // 주문번호 생성: HH-YYYYMMDD-seq
    const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '')
    const seqRes = await query(
      `SELECT COUNT(*) + 1 AS seq FROM orders WHERE order_number LIKE $1`,
      [`HH-${dateStr}-%`],
    )
    const orderNumber = `HH-${dateStr}-${String(seqRes.rows[0].seq).padStart(4, '0')}`

    const result = await transaction(async (client) => {
      const orderRes = await client.query(`
        INSERT INTO orders (
          order_number, customer_id, subscription_id, channel, external_order_id,
          subtotal, shipping_fee, discount, total_amount,
          recipient_name, recipient_phone, shipping_zip, shipping_address, shipping_memo,
          cool_box_size
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
        RETURNING *
      `, [
        orderNumber, o.customer_id, o.subscription_id, o.channel, o.external_order_id,
        subtotal, o.shipping_fee, o.discount, totalAmount,
        o.recipient_name, o.recipient_phone, o.shipping_zip, o.shipping_address, o.shipping_memo,
        o.cool_box_size || null,
      ])

      const orderId = orderRes.rows[0].id

      for (const item of o.items) {
        await client.query(`
          INSERT INTO order_items (order_id, sku_id, quantity, unit_price, subtotal)
          VALUES ($1, $2, $3, $4, $5)
        `, [orderId, item.sku_id, item.quantity, item.unit_price, item.quantity * item.unit_price])
      }

      return orderRes.rows[0]
    })

    res.status(201).json(apiResponse(result))
  } catch (err) {
    next(err)
  }
})

/** GET / — 주문 목록 */
router.get('/', async (req, res, next) => {
  try {
    const { status, channel, customer_id, date_from, date_to, page = 1, limit = 30 } = req.query
    const conditions = ['o.deleted_at IS NULL']
    const params = []
    let idx = 1

    if (status) { conditions.push(`o.status = $${idx++}`); params.push(status) }
    if (channel) { conditions.push(`o.channel = $${idx++}`); params.push(channel) }
    if (customer_id) { conditions.push(`o.customer_id = $${idx++}`); params.push(customer_id) }
    if (date_from) { conditions.push(`o.created_at >= $${idx++}`); params.push(date_from) }
    if (date_to) { conditions.push(`o.created_at < ($${idx++})::date + 1`); params.push(date_to) }

    const offset = (parseInt(page) - 1) * parseInt(limit)
    const where = conditions.join(' AND ')

    const limitIdx = idx++
    const offsetIdx = idx++

    const result = await query(`
      SELECT o.*, c.name AS customer_name
      FROM orders o
      LEFT JOIN customers c ON o.customer_id = c.id
      WHERE ${where}
      ORDER BY o.created_at DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `, [...params, parseInt(limit), offset])

    // 주문 아이템을 한 번에 조회 (N+1 방지)
    const orderIds = result.rows.map((r) => r.id)
    let itemsMap = {}
    if (orderIds.length > 0) {
      const itemsRes = await query(`
        SELECT oi.order_id, oi.quantity, oi.unit_price, oi.subtotal,
               s.code AS sku_code, s.name AS sku_name
        FROM order_items oi
        JOIN skus s ON oi.sku_id = s.id
        WHERE oi.order_id = ANY($1)
        ORDER BY oi.created_at
      `, [orderIds])
      itemsRes.rows.forEach((item) => {
        if (!itemsMap[item.order_id]) itemsMap[item.order_id] = []
        itemsMap[item.order_id].push(item)
      })
    }

    const ordersWithItems = result.rows.map((order) => ({
      ...order,
      items: itemsMap[order.id] || [],
    }))

    const countResult = await query(
      `SELECT COUNT(*) FROM orders o WHERE ${where}`,
      params,
    )
    const total = parseInt(countResult.rows[0].count)

    res.json(apiResponse(ordersWithItems, {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      totalPages: Math.ceil(total / parseInt(limit)),
    }))
  } catch (err) {
    next(err)
  }
})

/** GET /:id — 주문 상세 */
router.get('/:id', async (req, res, next) => {
  try {
    const [orderRes, itemsRes] = await Promise.all([
      query('SELECT o.*, c.name AS customer_name FROM orders o LEFT JOIN customers c ON o.customer_id = c.id WHERE o.id = $1', [req.params.id]),
      query('SELECT oi.*, s.code AS sku_code, s.name AS sku_name FROM order_items oi JOIN skus s ON oi.sku_id = s.id WHERE oi.order_id = $1', [req.params.id]),
    ])

    if (orderRes.rows.length === 0) return res.status(404).json(apiError('NOT_FOUND', '주문을 찾을 수 없습니다'))

    res.json(apiResponse({ ...orderRes.rows[0], items: itemsRes.rows }))
  } catch (err) { next(err) }
})

/** PUT /:id — 주문 상태 변경 */
router.put('/:id', validate(statusUpdateSchema), async (req, res, next) => {
  try {
    const { status, courier, tracking_number, return_reason, return_type } = req.body

    // 현재 상태 조회 후 유효한 전환인지 검증
    const current = await query('SELECT status FROM orders WHERE id = $1 AND deleted_at IS NULL', [req.params.id])
    if (current.rows.length === 0) return res.status(404).json(apiError('NOT_FOUND', '주문을 찾을 수 없습니다'))

    const currentStatus = current.rows[0].status
    const allowedNext = VALID_TRANSITIONS[currentStatus] || []
    if (!allowedNext.includes(status)) {
      return res.status(400).json(apiError('INVALID_TRANSITION', `${currentStatus} → ${status} 전환은 허용되지 않습니다`))
    }

    const updates = ['status = $1', 'updated_at = NOW()']
    const params = [status]
    let idx = 2

    if (status === 'SHIPPED') {
      updates.push('shipped_at = NOW()')
      if (courier) { updates.push(`courier = $${idx++}`); params.push(courier) }
      if (tracking_number) { updates.push(`tracking_number = $${idx++}`); params.push(tracking_number) }
    }
    if (status === 'DELIVERED') updates.push('delivered_at = NOW()')
    if (status === 'PAID') updates.push('paid_at = NOW()')
    if (return_reason) { updates.push(`return_reason = $${idx++}`); params.push(return_reason) }
    if (return_type) { updates.push(`return_type = $${idx++}`); params.push(return_type) }

    const result = await query(
      `UPDATE orders SET ${updates.join(', ')} WHERE id = $${idx} AND deleted_at IS NULL RETURNING *`,
      [...params, req.params.id],
    )

    if (result.rows.length === 0) return res.status(404).json(apiError('NOT_FOUND', '주문을 찾을 수 없습니다'))
    res.json(apiResponse(result.rows[0]))
  } catch (err) { next(err) }
})

module.exports = router
