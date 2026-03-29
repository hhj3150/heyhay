/**
 * @fileoverview 통합 대시보드 API
 * GET /api/v1/dashboard/kpi    — KPI 카드 데이터 (전 모듈 집계)
 * GET /api/v1/dashboard/alerts — 미확인 알림 목록
 * PUT /api/v1/dashboard/alerts/:id — 알림 읽음/해결 처리
 */
const express = require('express')
const { query } = require('../../config/database')
const { apiResponse, apiError } = require('../../lib/shared')

const router = express.Router()

/** GET /kpi — 전 모듈 KPI 한 번에 조회 */
router.get('/kpi', async (req, res, next) => {
  try {
    const [milk, factory, rawMilk, orders, subs, cafe, alerts] = await Promise.all([
      // 오늘 착유량 — daily_milk_totals (수동 입력) 조회
      query(`
        SELECT
          COALESCE((SELECT total_l FROM daily_milk_totals WHERE date = CURRENT_DATE), 0) AS today_milk,
          COALESCE((SELECT total_l FROM daily_milk_totals WHERE date = CURRENT_DATE - 1), 0) AS yesterday_milk,
          0 AS today_heads
      `).catch((e) => { console.error('[KPI] 착유량 조회 실패:', e.message); return { rows: [{ today_milk: 0, yesterday_milk: 0, today_heads: 0 }] } }),
      // 공장: 오늘 생산 배치 수
      query(`
        SELECT COUNT(*) AS today_batches
        FROM production_batches
        WHERE produced_at = CURRENT_DATE AND deleted_at IS NULL
      `).catch((e) => { console.error('[KPI] 생산배치 조회 실패:', e.message); return { rows: [{ today_batches: 0 }] } }),
      // 원유 입고
      query(`
        SELECT COALESCE(SUM(amount_l), 0) AS today_raw_milk
        FROM raw_milk_receipts
        WHERE received_date = CURRENT_DATE AND deleted_at IS NULL AND is_rejected = false
      `).catch((e) => { console.error('[KPI] 원유입고 조회 실패:', e.message); return { rows: [{ today_raw_milk: 0 }] } }),
      // 주문: 오늘 + 월 매출
      query(`
        SELECT
          COUNT(*) FILTER (WHERE DATE(created_at) = CURRENT_DATE AND deleted_at IS NULL) AS today_orders,
          COALESCE(SUM(total_amount) FILTER (WHERE DATE(created_at) = CURRENT_DATE AND deleted_at IS NULL), 0) AS today_order_revenue,
          COALESCE(SUM(total_amount) FILTER (WHERE created_at >= DATE_TRUNC('month', NOW()) AND deleted_at IS NULL), 0) AS month_revenue
        FROM orders
      `).catch((e) => { console.error('[KPI] 주문 조회 실패:', e.message); return { rows: [{ today_orders: 0, today_order_revenue: 0, month_revenue: 0 }] } }),
      // 구독
      query(`
        SELECT COUNT(*) AS active_subs
        FROM subscriptions
        WHERE status = 'ACTIVE' AND deleted_at IS NULL
      `).catch((e) => { console.error('[KPI] 구독 조회 실패:', e.message); return { rows: [{ active_subs: 0 }] } }),
      // 카페 매출
      query(`
        SELECT
          COALESCE(SUM(total_amount) FILTER (WHERE sale_date = CURRENT_DATE), 0) AS today_cafe,
          COALESCE(SUM(total_amount) FILTER (WHERE sale_date >= DATE_TRUNC('month', CURRENT_DATE)), 0) AS month_cafe
        FROM cafe_sales
      `).catch((e) => { console.error('[KPI] 카페매출 조회 실패:', e.message); return { rows: [{ today_cafe: 0, month_cafe: 0 }] } }),
      // 미확인 알림
      query(`
        SELECT COUNT(*) AS unread FROM alerts WHERE is_read = false
      `).catch((e) => { console.error('[KPI] 알림 조회 실패:', e.message); return { rows: [{ unread: 0 }] } }),
    ])

    const todayMilk = parseFloat(milk.rows[0].today_milk)
    const yesterdayMilk = parseFloat(milk.rows[0].yesterday_milk)
    const milkChange = yesterdayMilk > 0
      ? ((todayMilk - yesterdayMilk) / yesterdayMilk * 100).toFixed(1)
      : null

    res.json(apiResponse({
      farm: {
        today_milk_l: todayMilk,
        yesterday_milk_l: yesterdayMilk,
        milk_change_pct: milkChange,
        milking_heads: parseInt(milk.rows[0].today_heads),
      },
      factory: {
        today_batches: parseInt(factory.rows[0].today_batches),
        today_raw_milk_l: parseFloat(rawMilk.rows[0].today_raw_milk),
      },
      market: {
        today_orders: parseInt(orders.rows[0].today_orders),
        today_revenue: parseInt(orders.rows[0].today_order_revenue),
        month_revenue: parseInt(orders.rows[0].month_revenue),
        active_subscribers: parseInt(subs.rows[0].active_subs),
      },
      cafe: {
        today_revenue: parseInt(cafe.rows[0].today_cafe),
        month_revenue: parseInt(cafe.rows[0].month_cafe),
      },
      alerts: {
        unread: parseInt(alerts.rows[0].unread),
      },
    }))
  } catch (err) {
    next(err)
  }
})

