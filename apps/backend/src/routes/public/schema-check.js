/**
 * @fileoverview 임시 진단: DB 스키마 확인 (배포 문제 해결용)
 * GET /api/v1/public/schema-check — subscriptions 테이블의 신규 컬럼 존재 여부
 */
const express = require('express')
const { query } = require('../../config/database')
const { apiResponse } = require('../../lib/shared')

const router = express.Router()

/** 안전한 쿼리 실행 (에러 시 에러 메시지 반환) */
const safeQuery = async (sql) => {
  try {
    const r = await query(sql)
    return { ok: true, data: r.rows }
  } catch (err) {
    return { ok: false, error: err.message, code: err.code }
  }
}

router.get('/', async (req, res) => {
  const subCols = await safeQuery(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'subscriptions' ORDER BY column_name
  `)

  const migrationsTable = await safeQuery(`
    SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = '_migrations') AS exists
  `)

  const migApplied = await safeQuery(`SELECT filename, applied_at FROM _migrations ORDER BY filename`)

  const smsTable = await safeQuery(`
    SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'sms_logs') AS exists
  `)

  const statusCheck = await safeQuery(`
    SELECT pg_get_constraintdef(oid) AS def
    FROM pg_constraint WHERE conname = 'subscriptions_status_check'
  `)

  const columns = subCols.ok ? subCols.data.map((r) => r.column_name) : []
  const expectedNewCols = ['shipping_fee', 'delivery_note', 'signup_source', 'signup_ip', 'consent_sms', 'consent_privacy']
  const missing = expectedNewCols.filter((c) => !columns.includes(c))

  // users 테이블 진단
  const usersExist = await safeQuery(`
    SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'users') AS exists
  `)
  const usersCount = await safeQuery(`SELECT COUNT(*) AS cnt FROM users`)
  const usersInfo = await safeQuery(`
    SELECT id, username, role, name, is_active, LENGTH(password_hash) AS hash_len
    FROM users WHERE deleted_at IS NULL ORDER BY created_at
  `)

  res.json(apiResponse({
    subscriptions_columns: columns,
    missing_new_columns: missing,
    migrations_table: migrationsTable,
    all_migrations: migApplied,
    sms_logs_table: smsTable,
    status_check: statusCheck,
    users_table_exists: usersExist,
    users_count: usersCount,
    users_info: usersInfo,
  }))
})

module.exports = router
