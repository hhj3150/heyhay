/**
 * @fileoverview 배송 체크리스트 API
 * 매일 아침 자동 생성 → 포장 → 발송 → 완료 전 과정 관리
 * 구독자 주문 누락 절대 방지
 *
 * POST   /generate       — 오늘 체크리스트 자동 생성 (구독+주문+B2B)
 * GET    /               — 일자별 체크리스트 조회
 * GET    /stats           — 일자별 완료율 통계
 * PUT    /:id/pack        — 포장 완료 처리
 * PUT    /:id/ship        — 발송 완료 처리
 * PUT    /:id/deliver     — 배송 완료 처리
 * PUT    /:id/issue       — 이슈 등록
 * PUT    /:id/verify      — 수량·금액 검증
 */
const express = require('express')
const { query, transaction } = require('../../config/database')
const { apiResponse, apiError } = require('../../lib/shared')

const router = express.Router()

/** KST 기준 오늘 날짜 반환 */
function getKstToday() {
  const now = new Date()
  // UTC + 9시간 = KST
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  return kst.toISOString().split('T')[0]
}

/** GET /stats — 일자별 완료율 */
router.get('/stats', async (req, res, next) => {
  try {
    const { date } = req.query
    const targetDate = date || getKstToday()

    const result = await query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE is_packed) AS packed,
        COUNT(*) FILTER (WHERE is_shipped) AS shipped,
        COUNT(*) FILTER (WHERE is_delivered) AS delivered,
        COUNT(*) FILTER (WHERE qty_verified AND amount_verified) AS verified,
        COUNT(*) FILTER (WHERE has_issue) AS issues,
        COUNT(*) FILTER (WHERE source_type = 'SUBSCRIPTION') AS subscription_count,
        COUNT(*) FILTER (WHERE source_type = 'ORDER') AS order_count,
        COUNT(*) FILTER (WHERE source_type = 'B2B') AS b2b_count,
        COALESCE(SUM(total_amount), 0) AS total_amount
      FROM delivery_checklist
      WHERE delivery_date = $1
    `, [targetDate])

    const s = result.rows[0]
    const total = parseInt(s.total)

    res.json(apiResponse({
      date: targetDate,
      total,
      packed: parseInt(s.packed),
      shipped: parseInt(s.shipped),
      delivered: parseInt(s.delivered),
      verified: parseInt(s.verified),
      issues: parseInt(s.issues),
      by_source: {
        subscription: parseInt(s.subscription_count),
        order: parseInt(s.order_count),
        b2b: parseInt(s.b2b_count),
      },
      total_amount: parseInt(s.total_amount),
      completion_pct: total > 0 ? Math.round((parseInt(s.shipped) / total) * 100) : 0,
    }))
  } catch (err) { next(err) }
})

/** POST /generate — 오늘 체크리스트 자동 생성 */
router.post('/generate', async (req, res, next) => {
  try {
    const targetDate = req.body.date || getKstToday()

    // 이미 생성된 건 확인
    const existing = await query(
      'SELECT COUNT(*) FROM delivery_checklist WHERE delivery_date = $1',
      [targetDate],
    )
    if (parseInt(existing.rows[0].count) > 0) {
      return res.json(apiResponse({ message: '이미 생성됨', count: parseInt(existing.rows[0].count) }))
    }

    let created = 0

    await transaction(async (client) => {
      // 1) 활성 구독에서 오늘 배송분 생성
      // next_payment_at 포함하여 조회 — 날짜 비교의 핵심 컬럼
      const subs = await client.query(`
        SELECT s.id, s.frequency, s.items, s.price_per_cycle, s.next_payment_at,
               c.name, c.phone, c.address_main, c.address_detail, c.address_zip
        FROM subscriptions s
        JOIN customers c ON s.customer_id = c.id
        WHERE s.status = 'ACTIVE' AND s.deleted_at IS NULL
      `)

      const freqDays = { '1W': 7, '2W': 14, '4W': 28 }
      const today = new Date(targetDate + 'T00:00:00+09:00')
      const todayMs = today.getTime()
      const dayOfWeek = today.getDay()

      for (const sub of subs.rows) {
        const freq = freqDays[sub.frequency] || 7
        let shouldDeliver = false

        // 1차 판별: next_payment_at 날짜가 오늘과 일치하면 무조건 배송
        if (sub.next_payment_at) {
          const nextDateStr = new Date(sub.next_payment_at).toISOString().split('T')[0]
          if (nextDateStr === targetDate) {
            shouldDeliver = true
          } else {
            // next_payment_at 기준 주기적 배송일 판별
            const nextDate = new Date(nextDateStr + 'T00:00:00+09:00')
            const diffDays = Math.round((todayMs - nextDate.getTime()) / (1000 * 60 * 60 * 24))
            if (diffDays > 0 && diffDays % freq === 0) {
              shouldDeliver = true
            }
          }
        }

        // 2차 판별: next_payment_at 없으면 요일 기반 폴백
        if (!shouldDeliver && !sub.next_payment_at) {
          if (freq === 7) shouldDeliver = dayOfWeek === 1 // 매주 월요일
          else if (freq === 14) shouldDeliver = dayOfWeek === 1 && isEvenWeek(today)
          else if (freq === 28) shouldDeliver = dayOfWeek === 1 && isFirstWeekOfMonth(today)
        }

        if (!shouldDeliver) continue

        const items = typeof sub.items === 'string' ? JSON.parse(sub.items) : sub.items

        await client.query(`
          INSERT INTO delivery_checklist (
            delivery_date, source_type, source_id,
            customer_name, customer_phone, shipping_address, items, total_amount
          ) VALUES ($1, 'SUBSCRIPTION', $2, $3, $4, $5, $6, $7)
        `, [
          targetDate, sub.id, sub.name, sub.phone,
          `[${sub.address_zip || ''}] ${sub.address_main || ''} ${sub.address_detail || ''}`,
          JSON.stringify(items), parseInt(sub.price_per_cycle) || 0,
        ])
        created++
      }

      // 2) 미발송 주문 (PAID, PROCESSING, PACKED)
      const orders = await client.query(`
        SELECT o.id, o.order_number, o.total_amount,
               o.recipient_name, o.recipient_phone, o.shipping_address,
               o.shipping_memo, o.ice_pack_count,
               (SELECT json_agg(json_build_object(
                 'sku_code', s.code, 'sku_name', s.name,
                 'quantity', oi.quantity, 'unit_price', oi.unit_price
               )) FROM order_items oi JOIN skus s ON oi.sku_id = s.id WHERE oi.order_id = o.id
               ) AS items
        FROM orders o
        WHERE o.status IN ('PAID', 'PROCESSING', 'PACKED')
          AND o.deleted_at IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM delivery_checklist dc
            WHERE dc.source_id = o.id AND dc.source_type = 'ORDER'
          )
      `)

      for (const ord of orders.rows) {
        await client.query(`
          INSERT INTO delivery_checklist (
            delivery_date, source_type, source_id,
            customer_name, customer_phone, shipping_address, shipping_memo,
            items, total_amount, ice_pack_count
          ) VALUES ($1, 'ORDER', $2, $3, $4, $5, $6, $7, $8, $9)
        `, [
          targetDate, ord.id, ord.recipient_name, ord.recipient_phone,
          ord.shipping_address, ord.shipping_memo,
          JSON.stringify(ord.items || []), parseInt(ord.total_amount) || 0,
          ord.ice_pack_count || 1,
        ])
        created++
      }

      // 3) B2B 거래처 (오늘 배송일인 거래처)
      try {
        const dayMap = { 0: 'SUN', 1: 'MON', 2: 'TUE', 3: 'WED', 4: 'THU', 5: 'FRI', 6: 'SAT' }
        const todayDay = dayMap[dayOfWeek]

        const b2b = await client.query(`
          SELECT p.id, p.name, p.contact_phone, p.address,
                 (SELECT json_agg(json_build_object(
                   'sku_code', s.code, 'sku_name', s.name,
                   'quantity', bso.quantity, 'unit_price', bso.unit_price
                 )) FROM b2b_standing_orders bso JOIN skus s ON bso.sku_id = s.id
                 WHERE bso.partner_id = p.id AND bso.is_active = true
                 ) AS items,
                 (SELECT COALESCE(SUM(bso.quantity * bso.unit_price), 0)
                  FROM b2b_standing_orders bso WHERE bso.partner_id = p.id AND bso.is_active = true
                 ) AS total_amount
          FROM b2b_partners p
          WHERE p.is_active = true AND p.deleted_at IS NULL
            AND (p.delivery_day = $1 OR p.delivery_day = 'DAILY')
        `, [todayDay])

        for (const b of b2b.rows) {
          if (!b.items || b.items.length === 0) continue
          await client.query(`
            INSERT INTO delivery_checklist (
              delivery_date, source_type, source_id,
              customer_name, customer_phone, shipping_address,
              items, total_amount
            ) VALUES ($1, 'B2B', $2, $3, $4, $5, $6, $7)
          `, [
            targetDate, b.id, b.name, b.contact_phone,
            b.address || '', JSON.stringify(b.items), parseInt(b.total_amount) || 0,
          ])
          created++
        }
      } catch {
        // b2b_partners 테이블 미생성 시 무시
      }
    })

    res.json(apiResponse({ date: targetDate, created }))
  } catch (err) { next(err) }
})

/** GET / — 체크리스트 조회 */
router.get('/', async (req, res, next) => {
  try {
    const { date, status } = req.query
    const targetDate = date || getKstToday()

    const conditions = ['delivery_date = $1']
    const params = [targetDate]
    let idx = 2

    if (status === 'unpacked') conditions.push('is_packed = false')
    if (status === 'packed') conditions.push('is_packed = true AND is_shipped = false')
    if (status === 'shipped') conditions.push('is_shipped = true AND is_delivered = false')
    if (status === 'done') conditions.push('is_shipped = true')
    if (status === 'issue') conditions.push('has_issue = true')

    const result = await query(`
      SELECT * FROM delivery_checklist
      WHERE ${conditions.join(' AND ')}
      ORDER BY
        has_issue DESC,
        is_shipped ASC,
        is_packed ASC,
        source_type,
        customer_name
    `, params)

    res.json(apiResponse(result.rows))
  } catch (err) { next(err) }
})

/** PUT /:id/pack — 포장 완료 */
router.put('/:id/pack', async (req, res, next) => {
  try {
    const { packed_by } = req.body || {}
    const result = await query(`
      UPDATE delivery_checklist
      SET is_packed = true, packed_by = $1, packed_at = NOW(), updated_at = NOW()
      WHERE id = $2 RETURNING *
    `, [packed_by || 'system', req.params.id])

    if (result.rows.length === 0) return res.status(404).json(apiError('NOT_FOUND', '체크리스트 항목 없음'))
    res.json(apiResponse(result.rows[0]))
  } catch (err) { next(err) }
})

/** PUT /:id/ship — 발송 완료 */
router.put('/:id/ship', async (req, res, next) => {
  try {
    const { shipped_by, courier, tracking_number } = req.body || {}
    const result = await query(`
      UPDATE delivery_checklist
      SET is_shipped = true, shipped_by = $1, shipped_at = NOW(),
          courier = $2, tracking_number = $3, updated_at = NOW()
      WHERE id = $4 RETURNING *
    `, [shipped_by || 'system', courier || null, tracking_number || null, req.params.id])

    if (result.rows.length === 0) return res.status(404).json(apiError('NOT_FOUND', '체크리스트 항목 없음'))
    res.json(apiResponse(result.rows[0]))
  } catch (err) { next(err) }
})

/** PUT /:id/deliver — 배송 완료 */
router.put('/:id/deliver', async (req, res, next) => {
  try {
    const result = await query(`
      UPDATE delivery_checklist
      SET is_delivered = true, delivered_at = NOW(), updated_at = NOW()
      WHERE id = $1 RETURNING *
    `, [req.params.id])

    if (result.rows.length === 0) return res.status(404).json(apiError('NOT_FOUND', '체크리스트 항목 없음'))
    res.json(apiResponse(result.rows[0]))
  } catch (err) { next(err) }
})

/** PUT /:id/verify — 수량·금액 검증 */
router.put('/:id/verify', async (req, res, next) => {
  try {
    const result = await query(`
      UPDATE delivery_checklist
      SET qty_verified = true, amount_verified = true, updated_at = NOW()
      WHERE id = $1 RETURNING *
    `, [req.params.id])

    if (result.rows.length === 0) return res.status(404).json(apiError('NOT_FOUND', '체크리스트 항목 없음'))
    res.json(apiResponse(result.rows[0]))
  } catch (err) { next(err) }
})

/** PUT /:id/issue — 이슈 등록 */
router.put('/:id/issue', async (req, res, next) => {
  try {
    const { issue_note } = req.body
    const result = await query(`
      UPDATE delivery_checklist
      SET has_issue = true, issue_note = $1, updated_at = NOW()
      WHERE id = $2 RETURNING *
    `, [issue_note, req.params.id])

    if (result.rows.length === 0) return res.status(404).json(apiError('NOT_FOUND', '체크리스트 항목 없음'))
    res.json(apiResponse(result.rows[0]))
  } catch (err) { next(err) }
})

// 유틸
function isEvenWeek(date) {
  const start = new Date(date.getFullYear(), 0, 1)
  const weekNum = Math.ceil(((date - start) / 86400000 + start.getDay() + 1) / 7)
  return weekNum % 2 === 0
}

function isFirstWeekOfMonth(date) {
  return date.getDate() <= 7
}

module.exports = router
