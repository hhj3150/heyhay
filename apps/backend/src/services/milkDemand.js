/**
 * @fileoverview 원유 수요 계산 서비스
 * 주문(구독+일반+카페+B2B) → SKU별 수량 → 원유 필요량 역산
 *
 * ★ 사업 구조 (핵심):
 * 송영신목장 일 착유 ~550L
 * → ① 주문량 기반 D2O 공장 생산 (최우선)
 * → ② 남는 양만 낙농진흥회 납유
 * ※ 주문이 많아지면 진흥회 납유량이 줄어드는 구조
 *
 * 원유 소요량 기준 (loss 2% 적용):
 * - 살균유: 원유 × 1.02 (2% 손실)
 * - 발효유: 원유 × 1.02 (2% 손실)
 * - 카이막: 원유 10L → 카이막 100g (크림 분리, 농축)
 * - 소프트아이스크림: 원유 0.5L → 1서빙
 *
 * 스마트스토어: HACCP 인증 후 ~1개월 뒤 유제품 등록 예정
 * (현재는 에프트밀크(반려식물 퇴비)만 판매 중)
 */
const { query } = require('../config/database')

// ── 기본값 (DB system_settings 로드 실패 시 폴백) ──────────
/** 공정 손실률 2% */
const DEFAULT_LOSS_RATE = 0.02

/** 일 착유량 기본값 (송영신목장 전체) */
const DEFAULT_DAILY_MILKING_L = 550

/** SKU→설정키 매핑 (system_settings key → ml 단위) */
const SKU_MILK_KEYS = {
  'A2-750': 'a2_750_milk_ml',
  'A2-180': 'a2_180_milk_ml',
  'YG-500': 'yg_500_milk_ml',
  'YG-180': 'yg_180_milk_ml',
  'SI-001': 'si_001_milk_ml',
  'KM-100': 'km_100_milk_ml',
}

/** 기본 원유 소요량 (ml, loss 미적용 원본) */
const DEFAULT_RAW_MILK_ML = {
  'A2-750': 765,
  'A2-180': 184,
  'YG-500': 510,
  'YG-180': 184,
  'SI-001': 500,
  'KM-100': 10000,
}

/**
 * system_settings PRODUCTION 카테고리에서 로스율·원유소요량을 로드
 * @returns {Promise<{lossRate: number, dailyMilking: number, rawMilkBom: Object}>}
 */
const loadProductionSettings = async () => {
  try {
    const result = await query(
      "SELECT key, value FROM system_settings WHERE category = 'PRODUCTION'",
    )
    const map = {}
    result.rows.forEach((r) => { map[r.key] = r.value })

    const lossRate = parseFloat(map.loss_rate_pct || DEFAULT_LOSS_RATE * 100) / 100

    // SKU별 원유 소요량 (ml → L 변환)
    const rawMilkBom = {}
    for (const [sku, settingKey] of Object.entries(SKU_MILK_KEYS)) {
      const ml = parseInt(map[settingKey]) || DEFAULT_RAW_MILK_ML[sku]
      rawMilkBom[sku] = {
        raw_milk_l: ml / 1000,
        description: `${sku} 원유 ${ml}ml (DB 설정)`,
      }
    }

    return { lossRate, dailyMilking: DEFAULT_DAILY_MILKING_L, rawMilkBom }
  } catch {
    // DB 접근 실패 시 하드코딩 폴백
    const rawMilkBom = {}
    for (const [sku, ml] of Object.entries(DEFAULT_RAW_MILK_ML)) {
      rawMilkBom[sku] = {
        raw_milk_l: ml / 1000,
        description: `${sku} 원유 ${ml}ml (기본값)`,
      }
    }
    return { lossRate: DEFAULT_LOSS_RATE, dailyMilking: DEFAULT_DAILY_MILKING_L, rawMilkBom }
  }
}

// 하위 호환: 기존 코드에서 참조하는 상수 유지 (동기 폴백용)
const LOSS_RATE = DEFAULT_LOSS_RATE
const DAILY_MILKING_L = DEFAULT_DAILY_MILKING_L
const RAW_MILK_BOM = Object.freeze((() => {
  const bom = {}
  for (const [sku, ml] of Object.entries(DEFAULT_RAW_MILK_ML)) {
    bom[sku] = { raw_milk_l: ml / 1000, description: `${sku} 원유 ${ml}ml` }
  }
  return bom
})())

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
  try {
    // b2b_standing_orders 테이블에서 정기주문 기반 수요 계산
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
    const weeklyBySku = {}
    const byPartner = []

    result.rows.forEach((r) => {
      const weekly = Math.ceil(r.quantity * (freqMultiplier[r.frequency] || 1))
      if (!weeklyBySku[r.sku_code]) weeklyBySku[r.sku_code] = 0
      weeklyBySku[r.sku_code] += weekly
      byPartner.push({ ...r, weekly_qty: weekly })
    })

    return { weekly_by_sku: weeklyBySku, by_partner: byPartner }
  } catch {
    // b2b_partners 테이블 미생성 시 fallback
    return { weekly_by_sku: {}, by_partner: [] }
  }
}

