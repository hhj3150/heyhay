/**
 * @fileoverview 통합 출하 관리 API
 *
 * POST   /api/v1/factory/shipments              — 지시서 생성 (PLANNED)
 * GET    /api/v1/factory/shipments              — 목록 (channel/partner/date/status 필터)
 * GET    /api/v1/factory/shipments/today        — 당일 채널별 요약
 * GET    /api/v1/factory/shipments/stats        — 기간 통계 (group_by=channel|partner|sku)
 * GET    /api/v1/factory/shipments/:id          — 단건 + items
 * PATCH  /api/v1/factory/shipments/:id          — 상태/배송정보 수정
 * POST   /api/v1/factory/shipments/:id/confirm  — PLANNED → SHIPPED (FIFO 재고 차감)
 * POST   /api/v1/factory/shipments/:id/deliver  — SHIPPED → DELIVERED
 * POST   /api/v1/factory/shipments/:id/cancel   — 취소 (SHIPPED 상태면 재고 복구)
 */
const express = require('express')
const { z } = require('zod')
const { query, transaction } = require('../../config/database')
const { validate } = require('../../middleware/validate')
const {
  apiResponse, apiError,
  SHIPMENT_STATUS, SHIPMENT_CHANNEL,
  CHANNEL_MOVEMENT_TYPE, CHANNEL_PRICE_KEY,
} = require('../../lib/shared')

const router = express.Router()

// ============================================================
// 스키마
// ============================================================

const dateRegex = /^\d{4}-\d{2}-\d{2}$/

const itemSchema = z.object({
  sku_id: z.string().uuid(),
  quantity: z.number().int().positive(),
  unit_price: z.number().int().min(0).optional(), // 미입력 시 sku_prices에서 lookup
})

const createSchema = z.object({
  channel: z.enum(['B2B', 'CAFE', 'SMARTSTORE', 'OWN_MALL']),
  partner_id: z.string().uuid().optional(),
  order_id: z.string().uuid().optional(),
  planned_date: z.string().regex(dateRegex),
  destination: z.string().max(500).optional(),
  vehicle_no: z.string().max(20).optional(),
  driver_name: z.string().max(50).optional(),
  driver_phone: z.string().max(20).optional(),
  delivery_memo: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(itemSchema).min(1),
}).refine(
  (d) => d.channel !== 'B2B' || !!d.partner_id,
  { message: 'B2B 채널은 partner_id 필수', path: ['partner_id'] },
).refine(
  (d) => !['SMARTSTORE', 'OWN_MALL'].includes(d.channel) || !!d.order_id,
  { message: 'SMARTSTORE/OWN_MALL 채널은 order_id 필수', path: ['order_id'] },
)

const patchSchema = z.object({
  planned_date: z.string().regex(dateRegex).optional(),
  destination: z.string().max(500).optional(),
  vehicle_no: z.string().max(20).optional(),
  driver_name: z.string().max(50).optional(),
  driver_phone: z.string().max(20).optional(),
  delivery_memo: z.string().optional(),
  notes: z.string().optional(),
}).refine(
  (d) => Object.keys(d).length > 0,
  { message: '수정할 항목이 없습니다' },
)

const cancelSchema = z.object({
  reason: z.string().optional(),
})

// ============================================================
// 내부 헬퍼
// ============================================================

/**
 * 출하 번호 채번: SHP-YYYYMMDD-NNN
 * 트랜잭션 advisory lock 으로 동일 일자 동시 채번 충돌 방지
 * @param {import('pg').PoolClient} client
 * @param {string} plannedDate - YYYY-MM-DD
 */
async function nextShipmentNo(client, plannedDate) {
  const dateStr = plannedDate.replace(/-/g, '')
  // 일자 기반 락 키 (정수 8자리)
  await client.query('SELECT pg_advisory_xact_lock($1)', [parseInt(dateStr, 10)])
  const seqRes = await client.query(`
    SELECT COUNT(*) + 1 AS seq FROM shipments
    WHERE shipment_no LIKE $1
  `, [`SHP-${dateStr}-%`])
  const seq = String(seqRes.rows[0].seq).padStart(3, '0')
  return `SHP-${dateStr}-${seq}`
}

