/**
 * @fileoverview 착유 관리 API
 * POST   /api/v1/farm/milking         — 착유 기록 등록 (단건/다건)
 * GET    /api/v1/farm/milking         — 착유 기록 조회 (기간·개체 필터)
 * GET    /api/v1/farm/milking/daily   — 일별 착유 요약
 * GET    /api/v1/farm/milking/summary — 기간 착유 통계 (305일 유량 등)
 */
const express = require('express')
const { z } = require('zod')
const { query, transaction } = require('../../config/database')
const { validate } = require('../../middleware/validate')
const { apiResponse, apiError } = require('@heyhay/shared')

const router = express.Router()

// --- 스키마 ---

const milkingRecordSchema = z.object({
  animal_id: z.string().uuid(),
  milked_at: z.string().datetime({ offset: true }).optional(),
  session: z.enum(['AM', 'PM']),
  amount_l: z.number().positive('착유량은 양수여야 합니다'),
  fat_pct: z.number().min(0).max(15).optional(),
  protein_pct: z.number().min(0).max(10).optional(),
  scc: z.number().int().min(0).optional(),
  destination: z.enum(['FACTORY', 'DAIRY_ASSOC', 'DISCARD']).default('FACTORY'),
})

const batchMilkingSchema = z.object({
  records: z.array(milkingRecordSchema).min(1, '최소 1건의 착유 기록이 필요합니다'),
})

const listMilkingSchema = z.object({
  animal_id: z.string().uuid().optional(),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  session: z.enum(['AM', 'PM']).optional(),
  destination: z.enum(['FACTORY', 'DAIRY_ASSOC', 'DISCARD']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})

// --- 라우트 ---

/** GET /daily — 일별 착유 요약 */
router.get('/daily', async (req, res, next) => {
  try {
    const days = parseInt(req.query.days || '30', 10)

    const result = await query(`
      SELECT
        DATE(milked_at) AS date,
        COUNT(DISTINCT animal_id) AS head_count,
        SUM(amount_l) AS total_l,
        SUM(amount_l) FILTER (WHERE destination = 'FACTORY') AS factory_l,
        SUM(amount_l) FILTER (WHERE destination = 'DAIRY_ASSOC') AS dairy_assoc_l,
        AVG(fat_pct) AS avg_fat,
        AVG(protein_pct) AS avg_protein,
        AVG(scc) AS avg_scc
      FROM milk_records
      WHERE milked_at >= NOW() - INTERVAL '1 day' * $1
      GROUP BY DATE(milked_at)
      ORDER BY date DESC
    `, [days])

    res.json(apiResponse(result.rows))
  } catch (err) {
    next(err)
  }
})

/** GET /summary — 기간 착유 통계 */
router.get('/summary', async (req, res, next) => {
  try {
    const result = await query(`
      SELECT
        COUNT(*) AS total_records,
        COUNT(DISTINCT animal_id) AS total_cows,
        SUM(amount_l) AS total_l,
        AVG(amount_l) AS avg_per_record,
        SUM(amount_l) FILTER (WHERE destination = 'FACTORY') AS factory_total_l,
        SUM(amount_l) FILTER (WHERE destination = 'DAIRY_ASSOC') AS dairy_assoc_total_l,
        AVG(fat_pct) AS avg_fat,
        AVG(protein_pct) AS avg_protein,
        AVG(scc) AS avg_scc
      FROM milk_records
      WHERE milked_at >= DATE_TRUNC('month', NOW())
    `)

    // 오늘 착유량
    const todayResult = await query(`
      SELECT
        SUM(amount_l) AS today_total,
        SUM(amount_l) FILTER (WHERE destination = 'FACTORY') AS today_factory,
        COUNT(DISTINCT animal_id) AS today_heads
      FROM milk_records
      WHERE DATE(milked_at) = CURRENT_DATE
    `)

    // 전일 대비
    const yesterdayResult = await query(`
      SELECT SUM(amount_l) AS yesterday_total
      FROM milk_records
      WHERE DATE(milked_at) = CURRENT_DATE - 1
    `)

    const today = parseFloat(todayResult.rows[0].today_total || 0)
    const yesterday = parseFloat(yesterdayResult.rows[0].yesterday_total || 0)
    const changeRate = yesterday > 0
      ? ((today - yesterday) / yesterday * 100).toFixed(1)
      : null

    res.json(apiResponse({
      monthly: result.rows[0],
      today: { ...todayResult.rows[0], change_rate: changeRate },
    }))
  } catch (err) {
    next(err)
  }
})

/** POST / — 착유 기록 등록 (단건/다건 배치) */
router.post('/', validate(batchMilkingSchema), async (req, res, next) => {
  try {
    const { records } = req.body

    const inserted = await transaction(async (client) => {
      const results = []
      for (const record of records) {
        const milkedAt = record.milked_at || new Date().toISOString()
        const r = await client.query(`
          INSERT INTO milk_records (animal_id, milked_at, session, amount_l, fat_pct, protein_pct, scc, destination, recorded_by)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING *
        `, [
          record.animal_id, milkedAt, record.session, record.amount_l,
          record.fat_pct, record.protein_pct, record.scc,
          record.destination, req.user?.id,
        ])
        results.push(r.rows[0])
      }
      return results
    })

    res.status(201).json(apiResponse(inserted, { count: inserted.length }))
  } catch (err) {
    next(err)
  }
})

/** GET / — 착유 기록 조회 */
router.get('/', validate(listMilkingSchema, 'query'), async (req, res, next) => {
  try {
    const { animal_id, date_from, date_to, session, destination, page, limit } = req.query
    const conditions = []
    const params = []
    let idx = 1

    if (animal_id) {
      conditions.push(`m.animal_id = $${idx++}`)
      params.push(animal_id)
    }
    if (date_from) {
      conditions.push(`m.milked_at >= $${idx++}`)
      params.push(date_from)
    }
    if (date_to) {
      conditions.push(`m.milked_at < ($${idx++})::date + 1`)
      params.push(date_to)
    }
    if (session) {
      conditions.push(`m.session = $${idx++}`)
      params.push(session)
    }
    if (destination) {
      conditions.push(`m.destination = $${idx++}`)
      params.push(destination)
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const offset = (page - 1) * limit

    const [data, count] = await Promise.all([
      query(`
        SELECT m.*, a.cow_id, a.name AS cow_name
        FROM milk_records m
        JOIN animals a ON m.animal_id = a.id
        ${where}
        ORDER BY m.milked_at DESC
        LIMIT $${idx++} OFFSET $${idx++}
      `, [...params, limit, offset]),
      query(`SELECT COUNT(*) FROM milk_records m ${where}`, params),
    ])

    const total = parseInt(count.rows[0].count, 10)
    res.json(apiResponse(data.rows, { page, limit, total, totalPages: Math.ceil(total / limit) }))
  } catch (err) {
    next(err)
  }
})

/** POST /robot-sync — Lely A3 로봇 착유 데이터 동기화 */
router.post('/robot-sync', async (req, res, next) => {
  try {
    const { syncFromT4C } = require('../../services/lelyT4C')
    const result = await syncFromT4C()
    res.json(apiResponse(result))
  } catch (err) {
    next(err)
  }
})

/** GET /robot-status — Lely A3 로봇 상태 */
router.get('/robot-status', async (req, res, next) => {
  try {
    const { getRobotStatus } = require('../../services/lelyT4C')
    const status = await getRobotStatus()
    res.json(apiResponse(status))
  } catch (err) {
    next(err)
  }
})

module.exports = router
