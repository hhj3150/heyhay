/**
 * @fileoverview 오늘의 운영 커맨드센터 API
 * GET /api/v1/dashboard/today-ops — 매일 아침 모든 운영 현황 한 번에 조회
 *
 * 섹션: summary, orders, production, deliveries, alerts, milking
 * 각 섹션 개별 try/catch — 부분 실패해도 전체 응답은 정상 반환
 */
const express = require('express')
const { query } = require('../../config/database')
const { apiResponse } = require('../../lib/shared')
const { loadProductionSettings, calculateRawMilkNeeded } = require('../../services/milkDemand')

const router = express.Router()

/** KST 기준 오늘 날짜 (YYYY-MM-DD) */
function getKstToday() {
  const now = new Date()
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  return kst.toISOString().split('T')[0]
}

/** KST 기준 어제 저녁 9시 (전날 야간 주문 기준선) */
function getLastNight9pmUtc(todayKst) {
  // todayKst = 'YYYY-MM-DD' (KST)
  // 어제 21:00 KST = 어제 12:00 UTC
  const d = new Date(todayKst + 'T00:00:00+09:00')
  d.setDate(d.getDate() - 1)
  d.setHours(21, 0, 0, 0) // KST 21:00
  return d.toISOString()
}

/** KST 기준 내일 날짜 (YYYY-MM-DD) — 생산은 D+1 배송분 기준 */
function getKstTomorrow() {
  const now = new Date()
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  kst.setDate(kst.getDate() + 1)
  return kst.toISOString().split('T')[0]
}

/** 날짜 문자열에서 M/D 형식 추출 */
function formatShortDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00+09:00')
  return `${d.getMonth() + 1}/${d.getDate()}`
}

/**
 * 주문 섹션: 신규/대기/발송대기 주문
 * @param {string} todayKst
 * @returns {Promise<Object>}
 */
async function fetchOrders(todayKst) {
  const lastNight = getLastNight9pmUtc(todayKst)

  const [overnightRes, pendingRes, readyRes] = await Promise.all([
    // 어젯밤 9시 이후 ~ 현재까지 신규 주문
    query(`
      SELECT o.id, o.order_number, o.status, o.channel, o.total_amount,
             o.recipient_name, o.created_at,
             (SELECT json_agg(json_build_object(
               'sku_code', s.code, 'sku_name', s.name,
               'quantity', oi.quantity, 'unit_price', oi.unit_price
             )) FROM order_items oi JOIN skus s ON oi.sku_id = s.id WHERE oi.order_id = o.id
             ) AS items
      FROM orders o
      WHERE o.created_at >= $1
        AND o.deleted_at IS NULL
      ORDER BY o.created_at DESC
    `, [lastNight]),

    // 결제확인/처리 대기 (PENDING, PAID)
    query(`
      SELECT o.id, o.order_number, o.status, o.channel, o.total_amount,
             o.recipient_name, o.created_at,
             (SELECT json_agg(json_build_object(
               'sku_code', s.code, 'sku_name', s.name,
               'quantity', oi.quantity, 'unit_price', oi.unit_price
             )) FROM order_items oi JOIN skus s ON oi.sku_id = s.id WHERE oi.order_id = o.id
             ) AS items
      FROM orders o
      WHERE o.status IN ('PENDING', 'PAID')
        AND o.deleted_at IS NULL
      ORDER BY o.created_at ASC
    `),

    // 포장완료, 발송 대기 (PACKED)
    query(`
      SELECT o.id, o.order_number, o.status, o.channel, o.total_amount,
             o.recipient_name, o.shipping_address, o.created_at,
             (SELECT json_agg(json_build_object(
               'sku_code', s.code, 'sku_name', s.name,
               'quantity', oi.quantity, 'unit_price', oi.unit_price
             )) FROM order_items oi JOIN skus s ON oi.sku_id = s.id WHERE oi.order_id = o.id
             ) AS items
      FROM orders o
      WHERE o.status = 'PACKED'
        AND o.deleted_at IS NULL
      ORDER BY o.created_at ASC
    `),
  ])

  return {
    new_overnight: overnightRes.rows,
    pending_action: pendingRes.rows,
    ready_to_ship: readyRes.rows,
  }
}

/**
 * 생산 섹션: 내일(D+1) 배송분 기준 SKU별 수요 + 배송지 상세 + 원유 소요량 + 부족 자재
 * 오늘 생산 → 1일 숙성 → 내일 배송 구조
 * @param {string} todayKst
 * @returns {Promise<Object>}
 */