/**
 * 단가 fallback: sku_prices에서 채널별 활성 단가 조회
 * @returns {Promise<number>} 단가 (없으면 0)
 */
async function lookupPrice(client, skuId, channel) {
  const channelKey = CHANNEL_PRICE_KEY[channel]
  const res = await client.query(`
    SELECT unit_price FROM sku_prices
    WHERE sku_id = $1 AND channel = $2
      AND effective_from <= CURRENT_DATE
      AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
    ORDER BY effective_from DESC
    LIMIT 1
  `, [skuId, channelKey])
  return res.rows[0]?.unit_price ?? 0
}

/**
 * shipment 단건 조회 (items 포함)
 */
async function fetchShipmentWithItems(shipmentId) {
  const headRes = await query(`
    SELECT s.*,
      p.name AS partner_name,
      o.order_number AS order_number
    FROM shipments s
    LEFT JOIN b2b_partners p ON s.partner_id = p.id
    LEFT JOIN orders o ON s.order_id = o.id
    WHERE s.id = $1 AND s.deleted_at IS NULL
  `, [shipmentId])

  if (headRes.rows.length === 0) return null

  const itemsRes = await query(`
    SELECT si.*, sk.code AS sku_code, sk.name AS sku_name,
      pb.batch_id AS batch_no
    FROM shipment_items si
    JOIN skus sk ON si.sku_id = sk.id
    LEFT JOIN production_batches pb ON si.batch_id = pb.id
    WHERE si.shipment_id = $1
    ORDER BY si.created_at ASC
  `, [shipmentId])

  return { ...headRes.rows[0], items: itemsRes.rows }
}

// ============================================================
// 정적 경로 (today / stats) — :id 라우트보다 먼저 정의
// ============================================================

/** GET /today — 당일 채널별 출하 요약 */
router.get('/today', async (req, res, next) => {
  try {
    const result = await query(`
      SELECT channel,
        COUNT(*) AS shipment_count,
        COUNT(*) FILTER (WHERE status IN ('SHIPPED','DELIVERED')) AS shipped_count,
        COUNT(*) FILTER (WHERE status = 'PLANNED') AS planned_count,
        COALESCE(SUM(total_amount) FILTER (WHERE status IN ('SHIPPED','DELIVERED')), 0) AS shipped_amount
      FROM shipments
      WHERE planned_date = CURRENT_DATE AND deleted_at IS NULL
      GROUP BY channel
      ORDER BY channel
    `)

    const totalRes = await query(`
      SELECT
        COUNT(*) AS total_count,
        COUNT(*) FILTER (WHERE status IN ('SHIPPED','DELIVERED')) AS shipped_count,
        COALESCE(SUM(total_amount) FILTER (WHERE status IN ('SHIPPED','DELIVERED')), 0) AS shipped_amount
      FROM shipments
      WHERE planned_date = CURRENT_DATE AND deleted_at IS NULL
    `)

    res.json(apiResponse({
      by_channel: result.rows,
      total: totalRes.rows[0],
    }))
  } catch (err) {
    next(err)
  }
})

