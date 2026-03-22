/**
 * @fileoverview CCP/HACCP 공정 기록 API
 * POST   /api/v1/factory/process          — 공정 단계 기록
 * GET    /api/v1/factory/process/:batchId — 배치별 공정 이력
 * GET    /api/v1/factory/process/ccp-log  — CCP 이력 (HACCP 일지용)
 * POST   /api/v1/factory/process/deviation — CCP 이탈 보고
 */
const express = require('express')
const { z } = require('zod')
const { query } = require('../../config/database')
const { validate } = require('../../middleware/validate')
const { apiResponse, apiError, CCP_LIMITS } = require('@heyhay/shared')

const router = express.Router()

const processSchema = z.object({
  batch_id: z.string().min(1),
  process_step: z.enum([
    'RECEIVING', 'QUALITY_CHECK', 'CREAM_SEPARATION',
    'FILTRATION_80', 'FILTRATION_120',
    'PASTEURIZATION', 'HOMOGENIZATION', 'COOLING',
    'FINAL_FILTRATION', 'FILLING', 'KAYMAK_HEATING',
  ]),
  started_at: z.string().datetime({ offset: true }),
  ended_at: z.string().datetime({ offset: true }).optional(),
  is_ccp: z.boolean().default(false),
  ccp_id: z.string().optional(),
  temperature: z.number().optional(),
  hold_seconds: z.number().int().optional(),
  pressure_bar: z.number().optional(),
  mesh_size: z.number().int().optional(),
  notes: z.string().optional(),
})

/**
 * CCP 이탈 자동 감지
 * @param {object} record - 공정 기록
 * @returns {{ deviated: boolean, reason: string|null }}
 */
const checkCCPDeviation = (record) => {
  // CCP1: 살균 — 72°C 미만 또는 15초 미만
  if (record.ccp_id === 'CCP1') {
    if (record.temperature < CCP_LIMITS.CCP1_HTST.min_temp) {
      return { deviated: true, reason: `살균 온도 ${record.temperature}°C — 기준 ${CCP_LIMITS.CCP1_HTST.min_temp}°C 미달` }
    }
    if (record.hold_seconds && record.hold_seconds < CCP_LIMITS.CCP1_HTST.hold_seconds) {
      return { deviated: true, reason: `유지 시간 ${record.hold_seconds}초 — 기준 ${CCP_LIMITS.CCP1_HTST.hold_seconds}초 미달` }
    }
  }
  // CCP2: 충진 직전 여과 — 120 mesh 미달
  if (record.ccp_id === 'CCP2') {
    if (record.mesh_size && record.mesh_size < CCP_LIMITS.CCP2_FILTER.mesh) {
      return { deviated: true, reason: `여과 메쉬 ${record.mesh_size} — 기준 ${CCP_LIMITS.CCP2_FILTER.mesh} mesh 미달` }
    }
  }
  return { deviated: false, reason: null }
}

/** GET /ccp-log — CCP 기록 (HACCP 일지용) */
router.get('/ccp-log', async (req, res, next) => {
  try {
    const { date = new Date().toISOString().split('T')[0] } = req.query
    const result = await query(`
      SELECT * FROM process_records
      WHERE is_ccp = true AND DATE(started_at) = $1
      ORDER BY started_at ASC
    `, [date])

    res.json(apiResponse(result.rows))
  } catch (err) {
    next(err)
  }
})

/** POST / — 공정 단계 기록 */
router.post('/', validate(processSchema), async (req, res, next) => {
  try {
    const p = req.body

    // CCP 이탈 자동 감지
    let isDeviated = false
    let deviationReason = null
    if (p.is_ccp) {
      const check = checkCCPDeviation(p)
      isDeviated = check.deviated
      deviationReason = check.reason
    }

    const result = await query(`
      INSERT INTO process_records (
        batch_id, process_step, started_at, ended_at,
        is_ccp, ccp_id, temperature, hold_seconds, pressure_bar, mesh_size,
        is_deviated, deviation_reason, operator_id, notes
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      RETURNING *
    `, [
      p.batch_id, p.process_step, p.started_at, p.ended_at,
      p.is_ccp, p.ccp_id, p.temperature, p.hold_seconds, p.pressure_bar, p.mesh_size,
      isDeviated, deviationReason, req.user?.id, p.notes,
    ])

    // CCP 이탈 시 P1 알림 생성
    if (isDeviated) {
      await query(`
        INSERT INTO alerts (priority, alert_type, title, message, module, reference_id, reference_type, target_roles)
        VALUES ('P1', 'CCP_DEVIATION', $1, $2, 'factory', $3, 'process_records', '["ADMIN", "FACTORY"]')
      `, [
        `CCP 이탈 — ${p.ccp_id}`,
        deviationReason,
        result.rows[0].id,
      ])
    }

    res.status(201).json(apiResponse({
      ...result.rows[0],
      _ccp_alert: isDeviated ? { priority: 'P1', reason: deviationReason } : null,
    }))
  } catch (err) {
    next(err)
  }
})

/** GET /:batchId — 배치별 공정 이력 */
router.get('/:batchId', async (req, res, next) => {
  try {
    const result = await query(`
      SELECT * FROM process_records
      WHERE batch_id = $1
      ORDER BY started_at ASC
    `, [req.params.batchId])

    res.json(apiResponse(result.rows))
  } catch (err) {
    next(err)
  }
})

module.exports = router
