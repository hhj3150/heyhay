/**
 * @fileoverview 일일 공장 운영 통합 API
 *
 * 흐름:
 *   ① 송영신 착유 → daily_milk_totals 자동 합산
 *   ② 사용자 입력: factory_intake_l (공장 필요량 = 입고량)
 *   ③ 자동 산출: dairy_promotion_l = milking - factory_intake
 *   ④ 사용자 입력: production_batches (SKU별 생산량)
 *   ⑤ 자동 산출: expected_production_milk_l (표준 환산), loss_l = intake - expected
 *   ⑥ 출하 → 재고 차감 (shipments 별도)
 *
 * 엔드포인트:
 *   GET   /api/v1/factory/daily-ops/:date          — 한 화면 통합 뷰
 *   POST  /api/v1/factory/daily-ops/:date          — 공장 필요량 입력 (upsert)
 *   POST  /api/v1/factory/daily-ops/:date/recalc   — 자동값 재계산
 *   POST  /api/v1/factory/daily-ops/:date/close    — 일일 마감 (진흥회 기록 자동 생성 + 알림)
 *   POST  /api/v1/factory/daily-ops/:date/reopen   — 마감 해제 (ADMIN)
 *   GET   /api/v1/factory/daily-ops/range/list     — 기간별 요약
 */
const express = require('express')
const { z } = require('zod')
const { query, transaction } = require('../../config/database')
const { validate } = require('../../middleware/validate')
const { apiResponse, apiError } = require('../../lib/shared')

const router = express.Router()

const dateRegex = /^\d{4}-\d{2}-\d{2}$/

const intakeSchema = z.object({
  factory_intake_l: z.number().nonnegative(),
  notes: z.string().optional(),
})

// ============================================================
// 헬퍼: 자동 산출 (착유 합계, 표준/실제 생산 환산)
// ============================================================

/**
 * 해당 일자의 자동 계산값을 갱신해서 daily_factory_ops 행을 보장한다.
 * - milking_total_l: daily_milk_totals 합산
 * - expected_production_milk_l: SUM(qty × milk_per_unit_ml at op_date)
 * - actual_production_milk_l: SUM(production_batches.raw_milk_used_l)
 *
 * @returns {Promise<object>} 갱신된 daily_factory_ops 행
 */
async function recalcOpsForDate(client, date) {
  // 행 보장
  await client.query(`
    INSERT INTO daily_factory_ops (op_date)
    VALUES ($1)
    ON CONFLICT (op_date) DO NOTHING
  `, [date])

  // 송영신 착유 합산 (daily_milk_totals.date)
  const milkRes = await client.query(`
    SELECT COALESCE(SUM(total_l), 0)::numeric AS total_l
    FROM daily_milk_totals
    WHERE date = $1
  `, [date])
  const milkingTotal = parseFloat(milkRes.rows[0].total_l)

  // 표준 환산 (생산량 × 해당일 적용 환산비)
  const expRes = await client.query(`
    SELECT COALESCE(SUM(
      pb.quantity * (
        SELECT milk_per_unit_ml FROM sku_milk_conversion c
        WHERE c.sku_id = pb.sku_id
          AND c.effective_from <= $1::date
          AND (c.effective_to IS NULL OR c.effective_to >= $1::date)
        ORDER BY c.effective_from DESC
        LIMIT 1
      )
    ), 0)::numeric AS total_ml
    FROM production_batches pb
    WHERE pb.produced_at = $1 AND pb.deleted_at IS NULL
      AND pb.status IN ('COMPLETED','IN_PROGRESS')
  `, [date])
  const expectedMilkL = parseFloat(expRes.rows[0].total_ml) / 1000

  // 실제 투입 원유
  const actRes = await client.query(`
    SELECT COALESCE(SUM(raw_milk_used_l), 0)::numeric AS total_l
    FROM production_batches
    WHERE produced_at = $1 AND deleted_at IS NULL
      AND status IN ('COMPLETED','IN_PROGRESS')
  `, [date])
  const actualMilkL = parseFloat(actRes.rows[0].total_l)

  const updRes = await client.query(`
    UPDATE daily_factory_ops
    SET milking_total_l = $1,
        expected_production_milk_l = $2,
        actual_production_milk_l = $3,
        updated_at = NOW()
    WHERE op_date = $4
    RETURNING *
  `, [milkingTotal, expectedMilkL, actualMilkL, date])

  return updRes.rows[0]
}