/** GET /stats — 기간 통계 (group_by=channel|partner|sku) */
router.get('/stats', async (req, res, next) => {
  try {
    const dateFrom = req.query.date_from
    const dateTo = req.query.date_to
    const groupBy = req.query.group_by || 'channel'

    if (!dateFrom || !dateTo || !dateRegex.test(dateFrom) || !dateRegex.test(dateTo)) {
      return res.status(400).json(apiError(
        'VALIDATION_ERROR',
        'date_from / date_to (YYYY-MM-DD) 필수',
      ))
    }
    if (!['channel', 'partner', 'sku'].includes(groupBy)) {
      return res.status(400).json(apiError(
        'VALIDATION_ERROR',
        'group_by 는 channel|partner|sku 중 하나',
      ))
    }

    let sql
    if (groupBy === 'channel') {
      sql = `
        SELECT channel AS group_key, channel AS group_label,
          COUNT(*) AS shipment_count,
          COALESCE(SUM(total_amount), 0) AS total_amount,
          COALESCE(SUM(
            (SELECT SUM(quantity) FROM shipment_items WHERE shipment_id = s.id)
          ), 0) AS total_quantity
        FROM shipments s
        WHERE planned_date BETWEEN $1 AND $2
          AND status IN ('SHIPPED','DELIVERED')
          AND deleted_at IS NULL
        GROUP BY channel
        ORDER BY total_amount DESC
      `
    } else if (groupBy === 'partner') {
      sql = `
        SELECT s.partner_id::text AS group_key,
          COALESCE(p.name, '(없음)') AS group_label,
          COUNT(*) AS shipment_count,
          COALESCE(SUM(s.total_amount), 0) AS total_amount,
          COALESCE(SUM(
            (SELECT SUM(quantity) FROM shipment_items WHERE shipment_id = s.id)
          ), 0) AS total_quantity
        FROM shipments s
        LEFT JOIN b2b_partners p ON s.partner_id = p.id
        WHERE s.planned_date BETWEEN $1 AND $2
          AND s.status IN ('SHIPPED','DELIVERED')
          AND s.deleted_at IS NULL
        GROUP BY s.partner_id, p.name
        ORDER BY total_amount DESC
      `
    } else {
      sql = `
        SELECT sk.id::text AS group_key,
          sk.code AS group_label,
          sk.name AS sku_name,
          COUNT(DISTINCT s.id) AS shipment_count,
          COALESCE(SUM(si.quantity), 0) AS total_quantity,
          COALESCE(SUM(si.subtotal), 0) AS total_amount
        FROM shipments s
        JOIN shipment_items si ON si.shipment_id = s.id
        JOIN skus sk ON si.sku_id = sk.id
        WHERE s.planned_date BETWEEN $1 AND $2
          AND s.status IN ('SHIPPED','DELIVERED')
          AND s.deleted_at IS NULL
        GROUP BY sk.id, sk.code, sk.name
        ORDER BY total_quantity DESC
      `
    }

    const result = await query(sql, [dateFrom, dateTo])
    res.json(apiResponse(result.rows, { group_by: groupBy, date_from: dateFrom, date_to: dateTo }))
  } catch (err) {
    next(err)
  }
})

// ============================================================
// 목록 + 생성
// ============================================================

/** GET / — 목록 */
router.get('/', async (req, res, next) => {
  try {
    const {
      channel, partner_id, order_id, status,
      date_from, date_to,
      page = 1, limit = 30,
    } = req.query

    const conditions = ['s.deleted_at IS NULL']
    const params = []
    let idx = 1

    if (channel) { conditions.push(`s.channel = $${idx++}`); params.push(channel) }
    if (partner_id) { conditions.push(`s.partner_id = $${idx++}`); params.push(partner_id) }
    if (order_id) { conditions.push(`s.order_id = $${idx++}`); params.push(order_id) }
    if (status) { conditions.push(`s.status = $${idx++}`); params.push(status) }
    if (date_from) { conditions.push(`s.planned_date >= $${idx++}`); params.push(date_from) }
    if (date_to) { conditions.push(`s.planned_date <= $${idx++}`); params.push(date_to) }

    const where = conditions.join(' AND ')
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10)

    const result = await query(`
      SELECT s.id, s.shipment_no, s.channel, s.status,
        s.planned_date, s.shipped_at, s.delivered_at,
        s.partner_id, p.name AS partner_name,
        s.order_id, o.order_number,
        s.vehicle_no, s.driver_name, s.destination,
        s.total_amount, s.created_at,
        (SELECT COUNT(*) FROM shipment_items WHERE shipment_id = s.id) AS item_count
      FROM shipments s
      LEFT JOIN b2b_partners p ON s.partner_id = p.id
      LEFT JOIN orders o ON s.order_id = o.id
      WHERE ${where}
      ORDER BY s.planned_date DESC, s.created_at DESC
      LIMIT $${idx++} OFFSET $${idx++}
    `, [...params, parseInt(limit, 10), offset])

    res.json(apiResponse(result.rows))
  } catch (err) {
    next(err)
  }
})

