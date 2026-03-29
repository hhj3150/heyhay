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
const { apiResponse, apiError } = require('../../lib/shared')

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

/** GET /daily — 일별 착유 요약 (daily_milk_totals 우선) */
router.get('/daily', async (req, res, next) => {
  try {
    const days = parseInt(req.query.days || '30', 10)

    // daily_milk_totals 테이블에서 먼저 조회
    try {
      const result = await query(`
        SELECT date::text AS date, total_l, COALESCE(dairy_assoc_l, 0) AS dairy_assoc_l, COALESCE(d2o_l, 0) AS d2o_l
        FROM daily_milk_totals
        WHERE date >= (NOW() AT TIME ZONE 'Asia/Seoul')::date - $1
        ORDER BY date DESC
      `, [days])

      if (result.rows.length > 0) {
        return res.json(apiResponse(result.rows))
      }
    } catch (e) {
      // 테이블 없으면 무시
    }

    // fallback: milk_records에서 조회
    const result = await query(`
      SELECT
        DATE(milked_at) AS date,
        SUM(amount_l) AS total_l
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

/** POST /daily-total — 일일 총 착유량 + 납유량 수동 입력 */
router.post('/daily-total', async (req, res, next) => {
  try {
    const { amount_l, dairy_assoc_l, d2o_l, date } = req.body
    if (!amount_l || amount_l <= 0) {
      return res.status(400).json(apiError('INVALID', '착유량을 입력하세요'))
    }
    const targetDate = date || new Date().toISOString().split('T')[0]

    // 진흥회 = 총 착유량 - D2O (자동 계산)
    const d2oAmount = d2o_l || 0
    const dairyAmount = dairy_assoc_l || Math.max(0, amount_l - d2oAmount)

    // UPSERT
    const result = await query(`
      INSERT INTO daily_milk_totals (date, total_l, dairy_assoc_l, d2o_l, recorded_by)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (date) DO UPDATE SET total_l = $2, dairy_assoc_l = $3, d2o_l = $4, updated_at = NOW()
      RETURNING *
    `, [targetDate, amount_l, dairyAmount, d2oAmount, req.user?.id])

    res.status(201).json(apiResponse(result.rows[0]))
  } catch (err) {
    next(err)
  }
})

/** GET /monthly-dairy — 이번달 납유 정산 */
router.get('/monthly-dairy', async (req, res, next) => {
  try {
    const result = await query(`
      SELECT
        COUNT(*) FILTER (WHERE dairy_assoc_l > 0) AS dairy_days,
        COALESCE(SUM(dairy_assoc_l), 0) AS total_dairy_l,
        COUNT(*) FILTER (WHERE d2o_l > 0) AS d2o_days,
        COALESCE(SUM(COALESCE(d2o_l, 0)), 0) AS total_d2o_l,
        COALESCE(SUM(total_l), 0) AS total_milk_l
      FROM daily_milk_totals
      WHERE date >= DATE_TRUNC('month', (NOW() AT TIME ZONE 'Asia/Seoul')::date)
        AND date <= (NOW() AT TIME ZONE 'Asia/Seoul')::date
    `)
    res.json(apiResponse(result.rows[0]))
  } catch (err) {
    // 테이블 없으면 기본값
    res.json(apiResponse({ days: 0, total_dairy_l: 0, total_milk_l: 0, avg_daily_dairy_l: 0 }))
  }
})

/** GET /dairy-price — 납유단가 조회 */
router.get('/dairy-price', async (req, res, next) => {
  try {
    const [dairyRes, d2oRes] = await Promise.all([
      query(`SELECT value FROM settings WHERE key = 'dairy_unit_price'`),
      query(`SELECT value FROM settings WHERE key = 'd2o_unit_price'`),
    ])
    const dairyPrice = dairyRes.rows.length > 0 ? parseInt(dairyRes.rows[0].value) : 1130
    const d2oPrice = d2oRes.rows.length > 0 ? parseInt(d2oRes.rows[0].value) : 1200
    res.json(apiResponse({ dairy_price: dairyPrice, d2o_price: d2oPrice }))
  } catch (err) {
    res.json(apiResponse({ dairy_price: 1130, d2o_price: 1200 }))
  }
})

/** POST /dairy-price — 납유단가 설정 (2곳) */
router.post('/dairy-price', async (req, res, next) => {
  try {
    const { dairy_price, d2o_price } = req.body

    if (dairy_price) {
      await query(`
        INSERT INTO settings (key, value) VALUES ('dairy_unit_price', $1)
        ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()
      `, [String(dairy_price)])
    }
    if (d2o_price) {
      await query(`
        INSERT INTO settings (key, value) VALUES ('d2o_unit_price', $1)
        ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()
      `, [String(d2o_price)])
    }

    res.json(apiResponse({ dairy_price: dairy_price || 1130, d2o_price: d2o_price || 1200 }))
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