/**
 * 진흥회 단가 lookup
 * - settings.key in ('dairy_unit_price', 'dairy_normal_rate') 우선
 * - 없으면 system_settings(category=MILK_PRICE) 시도
 * - 둘 다 없으면 NULL 반환
 *
 * 주의: 트랜잭션 내부 client 사용 시 SQL 실패가 트랜잭션을 abort 시키므로
 * IF EXISTS 또는 to_regclass 가드 필수
 */
async function lookupDairyPromotionRate(client) {
  // settings 단순 key/value 테이블 조회
  const res = await client.query(`
    SELECT value FROM settings
    WHERE key IN ('dairy_unit_price', 'dairy_normal_rate')
    ORDER BY key DESC
    LIMIT 1
  `)
  return res.rows[0] ? parseInt(res.rows[0].value, 10) : null
}

// ============================================================
// 라우트
// ============================================================

/** GET /range/list — 기간별 요약 */
router.get('/range/list', async (req, res, next) => {
  try {
    const { from, to } = req.query
    if (!from || !to || !dateRegex.test(from) || !dateRegex.test(to)) {
      return res.status(400).json(apiError('VALIDATION_ERROR', 'from, to (YYYY-MM-DD) 필수'))
    }

    const result = await query(`
      SELECT op_date, milking_total_l, factory_intake_l,
        dairy_promotion_l, expected_production_milk_l,
        actual_production_milk_l, loss_l, is_closed
      FROM daily_factory_ops
      WHERE op_date BETWEEN $1 AND $2
      ORDER BY op_date DESC
    `, [from, to])

    const summary = await query(`
      SELECT
        COALESCE(SUM(milking_total_l), 0) AS sum_milking_l,
        COALESCE(SUM(factory_intake_l), 0) AS sum_intake_l,
        COALESCE(SUM(dairy_promotion_l), 0) AS sum_promotion_l,
        COALESCE(SUM(expected_production_milk_l), 0) AS sum_expected_l,
        COALESCE(SUM(actual_production_milk_l), 0) AS sum_actual_l,
        COALESCE(SUM(loss_l), 0) AS sum_loss_l,
        COUNT(*) FILTER (WHERE is_closed) AS closed_days,
        COUNT(*) AS total_days
      FROM daily_factory_ops
      WHERE op_date BETWEEN $1 AND $2
    `, [from, to])

    res.json(apiResponse(result.rows, { summary: summary.rows[0], from, to }))
  } catch (err) {
    next(err)
  }
})

