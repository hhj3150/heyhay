/**
 * @fileoverview 포장 자재 관리 API
 * GET    /api/v1/packaging/materials          — 자재 목록 (category 필터)
 * GET    /api/v1/packaging/materials/:id      — 자재 상세
 * POST   /api/v1/packaging/materials          — 자재 등록
 * PUT    /api/v1/packaging/materials/:id      — 자재 수정
 * GET    /api/v1/packaging/stock-logs         — 입출고 이력
 * POST   /api/v1/packaging/stock-logs         — 입출고 기록
 * GET    /api/v1/packaging/orders             — 발주 목록
 * POST   /api/v1/packaging/orders             — 발주 등록
 * PUT    /api/v1/packaging/orders/:id         — 발주 상태 변경
 * GET    /api/v1/packaging/demand-forecast    — 소요량 예측
 */
const express = require('express')
const { z } = require('zod')
const { query, transaction } = require('../../config/database')
const { validate } = require('../../middleware/validate')
const { apiResponse, apiError } = require('../../lib/shared')

const router = express.Router()

// ── 유효 카테고리 ──
const VALID_CATEGORIES = [
  'PET_BOTTLE', 'CUP', 'LID', 'CAP', 'LABEL',
  'BOX', 'ICE_PACK', 'TAPE', 'OTHER',
]

// ── Zod 스키마 ──
const materialSchema = z.object({
  category: z.enum(VALID_CATEGORIES),
  name: z.string().min(1).max(100),
  spec: z.string().max(200).optional(),
  sku_mapping: z.array(z.string()).optional(),
  unit: z.string().max(20).default('개'),
  unit_cost: z.number().int().min(0).default(0),
  safety_stock: z.number().int().min(0).default(0),
  current_stock: z.number().int().min(0).default(0),
  lead_days: z.number().int().min(0).default(3),
  supplier_name: z.string().max(200).optional(),
  supplier_contact: z.string().max(100).optional(),
  notes: z.string().optional(),
})

const materialUpdateSchema = z.object({
  category: z.enum(VALID_CATEGORIES).optional(),
  name: z.string().min(1).max(100).optional(),
  spec: z.string().max(200).optional(),
  sku_mapping: z.array(z.string()).optional(),
  unit: z.string().max(20).optional(),
  unit_cost: z.number().int().min(0).optional(),
  safety_stock: z.number().int().min(0).optional(),
  lead_days: z.number().int().min(0).optional(),
  supplier_name: z.string().max(200).optional(),
  supplier_contact: z.string().max(100).optional(),
  notes: z.string().optional(),
})

const stockLogSchema = z.object({
  material_id: z.string().uuid(),
  type: z.enum(['IN', 'OUT', 'ADJUST']),
  quantity: z.number().int(),
  reason: z.string().max(200).optional(),
  reference_id: z.string().max(100).optional(),
})

const orderSchema = z.object({
  material_id: z.string().uuid(),
  order_qty: z.number().int().positive(),
  unit_cost: z.number().int().min(0).default(0),
  supplier_name: z.string().max(200).optional(),
  expected_at: z.string().optional(),
  notes: z.string().optional(),
})

const orderUpdateSchema = z.object({
  status: z.enum(['DRAFT', 'ORDERED', 'SHIPPED', 'RECEIVED', 'CANCELLED']),
  received_qty: z.number().int().min(0).optional(),
  notes: z.string().optional(),
})