/** GET /alerts — 미확인 알림 목록 */
router.get('/alerts', async (req, res, next) => {
  try {
    const { priority, module: mod, resolved } = req.query
    const conditions = []
    const params = []
    let idx = 1

    if (priority) { conditions.push(`priority = $${idx++}`); params.push(priority) }
    if (mod) { conditions.push(`module = $${idx++}`); params.push(mod) }
    if (resolved === 'false') conditions.push('is_resolved = false')
    if (resolved === 'true') conditions.push('is_resolved = true')

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const result = await query(`
      SELECT * FROM alerts ${where}
      ORDER BY
        CASE priority WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 ELSE 3 END,
        created_at DESC
      LIMIT 50
    `, params)

    res.json(apiResponse(result.rows))
  } catch (err) { next(err) }
})

/** PUT /alerts/:id — 알림 읽음/해결 처리 */
router.put('/alerts/:id', async (req, res, next) => {
  try {
    const { is_read, is_resolved, resolve_note } = req.body
    const updates = ['updated_at = NOW()']
    const params = []
    let idx = 1

    if (is_read !== undefined) { updates.push(`is_read = $${idx++}`); params.push(is_read) }
    if (is_resolved !== undefined) {
      updates.push(`is_resolved = $${idx++}`); params.push(is_resolved)
      updates.push(`resolved_at = NOW()`)
      updates.push(`resolved_by = $${idx++}`); params.push(req.user?.id)
    }
    if (resolve_note) { updates.push(`resolve_note = $${idx++}`); params.push(resolve_note) }

    const result = await query(
      `UPDATE alerts SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
      [...params, req.params.id],
    )

    if (result.rows.length === 0) return res.status(404).json(apiError('NOT_FOUND', '알림을 찾을 수 없습니다'))
    res.json(apiResponse(result.rows[0]))
  } catch (err) { next(err) }
})

/** POST /ai-report — Claude AI 일일 분석 보고서 */
router.post('/ai-report', async (req, res, next) => {
  try {
    const { generateDailyReport } = require('../../services/aiAnalysis')
    const report = await generateDailyReport()
    res.json(apiResponse(report))
  } catch (err) {
    next(err)
  }
})

// 오늘의 운영 커맨드센터
router.use('/', require('./todayOps'))

// AI 음성 대화
router.use('/', require('./aiChat'))

// SSE 실시간 알림
const { router: sseRouter } = require('./sse')
router.use('/sse', sseRouter)

module.exports = router
