/**
 * @fileoverview AI 비서 API — Claude Sonnet 기반
 * 1) 질문 응답: DB 실데이터 기반 자연어 대답
 * 2) 음성 주문: "밀크카페 우유 100개 주문해줘" → 복명복창 → 확인 → 자동 등록
 */
const express = require('express')
const { query, transaction } = require('../../config/database')
const { apiResponse, apiError } = require('../../lib/shared')

const router = express.Router()

// ── SKU 퍼지 매칭 맵 ─────────────────────────────────────
const SKU_ALIASES = {
  '우유750': 'A2-750', '우유 750': 'A2-750', '750우유': 'A2-750', '750ml': 'A2-750',
  '우유대': 'A2-750', '대용량우유': 'A2-750', '큰우유': 'A2-750',
  '우유180': 'A2-180', '우유 180': 'A2-180', '180우유': 'A2-180', '180ml': 'A2-180',
  '우유소': 'A2-180', '소용량우유': 'A2-180', '작은우유': 'A2-180', '미니우유': 'A2-180',
  '요거트500': 'YG-500', '요거트 500': 'YG-500', '발효유500': 'YG-500', '발효유 500': 'YG-500',
  '요거트대': 'YG-500', '큰요거트': 'YG-500',
  '요거트180': 'YG-180', '요거트 180': 'YG-180', '발효유180': 'YG-180', '발효유 180': 'YG-180',
  '요거트소': 'YG-180', '작은요거트': 'YG-180',
  '아이스크림': 'SI-001', '소프트아이스크림': 'SI-001', '소프트': 'SI-001',
  '카이막': 'KM-100', '카이막100': 'KM-100',
}

// ── 거래처 퍼지 매칭 맵 ──────────────────────────────────
const PARTNER_ALIASES = {
  '밀크카페': '안성팜랜드 밀크카페',
  '카페': '안성팜랜드 밀크카페',
  '안성팜랜드': '안성팜랜드 밀크카페',
  '팜랜드': '안성팜랜드 밀크카페',
  '와인코리아': '와인코리아',
  '와인': '와인코리아',
}

/**
 * DB에서 현재 상태 요약 수집
 */