// ── 자재 목록 ──
/** GET /materials — 자재 목록 (category 필터) */
router.get('/materials', async (req, res, next) => {
  try {
    const { category } = req.query
    const conditions = []
    const params = []
    let idx = 1

    if (category) {
      conditions.push(`category = $${idx++}`)
      params.push(category)
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const result = await query(`
      SELECT * FROM packaging_materials
      ${where}
      ORDER BY category, name
    `, params)

    res.json(apiResponse(result.rows))
  } catch (err) {
    next(err)
  }
})

// ── 자재 상세 ──
/** GET /materials/:id — 자재 상세 */
router.get('/materials/:id', async (req, res, next) => {
  try {
    const { id } = req.params
    const result = await query('SELECT * FROM packaging_materials WHERE id = $1', [id])

    if (result.rows.length === 0) {
      return res.status(404).json(apiError('NOT_FOUND', '자재를 찾을 수 없습니다'))
    }

    res.json(apiResponse(result.rows[0]))
  } catch (err) {
    next(err)
  }
})

// ── 자재 등록 ──
/** POST /materials — 자재 등록 */
router.post('/materials', validate(materialSchema), async (req, res, next) => {
  try {
    const m = req.body
    const result = await query(`
      INSERT INTO packaging_materials (
        category, name, spec, sku_mapping, unit, unit_cost,
        safety_stock, current_stock, lead_days,
        supplier_name, supplier_contact, notes
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING *
    `, [
      m.category, m.name, m.spec, m.sku_mapping, m.unit, m.unit_cost,
      m.safety_stock, m.current_stock, m.lead_days,
      m.supplier_name, m.supplier_contact, m.notes,
    ])

    res.status(201).json(apiResponse(result.rows[0]))
  } catch (err) {
    next(err)
  }
})

// ── 자재 수정 ──
/** PUT /materials/:id — 자재 수정 */
router.put('/materials/:id', validate(materialUpdateSchema), async (req, res, next) => {
  try {
    const { id } = req.params
    const fields = req.body
    const setClauses = []
    const params = []
    let idx = 1

    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) {
        setClauses.push(`${key} = $${idx++}`)
        params.push(value)
      }
    }

    if (setClauses.length === 0) {
      return res.status(400).json(apiError('EMPTY_UPDATE', '수정할 항목이 없습니다'))
    }

    setClauses.push(`updated_at = NOW()`)
    params.push(id)

    const result = await query(`
      UPDATE packaging_materials
      SET ${setClauses.join(', ')}
      WHERE id = $${idx}
      RETURNING *
    `, params)

    if (result.rows.length === 0) {
      return res.status(404).json(apiError('NOT_FOUND', '자재를 찾을 수 없습니다'))
    }

    res.json(apiResponse(result.rows[0]))
  } catch (err) {
    next(err)
  }
})

