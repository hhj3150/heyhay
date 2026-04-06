/**
 * @fileoverview 결제 검증 API (인증 불필요)
 * POST /api/v1/public/payment/verify — PortOne 결제 완료 후 서버 검증
 */
const express = require('express')
const { z } = require('zod')
const { query, transaction } = require('../../config/database')
const { validate } = require('../../middleware/validate')
const { apiResponse, apiError } = require('../../lib/shared')

const router = express.Router()

const verifySchema = z.object({
  imp_uid: z.string().min(1, 'imp_uid는 필수입니다'),
  merchant_uid: z.string().min(1, 'merchant_uid는 필수입니다'),
})

/** next_payment_at 계산: 주기별 다음 결제일 */
const calcNextPayment = (startedAt, frequency) => {
  const freqDays = { '1W': 7, '2W': 14, '4W': 28 }
  const d = new Date(startedAt)
  d.setDate(d.getDate() + (freqDays[frequency] || 7))
  return d.toISOString().split('T')[0]
}

/** POST /verify — 결제 완료 검증 */
router.post('/verify', validate(verifySchema), async (req, res, next) => {
  try {
    const { imp_uid, merchant_uid } = req.body

    // 1) payments 테이블에서 해당 결제 레코드 조회
    const paymentResult = await query(
      'SELECT * FROM payments WHERE merchant_uid = $1 AND status = $2',
      [merchant_uid, 'PENDING'],
    )

    if (paymentResult.rows.length === 0) {
      return res.status(404).json(apiError('PAYMENT_NOT_FOUND', '결제 정보를 찾을 수 없습니다'))
    }

    const paymentRow = paymentResult.rows[0]

    // 2) PortOne API로 실제 결제 검증
    let portoneVerified = false
    let portonePayment = null

    try {
      const { verifyPayment } = require('../../services/portone')
      const result = await verifyPayment(imp_uid, paymentRow.amount)
      portoneVerified = result.verified
      portonePayment = result.payment

      if (!portoneVerified) {
        // 금액 불일치 또는 결제 상태 이상
        await query(
          'UPDATE payments SET status = $1, imp_uid = $2, failed_reason = $3 WHERE id = $4',
          ['FAILED', imp_uid, result.reason, paymentRow.id],
        )
        return res.status(400).json(apiError('PAYMENT_MISMATCH', result.reason))
      }
    } catch (portoneErr) {
      // PortOne API 키가 없으면 (테스트 모드) 검증 스킵
      if (portoneErr.message.includes('설정되지 않았습니다')) {
        portoneVerified = true // 테스트 모드: 검증 스킵
      } else {
        throw portoneErr
      }
    }

    // 3) 트랜잭션: 결제 완료 + 구독 활성화
    const result = await transaction(async (client) => {
      // payments 업데이트
      await client.query(
        'UPDATE payments SET status = $1, imp_uid = $2, paid_at = NOW() WHERE id = $3',
        ['PAID', imp_uid, paymentRow.id],
      )

      // subscription 조회
      const subResult = await client.query(
        'SELECT * FROM subscriptions WHERE id = $1',
        [paymentRow.subscription_id],
      )
      const sub = subResult.rows[0]

      // subscription 활성화
      const nextPayment = calcNextPayment(sub.started_at, sub.frequency)
      await client.query(`
        UPDATE subscriptions SET
          status = 'ACTIVE',
          payment_id = $1,
          next_payment_at = $2,
          updated_at = NOW()
        WHERE id = $3
      `, [imp_uid, nextPayment, sub.id])

      // 고객 상태 업데이트
      await client.query(`
        UPDATE customers SET
          segment = 'ACTIVE',
          total_orders = total_orders + 1,
          total_spent = total_spent + $1,
          first_order_at = COALESCE(first_order_at, NOW()),
          last_order_at = NOW(),
          updated_at = NOW()
        WHERE id = $2
      `, [paymentRow.amount, paymentRow.customer_id])

      return {
        subscription_id: sub.id,
        status: 'ACTIVE',
        frequency: sub.frequency,
        delivery_days: sub.delivery_days,
        started_at: sub.started_at,
        next_payment_at: nextPayment,
        amount: paymentRow.amount,
        pg_provider: paymentRow.pg_provider,
      }
    })

    res.json(apiResponse({
      ...result,
      message: '결제가 완료되었습니다. 정기구독이 시작됩니다.',
    }))
  } catch (err) {
    next(err)
  }
})

module.exports = router