const gatherContext = async () => {
  const results = {}

  // 생산 계획
  try {
    const { generateProductionPlan } = require('../../services/milkDemand')
    results.production = await generateProductionPlan()
  } catch { results.production = null }

  // 오늘 배송 체크리스트
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

  // 오늘 배송 상세 (거래처별)
  try {
    const today = new Date().toISOString().split('T')[0]
    const detail = await query(`
      SELECT dc.recipient_name, dc.is_packed, dc.is_shipped, dc.has_issue,
        dc.total_amount, dc.notes
      FROM delivery_checklist dc
      WHERE dc.delivery_date = $1
      ORDER BY dc.is_shipped ASC, dc.is_packed ASC
    `, [today])
    results.checklist_detail = detail.rows
  } catch { results.checklist_detail = [] }

  // 구독자 현황
  try {
    const subs = await query(`
      SELECT COUNT(*) FILTER (WHERE status = 'ACTIVE') AS active,
        COUNT(*) FILTER (WHERE status = 'PAUSED') AS paused,
        COALESCE(SUM(price_per_cycle) FILTER (WHERE status = 'ACTIVE'), 0) AS mrr
      FROM subscriptions WHERE deleted_at IS NULL
    `)
    results.subscriptions = subs.rows[0]
  } catch { results.subscriptions = null }

  // 주문 현황
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

  // B2B 거래처별 정기주문 현황
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

  // B2B 거래처별 미처리 주문
  try {
    const pendingB2b = await query(`
      SELECT o.recipient_name AS partner, o.order_number, o.status, o.total_amount,
        o.created_at::date AS order_date,
        STRING_AGG(s.name || ' ' || oi.quantity || '개', ', ') AS items_summary
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      JOIN skus s ON s.id = oi.sku_id
      WHERE o.channel = 'B2B'
        AND o.status IN ('PENDING', 'PAID', 'PROCESSING')
        AND o.deleted_at IS NULL
      GROUP BY o.id, o.recipient_name, o.order_number, o.status, o.total_amount, o.created_at
      ORDER BY o.created_at ASC
    `)
    results.pending_b2b_orders = pendingB2b.rows
  } catch { results.pending_b2b_orders = [] }

  // 고객 세그먼트
  try {
    const customers = await query(`SELECT segment, COUNT(*) AS count FROM customers WHERE deleted_at IS NULL GROUP BY segment`)
    results.customers = customers.rows
  } catch { results.customers = [] }

  // 최근 착유량 (최근 7일)
  try {
    const milk = await query(`
      SELECT date::text, total_l, COALESCE(dairy_assoc_l, 0) AS dairy_l, COALESCE(d2o_l, 0) AS d2o_l
      FROM daily_milk_totals
      WHERE date >= (NOW() AT TIME ZONE 'Asia/Seoul')::date - 7
      ORDER BY date DESC
    `)
    results.milking = milk.rows
  } catch { results.milking = [] }

  // 단가 설정
  try {
    const prices = await query(`SELECT key, value FROM settings WHERE key LIKE '%unit_price' OR key LIKE '%price%' OR key LIKE '%dairy%'`)
    results.prices = {}
    prices.rows.forEach((r) => { results.prices[r.key] = r.value })
  } catch { results.prices = {} }

  // 월간 착유 정산
  try {
    const monthly = await query(`
      SELECT COALESCE(SUM(dairy_assoc_l), 0) AS month_dairy_l, COALESCE(SUM(d2o_l), 0) AS month_d2o_l,
        COALESCE(SUM(total_l), 0) AS month_total_l,
        COUNT(*) FILTER (WHERE dairy_assoc_l > 0) AS dairy_days, COUNT(*) FILTER (WHERE d2o_l > 0) AS d2o_days,
        COUNT(*) FILTER (WHERE total_l > 0) AS milking_days
      FROM daily_milk_totals WHERE date >= DATE_TRUNC('month', (NOW() AT TIME ZONE 'Asia/Seoul')::date)
    `)
    results.monthly_settlement = monthly.rows[0]
  } catch { results.monthly_settlement = null }

  // 이번달 총 매출 (주문 합계)
  try {
    const monthlySales = await query(`
      SELECT COALESCE(SUM(total_amount), 0) AS month_sales,
        COUNT(*) AS month_order_count,
        COALESCE(SUM(total_amount) FILTER (WHERE channel = 'B2B'), 0) AS b2b_sales,
        COALESCE(SUM(total_amount) FILTER (WHERE channel = 'ONLINE'), 0) AS online_sales,
        COALESCE(SUM(total_amount) FILTER (WHERE channel NOT IN ('B2B', 'ONLINE')), 0) AS other_sales
      FROM orders
      WHERE deleted_at IS NULL
        AND status NOT IN ('CANCELLED', 'REFUNDED')
        AND created_at >= DATE_TRUNC('month', (NOW() AT TIME ZONE 'Asia/Seoul'))
    `)
    results.monthly_sales = monthlySales.rows[0]
  } catch { results.monthly_sales = null }

  // SKU 목록 (주문 처리용)
  try {
    const skus = await query(`SELECT id, code, name, default_price FROM skus WHERE is_active = true ORDER BY code`)
    results.skus = skus.rows
  } catch { results.skus = [] }

  // B2B 거래처 목록 (주문 처리용)
  try {
    const partners = await query(`SELECT id, name, contact_phone, address FROM b2b_partners WHERE is_active = true AND deleted_at IS NULL`)
    results.partners = partners.rows
  } catch { results.partners = [] }

  return results
}

/**
 * 시스템 프롬프트 생성 — ERP 전체 도메인 지식 포함
 * @param {object} context - gatherContext() 결과
 * @returns {string}
 */