/** GET /:date — 통합 일일 운영 뷰 */
router.get('/:date', async (req, res, next) => {
  try {
    const date = req.params.date
    if (!dateRegex.test(date)) {
      return res.status(400).json(apiError('VALIDATION_ERROR', '날짜 형식 YYYY-MM-DD'))
    }

    // 자동값 갱신 (조회 시 항상 최신 상태 보장)
    const ops = await transaction(async (client) => recalcOpsForDate(client, date))

    // 입고 상세
    const intakeDetail = await query(`
      SELECT id, amount_l, source, fat_pct, protein_pct, scc, grade,
        is_rejected, reject_reason
      FROM raw_milk_receipts
      WHERE received_date = $1 AND deleted_at IS NULL
      ORDER BY created_at ASC
    `, [date])

    // SKU별 생산량 + 환산
    const productionBySku = await query(`
      SELECT s.id AS sku_id, s.code, s.name, s.product_type,
        COALESCE(SUM(pb.quantity), 0)::int AS produced_qty,
        COALESCE(SUM(pb.raw_milk_used_l), 0) AS actual_milk_l,
        COALESCE(SUM(
          pb.quantity * (
            SELECT milk_per_unit_ml FROM sku_milk_conversion c
            WHERE c.sku_id = pb.sku_id
              AND c.effective_from <= $1::date
              AND (c.effective_to IS NULL OR c.effective_to >= $1::date)
            ORDER BY c.effective_from DESC LIMIT 1
          )
        ), 0)::numeric / 1000 AS expected_milk_l
      FROM skus s
      LEFT JOIN production_batches pb
        ON pb.sku_id = s.id
        AND pb.produced_at = $1
        AND pb.deleted_at IS NULL
        AND pb.status IN ('COMPLETED','IN_PROGRESS')
      WHERE s.is_active = true
      GROUP BY s.id, s.code, s.name, s.product_type
      ORDER BY s.code
    `, [date])

    // 출하 (채널별)
    const shipmentsByChannel = await query(`
      SELECT channel,
        COUNT(*) AS shipment_count,
        COUNT(*) FILTER (WHERE status IN ('SHIPPED','DELIVERED')) AS shipped_count,
        COALESCE(SUM(total_amount) FILTER (WHERE status IN ('SHIPPED','DELIVERED')), 0) AS shipped_amount,
        COALESCE(SUM(
          CASE WHEN status IN ('SHIPPED','DELIVERED')
               THEN (SELECT SUM(quantity) FROM shipment_items WHERE shipment_id = s.id)
               ELSE 0 END
        ), 0) AS shipped_qty
      FROM shipments s
      WHERE planned_date = $1 AND deleted_at IS NULL
      GROUP BY channel
      ORDER BY channel
    `, [date])

    // SKU별 출하 (당일)
    const shipmentsBySku = await query(`
      SELECT sk.id AS sku_id, sk.code, sk.name,
        COALESCE(SUM(si.quantity), 0)::int AS shipped_qty
      FROM skus sk
      LEFT JOIN shipment_items si ON si.sku_id = sk.id
      LEFT JOIN shipments sh ON si.shipment_id = sh.id
        AND sh.planned_date = $1
        AND sh.status IN ('SHIPPED','DELIVERED')
        AND sh.deleted_at IS NULL
      WHERE sk.is_active = true
      GROUP BY sk.id, sk.code, sk.name
      ORDER BY sk.code
    `, [date])

    // 현재 재고 (현시점)
    const inventoryNow = await query(`
      SELECT s.id AS sku_id, s.code, s.name,
        COALESCE(SUM(i.quantity), 0)::int AS qty,
        MIN(i.expiry_date) FILTER (WHERE i.quantity > 0) AS earliest_expiry
      FROM skus s
      LEFT JOIN inventory i ON s.id = i.sku_id AND i.quantity > 0
      WHERE s.is_active = true
      GROUP BY s.id, s.code, s.name
      ORDER BY s.code
    `)

    // 진흥회 납유 기록 (이미 마감된 경우)
    const promotionRes = await query(`
      SELECT * FROM dairy_promotion_deliveries WHERE delivery_date = $1
    `, [date])

    // 알림
    const alerts = []
    if (ops.factory_intake_l !== null && parseFloat(ops.dairy_promotion_l) < 0) {
      alerts.push({
        priority: 'P1',
        code: 'NEGATIVE_PROMOTION',
        message: `공장 입고량(${ops.factory_intake_l}L)이 착유량(${ops.milking_total_l}L)보다 큼 — 입력값 확인 필요`,
      })
    }
    const lossPct = ops.factory_intake_l && parseFloat(ops.factory_intake_l) > 0
      ? (parseFloat(ops.loss_l) / parseFloat(ops.factory_intake_l)) * 100
      : 0
    if (lossPct > 5) {
      alerts.push({
        priority: 'P2',
        code: 'LOSS_HIGH',
        message: `로스율 ${lossPct.toFixed(1)}% (기준 5% 초과)`,
      })
    }
    if (lossPct < -5) {
      alerts.push({
        priority: 'P2',
        code: 'LOSS_NEGATIVE',
        message: `표준 환산 대비 실제 입고가 부족 (${lossPct.toFixed(1)}%) — 환산비 점검 필요`,
      })
    }

    res.json(apiResponse({
      ops,
      intake_receipts: intakeDetail.rows,
      production_by_sku: productionBySku.rows,
      shipments_by_channel: shipmentsByChannel.rows,
      shipments_by_sku: shipmentsBySku.rows,
      inventory_now: inventoryNow.rows,
      dairy_promotion: promotionRes.rows[0] || null,
      alerts,
      derived: {
        loss_pct: parseFloat(lossPct.toFixed(2)),
      },
    }))
  } catch (err) {
    next(err)
  }
})

/** POST /:date — 공장 필요량 입력 (upsert, 마감일 차단) */
router.post('/:date', validate(intakeSchema), async (req, res, next) => {
  try {
    const date = req.params.date
    if (!dateRegex.test(date)) {
      return res.status(400).json(apiError('VALIDATION_ERROR', '날짜 형식 YYYY-MM-DD'))
    }

    const cur = await query('SELECT is_closed FROM daily_factory_ops WHERE op_date = $1', [date])
    if (cur.rows[0]?.is_closed) {
      return res.status(400).json(apiError('OPS_CLOSED', '마감된 일자입니다. reopen 후 수정하세요'))
    }

    const result = await transaction(async (client) => {
      await recalcOpsForDate(client, date)
      const upd = await client.query(`
        UPDATE daily_factory_ops
        SET factory_intake_l = $1,
            notes = COALESCE($2, notes),
            updated_at = NOW()
        WHERE op_date = $3
        RETURNING *
      `, [req.body.factory_intake_l, req.body.notes ?? null, date])
      return upd.rows[0]
    })

    res.json(apiResponse(result))
  } catch (err) {
    next(err)
  }
})

