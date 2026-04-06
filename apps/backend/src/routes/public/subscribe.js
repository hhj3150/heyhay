/**
 * @fileoverview 공개 정기구독 신청 API (인증 불필요)
 * POST /api/v1/public/subscribe — 구독 + 결제 대기 레코드 생성
 */
const express = require('express')
const { z } = require('zod')
const { query, transaction } = require('../../config/database')
const { validate } = require('../../middleware/validate')
const { apiResponse, apiError, PUBLIC_SKUS, SHIPPING } = require('../../lib/shared')
const crypto = require('crypto')

const router = express.Router()

/** PUBLIC_SKUS를 code 키 맵으로 변환 (가격 조회용) */
const SKU_MAP = Object.freeze(
  PUBLIC_SKUS.reduce((acc, s) => ({ ...acc, [s.code]: s }), {}),
)

/** 허용된 SKU 코드 목록 */
const ALLOWED_SKU_CODES = PUBLIC_SKUS.map((s) => s.code)

/** 공개 구독 신청 스키마 */
const publicSubscribeSchema = z.object({
  name: z.string().min(1, '이름은 필수입니다').max(50),
  phone: z.string().regex(
    /^01[0-9]-?[0-9]{3,4}-?[0-9]{4}$/,
    '올바른 휴대전화 번호를 입력하세요',
  ),
  address_zip: z.string().max(10).optional(),
  address_main: z.string().min(1, '주소는 필수입니다').max(255),
  address_detail: z.string().max(255).optional(),
  items: z.array(z.object({
    sku_code: z.enum(ALLOWED_SKU_CODES, { errorMap: () => ({ message: '유효하지 않은 상품입니다' }) }),
    quantity: z.number().int().positive().max(100),
  })).min(1, '최소 1개 이상의 상품을 선택해야 합니다'),
  frequency: z.enum(['1W', '2W', '4W'], { errorMap: () => ({ message: '배송 주기: 1W/2W/4W' }) }),
  delivery_days: z.array(z.enum(['TUE', 'FRI'])).min(1, '배송 요일을 선택해주세요'),
  pg_provider: z.enum(['kakaopay', 'naverpay']).optional(),
  started_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  consent_privacy: z.literal(true, { errorMap: () => ({ message: '개인정보 수집·이용 동의는 필수입니다' }) }),
  consent_sms: z.boolean().default(false),
})

/**
 * 서버 측 가격·배송비 재계산 (DB 최신 단가 기준)
 * @param {Array} items - [{sku_code, quantity}]
 * @returns {Promise<{ subtotal: number, shipping_fee: number, total: number, enriched_items: Array }>}
 */
const calculatePricing = async (items) => {
  const codes = items.map((i) => i.sku_code)
  const priceResult = await query(`
    SELECT s.code, s.name, COALESCE(sp.unit_price, 0) AS unit_price
    FROM skus s
    LEFT JOIN sku_prices sp ON sp.sku_code = s.code AND sp.channel = 'RETAIL' AND sp.effective_to IS NULL
    WHERE s.code = ANY($1)
  `, [codes])

  const priceMap = {}
  for (const r of priceResult.rows) {
    priceMap[r.code] = { name: r.name, unit_price: parseInt(r.unit_price, 10) }
  }

  const enriched_items = items.map((i) => {
    const dbSku = priceMap[i.sku_code]
    const fallbackSku = SKU_MAP[i.sku_code]
    const unit_price = dbSku?.unit_price || fallbackSku?.unit_price || 0
    const name = dbSku?.name || fallbackSku?.name || i.sku_code
    return {
      sku_code: i.sku_code, name, unit_price,
      quantity: i.quantity, line_total: unit_price * i.quantity,
    }
  })
  const subtotal = enriched_items.reduce((sum, i) => sum + i.line_total, 0)
  const shipping_fee = subtotal >= SHIPPING.free_threshold ? 0 : SHIPPING.base_fee
  const total = subtotal + shipping_fee
  return { subtotal, shipping_fee, total, enriched_items }
}

/** 전화번호 정규화 (하이픈 제거) */
const normalizePhone = (phone) => phone.replace(/-/g, '')

