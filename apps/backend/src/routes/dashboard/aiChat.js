/**
 * @fileoverview AI 비서 API — Claude Sonnet 기반
 * 1) 질문 응답: DB 실데이터 기반 자연어 대답
 * 2) 음성 주문: "밀크카페 우유 100개 주문해줘" → 복명복창 → 확인 → 자동 등록
 */
const express = require('express')
const { query, transaction } = require('../../config/database')
const { apiResponse, apiError } = require('../../lib/shared')

const router = express.Router()

/**
 * DB에서 현재 상태 요약 수집
 */
const gatherContext = async () => {
  const results = {}

  try {
    const { generateProductionPlan } = require('../../services/milkDemand')
    results.production = await generateProductionPlan()
  } catch { results.production = null }

  try {
    const today = new Date().toISOString().split('T')[0]
    const cl = await query(`
      SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE is_packed) AS packed,
        COUNT(*) FILTER (WHERE is_shipped) AS shipped, COUNT(*) FILTER (WHERE has_issue) AS issues,
        COALESCE(SUM(total_amount), 0) AS total_amount
      FROM delivery_checklist WHERE delivery_date = $1
    `, [today])
    results.checklist = cl.rows[0]
  } catch { results.checklist = null }

  try {
    const subs = await query(`
      SELECT COUNT(*) FILTER (WHERE status = 'ACTIVE') AS active,
        COUNT(*) FILTER (WHERE status = 'PAUSED') AS paused,
        COALESCE(SUM(price_per_cycle) FILTER (WHERE status = 'ACTIVE'), 0) AS mrr
      FROM subscriptions WHERE deleted_at IS NULL
    `)
    results.subscriptions = subs.rows[0]
  } catch { results.subscriptions = null }

  try {
    const orders = await query(`
      SELECT COUNT(*) FILTER (WHERE status = 'PENDING') AS pending,
        COUNT(*) FILTER (WHERE status = 'PAID') AS paid,
        COUNT(*) FILTER (WHERE status = 'PROCESSING') AS processing,
        COUNT(*) FILTER (WHERE status = 'SHIPPED') AS shipped,
        COUNT(*) FILTER (WHERE DATE(created_at) = CURRENT_DATE) AS today_orders
      FROM orders WHERE deleted_at IS NULL
    `)
    results.orders = orders.rows[0]
  } catch { results.orders = null }

  try {
    const b2b = await query(`
      SELECT p.name, COUNT(bso.id) AS products,
        COALESCE(SUM(bso.quantity * bso.unit_price), 0) AS estimated
      FROM b2b_partners p
      LEFT JOIN b2b_standing_orders bso ON bso.partner_id = p.id AND bso.is_active = true
      WHERE p.is_active = true AND p.deleted_at IS NULL GROUP BY p.name
    `)
    results.b2b = b2b.rows
  } catch { results.b2b = [] }

  try {
    const customers = await query(`SELECT segment, COUNT(*) AS count FROM customers WHERE deleted_at IS NULL GROUP BY segment`)
    results.customers = customers.rows
  } catch { results.customers = [] }

  try {
    const milk = await query(`
      SELECT date::text, total_l, COALESCE(dairy_assoc_l, 0) AS dairy_l, COALESCE(d2o_l, 0) AS d2o_l
      FROM daily_milk_totals WHERE date >= (NOW() AT TIME ZONE 'Asia/Seoul')::date - 1 ORDER BY date DESC LIMIT 2
    `)
    results.milking = milk.rows
  } catch { results.milking = [] }

  try {
    const prices = await query(`SELECT key, value FROM settings WHERE key LIKE '%unit_price'`)
    results.prices = {}
    prices.rows.forEach((r) => { results.prices[r.key] = parseInt(r.value) })
  } catch { results.prices = {} }

  try {
    const monthly = await query(`
      SELECT COALESCE(SUM(dairy_assoc_l), 0) AS month_dairy_l, COALESCE(SUM(d2o_l), 0) AS month_d2o_l,
        COUNT(*) FILTER (WHERE dairy_assoc_l > 0) AS dairy_days, COUNT(*) FILTER (WHERE d2o_l > 0) AS d2o_days
      FROM daily_milk_totals WHERE date >= DATE_TRUNC('month', (NOW() AT TIME ZONE 'Asia/Seoul')::date)
    `)
    results.monthly_settlement = monthly.rows[0]
  } catch { results.monthly_settlement = null }

  // SKU 목록 (주문 처리용)
  try {
    const skus = await query(`SELECT id, code, name, default_price FROM skus WHERE is_active = true ORDER BY code`)
    results.skus = skus.rows
  } catch { results.skus = [] }

  // B2B 거래처 목록 (주문 처리용)
  try {
    const partners = await query(`SELECT id, name FROM b2b_partners WHERE is_active = true AND deleted_at IS NULL`)
    results.partners = partners.rows
  } catch { results.partners = [] }

  return results
}