/** POST /:date/recalc — 자동값 재계산 (생산/입고/착유 변경 후 강제 갱신) */
router.post('/:date/recalc', async (req, res, next) => {
  try {
    const date = req.params.date
    if (!dateRegex.test(date)) {
      return res.status(400).json(apiError('VALIDATION_ERROR', '날짜 형식 YYYY-MM-DD'))
    }
    const result = await transaction(async (client) => recalcOpsForDate(client, date))
    res.json(apiResponse(result))
  } catch (err) {
    next(err)
  }
})

/** POST /:date/close — 일일 마감 + 진흥회 기록 자동 생성 */
router.post('/:date/close', async (req, res, next) => {
  try {
    const date = req.params.date
    if (!dateRegex.test(date)) {
      return res.status(400).json(apiError('VALIDATION_ERROR', '날짜 형식 YYYY-MM-DD'))
    }

    const result = await transaction(async (client) => {
      // 자동 갱신 후 마감
      const ops = await recalcOpsForDate(client, date)

      if (ops.is_closed) {
        throw Object.assign(new Error('이미 마감된 일자'), { status: 400, code: 'ALREADY_CLOSED' })
      }
      if (ops.factory_intake_l === null) {
        throw Object.assign(new Error('공장 필요량을 먼저 입력하세요'), {
          status: 400, code: 'INTAKE_REQUIRED',
        })
      }

      // CCP 이탈 미해결 검사
      const dev = await client.query(`
        SELECT COUNT(*)::int AS cnt FROM process_records pr
        JOIN production_batches pb ON pr.batch_id = pb.batch_id
        WHERE pb.produced_at = $1
          AND pr.is_ccp = true AND pr.is_deviated = true
      `, [date])
      if (dev.rows[0].cnt > 0) {
        throw Object.assign(new Error(`CCP 이탈 ${dev.rows[0].cnt}건 미해결 — 마감 차단`), {
          status: 400, code: 'CCP_DEVIATION_OPEN',
        })
      }

      // 진흥회 기록 자동 생성/갱신
      const promotionL = parseFloat(ops.dairy_promotion_l)
      const unitPrice = await lookupDairyPromotionRate(client)
      const totalAmount = unitPrice ? Math.round(promotionL * unitPrice) : null

      await client.query(`
        INSERT INTO dairy_promotion_deliveries (
          delivery_date, amount_l, unit_price, total_amount,
          auto_calculated, ops_id, notes
        ) VALUES ($1, $2, $3, $4, true, $5, '일일 마감 자동 생성')
        ON CONFLICT (delivery_date) DO UPDATE
        SET amount_l = EXCLUDED.amount_l,
            unit_price = COALESCE(EXCLUDED.unit_price, dairy_promotion_deliveries.unit_price),
            total_amount = EXCLUDED.total_amount,
            ops_id = EXCLUDED.ops_id,
            updated_at = NOW()
      `, [date, Math.max(0, promotionL), unitPrice, totalAmount, ops.id])

      const upd = await client.query(`
        UPDATE daily_factory_ops
        SET is_closed = true, closed_at = NOW(), closed_by = $1, updated_at = NOW()
        WHERE op_date = $2
        RETURNING *
      `, [req.user?.id || null, date])

      return upd.rows[0]
    })

    res.json(apiResponse(result))
  } catch (err) {
    if (err.code === 'ALREADY_CLOSED' || err.code === 'INTAKE_REQUIRED' || err.code === 'CCP_DEVIATION_OPEN') {
      return res.status(err.status || 400).json(apiError(err.code, err.message))
    }
    next(err)
  }
})

/** POST /:date/reopen — 마감 해제 (ADMIN 권장) */
router.post('/:date/reopen', async (req, res, next) => {
  try {
    const date = req.params.date
    if (!dateRegex.test(date)) {
      return res.status(400).json(apiError('VALIDATION_ERROR', '날짜 형식 YYYY-MM-DD'))
    }

    const result = await query(`
      UPDATE daily_factory_ops
      SET is_closed = false, closed_at = NULL, closed_by = NULL, updated_at = NOW()
      WHERE op_date = $1 AND is_closed = true
      RETURNING *
    `, [date])

    if (result.rows.length === 0) {
      return res.status(400).json(apiError('NOT_CLOSED', '마감 상태가 아닙니다'))
    }
    res.json(apiResponse(result.rows[0]))
  } catch (err) {
    next(err)
  }
})

module.exports = router
