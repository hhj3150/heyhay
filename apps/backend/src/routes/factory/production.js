/**
 * @fileoverview SKU 생산 배치 + 재고 관리 API
 * GET    /api/v1/factory/skus              — SKU 마스터 목록
 * POST   /api/v1/factory/batches           — 생산 배치 등록
 * GET    /api/v1/factory/batches           — 배치 목록
 * GET    /api/v1/factory/inventory         — 현재 재고 현황
 * GET    /api/v1/factory/inventory/alerts  — 안전재고 미달 알림
 * POST   /api/v1/factory/inventory/move    — 재고 이동 (출고)
 */
const express = require('express')
const { z } = require('zod')
const { query, transaction } = require('../../config/database')
const { validate } = require('../../middleware/validate')
const { apiResponse, apiError } = require('@heyhay/shared')

const router = express.Router()

const batchSchema = z.object({
  sku_id: z.string().uuid(),
  produced_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  quantity: z.number().int().positive(),
  raw_milk_used_l: z.number().positive(),
  material_cost: z.number().int().min(0).optional(),
  labor_cost: z.number().int().min(0).optional(),
  overhead_cost: z.number().int().min(0).optional(),
  raw_milk_receipt_id: z.string().uuid().optional(),
  notes: z.string().optional(),
})

const moveSchema = z.object({
  sku_id: z.string().uuid(),
  batch_id: z.string().uuid().optional(),
  movement_type: z.enum(['SALE', 'CAFE_OUT', 'B2B_OUT', 'DISCARD', 'ADJUSTMENT']),
  quantity: z.number().int(),
  location: z.string().optional(),
  reference_id: z.string().uuid().optional(),
  reference_type: z.string().optional(),
  reason: z.string().optional(),
})

/** GET /skus — SKU 마스터 목록 */
router.get('/skus', async (req, res, next) => {
  try {
    const result = await query('SELECT * FROM skus WHERE is_active = true ORDER BY code')
    res.json(apiResponse(result.rows))
  } catch (err) {
    next(err)
  }
})

/** POST /batches — 생산 배치 등록 */
router.post('/batches', validate(batchSchema), async (req, res, next) => {
  try {
    const b = req.body

    // SKU 정보 조회 (소비기한 계산용)
    const skuResult = await query('SELECT * FROM skus WHERE id = $1', [b.sku_id])
    if (skuResult.rows.length === 0) {
      return res.status(404).json(apiError('SKU_NOT_FOUND', 'SKU를 찾을 수 없습니다'))
    }
    const sku = skuResult.rows[0]

    // 배치 ID 자동 생성: YYYYMMDD-SKU코드-seq
    const dateStr = b.produced_at.replace(/-/g, '')
    const seqResult = await query(`
      SELECT COUNT(*) + 1 AS seq FROM production_batches
      WHERE batch_id LIKE $1
    `, [`${dateStr}-${sku.code}-%`])
    const seq = String(seqResult.rows[0].seq).padStart(3, '0')
    const batchId = `${dateStr}-${sku.code}-${seq}`

    // 소비기한 자동 계산
    const producedDate = new Date(b.produced_at)
    producedDate.setDate(producedDate.getDate() + sku.shelf_days)
    const expiryDate = producedDate.toISOString().split('T')[0]

    // 개당 원가 자동 계산
    const totalCost = (b.material_cost || 0) + (b.labor_cost || 0) + (b.overhead_cost || 0)
    const unitCost = b.quantity > 0 ? Math.round(totalCost / b.quantity) : 0

    const result = await transaction(async (client) => {
      // 배치 등록
      const batchResult = await client.query(`
        INSERT INTO production_batches (
          batch_id, sku_id, produced_at, quantity, raw_milk_used_l,
          material_cost, labor_cost, overhead_cost, unit_cost,
          expiry_date, raw_milk_receipt_id, notes
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        RETURNING *
      `, [
        batchId, b.sku_id, b.produced_at, b.quantity, b.raw_milk_used_l,
        b.material_cost, b.labor_cost, b.overhead_cost, unitCost,
        expiryDate, b.raw_milk_receipt_id, b.notes,
      ])

      // 재고 추가
      await client.query(`
        INSERT INTO inventory (sku_id, batch_id, location, quantity, expiry_date)
        VALUES ($1, $2, 'FACTORY_COLD', $3, $4)
      `, [b.sku_id, batchResult.rows[0].id, b.quantity, expiryDate])

      // 재고 변동 이력
      await client.query(`
        INSERT INTO inventory_movements (sku_id, batch_id, movement_type, quantity, location, recorded_by)
        VALUES ($1, $2, 'PRODUCTION', $3, 'FACTORY_COLD', $4)
      `, [b.sku_id, batchResult.rows[0].id, b.quantity, req.user?.id])

      return batchResult.rows[0]
    })

    res.status(201).json(apiResponse(result))
  } catch (err) {
    next(err)
  }
})