/** POST /ai-chat — AI 대화 + 주문 처리 */
router.post('/ai-chat', async (req, res, next) => {
  try {
    const { message, confirm_order } = req.body
    if (!message && !confirm_order) return res.status(400).json(apiError('NO_MESSAGE', '질문을 입력하세요'))

    // 주문 확인 처리
    if (confirm_order) {
      const result = await executeOrder(confirm_order)
      return res.json(apiResponse(result))
    }

    const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.Claude_API_Key || process.env.claude_api_key
    if (!apiKey) {
      const context = await gatherContext()
      const localAnswer = generateLocalAnswer(message, context)
      return res.json(apiResponse({ answer: localAnswer, source: 'local' }))
    }

    const context = await gatherContext()

    const systemPrompt = `당신은 HEY HAY MILK ERP의 AI 경영 비서입니다.

## 사업 구조
- 송영신목장: A2 저지종 60두+, 일 착유 약 550L
- 납유처 2곳: ①낙농진흥회(180L까지 정상유대, 초과분 -100원/L) ②D2O 농업회사법인(유가공)
- D2O 공장: 주문량 기반 생산 → 남는 양만 진흥회 납유
- 판매: 온라인(스마트스토어 예정) + B2B(밀크카페, 와인코리아) + 공장직판
- SKU 6종: A2우유 750ml(A2-750)/180ml(A2-180), 발효유 500ml(YG-500)/180ml(YG-180), 소프트아이스크림(SI-001), 카이막 100g(KM-100)
- Loss율: 2%

## 등록된 SKU 및 가격
${JSON.stringify(context.skus, null, 2)}

## 등록된 B2B 거래처
${JSON.stringify(context.partners, null, 2)}

## 현재 실시간 데이터
${JSON.stringify({
  milking: context.milking,
  orders: context.orders,
  subscriptions: context.subscriptions,
  b2b: context.b2b,
  checklist: context.checklist,
  prices: context.prices,
  monthly_settlement: context.monthly_settlement,
}, null, 2)}

## 주문 처리 규칙 (매우 중요!)
사용자가 주문을 요청하면 (예: "밀크카페 우유 100개 주문해줘"):
1. 반드시 아래 JSON 형식으로 응답
2. answer에 복명복창 (뭘 주문하는지 확인)
3. order_data에 주문 정보 JSON

주문 요청 감지 키워드: "주문", "넣어줘", "등록해줘", "보내줘", "출하해줘"

주문 요청 시 응답 형식:
{
  "answer": "밀크카페에 A2 저지우유 750ml 100개, A2 저지우유 180ml 20개 주문 넣을까요?\\n합계: xxx,xxx원\\n\\n'주문해' 또는 '확인'이라고 말씀해주세요.",
  "order_data": {
    "partner_name": "안성팜랜드 밀크카페",
    "channel": "B2B",
    "items": [
      {"sku_code": "A2-750", "sku_id": "xxx", "quantity": 100, "unit_price": 9000},
      {"sku_code": "A2-180", "sku_id": "xxx", "quantity": 20, "unit_price": 3500}
    ],
    "recipient_name": "안성팜랜드 밀크카페",
    "recipient_phone": ""
  }
}

주문이 아닌 일반 질문 시: order_data 없이 answer만 반환

## 일반 규칙
- 한국어 간결하게 (3-4문장)
- 숫자는 DB 기준 정확히
- "milking" 데이터가 실제 착유 기록 — 우선 사용
- 원장님께 보고하듯 친근하고 명확하게
- 주문 복명복창 시 제품명, 수량, 금액 모두 명시`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        system: systemPrompt,
        messages: [{ role: 'user', content: message }],
      }),
    })

    if (!response.ok) {
      const context2 = await gatherContext()
      const localAnswer = generateLocalAnswer(message, context2)
      return res.json(apiResponse({ answer: localAnswer, source: 'local' }))
    }

    const data = await response.json()
    let answer = data.content?.[0]?.text || '응답을 생성할 수 없습니다.'

    // JSON 응답 파싱 시도 (주문 데이터 포함 여부)
    try {
      const parsed = JSON.parse(answer)
      if (parsed.order_data) {
        return res.json(apiResponse({
          answer: parsed.answer,
          order_data: parsed.order_data,
          source: 'claude',
        }))
      }
    } catch {
      // JSON이 아닌 일반 텍스트 응답
    }

    res.json(apiResponse({ answer, source: 'claude' }))
  } catch (err) {
    next(err)
  }
})

