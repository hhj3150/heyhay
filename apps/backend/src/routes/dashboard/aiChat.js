/**
 * @fileoverview AI 비서 API — Claude Sonnet 기반 음성 대화형
 * DB 실데이터를 조회해서 자연어로 대답
 * "오늘 납유량은?" → DB 조회 → Claude → 자연어 응답
 */
const express = require('express')
const { query } = require('../../config/database')
const { apiResponse, apiError } = require('@heyhay/shared')

const router = express.Router()

/**
 * DB에서 현재 상태 요약 수집
 * @returns {Promise<string>} 컨텍스트 문자열
 */
const gatherContext = async () => {
  const results = {}

  // 생산 계획
  try {
    const { generateProductionPlan } = require('../../services/milkDemand')
    results.production = await generateProductionPlan()
  } catch { results.production = null }

  // 오늘 체크리스트 현황
  try {
    const today = new Date().toISOString().split('T')[0]
    const cl = await query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE is_packed) AS packed,
        COUNT(*) FILTER (WHERE is_shipped) AS shipped,
        COUNT(*) FILTER (WHERE has_issue) AS issues,
        COALESCE(SUM(total_amount), 0) AS total_amount
      FROM delivery_checklist WHERE delivery_date = $1
    `, [today])
    results.checklist = cl.rows[0]
  } catch { results.checklist = null }

  // 구독자 현황
  try {
    const subs = await query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'ACTIVE') AS active,
        COUNT(*) FILTER (WHERE status = 'PAUSED') AS paused,
        COUNT(*) FILTER (WHERE status = 'CANCELLED') AS cancelled,
        COALESCE(SUM(price_per_cycle) FILTER (WHERE status = 'ACTIVE'), 0) AS mrr
      FROM subscriptions WHERE deleted_at IS NULL
    `)
    results.subscriptions = subs.rows[0]
  } catch { results.subscriptions = null }

  // 주문 현황
  try {
    const orders = await query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'PENDING') AS pending,
        COUNT(*) FILTER (WHERE status = 'PAID') AS paid,
        COUNT(*) FILTER (WHERE status = 'PROCESSING') AS processing,
        COUNT(*) FILTER (WHERE status = 'SHIPPED') AS shipped,
        COUNT(*) FILTER (WHERE DATE(created_at) = CURRENT_DATE) AS today_orders
      FROM orders WHERE deleted_at IS NULL
    `)
    results.orders = orders.rows[0]
  } catch { results.orders = null }

  // B2B 거래처
  try {
    const b2b = await query(`
      SELECT p.name, COUNT(bso.id) AS products,
             COALESCE(SUM(bso.quantity * bso.unit_price), 0) AS estimated
      FROM b2b_partners p
      LEFT JOIN b2b_standing_orders bso ON bso.partner_id = p.id AND bso.is_active = true
      WHERE p.is_active = true AND p.deleted_at IS NULL
      GROUP BY p.name
    `)
    results.b2b = b2b.rows
  } catch { results.b2b = [] }

  // 고객 세그먼트
  try {
    const customers = await query(`
      SELECT segment, COUNT(*) AS count
      FROM customers WHERE deleted_at IS NULL
      GROUP BY segment
    `)
    results.customers = customers.rows
  } catch { results.customers = [] }

  return results
}

/** POST /ai-chat — AI 대화 */
router.post('/ai-chat', async (req, res, next) => {
  try {
    const { message } = req.body
    if (!message) return res.status(400).json(apiError('NO_MESSAGE', '질문을 입력하세요'))

    const apiKey = process.env.CLAUDE_API_KEY
    if (!apiKey) {
      // API 키 없으면 로컬 응답 생성
      const context = await gatherContext()
      const localAnswer = generateLocalAnswer(message, context)
      return res.json(apiResponse({ answer: localAnswer, source: 'local' }))
    }

    // DB 컨텍스트 수집
    const context = await gatherContext()

    const systemPrompt = `당신은 HEY HAY MILK ERP의 AI 비서입니다.
송영신목장(A2 저지종, 일 착유 550L) → D2O 유가공 공장 → 온라인/B2B 판매 구조입니다.
주문 생산 먼저, 남는 양만 낙농진흥회 납유합니다.

현재 실시간 데이터:
${JSON.stringify(context, null, 2)}

규칙:
- 한국어로 간결하게 대답 (2-3문장)
- 숫자는 정확히, 모르면 "확인이 필요합니다"
- 원장님이 물어보는 것처럼 친근하게 대답
- 음성으로 읽히므로 짧고 명확하게`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 300,
        system: systemPrompt,
        messages: [{ role: 'user', content: message }],
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Claude API error:', errorText)
      // fallback
      const localAnswer = generateLocalAnswer(message, context)
      return res.json(apiResponse({ answer: localAnswer, source: 'local' }))
    }

    const data = await response.json()
    const answer = data.content?.[0]?.text || '응답을 생성할 수 없습니다.'

    res.json(apiResponse({ answer, source: 'claude' }))
  } catch (err) {
    next(err)
  }
})

/**
 * API 키 없을 때 로컬 응답 생성
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
    return `오늘 D2O 공장 생산 계획은 ${prod.daily_to_factory || 0}L입니다. ${prod.message || ''}`
  }

  if (q.includes('배송') || q.includes('체크') || q.includes('발송')) {
    const total = parseInt(cl.total) || 0
    const shipped = parseInt(cl.shipped) || 0
    return `오늘 배송 ${total}건 중 ${shipped}건 발송 완료, ${total - shipped}건 남았습니다.${parseInt(cl.issues) > 0 ? ` 이슈 ${cl.issues}건 있습니다.` : ''}`
  }

  if (q.includes('구독') || q.includes('정기')) {
    return `활성 구독자 ${subs.active || 0}명, 일시정지 ${subs.paused || 0}명입니다. 월 반복 수익은 ${parseInt(subs.mrr || 0).toLocaleString()}원입니다.`
  }

  if (q.includes('주문')) {
    const orders = ctx.orders || {}
    return `처리 대기 주문: 접수 ${orders.pending || 0}건, 결제완료 ${orders.paid || 0}건, 처리중 ${orders.processing || 0}건입니다.`
  }

  if (q.includes('거래처') || q.includes('b2b') || q.includes('비투비')) {
    const names = (ctx.b2b || []).map((b) => b.name).join(', ')
    return `현재 B2B 거래처: ${names || '없음'}입니다.`
  }

  return `${prod.daily_milking || 550}L 착유 중, D2O ${prod.daily_to_factory || 0}L 생산, 진흥회 ${prod.daily_to_dairy || 0}L 납유 예정입니다. 구독자 ${subs.active || 0}명 활성 중입니다.`
}

module.exports = router