async function fetchProduction(todayKst) {
  const tomorrowKst = getKstTomorrow()
  const tomorrowDate = new Date(tomorrowKst + 'T00:00:00+09:00')
  const dayMap = { 0: 'SUN', 1: 'MON', 2: 'TUE', 3: 'WED', 4: 'THU', 5: 'FRI', 6: 'SAT' }
  const tomorrowDay = dayMap[tomorrowDate.getDay()]

  // 병렬 조회: 내일 배송분 구독/주문/B2B + 원유 설정 + 착유량 + 자재 + 생산배치
  const [subsRes, ordersRes, b2bRes, prodSettings, milkRes, materialsRes, prodPlanRes] = await Promise.all([
    // 내일 배송 구독 — 고객별 상세 포함
    query(`
      SELECT dc.customer_name, dc.shipping_address, dc.items
      FROM delivery_checklist dc
      WHERE dc.delivery_date = $1 AND dc.source_type = 'SUBSCRIPTION'
    `, [tomorrowKst]).catch(() => ({ rows: [] })),

    // 내일 배송 예정 주문 — 주문별 상세 포함
    query(`
      SELECT dc.customer_name, dc.shipping_address, dc.items, dc.source_id
      FROM delivery_checklist dc
      WHERE dc.delivery_date = $1 AND dc.source_type = 'ORDER'
    `, [tomorrowKst]).catch(() => ({ rows: [] })),

    // B2B 내일 출하 예정 — 거래처별 상세
    query(`
      SELECT p.name AS partner_name, s.code AS sku_code, s.name AS sku_name,
             bso.quantity AS qty
      FROM b2b_standing_orders bso
      JOIN b2b_partners p ON bso.partner_id = p.id
      JOIN skus s ON bso.sku_id = s.id
      WHERE bso.is_active = true AND p.is_active = true AND p.deleted_at IS NULL
        AND (p.delivery_day = $1 OR p.delivery_day = 'DAILY')
    `, [tomorrowDay]).catch(() => ({ rows: [] })),

    loadProductionSettings().catch(() => null),

    // 오늘 기록된 착유량
    query(`
      SELECT COALESCE(total_l, 0) AS total_l
      FROM daily_milk_totals
      WHERE date = $1
    `, [todayKst]).catch(() => ({ rows: [] })),

    // 부족 자재
    query(`
      SELECT id, name, category, current_stock, safety_stock
      FROM packaging_materials
      WHERE current_stock < safety_stock
      ORDER BY category, name
    `).catch(() => ({ rows: [] })),

    // 오늘 생산 배치 존재 여부
    query(`
      SELECT COUNT(*) AS cnt
      FROM production_batches
      WHERE produced_at = $1 AND deleted_at IS NULL
    `, [todayKst]).catch(() => ({ rows: [{ cnt: 0 }] })),
  ])

  // 구독 배송 — SKU 집계 + 배송지별 상세
  const subSkuMap = {}
  const subBreakdown = {} // { sku_code: [{customer_name, quantity, address_short}] }
  for (const row of subsRes.rows) {
    let items
    try {
      items = typeof row.items === 'string' ? JSON.parse(row.items) : row.items
    } catch {
      items = []
    }
    if (!Array.isArray(items)) continue
    const addressShort = shortenAddress(row.shipping_address)
    for (const item of items) {
      const code = item.sku_code
      if (!code) continue
      const qty = item.quantity || 0
      subSkuMap[code] = (subSkuMap[code] || 0) + qty
      if (!subBreakdown[code]) {
        subBreakdown[code] = []
      }
      subBreakdown[code] = [
        ...subBreakdown[code],
        { customer_name: row.customer_name, quantity: qty, address_short: addressShort },
      ]
    }
  }

  // 주문 배송 — SKU 집계 + 주문별 상세 (주문번호 조회)
  const orderSkuMap = {}
  const orderBreakdown = {} // { sku_code: [{order_number, recipient, quantity}] }
  const orderSourceIds = ordersRes.rows
    .filter((r) => r.source_id)
    .map((r) => r.source_id)

  // 주문번호 매핑 (source_id → order_number)
  let orderNumberMap = {}
  if (orderSourceIds.length > 0) {
    const orderNumRes = await query(`
      SELECT id, order_number FROM orders WHERE id = ANY($1)
    `, [orderSourceIds]).catch(() => ({ rows: [] }))
    for (const r of orderNumRes.rows) {
      orderNumberMap = { ...orderNumberMap, [r.id]: r.order_number }
    }
  }

  for (const row of ordersRes.rows) {
    let items
    try {
      items = typeof row.items === 'string' ? JSON.parse(row.items) : row.items
    } catch {
      items = []
    }
    if (!Array.isArray(items)) continue
    const orderNumber = orderNumberMap[row.source_id] || ''
    for (const item of items) {
      const code = item.sku_code
      if (!code) continue
      const qty = item.quantity || 0
      orderSkuMap[code] = (orderSkuMap[code] || 0) + qty
      if (!orderBreakdown[code]) {
        orderBreakdown[code] = []
      }
      orderBreakdown[code] = [
        ...orderBreakdown[code],
        { order_number: orderNumber, recipient: row.customer_name, quantity: qty },
      ]
    }
  }

  // B2B — SKU 집계 + 거래처별 상세
  const b2bSkuMap = {}
  const b2bBreakdown = {} // { sku_code: [{partner_name, quantity}] }
  const skuNameMap = {}
  for (const row of b2bRes.rows) {
    const code = row.sku_code
    const qty = parseInt(row.qty)
    b2bSkuMap[code] = (b2bSkuMap[code] || 0) + qty
    skuNameMap[code] = row.sku_name
    if (!b2bBreakdown[code]) {
      b2bBreakdown[code] = []
    }
    b2bBreakdown[code] = [
      ...b2bBreakdown[code],
      { partner_name: row.partner_name, quantity: qty },
    ]
  }

  // SKU별 통합 수요
  const allSkuCodes = new Set([
    ...Object.keys(subSkuMap),
    ...Object.keys(orderSkuMap),
    ...Object.keys(b2bSkuMap),
  ])

  const skuDemand = []
  const skuTotals = {}

  for (const code of allSkuCodes) {
    const subQty = subSkuMap[code] || 0
    const orderQty = orderSkuMap[code] || 0
    const b2bQty = b2bSkuMap[code] || 0
    const needed = subQty + orderQty + b2bQty

    skuDemand.push({
      sku_code: code,
      sku_name: skuNameMap[code] || code,
      needed,
      reason_breakdown: {
        subscription: subQty,
        orders: orderQty,
        b2b: b2bQty,
      },
      breakdown: {
        subscription: subBreakdown[code] || [],
        orders: orderBreakdown[code] || [],
        b2b: b2bBreakdown[code] || [],
      },
    })

    skuTotals[code] = needed
  }

  // 원유 소요량 계산
  let milkNeededL = 0
  if (prodSettings) {
    const milkCalc = calculateRawMilkNeeded(skuTotals, prodSettings.rawMilkBom)
    milkNeededL = milkCalc.total_raw_milk_l
  }

  const milkRecordedL = milkRes.rows.length > 0
    ? parseFloat(milkRes.rows[0].total_l)
    : 0

  // 부족 자재
  const materialsShortage = materialsRes.rows.map((m) => ({
    id: m.id,
    name: m.name,
    category: m.category,
    current_stock: m.current_stock,
    safety_stock: m.safety_stock,
    shortage: m.safety_stock - m.current_stock,
  }))

  const productionPlanExists = parseInt(prodPlanRes.rows[0].cnt) > 0

  // 내일 배송 총 건수 (생산 필요 요약용)
  const tomorrowDeliveryCount = subsRes.rows.length + ordersRes.rows.length + b2bRes.rows.length

  return {
    label: `오늘 생산 → 내일(${formatShortDate(tomorrowKst)}) 배송분`,
    target_delivery_date: tomorrowKst,
    tomorrow_delivery_count: tomorrowDeliveryCount,
    sku_demand: skuDemand,
    milk_needed_l: milkNeededL,
    milk_recorded_l: milkRecordedL,
    materials_shortage: materialsShortage,
    production_plan_exists: productionPlanExists,
  }
}

