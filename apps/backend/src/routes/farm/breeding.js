/**
 * @fileoverview 번식 관리 API (AI/ET/IVF 포함)
 * POST   /api/v1/farm/breeding          — 번식 이벤트 등록
 * GET    /api/v1/farm/breeding          — 번식 기록 조회
 * GET    /api/v1/farm/breeding/upcoming — 분만 예정 알림 목록
 * GET    /api/v1/farm/breeding/stats    — 번식 지수 통계
 * PUT    /api/v1/farm/breeding/:id      — 번식 기록 수정
 */
const express = require('express')
const { z } = require('zod')
const { query } = require('../../config/database')
const { validate } = require('../../middleware/validate')
const { apiResponse, apiError } = require('../../lib/shared')

const router = express.Router()

// --- 스키마 ---

const breedingSchema = z.object({
  animal_id: z.string().uuid(),
  event_type: z.enum(['HEAT', 'AI', 'ET', 'IVF', 'PREG_CHECK', 'CALVING']),
  event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  semen_code: z.string().optional(),
  donor_cow_id: z.string().uuid().optional(),
  recipient_cow_id: z.string().uuid().optional(),
  embryo_id: z.string().optional(),
  veterinarian: z.string().default('하원장'),
  preg_result: z.enum(['POSITIVE', 'NEGATIVE', 'RECHECK']).optional(),
  preg_method: z.enum(['RECTAL', 'ULTRASOUND']).optional(),
  expected_calving: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  calving_ease: z.enum(['NORMAL', 'ASSISTED', 'DYSTOCIA']).optional(),
  calf_id: z.string().uuid().optional(),
  retained_placenta: z.boolean().default(false),
  notes: z.string().optional(),
  ultrasound_url: z.string().url().optional(),
})

// --- 라우트 ---

/** GET /upcoming — 분만 예정 개체 (D-30 이내) */
router.get('/upcoming', async (req, res, next) => {
  try {
    const days = parseInt(req.query.days || '30', 10)
    const result = await query(`
      SELECT br.*, a.cow_id, a.name AS cow_name
      FROM breeding_records br
      JOIN animals a ON br.animal_id = a.id
      WHERE br.expected_calving IS NOT NULL
        AND br.expected_calving BETWEEN CURRENT_DATE AND CURRENT_DATE + ($1)::integer
        AND br.event_type IN ('AI', 'ET', 'IVF', 'PREG_CHECK')
        AND br.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM breeding_records br2
          WHERE br2.animal_id = br.animal_id
            AND br2.event_type = 'CALVING'
            AND br2.event_date >= br.event_date
            AND br2.deleted_at IS NULL
        )
      ORDER BY br.expected_calving ASC
    `, [days])

    res.json(apiResponse(result.rows))
  } catch (err) {
    next(err)
  }
})

/** GET /stats — 번식 지수 통계 */
router.get('/stats', async (req, res, next) => {
  try {
    // 수태율: 수정 대비 임신 확인 비율
    const conceptionRate = await query(`
      WITH ai_events AS (
        SELECT animal_id, event_date FROM breeding_records
        WHERE event_type IN ('AI', 'ET', 'IVF') AND deleted_at IS NULL
        AND event_date >= CURRENT_DATE - INTERVAL '12 months'
      ),
      positive AS (
        SELECT DISTINCT animal_id FROM breeding_records
        WHERE event_type = 'PREG_CHECK' AND preg_result = 'POSITIVE' AND deleted_at IS NULL
        AND event_date >= CURRENT_DATE - INTERVAL '12 months'
      )
      SELECT
        COUNT(DISTINCT ai.animal_id) AS total_inseminated,
        COUNT(DISTINCT p.animal_id) AS total_confirmed
      FROM ai_events ai
      LEFT JOIN positive p ON ai.animal_id = p.animal_id
    `)

    // 평균 공태일수: 분만 → 다음 수정까지 일수
    const openDays = await query(`
      SELECT AVG(days_open) AS avg_open_days FROM (
        SELECT
          c.animal_id,
          MIN(ai.event_date) - c.event_date AS days_open
        FROM breeding_records c
        JOIN breeding_records ai ON c.animal_id = ai.animal_id
          AND ai.event_type IN ('AI', 'ET', 'IVF')
          AND ai.event_date > c.event_date
          AND ai.deleted_at IS NULL
        WHERE c.event_type = 'CALVING' AND c.deleted_at IS NULL
          AND c.event_date >= CURRENT_DATE - INTERVAL '24 months'
        GROUP BY c.animal_id, c.event_date
      ) sub
    `)

    // null 참조 방어: rows가 비어있을 수 있음
    const cr = conceptionRate.rows.length > 0
      ? conceptionRate.rows[0]
      : { total_inseminated: 0, total_confirmed: 0 }
    const total = parseInt(cr.total_inseminated || 0, 10)
    const confirmed = parseInt(cr.total_confirmed || 0, 10)

    const openDaysRow = openDays.rows.length > 0 ? openDays.rows[0] : { avg_open_days: null }

    res.json(apiResponse({
      conception_rate: total > 0 ? ((confirmed / total) * 100).toFixed(1) : null,
      total_inseminated: total,
      total_confirmed: confirmed,
      avg_open_days: openDaysRow.avg_open_days
        ? parseFloat(openDaysRow.avg_open_days).toFixed(0)
        : null,
    }))
  } catch (err) {
    next(err)
  }
})

