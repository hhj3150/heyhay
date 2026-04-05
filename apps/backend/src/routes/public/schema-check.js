/**
 * @fileoverview 임시 진단: DB 스키마 확인 (배포 문제 해결용)
 * GET /api/v1/public/schema-check — subscriptions 테이블의 신규 컬럼 존재 여부
 */
const express = require('express')
const { query } = require('../../config/database')
const { apiResponse } = require('../../lib/shared')

const router = express.Router()

router.get('/', async (req, res, next) => {
  try {
    // subscriptions 테이블의 컬럼 목록
    const subCols = await query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'subscriptions'
      ORDER BY column_name
    `)

    // 014 마이그레이션 적용 여부
    const migApplied = await query(`
      SELECT filename, applied_at FROM _migrations
      WHERE filename LIKE '014%'
    `)

    // status check 제약조건
    const statusCheck = await query(`
      SELECT pg_get_constraintdef(oid) AS def
      FROM pg_constraint
      WHERE conname = 'subscriptions_status_check'
    `)

    // sms_logs 테이블 존재 여부
    const smsTable = await query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'sms_logs'
      ) AS exists
    `)

    const columns = subCols.rows.map((r) => r.column_name)
    const expectedNewCols = ['shipping_fee', 'delivery_note', 'signup_source', 'signup_ip', 'consent_sms', 'consent_privacy']
    const missing = expectedNewCols.filter((c) => !columns.includes(c))

    res.json(apiResponse({
      subscriptions_columns: columns,
      missing_new_columns: missing,
      migration_014_applied: migApplied.rows,
      status_check_def: statusCheck.rows[0]?.def,
      sms_logs_exists: smsTable.rows[0]?.exists,
    }))
  } catch (err) {
    next(err)
  }
})

module.exports = router