/** POST / — 출하 지시서 생성 */
router.post('/', validate(createSchema), async (req, res, next) => {
  try {
    const b = req.body

    const result = await transaction(async (client) => {
      const shipmentNo = await nextShipmentNo(client, b.planned_date)

      // items 단가 보정 + 합계 계산
      const itemsResolved = []
      let totalAmount = 0
      for (const it of b.items) {
        const unitPrice = it.unit_price ?? await lookupPrice(client, it.sku_id, b.channel)
        const subtotal = unitPrice * it.quantity
        itemsResolved.push({ ...it, unit_price: unitPrice, subtotal })
        totalAmount += subtotal
      }

      const headRes = await client.query(`
        INSERT INTO shipments (
          shipment_no, channel, partner_id, order_id, status,
          planned_date, vehicle_no, driver_name, driver_phone,
          destination, delivery_memo, total_amount, notes, created_by
        ) VALUES ($1,$2,$3,$4,'PLANNED',$5,$6,$7,$8,$9,$10,$11,$12,$13)
        RETURNING *
      `, [
        shipmentNo, b.channel, b.partner_id || null, b.order_id || null,
        b.planned_date, b.vehicle_no || null, b.driver_name || null, b.driver_phone || null,
        b.destination || null, b.delivery_memo || null, totalAmount, b.notes || null,
        req.user?.id || null,
      ])

      const shipment = headRes.rows[0]
      const insertedItems = []
      for (const it of itemsResolved) {
        const itemRes = await client.query(`
          INSERT INTO shipment_items (shipment_id, sku_id, quantity, unit_price, subtotal)
          VALUES ($1,$2,$3,$4,$5)
          RETURNING *
        `, [shipment.id, it.sku_id, it.quantity, it.unit_price, it.subtotal])
        insertedItems.push(itemRes.rows[0])
      }

      return { ...shipment, items: insertedItems }
    })

    res.status(201).json(apiResponse(result))
  } catch (err) {
    next(err)
  }
})

// ============================================================
// 단건 조회 / 수정
// ============================================================

/** GET /:id — 단건 조회 */
router.get('/:id', async (req, res, next) => {
  try {
    const data = await fetchShipmentWithItems(req.params.id)
    if (!data) {
      return res.status(404).json(apiError('SHIPMENT_NOT_FOUND', '출하 정보를 찾을 수 없습니다'))
    }
    res.json(apiResponse(data))
  } catch (err) {
    next(err)
  }
})