/**
 * SKU 수량 → 원유 필요량 변환
 * @param {Object} skuQuantities - { 'A2-750': 10, 'YG-500': 5, ... }
 * @param {Object} [bomOverride] - DB에서 로드한 BOM (없으면 기본값 사용)
 * @returns {Object} { total_raw_milk_l, breakdown }
 */
const calculateRawMilkNeeded = (skuQuantities, bomOverride) => {
  const activeBom = bomOverride || RAW_MILK_BOM
  let totalRawMilk = 0
  const breakdown = []

  for (const [skuCode, qty] of Object.entries(skuQuantities)) {
    const bom = activeBom[skuCode]
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
  const [subDemand, pendingDemand, cafeDemand, b2bDemand, prodSettings] = await Promise.all([
    getSubscriptionDemand(2),
    getPendingOrderDemand(),
    getCafeDailyAverage(),
    getB2BDemand(),
    loadProductionSettings(),
  ])

  const { lossRate, dailyMilking, rawMilkBom } = prodSettings

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

  // B2B 정기주문 주간 환산 수요 합산
  const b2bWeekly = b2bDemand.weekly_by_sku || {}
  addDemand('B2B', b2bWeekly)

  // 원유 필요량 계산
  const skuTotals = {}
  for (const [sku, data] of Object.entries(totalSkuDemand)) {
    skuTotals[sku] = data.total
  }
  // DB에서 로드한 BOM으로 원유 필요량 계산
  const milkCalc = calculateRawMilkNeeded(skuTotals, rawMilkBom)

  // 일평균 필요량
  const dailyNeed = Math.round(milkCalc.total_raw_milk_l / 7 * 10) / 10

  // ★ 핵심 구조: 주문 생산 먼저 → 남는 양만 진흥회 납유
  const dailyToFactory = dailyNeed  // D2O 공장에서 생산할 양
  const dailyToDairy = Math.round((dailyMilking - dailyNeed) * 10) / 10  // 진흥회 납유량
  const weeklyToDairy = Math.round(dailyToDairy * 7 * 10) / 10

  return {
    period: `${thisWeekKey} (이번주)`,
    generated_at: new Date().toISOString(),

    // 채널별 수요
    demand_by_channel: {
      subscriptions: thisWeekSubs,
      pending_orders: pendingDemand,
      cafe_weekly: cafeWeekly,
      b2b: b2bDemand,
    },

    // SKU별 통합 수요
    demand_by_sku: totalSkuDemand,

    // 원유 필요량 (DB 설정값 기반)
    raw_milk: {
      weekly_need_l: milkCalc.total_raw_milk_l,
      daily_need_l: dailyNeed,
      loss_rate_pct: lossRate * 100,
      breakdown: milkCalc.breakdown,
    },

    // 원유 배분 계획
    milk_allocation: {
      daily_milking_l: dailyMilking,
      daily_to_factory_l: dailyToFactory,
      daily_to_dairy_l: dailyToDairy,
      weekly_to_factory_l: Math.round(dailyToFactory * 7 * 10) / 10,
      weekly_to_dairy_l: weeklyToDairy,
      note: '주문 생산 먼저 → 남는 양만 낙농진흥회 납유',
    },

    // 목장 정보
    farm_capacity: {
      daily_milking_l: dailyMilking,
      weekly_milking_l: dailyMilking * 7,
    },

    // 스마트스토어 상태
    smartstore: {
      status: 'HACCP_PENDING',
      current_products: '에프트밀크 (반려식물 퇴비)',
      dairy_launch_eta: 'HACCP 인증 후 ~1개월',
      note: '유제품 미등록 — 자사몰/B2B/카페 주문만 집계',
    },

    // 결론
    summary: {
      daily_milking: dailyMilking,
      daily_to_factory: dailyToFactory,
      daily_to_dairy: dailyToDairy,
      status: dailyToDairy >= 0 ? '정상' : '⚠️ 생산량 초과',
      message: dailyToDairy >= 0
        ? `일 ${dailyMilking}L 착유 → D2O 생산 ${dailyToFactory}L + 진흥회 납유 ${dailyToDairy}L`
        : `⚠️ 일 ${dailyNeed}L 필요하나 ${dailyMilking}L만 착유 가능. ${Math.abs(dailyToDairy)}L 부족!`,
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
  LOSS_RATE,
  loadProductionSettings,
  getSubscriptionDemand,
  getPendingOrderDemand,
  getCafeDailyAverage,
  getB2BDemand,
  calculateRawMilkNeeded,
  generateProductionPlan,
}