/**
 * 주소를 "시/도 시/군/구" 형태로 축약
 * @param {string|null} address
 * @returns {string}
 */
function shortenAddress(address) {
  if (!address) return ''
  const parts = address.trim().split(/\s+/)
  // 보통 "경기도 안성시 ..." → "경기 안성" 형태
  if (parts.length >= 2) {
    const province = parts[0].replace(/특별시|광역시|특별자치시|특별자치도|도$/, '')
    const city = parts[1].replace(/시$|군$|구$/, '')
    return `${province} ${city}`
  }
  return parts[0] || ''
}

/**
 * 배송 섹션: 오늘 체크리스트 현황
 * @param {string} todayKst
 * @returns {Promise<Object>}
 */
async function fetchDeliveries(todayKst) {
  const [subDeliveries, orderDeliveries, b2bDeliveries, statsRes] = await Promise.all([
    // 구독 배송
    query(`
      SELECT id, customer_name, customer_phone, shipping_address, items,
             total_amount, is_packed, is_shipped, is_delivered, has_issue, issue_note
      FROM delivery_checklist
      WHERE delivery_date = $1 AND source_type = 'SUBSCRIPTION'
      ORDER BY customer_name
    `, [todayKst]).catch(() => ({ rows: [] })),

    // 일반 주문 배송
    query(`
      SELECT id, customer_name, customer_phone, shipping_address, items,
             total_amount, is_packed, is_shipped, is_delivered, has_issue, issue_note
      FROM delivery_checklist
      WHERE delivery_date = $1 AND source_type = 'ORDER'
      ORDER BY customer_name
    `, [todayKst]).catch(() => ({ rows: [] })),

    // B2B 출하
    query(`
      SELECT id, customer_name, customer_phone, shipping_address, items,
             total_amount, is_packed, is_shipped, is_delivered, has_issue, issue_note
      FROM delivery_checklist
      WHERE delivery_date = $1 AND source_type = 'B2B'
      ORDER BY customer_name
    `, [todayKst]).catch(() => ({ rows: [] })),

    // 체크리스트 통계
    query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE is_packed) AS packed,
        COUNT(*) FILTER (WHERE is_shipped) AS shipped,
        COUNT(*) FILTER (WHERE has_issue) AS issues
      FROM delivery_checklist
      WHERE delivery_date = $1
    `, [todayKst]).catch(() => ({ rows: [{ total: 0, packed: 0, shipped: 0, issues: 0 }] })),
  ])

  const stats = statsRes.rows[0]

  return {
    label: '오늘 배송 (어제 생산분)',
    subscription: subDeliveries.rows,
    orders: orderDeliveries.rows,
    b2b: b2bDeliveries.rows,
    checklist_stats: {
      total: parseInt(stats.total),
      packed: parseInt(stats.packed),
      shipped: parseInt(stats.shipped),
      issues: parseInt(stats.issues),
    },
  }
}

/**
 * 알림 섹션: 미확인 알림
 * @returns {Promise<Array>}
 */
async function fetchAlerts() {
  const result = await query(`
    SELECT id, priority, module, title, message, is_read, is_resolved, created_at
    FROM alerts
    WHERE is_read = false
    ORDER BY
      CASE priority WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 ELSE 3 END,
      created_at DESC
    LIMIT 20
  `)
  return result.rows
}

/**
 * 착유 섹션: 오늘 착유량
 * @param {string} todayKst
 * @returns {Promise<Object>}
 */
async function fetchMilking(todayKst) {
  const result = await query(`
    SELECT total_l, dairy_assoc_l, d2o_l
    FROM daily_milk_totals
    WHERE date = $1
  `, [todayKst])

  if (result.rows.length === 0) {
    return {
      today_total: 0,
      dairy_assoc: 0,
      d2o: 0,
      recorded: false,
    }
  }

  const row = result.rows[0]
  return {
    today_total: parseFloat(row.total_l) || 0,
    dairy_assoc: parseFloat(row.dairy_assoc_l) || 0,
    d2o: parseFloat(row.d2o_l) || 0,
    recorded: true,
  }
}

/** GET /today-ops — 오늘의 운영 커맨드센터 */
router.get('/today-ops', async (req, res, next) => {
  try {
    const todayKst = getKstToday()

    // 각 섹션 병렬 조회 — 개별 try/catch로 부분 실패 허용
    const [orders, production, deliveries, alerts, milking] = await Promise.all([
      fetchOrders(todayKst).catch((err) => {
        console.error('[today-ops] orders 섹션 실패:', err.message)
        return { new_overnight: [], pending_action: [], ready_to_ship: [] }
      }),
      fetchProduction(todayKst).catch((err) => {
        console.error('[today-ops] production 섹션 실패:', err.message)
        return {
          sku_demand: [], milk_needed_l: 0, milk_recorded_l: 0,
          materials_shortage: [], production_plan_exists: false,
        }
      }),
      fetchDeliveries(todayKst).catch((err) => {
        console.error('[today-ops] deliveries 섹션 실패:', err.message)
        return {
          subscription: [], orders: [], b2b: [],
          checklist_stats: { total: 0, packed: 0, shipped: 0, issues: 0 },
        }
      }),
      fetchAlerts().catch((err) => {
        console.error('[today-ops] alerts 섹션 실패:', err.message)
        return []
      }),
      fetchMilking(todayKst).catch((err) => {
        console.error('[today-ops] milking 섹션 실패:', err.message)
        return { today_total: 0, dairy_assoc: 0, d2o: 0, recorded: false }
      }),
    ])

    // 오늘 주문 총계 (신규 기준)
    const totalOrdersToday = orders.new_overnight.length
    const pendingOrders = orders.pending_action.length
    const stats = deliveries.checklist_stats

    const data = {
      date: todayKst,
      summary: {
        total_orders_today: totalOrdersToday,
        pending_orders: pendingOrders,
        deliveries_due: stats.total,
        deliveries_shipped: stats.shipped,
        deliveries_remaining: stats.total - stats.shipped,
        milk_recorded: milking.recorded,
        production_plan_exists: production.production_plan_exists,
      },
      orders,
      production,
      deliveries,
      alerts,
      milking,
    }

    res.json(apiResponse(data))
  } catch (err) {
    next(err)
  }
})

module.exports = router