/** POST / — 번식 이벤트 등록 */
router.post('/', validate(breedingSchema), async (req, res, next) => {
  try {
    const b = req.body

    // AI/ET/IVF 시 분만 예정일 자동 계산 (약 283일)
    let expectedCalving = b.expected_calving
    if (!expectedCalving && ['AI', 'ET', 'IVF'].includes(b.event_type)) {
      const d = new Date(b.event_date)
      d.setDate(d.getDate() + 283)
      expectedCalving = d.toISOString().split('T')[0]
    }

    // 분만 이벤트 시 개체 상태 업데이트
    if (b.event_type === 'CALVING') {
      await query(
        `UPDATE animals SET status = 'MILKING', updated_at = NOW() WHERE id = $1`,
        [b.animal_id],
      )
    }

    // 임신 확인 시 개체 상태 업데이트
    if (b.event_type === 'PREG_CHECK' && b.preg_result === 'POSITIVE') {
      await query(
        `UPDATE animals SET status = 'PREGNANT', updated_at = NOW() WHERE id = $1`,
        [b.animal_id],
      )
    }

    const result = await query(`
      INSERT INTO breeding_records (
        animal_id, event_type, event_date, semen_code,
        donor_cow_id, recipient_cow_id, embryo_id, veterinarian,
        preg_result, preg_method, expected_calving,
        calving_ease, calf_id, retained_placenta, notes, ultrasound_url
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      RETURNING *
    `, [
      b.animal_id, b.event_type, b.event_date, b.semen_code,
      b.donor_cow_id, b.recipient_cow_id, b.embryo_id, b.veterinarian,
      b.preg_result, b.preg_method, expectedCalving,
      b.calving_ease, b.calf_id, b.retained_placenta, b.notes, b.ultrasound_url,
    ])

    res.status(201).json(apiResponse(result.rows[0]))
  } catch (err) {
    next(err)
  }
})

/** GET / — 번식 기록 조회 */
router.get('/', async (req, res, next) => {
  try {
    const { animal_id, event_type, page = 1, limit = 50 } = req.query
    const conditions = ['br.deleted_at IS NULL']
    const params = []
    let idx = 1

    if (animal_id) {
      conditions.push(`br.animal_id = $${idx++}`)
      params.push(animal_id)
    }
    if (event_type) {
      conditions.push(`br.event_type = $${idx++}`)
      params.push(event_type)
    }

    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10)
    const where = conditions.join(' AND ')

    const result = await query(`
      SELECT br.*, a.cow_id, a.name AS cow_name
      FROM breeding_records br
      JOIN animals a ON br.animal_id = a.id
      WHERE ${where}
      ORDER BY br.event_date DESC
      LIMIT $${idx++} OFFSET $${idx++}
    `, [...params, parseInt(limit, 10), offset])

    res.json(apiResponse(result.rows))
  } catch (err) {
    next(err)
  }
})

/** PUT /:id — 번식 기록 수정 */
router.put('/:id', validate(breedingSchema.partial()), async (req, res, next) => {
  try {
    const fields = req.body
    const keys = Object.keys(fields)
    if (keys.length === 0) {
      return res.status(400).json(apiError('NO_FIELDS', '수정할 항목이 없습니다'))
    }

    const setClauses = keys.map((key, i) => `${key} = $${i + 1}`)
    setClauses.push('updated_at = NOW()')
    const values = keys.map((k) => fields[k])

    const result = await query(`
      UPDATE breeding_records SET ${setClauses.join(', ')}
      WHERE id = $${keys.length + 1} AND deleted_at IS NULL
      RETURNING *
    `, [...values, req.params.id])

    if (result.rows.length === 0) {
      return res.status(404).json(apiError('NOT_FOUND', '번식 기록을 찾을 수 없습니다'))
    }

    res.json(apiResponse(result.rows[0]))
  } catch (err) {
    next(err)
  }
})

module.exports = router
