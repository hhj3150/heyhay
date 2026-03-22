/**
 * @fileoverview 원유 수요 계산 서비스
 * 주문(구독+일반+카페+B2B) → SKU별 수량 → 원유 필요량 역산
 *
 * 핵심 로직:
 * 1. 이번주/다음주 예정 주문 수집 (구독 배송 + 미처리 주문)
 * 2. SKU별 수량 합산
 * 3. 제품별 원유 소요량(BOM) 적용 → 총 필요 원유량 산출
 * 4. 낙농진흥회 납유(200L/일) 제외 → D2O 공장 투입 가능량 비교
 *
 * 원유 소요량 기준 (유가공 수율 감안):
 * - 살균유: 원유 1.08L → 제품 1L (손실 8%)
 * - 발효유: 원유 1.10L → 제품 1L (발효 수축 포함)
 * - 카이막: 원유 10L → 카이막 100g (크림 분리, 농축)
 * - 소프트아이스크림: 원유 0.5L → 1서빙 (크림+우유 혼합)
 */
const { query } = require('../config/database')

/**
 * SKU별 원유 소요량 (L / 제품 1단위)
 * 실제 유가공 수율 기반
 */
const RAW_MILK_BOM = Object.freeze({
  'A2-750': { raw_milk_l: 0.81, description: '750ml × 1.08 수율' },
  'A2-180': { raw_milk_l: 0.195, description: '180ml × 1.08 수율' },
  'YG-500': { raw_milk_l: 0.55, description: '500ml × 1.10 수율' },
  'YG-180': { raw_milk_l: 0.198, description: '180ml × 1.10 수율' },
  'SI-001': { raw_milk_l: 0.5, description: '소프트아이스크림 1서빙' },
  'KM-100': { raw_milk_l: 10.0, description: '카이막 100g (크림분리+농축)' },
})

/** 일 착유량 (목장 전체 평균) */
const DAILY_MILKING_L = 145

/** 낙농진흥회 납유 쿼터 (ERP 제외 분량) */
const DAIRY_QUOTA_L = 200

/**
 * 이번주 + 다음주 구독 배송 수량 계산
 * @param {number} weeks - 몇 주 앞까지 (기본 2주)
 * @returns {Promise<Object>} SKU별 주간 수량
 */
const getSubscriptionDemand = async (weeks = 2) => {
  const activeSubs = await query(`
    SELECT s.id, s.frequency, s.items, s.next_payment_at,
           c.name AS customer_name
    FROM subscriptions s
    JOIN customers c ON s.customer_id = c.id
    WHERE s.status = 'ACTIVE' AND s.deleted_at IS NULL
  `)

  const freqDays = { '1W': 7, '2W': 14, '4W': 28 }
  const now = new Date()
  const endDate = new Date(now.getTime() + weeks * 7 * 24 * 60 * 60 * 1000)

  // 주간별 SKU 수요
  const weeklyDemand = {}

  for (const sub of activeSubs.rows) {
    const items = typeof sub.items === 'string' ? JSON.parse(sub.items) : sub.items
    const freq = freqDays[sub.frequency] || 7

    // next_payment_at부터 endDate까지 배송일 계산
    let deliveryDate = sub.next_payment_at ? new Date(sub.next_payment_at) : new Date()

    while (deliveryDate <= endDate) {
      if (deliveryDate >= now) {
        const weekKey = getWeekKey(deliveryDate)
        if (!weeklyDemand[weekKey]) weeklyDemand[weekKey] = { skus: {}, deliveries: [] }

        for (const item of items) {
          const sku = item.sku_code
          if (!weeklyDemand[weekKey].skus[sku]) weeklyDemand[weekKey].skus[sku] = 0
          weeklyDemand[weekKey].skus[sku] += item.quantity
        }

        weeklyDemand[weekKey].deliveries.push({
          customer: sub.customer_name,
          date: deliveryDate.toISOString().split('T')[0],
          items,
        })
      }

      deliveryDate = new Date(deliveryDate.getTime() + freq * 24 * 60 * 60 * 1000)
    }
  }

  return weeklyDemand
}

/**
 * 미처리 주문 (PENDING + PAID + PROCESSING) 수량 계산
 * @returns {Promise<Object>} SKU별 수량
 */
