/**
 * @fileoverview 문자 발송 이력 API
 * POST /api/v1/market/sms/log   — 수동 발송 완료 기록
 * GET  /api/v1/market/sms/logs  — 발송 이력 조회
 * POST /api/v1/market/sms/send  — 실제 SMS API 호출 (스켈레톤, 추후 연동)
 */
const express = require('express')
const { z } = require('zod')
const { query } = require('../../config/database')
const { validate } = require('../../middleware/validate')
const { apiResponse, apiError } = require('../../lib/shared')

const router = express.Router()

const logSchema = z.object({
  recipient_count: z.number().int().positive(),
  message: z.string().min(1).max(2000),
  memo: z.string().max(500).optional(),
})

/** POST /log — 수동 발송 완료 기록 */
router.post('/log', validate(logSchema), async (req, res, next) => {
  try {
    const { recipient_count, message, memo } = req.body
    const byteLength = Buffer.byteLength(message, 'utf8')

    const result = await query(`
      INSERT INTO sms_logs (recipient_count, message, byte_length, sent_by, provider, memo)
      VALUES ($1, $2, $3, $4, 'MANUAL', $5)
      RETURNING id, sent_at
    `, [recipient_count, message, byteLength, req.user?.id, memo])

    res.status(201).json(apiResponse(result.rows[0]))
  } catch (err) {
    next(err)
  }
})

/** GET /logs — 발송 이력 조회 (최근 50건) */
router.get('/logs', async (req, res, next) => {
  try {
    const result = await query(`
      SELECT id, recipient_count, message, byte_length, provider, memo, sent_at
      FROM sms_logs
      ORDER BY sent_at DESC
      LIMIT 50
    `)
    res.json(apiResponse(result.rows))
  } catch (err) {
    next(err)
  }
})

/** POST /send — 실제 SMS 발송 (추후 Aligo/Solapi 연동) */
router.post('/send', async (req, res) => {
  // TODO: SMS API 연동 후 구현
  res.status(501).json(apiError('NOT_IMPLEMENTED', 'SMS API 연동은 아직 구현되지 않았습니다. 번호 복사 후 수동 발송을 이용하세요.'))
})

module.exports = router