/** merchant_uid 생성: SUB-{timestamp}-{random} */
const generateMerchantUid = () => {
  const ts = Date.now().toString(36)
  const rand = crypto.randomBytes(4).toString('hex')
  return `SUB-${ts}-${rand}`
}

/** 배송 시작일 계산: 다음 배송 요일 (화 or 금) */
const getNextDeliveryDate = (deliveryDays) => {
  const dayMap = { TUE: 2, FRI: 5 }
  const targetDays = deliveryDays.map((d) => dayMap[d]).sort()
  const d = new Date()
  d.setDate(d.getDate() + 3) // 최소 3일 후

  for (let i = 0; i < 14; i++) {
    if (targetDays.includes(d.getDay())) {
      return d.toISOString().split('T')[0]
    }
    d.setDate(d.getDate() + 1)
  }
  return d.toISOString().split('T')[0]
}

/** POST / — 정기구독 신청 + 결제 대기 레코드 생성 */
router.post('/', validate(publicSubscribeSchema), async (req, res, next) => {
  try {
    const body = req.body
    const phone = normalizePhone(body.phone)
    const signupIp = req.ip || req.headers['x-forwarded-for'] || null

    // 1) 서버 측 가격 재계산
    const { subtotal, shipping_fee, total, enriched_items } = await calculatePricing(body.items)

    // 2) 고객 UPSERT
    const existingCust = await query(
      'SELECT id FROM customers WHERE phone = $1 AND deleted_at IS NULL LIMIT 1',
      [phone],
    )

    let customerId
    if (existingCust.rows.length > 0) {
      customerId = existingCust.rows[0].id
      await query(`
        UPDATE customers SET
          name = $1, address_zip = COALESCE($2, address_zip),
          address_main = COALESCE($3, address_main),
          address_detail = COALESCE($4, address_detail),
          marketing_sms = CASE WHEN $5 = true THEN true ELSE marketing_sms END,
          updated_at = NOW()
        WHERE id = $6
      `, [body.name, body.address_zip, body.address_main, body.address_detail, body.consent_sms, customerId])
    } else {
      const newCust = await query(`
        INSERT INTO customers (name, phone, channel, address_zip, address_main, address_detail, marketing_sms, segment)
        VALUES ($1, $2, 'OWN_MALL', $3, $4, $5, $6, 'NEW')
        RETURNING id
      `, [body.name, phone, body.address_zip, body.address_main, body.address_detail, body.consent_sms])
      customerId = newCust.rows[0].id
    }

    // 3) 구독 + 결제 레코드 트랜잭션 생성
    const merchantUid = generateMerchantUid()
    const startedAt = body.started_at || getNextDeliveryDate(body.delivery_days)
    const planName = `정기구독 ${body.frequency}`
    const pgProvider = body.pg_provider || 'kakaopay'

    const result = await transaction(async (client) => {
      // 구독 생성 (PAYMENT_PENDING)
      const subResult = await client.query(`
        INSERT INTO subscriptions (
          customer_id, plan_name, frequency, items, price_per_cycle,
          shipping_fee, delivery_days, status, started_at, merchant_uid,
          pg_provider, signup_source, signup_ip, consent_sms, consent_privacy
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'PAYMENT_PENDING', $8, $9, $10, 'LANDING_PAGE', $11, $12, $13)
        RETURNING id, created_at
      `, [
        customerId, planName, body.frequency, JSON.stringify(enriched_items), total,
        shipping_fee, body.delivery_days, startedAt, merchantUid,
        pgProvider, signupIp, body.consent_sms, body.consent_privacy,
      ])

      // 결제 레코드 생성 (PENDING)
      await client.query(`
        INSERT INTO payments (subscription_id, customer_id, merchant_uid, pg_provider, amount, status)
        VALUES ($1, $2, $3, $4, $5, 'PENDING')
      `, [subResult.rows[0].id, customerId, merchantUid, pgProvider, total])

      return subResult.rows[0]
    })

    res.status(201).json(apiResponse({
      signup_id: result.id,
      merchant_uid: merchantUid,
      amount: total,
      subtotal,
      shipping_fee,
      started_at: startedAt,
      delivery_days: body.delivery_days,
    }))
  } catch (err) {
    next(err)
  }
})

module.exports = router