/**
 * 주문 실행 — AI가 파싱한 order_data로 실제 DB 주문 등록
 */
async function executeOrder(orderData) {
  const { partner_name, channel, items, recipient_name, recipient_phone } = orderData

  if (!items || items.length === 0) {
    return { answer: '주문할 상품이 없습니다.', success: false }
  }

  // SKU ID 확인
  const skuRows = await query(`SELECT id, code, name, default_price FROM skus WHERE is_active = true`)
  const skuMap = {}
  skuRows.rows.forEach((s) => { skuMap[s.code] = s })

  const validItems = []
  for (const item of items) {
    const sku = skuMap[item.sku_code]
    if (!sku) continue
    validItems.push({
      sku_id: sku.id,
      quantity: parseInt(item.quantity),
      unit_price: parseInt(item.unit_price) || parseInt(sku.default_price) || 0,
    })
  }

  if (validItems.length === 0) {
    return { answer: '유효한 상품을 찾을 수 없습니다.', success: false }
  }

  // 주문번호 생성
  const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '')
  const seqRes = await query(`SELECT COUNT(*) + 1 AS seq FROM orders WHERE order_number LIKE $1`, [`HH-${dateStr}-%`])
  const orderNumber = `HH-${dateStr}-${String(seqRes.rows[0].seq).padStart(4, '0')}`

  const subtotal = validItems.reduce((sum, i) => sum + i.quantity * i.unit_price, 0)

  const result = await transaction(async (client) => {
    const orderRes = await client.query(`
      INSERT INTO orders (order_number, channel, status, subtotal, shipping_fee, discount, total_amount,
        recipient_name, recipient_phone)
      VALUES ($1, $2, 'PAID', $3, 0, 0, $3, $4, $5) RETURNING *
    `, [orderNumber, channel || 'B2B', subtotal, recipient_name || partner_name, recipient_phone || ''])

    const orderId = orderRes.rows[0].id

    for (const item of validItems) {
      await client.query(`
        INSERT INTO order_items (order_id, sku_id, quantity, unit_price, subtotal)
        VALUES ($1, $2, $3, $4, $5)
      `, [orderId, item.sku_id, item.quantity, item.unit_price, item.quantity * item.unit_price])
    }

    return orderRes.rows[0]
  })

  const itemSummary = validItems.map((i) => {
    const sku = Object.values(skuMap).find((s) => s.id === i.sku_id)
    return `${sku?.name || ''} ${i.quantity}개`
  }).join(', ')

  return {
    answer: `✅ 주문 완료!\n\n주문번호: ${orderNumber}\n거래처: ${recipient_name || partner_name}\n상품: ${itemSummary}\n합계: ${subtotal.toLocaleString()}원\n\n주문 관리에서 확인하세요.`,
    success: true,
    order_id: result.id,
    order_number: orderNumber,
  }
}

/**
 * 로컬 응답 (API 키 없을 때)
 */
function generateLocalAnswer(message, ctx) {
  const q = message.toLowerCase()
  const prod = ctx.production?.summary || {}
  const cl = ctx.checklist || {}
  const subs = ctx.subscriptions || {}

  if (q.includes('납유') || q.includes('진흥회')) {
    return `오늘 착유량 ${prod.daily_milking || 550}L 중 D2O 생산 ${prod.daily_to_factory || 0}L을 빼면, 진흥회 납유량은 약 ${prod.daily_to_dairy || 0}L입니다.`
  }
  if (q.includes('생산') || q.includes('공장')) {
    return `오늘 D2O 공장 생산 계획은 ${prod.daily_to_factory || 0}L입니다.`
  }
  if (q.includes('배송') || q.includes('체크')) {
    const total = parseInt(cl.total) || 0
    const shipped = parseInt(cl.shipped) || 0
    return `오늘 배송 ${total}건 중 ${shipped}건 발송 완료.`
  }
  if (q.includes('구독') || q.includes('정기')) {
    return `활성 구독자 ${subs.active || 0}명. 월 반복 수익 ${parseInt(subs.mrr || 0).toLocaleString()}원.`
  }
  if (q.includes('주문')) {
    const orders = ctx.orders || {}
    return `처리 대기: 접수 ${orders.pending || 0}건, 결제완료 ${orders.paid || 0}건, 처리중 ${orders.processing || 0}건.`
  }
  return `${prod.daily_milking || 550}L 착유 중, 구독자 ${subs.active || 0}명 활성.`
}

module.exports = router