const getPendingOrderDemand = async () => {
  const result = await query(`
    SELECT oi.sku_id, s.code AS sku_code, s.name AS sku_name,
           SUM(oi.quantity) AS total_qty
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    JOIN skus s ON oi.sku_id = s.id
    WHERE o.status IN ('PENDING', 'PAID', 'PROCESSING')
      AND o.deleted_at IS NULL
    GROUP BY oi.sku_id, s.code, s.name
  `)

  const demand = {}
  result.rows.forEach((r) => {
    demand[r.sku_code] = {
      quantity: parseInt(r.total_qty),
      name: r.sku_name,
    }
  })

  return demand
}

/**
 * 카페 일 평균 소비량 (최근 7일 기준)
 * @returns {Promise<Object>} SKU별 일 평균
 */
const getCafeDailyAverage = async () => {
  try {
    const result = await query(`
      SELECT cs.menu_name,
             CEIL(SUM(cs.quantity)::numeric / GREATEST(COUNT(DISTINCT cs.sale_date), 1)) AS daily_avg
      FROM cafe_sales cs
      WHERE cs.sale_date >= CURRENT_DATE - 7
      GROUP BY cs.menu_name
    `)

    const demand = {}
    result.rows.forEach((r) => {
      // 메뉴명으로 SKU 코드 역매핑
      const skuCode = menuToSku(r.menu_name)
      if (skuCode) {
        demand[skuCode] = {
          daily_avg: parseInt(r.daily_avg),
          name: r.menu_name,
        }
      }
    })

    return demand
  } catch {
    // 카페 데이터 없으면 빈 객체
    return {}
  }
}

/**
 * 카페 메뉴명 → SKU 코드 매핑
 * @param {string} menuName
 * @returns {string|null}
 */
const menuToSku = (menuName) => {
  if (!menuName) return null
  const name = menuName.toLowerCase()
  if (name.includes('750')) return 'A2-750'
  if (name.includes('180') && name.includes('우유')) return 'A2-180'
  if (name.includes('500')) return 'YG-500'
  if (name.includes('180') && name.includes('발효')) return 'YG-180'
  if (name.includes('아이스크림') || name.includes('소프트')) return 'SI-001'
  if (name.includes('카이막')) return 'KM-100'
  return null
}

/**
 * B2B 거래처별 주문 현황
 * @returns {Promise<Array>} 거래처별 SKU 수량
 */
const getB2BDemand = async () => {
  const result = await query(`
    SELECT c.name AS customer_name, s.code AS sku_code, s.name AS sku_name,
           SUM(oi.quantity) AS total_qty,
           COUNT(DISTINCT o.id) AS order_count
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    JOIN skus s ON oi.sku_id = s.id
    JOIN customers c ON o.customer_id = c.id
    WHERE o.channel = 'B2B'
      AND o.status NOT IN ('CANCELLED', 'RETURNED')
      AND o.created_at >= DATE_TRUNC('month', NOW())
      AND o.deleted_at IS NULL
    GROUP BY c.name, s.code, s.name
    ORDER BY c.name
  `)

  return result.rows
}

/**
 * SKU 수량 → 원유 필요량 변환
 * @param {Object} skuQuantities - { 'A2-750': 10, 'YG-500': 5, ... }
 * @returns {Object} { total_raw_milk_l, breakdown }
 */
const calculateRawMilkNeeded = (skuQuantities) => {
  let totalRawMilk = 0
  const breakdown = []

  for (const [skuCode, qty] of Object.entries(skuQuantities)) {
    const bom = RAW_MILK_BOM[skuCode]
    if (!bom) continue

    const rawMilk = bom.raw_milk_l * qty
    totalRawMilk += rawMilk

    breakdown.push({
      sku_code: skuCode,
      quantity: qty,
      raw_milk_per_unit: bom.raw_milk_l,
      raw_milk_total: Math.round(rawMilk * 10) / 10,
      description: bom.description,
    })
  }

  return {
    total_raw_milk_l: Math.round(totalRawMilk * 10) / 10,
    breakdown,
  }
}

/**
 * 종합 생산 계획 보고서
 * 모든 채널의 수요를 합산 → 원유 필요량 → 목장 생산 가능량과 비교
 * @returns {Promise<Object>} 생산 계획 데이터
 */