/** GET /batches — 배치 목록 */
router.get('/batches', async (req, res, next) => {
  try {
    const { sku_id, date_from, date_to, page = 1, limit = 30 } = req.query
    const conditions = ['pb.deleted_at IS NULL']
    const params = []
    let idx = 1

    if (sku_id) { conditions.push(`pb.sku_id = $${idx++}`); params.push(sku_id) }
    if (date_from) { conditions.push(`pb.produced_at >= $${idx++}`); params.push(date_from) }
    if (date_to) { conditions.push(`pb.produced_at <= $${idx++}`); params.push(date_to) }

    const offset = (parseInt(page) - 1) * parseInt(limit)
    const where = conditions.join(' AND ')

    const result = await query(`
      SELECT pb.*, s.code AS sku_code, s.name AS sku_name
      FROM production_batches pb
      JOIN skus s ON pb.sku_id = s.id
      WHERE ${where}
      ORDER BY pb.produced_at DESC
      LIMIT $${idx++} OFFSET $${idx++}
    `, [...params, parseInt(limit), offset])

    res.json(apiResponse(result.rows))
  } catch (err) {
    next(err)
  }
})

/** GET /inventory — 현재 재고 현황 (SKU별 집계) */
router.get('/inventory', async (req, res, next) => {
  try {
    const result = await query(`
      SELECT
        s.id AS sku_id, s.code, s.name, s.product_type,
        COALESCE(SUM(i.quantity), 0) AS total_qty,
        COALESCE(SUM(i.quantity) FILTER (WHERE i.location = 'FACTORY_COLD'), 0) AS factory_qty,
        COALESCE(SUM(i.quantity) FILTER (WHERE i.location = 'CAFE'), 0) AS cafe_qty,
        MIN(i.expiry_date) FILTER (WHERE i.quantity > 0) AS earliest_expiry
      FROM skus s
      LEFT JOIN inventory i ON s.id = i.sku_id AND i.quantity > 0
      WHERE s.is_active = true
      GROUP BY s.id, s.code, s.name, s.product_type
      ORDER BY s.code
    `)
    res.json(apiResponse(result.rows))
  } catch (err) {
    next(err)
  }
})

/** GET /inventory/alerts — 안전재고 미달 목록 */
router.get('/inventory/alerts', async (req, res, next) => {
  try {
    const result = await query(`
      SELECT s.code, s.name, it.channel, it.min_quantity,
        COALESCE(inv.current_qty, 0) AS current_qty,
        it.min_quantity - COALESCE(inv.current_qty, 0) AS shortage
      FROM inventory_thresholds it
      JOIN skus s ON it.sku_id = s.id
      LEFT JOIN (
        SELECT sku_id, SUM(quantity) AS current_qty
        FROM inventory WHERE quantity > 0
        GROUP BY sku_id
      ) inv ON it.sku_id = inv.sku_id
      WHERE COALESCE(inv.current_qty, 0) < it.min_quantity
      ORDER BY shortage DESC
    `)
    res.json(apiResponse(result.rows))
  } catch (err) {
    next(err)
  }
})

/** POST /inventory/move — 재고 이동 (출고) */
router.post('/inventory/move', validate(moveSchema), async (req, res, next) => {
  try {
    const m = req.body

    await transaction(async (client) => {
      // FIFO 원칙: 가장 오래된 배치부터 출고
      const inv = await client.query(`
        SELECT id, quantity, batch_id FROM inventory
        WHERE sku_id = $1 AND quantity > 0 AND location = 'FACTORY_COLD'
        ORDER BY expiry_date ASC
      `, [m.sku_id])

      let remaining = Math.abs(m.quantity)
      for (const row of inv.rows) {
        if (remaining <= 0) break
        const deduct = Math.min(remaining, row.quantity)
        await client.query(
          'UPDATE inventory SET quantity = quantity - $1, updated_at = NOW() WHERE id = $2',
          [deduct, row.id],
        )
        remaining -= deduct
      }

      if (remaining > 0) {
        throw Object.assign(new Error('재고가 부족합니다'), { status: 400, code: 'INSUFFICIENT_STOCK' })
      }

      // 변동 이력
      await client.query(`
        INSERT INTO inventory_movements (
          sku_id, batch_id, movement_type, quantity, location,
          reference_id, reference_type, reason, recorded_by
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      `, [
        m.sku_id, m.batch_id, m.movement_type, -Math.abs(m.quantity),
        m.location, m.reference_id, m.reference_type, m.reason, req.user?.id,
      ])
    })

    res.json(apiResponse({ message: '재고 이동 완료' }))
  } catch (err) {
    if (err.code === 'INSUFFICIENT_STOCK') {
      return res.status(400).json(apiError('INSUFFICIENT_STOCK', err.message))
    }
    next(err)
  }
})

module.exports = router