const buildSystemPrompt = (context) => {
  const todayMilking = context.milking?.[0]
  const hasTodayMilking = todayMilking && todayMilking.total_l > 0

  return `당신은 HEY HAY MILK ERP의 AI 경영 비서입니다. 하원장님(ADMIN)에게 보고하는 전문 비서처럼 행동하세요.

═══════════════════════════════════════
  사업 구조 (Farm-to-Consumer 전체 흐름)
═══════════════════════════════════════

## 1단계: 원유 생산 (송영신목장)
- A2 저지종 60두+, 일 착유량 약 550L (오전/오후 2회)
- 착유 → 냉각탱크 → 집유

## 2단계: 원유 배분
- 우선순위 1: D2O 공장 투입 (당일 주문량 기반 — 주문 먼저, 남는 양 진흥회)
- 우선순위 2: 낙농진흥회 납유 (여유분)
- Loss율: 약 2%

## 3단계: 낙농진흥회 납유 정산
- 쿼터: 200L/일 (현재 기준)
- 정상유대: 180L까지 적용 (쿼터 내)
- 초과분: 180L 넘는 물량은 리터당 -100원 감액
- 예시: 250L 납유 시 → 180L × 정상단가 + 70L × (정상단가 - 100원)
- D2O 납유 단가: settings 테이블에서 조회 (아래 데이터 참조)

## 4단계: D2O 유가공 공장
- D2O 농업회사법인 / 경기도청 허가 / 300L/hr 설비
- 공정: 원유수령 → 품질검사 → 크림분리 → 바켓여과(80→120mesh) → 살균 CCP1(HTST 72°C/15초) → 균질 → 냉각 → 여과 CCP2(120mesh) → 충진
- 카이막: 별도탱크 85~90°C 장시간 가열

## 5단계: 판매 채널 (3개)
- B2B: 안성팜랜드 밀크카페(위탁), 와인코리아 등 → 직접배달
- 온라인: 스마트스토어 + 자사몰 (HACCP 준비 중) → 택배
- 공장 직판: 현장 판매

## SKU 6종
| 코드 | 제품명 | 용량 |
|------|--------|------|
| A2-750 | A2 저지우유 | 750ml |
| A2-180 | A2 저지우유 | 180ml |
| YG-500 | 발효유 | 500ml |
| YG-180 | 발효유 | 180ml |
| SI-001 | 소프트아이스크림 | 즉석제조 |
| KM-100 | 카이막 | 100g |

═══════════════════════════════════════
  등록된 SKU 및 가격 (DB 실데이터)
═══════════════════════════════════════
${JSON.stringify(context.skus, null, 2)}

═══════════════════════════════════════
  등록된 B2B 거래처 (DB 실데이터)
═══════════════════════════════════════
${JSON.stringify(context.partners, null, 2)}

═══════════════════════════════════════
  SKU 별칭 (퍼지 매칭용 — 사용자가 이렇게 말할 수 있음)
═══════════════════════════════════════
우유750, 750우유, 대용량우유, 큰우유 → A2-750
우유180, 180우유, 소용량우유, 미니우유 → A2-180
요거트500, 발효유500, 큰요거트 → YG-500
요거트180, 발효유180, 작은요거트 → YG-180
아이스크림, 소프트아이스크림, 소프트 → SI-001
카이막, 카이막100 → KM-100

═══════════════════════════════════════
  거래처 별칭 (퍼지 매칭용)
═══════════════════════════════════════
밀크카페, 카페, 안성팜랜드, 팜랜드 → 안성팜랜드 밀크카페
와인코리아, 와인 → 와인코리아

═══════════════════════════════════════
  현재 실시간 데이터 (DB 조회 결과)
═══════════════════════════════════════

### 착유량 (최근 7일)
${hasTodayMilking
    ? `오늘: ${todayMilking.total_l}L (진흥회 ${todayMilking.dairy_l}L / D2O ${todayMilking.d2o_l}L)`
    : '오늘: 아직 입력 전'}
전체 7일:
${JSON.stringify(context.milking, null, 2)}

### 월간 착유 정산
${JSON.stringify(context.monthly_settlement, null, 2)}

### 단가 설정 (settings 테이블)
${JSON.stringify(context.prices, null, 2)}

### 이번달 매출
${JSON.stringify(context.monthly_sales, null, 2)}

### 주문 현황
${JSON.stringify(context.orders, null, 2)}

### 구독자 현황
${JSON.stringify(context.subscriptions, null, 2)}

### B2B 거래처 현황
${JSON.stringify(context.b2b, null, 2)}

### B2B 미처리 주문
${JSON.stringify(context.pending_b2b_orders, null, 2)}

### 오늘 배송 체크리스트
요약: ${JSON.stringify(context.checklist, null, 2)}
상세:
${JSON.stringify(context.checklist_detail, null, 2)}

### 고객 세그먼트
${JSON.stringify(context.customers, null, 2)}

═══════════════════════════════════════
  주문 처리 규칙 (매우 중요!)
═══════════════════════════════════════

### 주문 감지
사용자가 주문을 요청하면 (키워드: "주문", "넣어줘", "등록해줘", "보내줘", "출하해줘", "배송해줘", "보내줘", "넣어", "줘")
반드시 아래 JSON 형식으로만 응답하세요.

### 거래처 퍼지 매칭 규칙
- "밀크카페", "카페", "안성팜랜드", "팜랜드" → 안성팜랜드 밀크카페
- "와인코리아", "와인" → 와인코리아
- 매칭 안 되면 사용자에게 "어느 거래처인가요?" 되물어라

### SKU 퍼지 매칭 규칙
- "우유750", "750우유", "대용량우유", "큰우유" → A2-750
- "우유180", "180우유", "미니우유" → A2-180
- "요거트500", "큰요거트", "발효유500" → YG-500
- "요거트180", "작은요거트", "발효유180" → YG-180
- "아이스크림", "소프트" → SI-001
- "카이막" → KM-100
- "우유"만 말하면 → "750ml인가요, 180ml인가요?" 되물어라
- "요거트"/"발효유"만 말하면 → "500ml인가요, 180ml인가요?" 되물어라

### 배송 방법 자동 판단
- B2B 거래처 주문: channel = "B2B", 배송방법 = 직접배달
- 온라인 주문 (개인 고객): channel = "ONLINE", 배송방법 = 택배
- 거래처명이 DB 등록 거래처에 있으면 → B2B
- 개인 이름/전화번호로 주문하면 → ONLINE

### 복명복창 형식 (반드시 준수)
주문 요청 시 응답 JSON:
{
  "answer": "[거래처명]에 다음 주문 넣겠습니다:\\n\\n• [제품명] [수량]개 × [단가]원 = [소계]원\\n• [제품명] [수량]개 × [단가]원 = [소계]원\\n━━━━━━━━━━━━\\n합계: [총액]원\\n배송: [직접배달/택배]\\n\\n맞으면 '확인' 또는 '주문해'라고 말씀해주세요.",
  "order_data": {
    "partner_name": "정식 거래처명 (DB 기준)",
    "channel": "B2B 또는 ONLINE",
    "items": [
      {"sku_code": "A2-750", "sku_id": "UUID", "quantity": 100, "unit_price": 7000}
    ],
    "recipient_name": "수령인명",
    "recipient_phone": "전화번호 (없으면 빈 문자열)"
  }
}

주의: 단가는 반드시 DB의 SKU default_price 또는 B2B standing_orders unit_price를 사용하세요.
단가 × 수량 계산을 반드시 정확히 하세요. 천 단위 쉼표 표기.

### 일반 질문 응답
주문이 아닌 일반 질문: order_data 없이 answer만 반환 (JSON이 아닌 일반 텍스트)

═══════════════════════════════════════
  응답 규칙
═══════════════════════════════════════

1. 한국어로 간결하게 (3~5문장, 필요시 더 길어도 됨)
2. 숫자는 DB 기준 정확히 — 추측이나 반올림 금지
3. 착유량 데이터가 없는 날: "아직 입력 전입니다" 솔직히 안내 (절대 추정하지 말 것)
4. 원장님께 보고하듯 친근하고 명확하게
5. 금액은 천 단위 쉼표, 리터는 L 단위
6. 납유대금 계산 시 반드시 진흥회 규칙(180L 기준 초과분 감액) 적용
7. 구독자 관련: 배송 누락 없는지 체크, 수량 검증 포함
8. 확실하지 않으면 "확인이 필요합니다"라고 솔직히
9. 주문 복명복창 시 제품명, 수량, 단가, 소계, 합계 모두 명시`
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
    const systemPrompt = buildSystemPrompt(context)

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 800,
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
      // JSON 블록이 ```json ... ``` 으로 감싸져 있을 수 있음
      const jsonMatch = answer.match(/```json\s*([\s\S]*?)```/) || answer.match(/(\{[\s\S]*"order_data"[\s\S]*\})/)
      const jsonStr = jsonMatch ? jsonMatch[1] : answer
      const parsed = JSON.parse(jsonStr.trim())
      if (parsed.order_data) {
        // 퍼지 매칭 후처리: partner_name 정규화
        const normalizedPartner = fuzzyMatchPartner(parsed.order_data.partner_name)
        const normalizedItems = parsed.order_data.items.map((item) => ({
          ...item,
          sku_code: fuzzyMatchSku(item.sku_code) || item.sku_code,
        }))
        return res.json(apiResponse({
          answer: parsed.answer,
          order_data: {
            ...parsed.order_data,
            partner_name: normalizedPartner || parsed.order_data.partner_name,
            items: normalizedItems,
          },
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
 * 거래처 퍼지 매칭
 * @param {string} input - 사용자 입력 거래처명
 * @returns {string|null} 매칭된 정식 거래처명
 */
function fuzzyMatchPartner(input) {
  if (!input) return null
  const normalized = input.trim().toLowerCase().replace(/\s+/g, '')
  // 정확한 별칭 매칭
  for (const [alias, name] of Object.entries(PARTNER_ALIASES)) {
    if (normalized.includes(alias.toLowerCase().replace(/\s+/g, ''))) {
      return name
    }
  }
  return null
}

/**
 * SKU 퍼지 매칭
 * @param {string} input - 사용자 입력 SKU명
 * @returns {string|null} 매칭된 SKU 코드
 */
function fuzzyMatchSku(input) {
  if (!input) return null
  const normalized = input.trim().toLowerCase().replace(/\s+/g, '')
  // 이미 정식 코드면 그대로
  const validCodes = ['A2-750', 'A2-180', 'YG-500', 'YG-180', 'SI-001', 'KM-100']
  if (validCodes.includes(input.toUpperCase())) return input.toUpperCase()
  // 별칭 매칭
  for (const [alias, code] of Object.entries(SKU_ALIASES)) {
    if (normalized === alias.toLowerCase().replace(/\s+/g, '')) {
      return code
    }
  }
  return null
}

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
    // 퍼지 매칭 적용
    const resolvedCode = fuzzyMatchSku(item.sku_code) || item.sku_code
    const sku = skuMap[resolvedCode]
    if (!sku) continue
    validItems.push({
      sku_id: sku.id,
      sku_code: resolvedCode,
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

  // 채널 자동 판단: 거래처명이 DB에 있으면 B2B, 아니면 ONLINE
  const resolvedChannel = channel || 'B2B'

  const result = await transaction(async (client) => {
    const orderRes = await client.query(`
      INSERT INTO orders (order_number, channel, status, subtotal, shipping_fee, discount, total_amount,
        recipient_name, recipient_phone)
      VALUES ($1, $2, 'PAID', $3, 0, 0, $3, $4, $5) RETURNING *
    `, [orderNumber, resolvedChannel, subtotal, recipient_name || partner_name, recipient_phone || ''])

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
    return `${sku?.name || ''} ${i.quantity}개 (${(i.quantity * i.unit_price).toLocaleString()}원)`
  }).join(', ')

  return {
    answer: `주문 완료!\n\n주문번호: ${orderNumber}\n거래처: ${recipient_name || partner_name}\n채널: ${resolvedChannel === 'B2B' ? 'B2B (직접배달)' : '온라인 (택배)'}\n상품: ${itemSummary}\n합계: ${subtotal.toLocaleString()}원\n\n주문 관리에서 확인하세요.`,
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
  const monthly = ctx.monthly_sales || {}

  if (q.includes('납유') || q.includes('진흥회')) {
    const milking = ctx.milking?.[0]
    if (!milking || !milking.total_l) {
      return '오늘 착유량이 아직 입력 전입니다. 착유 후 다시 확인해주세요.'
    }
    return `오늘 착유량 ${milking.total_l}L 중 D2O ${milking.d2o_l}L, 진흥회 납유 ${milking.dairy_l}L입니다.`
  }
  if (q.includes('매출')) {
    return `이번달 총 매출 ${parseInt(monthly.month_sales || 0).toLocaleString()}원 (${monthly.month_order_count || 0}건). B2B ${parseInt(monthly.b2b_sales || 0).toLocaleString()}원, 온라인 ${parseInt(monthly.online_sales || 0).toLocaleString()}원.`
  }
  if (q.includes('생산') || q.includes('공장')) {
    return `오늘 D2O 공장 생산 계획은 ${prod.daily_to_factory || 0}L입니다.`
  }
  if (q.includes('배송') || q.includes('체크')) {
    const total = parseInt(cl.total) || 0
    const shipped = parseInt(cl.shipped) || 0
    const issues = parseInt(cl.issues) || 0
    return `오늘 배송 ${total}건 중 ${shipped}건 발송 완료.${issues > 0 ? ` 이슈 ${issues}건 확인 필요.` : ''}`
  }
  if (q.includes('구독') || q.includes('정기')) {
    return `활성 구독자 ${subs.active || 0}명, 일시정지 ${subs.paused || 0}명. 월 반복 수익 ${parseInt(subs.mrr || 0).toLocaleString()}원.`
  }
  if (q.includes('주문')) {
    const orders = ctx.orders || {}
    return `처리 대기: 접수 ${orders.pending || 0}건, 결제완료 ${orders.paid || 0}건, 처리중 ${orders.processing || 0}건. 오늘 신규 ${orders.today_orders || 0}건.`
  }
  if (q.includes('착유') || q.includes('우유량')) {
    const milking = ctx.milking?.[0]
    if (!milking || !milking.total_l) {
      return '오늘 착유량이 아직 입력 전입니다.'
    }
    return `오늘 착유량 ${milking.total_l}L (D2O ${milking.d2o_l}L / 진흥회 ${milking.dairy_l}L).`
  }
  return `${prod.daily_milking || '착유 미입력'}L 착유 중, 구독자 ${subs.active || 0}명 활성, 이번달 매출 ${parseInt(monthly.month_sales || 0).toLocaleString()}원.`
}

module.exports = router