const generateProductionPlan = async () => {
  const [subDemand, pendingDemand, cafeDemand, b2bDemand] = await Promise.all([
    getSubscriptionDemand(2),
    getPendingOrderDemand(),
    getCafeDailyAverage(),
    getB2BDemand(),
  ])

  // 이번주 구독 수요
  const thisWeekKey = getWeekKey(new Date())
  const thisWeekSubs = subDemand[thisWeekKey]?.skus || {}

  // 카페 주간 환산 (일평균 × 7)
  const cafeWeekly = {}
  for (const [sku, data] of Object.entries(cafeDemand)) {
    cafeWeekly[sku] = data.daily_avg * 7
  }

  // 전체 SKU 합산 (이번주 기준)
  const totalSkuDemand = {}
  const addDemand = (source, skus) => {
    for (const [sku, qty] of Object.entries(skus)) {
      if (!totalSkuDemand[sku]) totalSkuDemand[sku] = { total: 0, sources: {} }
      const q = typeof qty === 'object' ? qty.quantity || qty.daily_avg || 0 : qty
      totalSkuDemand[sku].total += q
      totalSkuDemand[sku].sources[source] = q
    }
  }

  addDemand('구독', thisWeekSubs)
  addDemand('미처리주문', pendingDemand)
  addDemand('카페(주간)', cafeWeekly)

  // 원유 필요량 계산
  const skuTotals = {}
  for (const [sku, data] of Object.entries(totalSkuDemand)) {
    skuTotals[sku] = data.total
  }
  const milkCalc = calculateRawMilkNeeded(skuTotals)

  // 일평균 필요량
  const dailyNeed = Math.round(milkCalc.total_raw_milk_l / 7 * 10) / 10

  // 목장 생산 vs 수요 비교
  const availableForFactory = DAILY_MILKING_L  // 납유 쿼터는 ERP 밖

  return {
    period: `${thisWeekKey} (이번주)`,
    generated_at: new Date().toISOString(),

    // 채널별 수요
    demand_by_channel: {
      subscriptions: thisWeekSubs,
      pending_orders: pendingDemand,
      cafe_weekly: cafeWeekly,
      b2b_monthly: b2bDemand,
    },

    // SKU별 통합 수요
    demand_by_sku: totalSkuDemand,

    // 원유 필요량
    raw_milk: {
      weekly_need_l: milkCalc.total_raw_milk_l,
      daily_need_l: dailyNeed,
      breakdown: milkCalc.breakdown,
    },

    // 목장 생산 현황
    farm_capacity: {
      daily_milking_l: DAILY_MILKING_L,
      weekly_milking_l: DAILY_MILKING_L * 7,
      dairy_quota_l: DAIRY_QUOTA_L,
      note: '낙농진흥회 납유 200L/일은 ERP 밖 별도 집계',
    },

    // 결론
    summary: {
      daily_available: availableForFactory,
      daily_needed: dailyNeed,
      surplus_l: Math.round((availableForFactory - dailyNeed) * 10) / 10,
      status: availableForFactory >= dailyNeed ? '충분' : '부족',
      message: availableForFactory >= dailyNeed
        ? `일 ${availableForFactory}L 착유 중 ${dailyNeed}L 필요. 여유분 ${Math.round(availableForFactory - dailyNeed)}L`
        : `⚠️ 일 ${dailyNeed}L 필요하나 ${availableForFactory}L만 생산 가능. ${Math.round(dailyNeed - availableForFactory)}L 부족!`,
    },
  }
}

/**
 * 주차 키 생성 (YYYY-W##)
 * @param {Date} date
 * @returns {string}
 */
const getWeekKey = (date) => {
  const d = new Date(date)
  const yearStart = new Date(d.getFullYear(), 0, 1)
  const weekNum = Math.ceil(((d - yearStart) / 86400000 + yearStart.getDay() + 1) / 7)
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`
}

module.exports = {
  RAW_MILK_BOM,
  DAILY_MILKING_L,
  DAIRY_QUOTA_L,
  getSubscriptionDemand,
  getPendingOrderDemand,
  getCafeDailyAverage,
  getB2BDemand,
  calculateRawMilkNeeded,
  generateProductionPlan,
}
