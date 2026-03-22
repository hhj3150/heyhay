/**
 * @fileoverview 건강·의료 관리 API
 * POST   /api/v1/farm/health          — 진료/백신/유방염 기록 등록
 * GET    /api/v1/farm/health          — 건강 기록 조회
 * GET    /api/v1/farm/health/withdrawal — 현재 휴약 중인 개체 목록
 */
const express = require('express')
const { z } = require('zod')
const { query } = require('../../config/database')
const { validate } = require('../../middleware/validate')
const { apiResponse, apiError } = require('../../lib/shared')

const router = express.Router()

const healthRecordSchema = z.object({
  animal_id: z.string().uuid(),
  record_type: z.enum(['TREATMENT', 'VACCINATION', 'MASTITIS', 'CULL_EVAL']),
  occurred_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  diagnosis: z.string().optional(),
  icd_code: z.string().optional(),
  treatment: z.string().optional(),
  medications: z.array(z.object({
    name: z.string(),
    dosage: z.string().optional(),
    route: z.string().optional(),
    withdrawal_days: z.number().int().min(0).optional(),
  })).optional(),
  withdrawal_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  cost: z.number().int().min(0).optional(),
  veterinarian: z.string().optional(),
  cmt_result: z.enum(['N', 'T', '1', '2', '3']).optional(),
  affected_quarter: z.string().optional(),
  notes: z.string().optional(),
})

/** GET /withdrawal — 휴약 중인 개체 */
router.get('/withdrawal', async (req, res, next) => {
  try {
    const result = await query(`
      SELECT hr.*, a.cow_id, a.name AS cow_name
      FROM health_records hr
      JOIN animals a ON hr.animal_id = a.id
      WHERE hr.withdrawal_end >= CURRENT_DATE
        AND hr.deleted_at IS NULL
      ORDER BY hr.withdrawal_end ASC
    `)
    res.json(apiResponse(result.rows))
  } catch (err) {
    next(err)
  }
})

/** POST / — 건강 기록 등록 */
router.post('/', validate(healthRecordSchema), async (req, res, next) => {
  try {
    const h = req.body

    // 투약 시 휴약 종료일 자동 계산
    let withdrawalEnd = h.withdrawal_end
    if (!withdrawalEnd && h.medications?.length > 0) {
      const maxDays = Math.max(...h.medications.map((m) => m.withdrawal_days || 0))
      if (maxDays > 0) {
        const d = new Date(h.occurred_at)
        d.setDate(d.getDate() + maxDays)
        withdrawalEnd = d.toISOString().split('T')[0]
      }
    }

    const result = await query(`
      INSERT INTO health_records (
        animal_id, record_type, occurred_at, diagnosis, icd_code,
        treatment, medications, withdrawal_end, cost, veterinarian,
        cmt_result, affected_quarter, notes
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING *
    `, [
      h.animal_id, h.record_type, h.occurred_at, h.diagnosis, h.icd_code,
      h.treatment, h.medications ? JSON.stringify(h.medications) : null,
      withdrawalEnd, h.cost, h.veterinarian,
      h.cmt_result, h.affected_quarter, h.notes,
    ])

    res.status(201).json(apiResponse(result.rows[0]))
  } catch (err) {
    next(err)
  }
})

/** GET / — 건강 기록 조회 */
router.get('/', async (req, res, next) => {
  try {
    const { animal_id, record_type, page = 1, limit = 50 } = req.query
    const conditions = ['hr.deleted_at IS NULL']
    const params = []
    let idx = 1

    if (animal_id) {
      conditions.push(`hr.animal_id = $${idx++}`)
      params.push(animal_id)
    }
    if (record_type) {
      conditions.push(`hr.record_type = $${idx++}`)
      params.push(record_type)
    }

    const offset = (parseInt(page) - 1) * parseInt(limit)
    const where = conditions.join(' AND ')

    const result = await query(`
      SELECT hr.*, a.cow_id, a.name AS cow_name
      FROM health_records hr
      JOIN animals a ON hr.animal_id = a.id
      WHERE ${where}
      ORDER BY hr.occurred_at DESC
      LIMIT $${idx++} OFFSET $${idx++}
    `, [...params, parseInt(limit), offset])

    res.json(apiResponse(result.rows))
  } catch (err) {
    next(err)
  }
})

module.exports = router