/** PATCH /:id — 배송정보/일정 수정 (CANCELLED 상태에서는 거부) */
router.patch('/:id', validate(patchSchema), async (req, res, next) => {
  try {
    const id = req.params.id
    const b = req.body

    const cur = await query('SELECT status FROM shipments WHERE id = $1 AND deleted_at IS NULL', [id])
    if (cur.rows.length === 0) {
      return res.status(404).json(apiError('SHIPMENT_NOT_FOUND', '출하 정보를 찾을 수 없습니다'))
    }
    if (cur.rows[0].status === SHIPMENT_STATUS.CANCELLED) {
      return res.status(400).json(apiError('INVALID_STATUS', '취소된 출하는 수정할 수 없습니다'))
    }

    const sets = []
    const params = []
    let idx = 1
    const fields = ['planned_date', 'destination', 'vehicle_no', 'driver_name', 'driver_phone', 'delivery_memo', 'notes']
    for (const f of fields) {
      if (b[f] !== undefined) {
        sets.push(`${f} = $${idx++}`)
        params.push(b[f])
      }
    }
    sets.push('updated_at = NOW()')
    params.push(id)

    const result = await query(
      `UPDATE shipments SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      params,
    )
    res.json(apiResponse(result.rows[0]))
  } catch (err) {
    next(err)
  }
})

// ============================================================
// 상태 전이: confirm / deliver / cancel
// ============================================================

/** POST /:id/confirm — PLANNED → SHIPPED (FIFO 재고 차감) */
router.post('/:id/confirm', async (req, res, next) => {
  try {
    const id = req.params.id

    const result = await transaction(async (client) => {
      const headRes = await client.query(
        'SELECT * FROM shipments WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
        [id],
      )
      if (headRes.rows.length === 0) {
        throw Object.assign(new Error('출하 정보를 찾을 수 없습니다'), {
          status: 404, code: 'SHIPMENT_NOT_FOUND',
        })
      }
      const shipment = headRes.rows[0]
      if (shipment.status !== SHIPMENT_STATUS.PLANNED && shipment.status !== SHIPMENT_STATUS.PICKED) {
        throw Object.assign(new Error(`현재 상태(${shipment.status})에서는 확정할 수 없습니다`), {
          status: 400, code: 'INVALID_STATUS',
        })
      }

      const itemsRes = await client.query(
        'SELECT * FROM shipment_items WHERE shipment_id = $1 ORDER BY created_at ASC',
        [id],
      )

      const movementType = CHANNEL_MOVEMENT_TYPE[shipment.channel]

      // 각 item 별 FIFO 차감
      for (const item of itemsRes.rows) {
        const invRows = await client.query(`
          SELECT id, batch_id, quantity FROM inventory
          WHERE sku_id = $1 AND quantity > 0 AND location = 'FACTORY_COLD'
          ORDER BY expiry_date ASC NULLS LAST, created_at ASC
          FOR UPDATE
        `, [item.sku_id])

        let remaining = item.quantity
        let firstBatchId = null

        for (const inv of invRows.rows) {
          if (remaining <= 0) break
          const deduct = Math.min(remaining, inv.quantity)
          await client.query(
            'UPDATE inventory SET quantity = quantity - $1, updated_at = NOW() WHERE id = $2',
            [deduct, inv.id],
          )
          await client.query(`
            INSERT INTO inventory_movements (
              sku_id, batch_id, movement_type, quantity, location,
              reference_id, reference_type, reason, recorded_by
            ) VALUES ($1, $2, $3, $4, 'FACTORY_COLD', $5, 'shipment', $6, $7)
          `, [
            item.sku_id, inv.batch_id, movementType, -deduct,
            shipment.id, `출하 ${shipment.shipment_no}`, req.user?.id || null,
          ])
          if (firstBatchId === null) firstBatchId = inv.batch_id
          remaining -= deduct
        }

        if (remaining > 0) {
          throw Object.assign(new Error(`재고 부족 (sku_id=${item.sku_id}, 부족=${remaining})`), {
            status: 400, code: 'INSUFFICIENT_STOCK',
          })
        }

        if (firstBatchId) {
          await client.query(
            'UPDATE shipment_items SET batch_id = $1 WHERE id = $2',
            [firstBatchId, item.id],
          )
        }
      }

      const updRes = await client.query(`
        UPDATE shipments
        SET status = 'SHIPPED', shipped_at = NOW(), shipped_by = $1, updated_at = NOW()
        WHERE id = $2
        RETURNING *
      `, [req.user?.id || null, id])

      return updRes.rows[0]
    })

    res.json(apiResponse(result))
  } catch (err) {
    if (err.code === 'INSUFFICIENT_STOCK') {
      return res.status(400).json(apiError('INSUFFICIENT_STOCK', err.message))
    }
    if (err.code === 'INVALID_STATUS') {
      return res.status(400).json(apiError('INVALID_STATUS', err.message))
    }
    if (err.code === 'SHIPMENT_NOT_FOUND') {
      return res.status(404).json(apiError('SHIPMENT_NOT_FOUND', err.message))
    }
    next(err)
  }
})

/** POST /:id/deliver — SHIPPED → DELIVERED */
router.post('/:id/deliver', async (req, res, next) => {
  try {
    const result = await query(`
      UPDATE shipments
      SET status = 'DELIVERED', delivered_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND status = 'SHIPPED' AND deleted_at IS NULL
      RETURNING *
    `, [req.params.id])

    if (result.rows.length === 0) {
      return res.status(400).json(apiError(
        'INVALID_STATUS',
        'SHIPPED 상태의 출하만 배송완료 처리 가능',
      ))
    }
    res.json(apiResponse(result.rows[0]))
  } catch (err) {
    next(err)
  }
})

/** POST /:id/cancel — 취소 (SHIPPED 상태면 재고 복구) */
router.post('/:id/cancel', validate(cancelSchema), async (req, res, next) => {
  try {
    const id = req.params.id
    const reason = req.body?.reason || '출하 취소'

    const result = await transaction(async (client) => {
      const headRes = await client.query(
        'SELECT * FROM shipments WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
        [id],
      )
      if (headRes.rows.length === 0) {
        throw Object.assign(new Error('출하 정보를 찾을 수 없습니다'), {
          status: 404, code: 'SHIPMENT_NOT_FOUND',
        })
      }
      const shipment = headRes.rows[0]
      if (shipment.status === SHIPMENT_STATUS.CANCELLED) {
        throw Object.assign(new Error('이미 취소된 출하입니다'), {
          status: 400, code: 'INVALID_STATUS',
        })
      }
      if (shipment.status === SHIPMENT_STATUS.DELIVERED) {
        throw Object.assign(new Error('배송완료된 출하는 취소할 수 없습니다'), {
          status: 400, code: 'INVALID_STATUS',
        })
      }

      // SHIPPED 상태였다면 재고 복구
      const needRestore = shipment.status === SHIPMENT_STATUS.SHIPPED
      if (needRestore) {
        const itemsRes = await client.query(
          'SELECT * FROM shipment_items WHERE shipment_id = $1',
          [id],
        )
        const movementType = CHANNEL_MOVEMENT_TYPE[shipment.channel]

        for (const item of itemsRes.rows) {
          // 차감했던 배치로 환원 (없으면 신규 inventory 행 생성은 생략 — 운영상 batch_id 기록됨)
          if (item.batch_id) {
            const invRes = await client.query(`
              SELECT id FROM inventory
              WHERE sku_id = $1 AND batch_id = $2 AND location = 'FACTORY_COLD'
              LIMIT 1
            `, [item.sku_id, item.batch_id])

            if (invRes.rows.length > 0) {
              await client.query(
                'UPDATE inventory SET quantity = quantity + $1, updated_at = NOW() WHERE id = $2',
                [item.quantity, invRes.rows[0].id],
              )
            } else {
              // 인벤토리 행이 사라진 예외 케이스: 신규 행 추가
              const batchRes = await client.query(
                'SELECT expiry_date FROM production_batches WHERE id = $1',
                [item.batch_id],
              )
              await client.query(`
                INSERT INTO inventory (sku_id, batch_id, location, quantity, expiry_date)
                VALUES ($1, $2, 'FACTORY_COLD', $3, $4)
              `, [item.sku_id, item.batch_id, item.quantity, batchRes.rows[0]?.expiry_date || null])
            }
          }

          // 역방향 movement (양수)
          await client.query(`
            INSERT INTO inventory_movements (
              sku_id, batch_id, movement_type, quantity, location,
              reference_id, reference_type, reason, recorded_by
            ) VALUES ($1, $2, 'ADJUSTMENT', $3, 'FACTORY_COLD', $4, 'shipment_cancel', $5, $6)
          `, [
            item.sku_id, item.batch_id, item.quantity,
            shipment.id, `출하취소 ${shipment.shipment_no} (${reason})`,
            req.user?.id || null,
          ])
        }
      }

      const updRes = await client.query(`
        UPDATE shipments
        SET status = 'CANCELLED', updated_at = NOW(),
          notes = COALESCE(notes, '') ||
            CASE WHEN COALESCE(notes,'') = '' THEN '' ELSE E'\n' END ||
            '[취소] ' || $1
        WHERE id = $2
        RETURNING *
      `, [reason, id])

      return updRes.rows[0]
    })

    res.json(apiResponse(result))
  } catch (err) {
    if (err.code === 'INVALID_STATUS') {
      return res.status(400).json(apiError('INVALID_STATUS', err.message))
    }
    if (err.code === 'SHIPMENT_NOT_FOUND') {
      return res.status(404).json(apiError('SHIPMENT_NOT_FOUND', err.message))
    }
    next(err)
  }
})

module.exports = router
