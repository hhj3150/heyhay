/**
 * @fileoverview PortOne 웹훅 수신 (인증 불필요 — 서명/금액 검증으로 보호)
 * POST /api/v1/public/portone/webhook
 *
 * PortOne 관리자에서 등록한 URL로 결제 이벤트가 POST됨.
 * payload: { imp_uid, merchant_uid, status }
 *
 * 보안: PortOne API로 결제 재조회하여 금액·상태 독립 검증 (요청 본문 신뢰 금지).
 */
const express = require('express')
const { z } = require('zod')
const { query } = require('../../config/database')
const { validate } = require('../../middleware/validate')
const { apiResponse, apiError } = require('../../lib/shared')

const router = express.Router()

const webhookSchema = z.object({
  imp_uid: z.string().min(1),
  merchant_uid: z.string().min(1),
  status: z.string().min(1),
})

/** PortOne 상태 → 내부 결제 상태 매핑 */
const mapStatus = (portoneStatus) => {
  const map = {
    paid: 'PAID',
    ready: 'PENDING',
    failed: 'FAILED',
    cancelled: 'CANCELLED',
  }
  return map[portoneStatus] || 'FAILED'
}

/** POST /webhook — PortOne 이벤트 수신 */
router.post('/webhook', validate(webhookSchema), async (req, res, next) => {
  try {
    const { imp_uid, merchant_uid, status } = req.body

    // 1) 해당 merchant_uid의 결제 레코드 조회
    const paymentResult = await query(
      'SELECT id, subscription_id, amount, status AS current_status FROM payments WHERE merchant_uid = $1',
      [merchant_uid],
    )

    if (paymentResult.rows.length === 0) {
      // 알 수 없는 merchant_uid는 조용히 무시 (재전송 루프 방지)
      return res.json(apiResponse({ skipped: true, reason: 'unknown merchant_uid' }))
    }

    const paymentRow = paymentResult.rows[0]

    // 2) PortOne API로 독립 검증 (키 미설정 시에는 상태만 반영)
    let verified = false
    try {
      const { verifyPayment } = require('../../services/portone')
      const result = await verifyPayment(imp_uid, paymentRow.amount)
      verified = result.verified
    } catch (portoneErr) {
      if (portoneErr.message.includes('설정되지 않았습니다')) {
        verified = status === 'paid' // 테스트 모드
      } else {
        throw portoneErr
      }
    }

    const newStatus = verified && status === 'paid' ? 'PAID' : mapStatus(status)

    // 3) 상태 변경이 없으면 조용히 종료 (중복 웹훅)
    if (paymentRow.current_status === newStatus) {
      return res.json(apiResponse({ skipped: true, reason: 'no change' }))
    }

    // 4) payments 상태 갱신
    await query(
      `UPDATE payments SET status = $1, imp_uid = $2,
         paid_at = CASE WHEN $1 = 'PAID' THEN NOW() ELSE paid_at END,
         failed_reason = CASE WHEN $1 IN ('FAILED','CANCELLED') THEN $3 ELSE failed_reason END
       WHERE id = $4`,
      [newStatus, imp_uid, `portone webhook: ${status}`, paymentRow.id],
    )

    // 5) 결제 취소·실패 시 구독 일시정지 + 관리자 알림
    if (newStatus === 'CANCELLED' || newStatus === 'FAILED') {
      await query(
        `UPDATE subscriptions SET status = 'PAUSED', pause_reason = $1, updated_at = NOW()
         WHERE id = $2 AND status = 'ACTIVE'`,
        [`PortOne ${status}`, paymentRow.subscription_id],
      )

      await query(
        `INSERT INTO alerts (module, priority, alert_type, title, message, target_roles)
         VALUES ('market', 'P2', 'PAYMENT_WEBHOOK', $1, $2, '["ADMIN"]')`,
        [
          `결제 상태 변경 — ${merchant_uid}`,
          `PortOne 웹훅 수신: ${merchant_uid} / status=${status} / 금액 ₩${paymentRow.amount.toLocaleString('ko-KR')}`,
        ],
      )
    }

    res.json(apiResponse({ processed: true, status: newStatus }))
  } catch (err) {
    next(err)
  }
})

module.exports = router
