/**
 * @fileoverview 공개 구독 신청 API (인증 불필요)
 * POST /api/v1/public/subscribe — 랜딩 페이지에서 사전 신청 접수
 */
const express = require('express')
const { z } = require('zod')
const { query } = require('../../config/database')
const { validate } = require('../../middleware/validate')
const { apiResponse, apiError, PUBLIC_SKUS, SHIPPING } = require('../../lib/shared')

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
  started_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  consent_privacy: z.literal(true, { errorMap: () => ({ message: '개인정보 수집·이용 동의는 필수입니다' }) }),
  consent_sms: z.boolean().default(false),
})

/**
 * 서버 측 가격·배송비 재계산
 * @param {Array} items - [{sku_code, quantity}]
 * @returns {{ subtotal: number, shipping_fee: number, total: number, enriched_items: Array }}
 */
const calculatePricing = (items) => {
  const enriched_items = items.map((i) => {
    const sku = SKU_MAP[i.sku_code]
    return {
      sku_code: i.sku_code,
      name: sku.name,
      unit_price: sku.unit_price,
      quantity: i.quantity,
      line_total: sku.unit_price * i.quantity,
    }
  })
  const subtotal = enriched_items.reduce((sum, i) => sum + i.line_total, 0)
  const shipping_fee = subtotal >= SHIPPING.free_threshold ? 0 : SHIPPING.base_fee
  const total = subtotal + shipping_fee
  return { subtotal, shipping_fee, total, enriched_items }
}

/** 전화번호 정규화 (하이픈 제거) */
const normalizePhone = (phone) => phone.replace(/-/g, '')

/** 기본 시작일: 다음주 화요일 (YYYY-MM-DD) */
const getDefaultStartedAt = () => {
  const d = new Date()
  d.setDate(d.getDate() + 7)
  // 다음주 화요일까지 이동 (0=일, 2=화)
  while (d.getDay() !== 2) d.setDate(d.getDate() + 1)
  return d.toISOString().split('T')[0]
}

/** POST / — 공개 구독 신청 접수 */
router.post('/', validate(publicSubscribeSchema), async (req, res, next) => {
  try {
    const body = req.body
    const phone = normalizePhone(body.phone)
    const signupIp = req.ip || req.headers['x-forwarded-for'] || null

    // 1) 서버 측 재계산 (클라이언트 값 신뢰 금지)
    const { subtotal, shipping_fee, total, enriched_items } = calculatePricing(body.items)

    // 2) 고객 UPSERT (phone 기준)
    const existingCust = await query(
      'SELECT id, marketing_sms FROM customers WHERE phone = $1 AND deleted_at IS NULL LIMIT 1',
      [phone],
    )

    let customerId
    if (existingCust.rows.length > 0) {
      customerId = existingCust.rows[0].id
      // 이름·주소 업데이트 (최신 값으로)
      await query(`
        UPDATE customers SET
          name = $1,
          address_zip = COALESCE($2, address_zip),
          address_main = COALESCE($3, address_main),
          address_detail = COALESCE($4, address_detail),
          marketing_sms = CASE WHEN $5 = true THEN true ELSE marketing_sms END,
          updated_at = NOW()
        WHERE id = $6
      `, [
        body.name, body.address_zip, body.address_main, body.address_detail,
        body.consent_sms, customerId,
      ])
    } else {
      const newCust = await query(`
        INSERT INTO customers (
          name, phone, channel, address_zip, address_main, address_detail,
          marketing_sms, segment
        ) VALUES ($1, $2, 'OWN_MALL', $3, $4, $5, $6, 'NEW')
        RETURNING id
      `, [
        body.name, phone, body.address_zip, body.address_main, body.address_detail,
        body.consent_sms,
      ])
      customerId = newCust.rows[0].id
    }

    // 3) 중복 PENDING_SIGNUP 체크 (동일 고객이 이미 신청 중이면 신규 row 생성 안 함)
    const existingSignup = await query(`
      SELECT id FROM subscriptions
      WHERE customer_id = $1 AND status = 'PENDING_SIGNUP' AND deleted_at IS NULL
      LIMIT 1
    `, [customerId])

    if (existingSignup.rows.length > 0) {
      return res.status(202).json(apiResponse({
        signup_id: existingSignup.rows[0].id,
        already_pending: true,
        message: '이미 신청이 접수되어 있습니다. HACCP 인증 완료 후 연락드리겠습니다.',
      }))
    }

    // 4) 구독 신청 INSERT
    const startedAt = body.started_at || getDefaultStartedAt()
    const planName = `사전신청 ${body.frequency}`

    const result = await query(`
      INSERT INTO subscriptions (
        customer_id, plan_name, frequency, items, price_per_cycle,
        shipping_fee, status, started_at, signup_source, signup_ip,
        consent_sms, consent_privacy
      ) VALUES ($1, $2, $3, $4, $5, $6, 'PENDING_SIGNUP', $7, 'LANDING_PAGE', $8, $9, $10)
      RETURNING id, created_at
    `, [
      customerId, planName, body.frequency, JSON.stringify(enriched_items), total,
      shipping_fee, startedAt, signupIp, body.consent_sms, body.consent_privacy,
    ])

    res.status(201).json(apiResponse({
      signup_id: result.rows[0].id,
      started_at: startedAt,
      subtotal,
      shipping_fee,
      total,
      message: '신청이 접수되었습니다. HACCP 인증 완료 후 연락드리겠습니다.',
    }))
  } catch (err) {
    next(err)
  }
})

module.exports = router