// ── 입출고 이력 조회 ──
/** GET /stock-logs — 입출고 이력 (material_id, type 필터) */
router.get('/stock-logs', async (req, res, next) => {
  try {
    const { material_id, type, page = 1, limit = 50 } = req.query
    const conditions = []
    const params = []
    let idx = 1

    if (material_id) {
      conditions.push(`sl.material_id = $${idx++}`)
      params.push(material_id)
    }
    if (type) {
      conditions.push(`sl.type = $${idx++}`)
      params.push(type)
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const offset = (parseInt(page) - 1) * parseInt(limit)

    const result = await query(`
      SELECT sl.*, pm.name AS material_name, pm.category
      FROM packaging_stock_logs sl
      JOIN packaging_materials pm ON sl.material_id = pm.id
      ${where}
      ORDER BY sl.created_at DESC
      LIMIT $${idx++} OFFSET $${idx++}
    `, [...params, parseInt(limit), offset])

    res.json(apiResponse(result.rows))
  } catch (err) {
    next(err)
  }
})

// ── 입출고 기록 (재고 자동 증감) ──
/** POST /stock-logs — 입출고 기록 (트랜잭션) */
router.post('/stock-logs', validate(stockLogSchema), async (req, res, next) => {
  try {
    const { material_id, type, quantity, reason, reference_id } = req.body
    const createdBy = req.user?.name || req.user?.id || 'system'

    const result = await transaction(async (client) => {
      // 자재 존재 확인
      const matResult = await client.query(
        'SELECT id, current_stock FROM packaging_materials WHERE id = $1 FOR UPDATE',
        [material_id],
      )
      if (matResult.rows.length === 0) {
        throw Object.assign(new Error('자재를 찾을 수 없습니다'), { status: 404, code: 'NOT_FOUND' })
      }

      const currentStock = matResult.rows[0].current_stock

      // 재고 변동량 계산
      let delta = 0
      if (type === 'IN') {
        delta = Math.abs(quantity)
      } else if (type === 'OUT') {
        delta = -Math.abs(quantity)
        if (currentStock + delta < 0) {
          throw Object.assign(new Error('재고가 부족합니다'), { status: 400, code: 'INSUFFICIENT_STOCK' })
        }
      } else {
        // ADJUST: quantity 자체가 증감값 (양수=증가, 음수=감소)
        delta = quantity
        if (currentStock + delta < 0) {
          throw Object.assign(new Error('조정 후 재고가 음수가 됩니다'), { status: 400, code: 'NEGATIVE_STOCK' })
        }
      }

      // 재고 업데이트
      await client.query(
        'UPDATE packaging_materials SET current_stock = current_stock + $1, updated_at = NOW() WHERE id = $2',
        [delta, material_id],
      )

      // 이력 기록
      const logResult = await client.query(`
        INSERT INTO packaging_stock_logs (material_id, type, quantity, reason, reference_id, created_by)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `, [material_id, type, quantity, reason, reference_id, createdBy])

      return logResult.rows[0]
    })

    res.status(201).json(apiResponse(result))
  } catch (err) {
    if (err.code === 'NOT_FOUND') {
      return res.status(404).json(apiError('NOT_FOUND', err.message))
    }
    if (err.code === 'INSUFFICIENT_STOCK' || err.code === 'NEGATIVE_STOCK') {
      return res.status(400).json(apiError(err.code, err.message))
    }
    next(err)
  }
})

// ── 발주 목록 ──
/** GET /orders — 발주 목록 (status 필터) */
router.get('/orders', async (req, res, next) => {
  try {
    const { status, page = 1, limit = 50 } = req.query
    const conditions = []
    const params = []
    let idx = 1

    if (status) {
      conditions.push(`po.status = $${idx++}`)
      params.push(status)
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const offset = (parseInt(page) - 1) * parseInt(limit)

    const result = await query(`
      SELECT po.*, pm.name AS material_name, pm.category, pm.unit
      FROM packaging_orders po
      JOIN packaging_materials pm ON po.material_id = pm.id
      ${where}
      ORDER BY po.created_at DESC
      LIMIT $${idx++} OFFSET $${idx++}
    `, [...params, parseInt(limit), offset])

    res.json(apiResponse(result.rows))
  } catch (err) {
    next(err)
  }
})

// ── 발주 등록 ──
/** POST /orders — 발주 등록 */
router.post('/orders', validate(orderSchema), async (req, res, next) => {
  try {
    const o = req.body
    const totalCost = o.order_qty * o.unit_cost

    // 자재 존재 확인
    const matCheck = await query('SELECT id, supplier_name FROM packaging_materials WHERE id = $1', [o.material_id])
    if (matCheck.rows.length === 0) {
      return res.status(404).json(apiError('NOT_FOUND', '자재를 찾을 수 없습니다'))
    }

    const supplierName = o.supplier_name || matCheck.rows[0].supplier_name

    const result = await query(`
      INSERT INTO packaging_orders (
        material_id, order_qty, unit_cost, total_cost,
        status, supplier_name, expected_at, notes
      ) VALUES ($1,$2,$3,$4,'DRAFT',$5,$6,$7)
      RETURNING *
    `, [o.material_id, o.order_qty, o.unit_cost, totalCost, supplierName, o.expected_at, o.notes])

    res.status(201).json(apiResponse(result.rows[0]))
  } catch (err) {
    next(err)
  }
})

// ── 발주 상태 변경 ──
/** PUT /orders/:id — 발주 상태 변경 (RECEIVED 시 자동 입고) */
router.put('/orders/:id', validate(orderUpdateSchema), async (req, res, next) => {
  try {
    const { id } = req.params
    const { status, received_qty, notes } = req.body

    const result = await transaction(async (client) => {
      // 현재 발주 조회
      const orderResult = await client.query(
        'SELECT * FROM packaging_orders WHERE id = $1 FOR UPDATE',
        [id],
      )
      if (orderResult.rows.length === 0) {
        throw Object.assign(new Error('발주를 찾을 수 없습니다'), { status: 404, code: 'NOT_FOUND' })
      }

      const order = orderResult.rows[0]

      // 상태 전이 검증
      const validTransitions = {
        DRAFT: ['ORDERED', 'CANCELLED'],
        ORDERED: ['SHIPPED', 'CANCELLED'],
        SHIPPED: ['RECEIVED', 'CANCELLED'],
        RECEIVED: [],
        CANCELLED: [],
      }
      if (!validTransitions[order.status]?.includes(status)) {
        throw Object.assign(
          new Error(`${order.status} → ${status} 전환이 불가합니다`),
          { status: 400, code: 'INVALID_TRANSITION' },
        )
      }

      // 상태별 추가 필드 설정
      const updates = { status, updated_at: 'NOW()' }
      if (status === 'ORDERED') {
        updates.ordered_at = new Date().toISOString()
      }
      if (status === 'RECEIVED') {
        const qty = received_qty || order.order_qty
        updates.received_at = new Date().toISOString()
        updates.received_qty = qty

        // 자동 입고 처리: current_stock 증가 + stock_log 기록
        await client.query(
          'UPDATE packaging_materials SET current_stock = current_stock + $1, updated_at = NOW() WHERE id = $2',
          [qty, order.material_id],
        )
        await client.query(`
          INSERT INTO packaging_stock_logs (material_id, type, quantity, reason, reference_id, created_by)
          VALUES ($1, 'IN', $2, '발주 입고', $3, $4)
        `, [order.material_id, qty, id, req.user?.name || 'system'])
      }

      // 발주 업데이트 빌드
      const setClauses = []
      const params = []
      let idx = 1

      setClauses.push(`status = $${idx++}`)
      params.push(status)

      if (updates.ordered_at) {
        setClauses.push(`ordered_at = $${idx++}`)
        params.push(updates.ordered_at)
      }
      if (updates.received_at) {
        setClauses.push(`received_at = $${idx++}`)
        params.push(updates.received_at)
      }
      if (updates.received_qty !== undefined) {
        setClauses.push(`received_qty = $${idx++}`)
        params.push(updates.received_qty)
      }
      if (notes !== undefined) {
        setClauses.push(`notes = $${idx++}`)
        params.push(notes)
      }
      setClauses.push('updated_at = NOW()')

      params.push(id)
      const updateResult = await client.query(`
        UPDATE packaging_orders SET ${setClauses.join(', ')} WHERE id = $${idx}
        RETURNING *
      `, params)

      return updateResult.rows[0]
    })

    res.json(apiResponse(result))
  } catch (err) {
    if (err.code === 'NOT_FOUND') {
      return res.status(404).json(apiError('NOT_FOUND', err.message))
    }
    if (err.code === 'INVALID_TRANSITION') {
      return res.status(400).json(apiError('INVALID_TRANSITION', err.message))
    }
    next(err)
  }
})

// ── 소요량 예측 ──
/** GET /demand-forecast?period=week — 소요량 예측 */
router.get('/demand-forecast', async (req, res, next) => {
  try {
    // 1) 이번 주 구독 배송 + 미처리 주문에서 SKU별 수량 합산
    const pendingOrders = await query(`
      SELECT s.code AS sku_code, SUM(oi.quantity) AS total_qty
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      JOIN skus s ON oi.sku_id = s.id
      WHERE o.status IN ('PENDING', 'PAID', 'PROCESSING', 'PACKED')
        AND o.deleted_at IS NULL
      GROUP BY s.code
    `)

    // 구독 배송 (이번 주) — 테이블 미존재 시 빈 결과
    let subscriptionOrders = { rows: [] }
    try {
      subscriptionOrders = await query(`
        SELECT si.sku_code, SUM(si.quantity) AS total_qty
        FROM subscription_items si
        JOIN subscriptions s ON si.subscription_id = s.id
        WHERE s.status = 'ACTIVE'
          AND s.deleted_at IS NULL
        GROUP BY si.sku_code
      `)
    } catch (e) {
      // subscription_items 테이블이 없을 수 있음 (42P01)
    }

    // SKU별 합산
    /** @type {Record<string, number>} */
    const skuDemand = {}
    for (const row of pendingOrders.rows) {
      skuDemand[row.sku_code] = (skuDemand[row.sku_code] || 0) + parseInt(row.total_qty)
    }
    for (const row of subscriptionOrders.rows) {
      skuDemand[row.sku_code] = (skuDemand[row.sku_code] || 0) + parseInt(row.total_qty)
    }

    // 2) 자재 목록 조회
    const materials = await query('SELECT * FROM packaging_materials ORDER BY category, name')

    // 3) SKU → 자재 매핑으로 소요량 계산
    // 1개 제품 = 페트병 1 + 캡 1 + 라벨 1
    const demandByMaterial = materials.rows.map((mat) => {
      let needed = 0

      if (['PET_BOTTLE', 'CAP', 'LABEL'].includes(mat.category)) {
        // 제품 1개당 1개씩 필요
        for (const skuCode of (mat.sku_mapping || [])) {
          needed += skuDemand[skuCode] || 0
        }
      } else if (mat.category === 'BOX') {
        // 배송건수 기준 (주문 1건 = 박스 1개 추정)
        const totalShipments = Object.values(skuDemand).reduce((sum, qty) => sum + qty, 0)
        // 매핑된 SKU가 있는 주문만 계산
        const mappedDemand = (mat.sku_mapping || []).reduce(
          (sum, code) => sum + (skuDemand[code] || 0), 0,
        )
        // 박스는 배송 단위 — 대략 주문수량/6 (소박스), /3 (중박스), /10 (대박스) 추정
        if (mat.name.includes('소')) {
          needed = Math.ceil(mappedDemand / 6)
        } else if (mat.name.includes('중')) {
          needed = Math.ceil(mappedDemand / 3)
        } else {
          needed = Math.ceil(mappedDemand / 10)
        }
      } else if (mat.category === 'ICE_PACK') {
        // 배송건당 아이스팩 1개
        const mappedDemand = (mat.sku_mapping || []).reduce(
          (sum, code) => sum + (skuDemand[code] || 0), 0,
        )
        if (mat.name.includes('350')) {
          needed = Math.ceil(mappedDemand / 6)
        } else {
          needed = Math.ceil(mappedDemand / 3)
        }
      } else if (mat.category === 'TAPE') {
        // 테이프: 배송 50건당 1롤
        const totalShipments = Object.values(skuDemand).reduce((sum, qty) => sum + qty, 0)
        needed = Math.ceil(totalShipments / 50)
      }

      const shortage = Math.max(0, needed - mat.current_stock)

      return {
        material_id: mat.id,
        material_name: mat.name,
        category: mat.category,
        current_stock: mat.current_stock,
        safety_stock: mat.safety_stock,
        needed,
        shortage,
        below_safety: mat.current_stock < mat.safety_stock,
      }
    })

    // 4) 부족 자재만 필터
    const shortages = demandByMaterial.filter((d) => d.shortage > 0 || d.below_safety)

    res.json(apiResponse({
      sku_demand: skuDemand,
      demand_by_material: demandByMaterial,
      shortages,
      total_materials: materials.rows.length,
      shortage_count: shortages.length,
    }))
  } catch (err) {
    // 테이블 없을 때도 에러 없이 기본값 반환
    if (err.code === '42P01') {
      return res.json(apiResponse({
        sku_demand: {},
        demand_by_material: [],
        shortages: [],
        total_materials: 0,
        shortage_count: 0,
      }))
    }
    next(err)
  }
})

module.exports = router
