/**
 * @fileoverview 센서 데이터 API
 * GET  /api/v1/farm/sensor/readings    — 센서 데이터 조회
 * GET  /api/v1/farm/sensor/latest      — 최신 센서 데이터 (전 개체)
 * POST /api/v1/farm/sensor/sync        — smaXtec 동기화 실행
 * GET  /api/v1/farm/sensor/status      — 연동 상태
 */
const express = require('express')
const { query } = require('../../config/database')
const { apiResponse, apiError } = require('../../lib/shared')

const router = express.Router()

/** GET /latest — 전 개체 최신 센서 데이터 */
router.get('/latest', async (req, res, next) => {
  try {
    const result = await query(`
      SELECT DISTINCT ON (sr.animal_id)
        sr.*, a.cow_id, a.name AS cow_name, a.status AS cow_status
      FROM sensor_readings sr
      JOIN animals a ON sr.animal_id = a.id
      WHERE a.deleted_at IS NULL
      ORDER BY sr.animal_id, sr.measured_at DESC
    `)

    res.json(apiResponse(result.rows))
  } catch (err) {
    next(err)
  }
})

/** GET /readings — 특정 개체 시계열 데이터 */
router.get('/readings', async (req, res, next) => {
  try {
    const { cow_id, hours = 24, metric = 'temperature' } = req.query

    if (!cow_id) {
      return res.status(400).json(apiError('MISSING_COW_ID', 'cow_id 파라미터 필수'))
    }

    const validMetrics = ['temperature', 'activity', 'rumination', 'drink_count']
    if (!validMetrics.includes(metric)) {
      return res.status(400).json(apiError('INVALID_METRIC', `유효한 metric: ${validMetrics.join(', ')}`))
    }

    const result = await query(`
      SELECT sr.measured_at, sr.${metric} AS value
      FROM sensor_readings sr
      JOIN animals a ON sr.animal_id = a.id
      WHERE a.cow_id = $1
        AND sr.measured_at >= NOW() - ($2 || ' hours')::INTERVAL
        AND sr.${metric} IS NOT NULL
      ORDER BY sr.measured_at ASC
    `, [cow_id, String(hours)])

    res.json(apiResponse(result.rows))
  } catch (err) {
    next(err)
  }
})

/** POST /sync — smaXtec 데이터 동기화 실행 */
router.post('/sync', async (req, res, next) => {
  try {
    const orgId = process.env.SMAXTEC_ORG_ID
    if (!orgId) {
      return res.status(400).json(apiError('NO_ORG_ID', 'SMAXTEC_ORG_ID 환경변수가 설정되지 않았습니다'))
    }

    const { syncSensorData } = require('../../services/smaxtec')
    const result = await syncSensorData(orgId)
    res.json(apiResponse(result))
  } catch (err) {
    next(err)
  }
})

/** GET /status — smaXtec 연동 상태 */
router.get('/status', async (req, res, next) => {
  try {
    const hasKey = !!process.env.SMAXTEC_API_KEY

    const latestReading = await query(`
      SELECT MAX(measured_at) AS last_sync
      FROM sensor_readings
    `)

    const totalReadings = await query(`
      SELECT COUNT(*) AS count FROM sensor_readings
    `)

    const animalCount = await query(`
      SELECT COUNT(DISTINCT animal_id) AS count FROM sensor_readings
    `)

    // null 참조 방어: rows가 비어있을 수 있음
    const lastSyncRow = latestReading.rows.length > 0 ? latestReading.rows[0] : { last_sync: null }
    const totalRow = totalReadings.rows.length > 0 ? totalReadings.rows[0] : { count: 0 }
    const animalRow = animalCount.rows.length > 0 ? animalCount.rows[0] : { count: 0 }

    res.json(apiResponse({
      connected: hasKey,
      last_sync: lastSyncRow.last_sync,
      total_readings: parseInt(totalRow.count, 10),
      monitored_animals: parseInt(animalRow.count, 10),
    }))
  } catch (err) {
    next(err)
  }
})

module.exports = router
