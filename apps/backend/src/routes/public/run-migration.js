/**
 * @fileoverview 임시: 014 마이그레이션 강제 실행 (배포 문제 해결용)
 * POST /api/v1/public/run-migration-014 — 마이그레이션 직접 적용
 * 한 번 실행 후 반드시 삭제해야 함
 */
const express = require('express')
const { query } = require('../../config/database')
const { apiResponse, apiError } = require('../../lib/shared')

const router = express.Router()

/** 간단한 시크릿 키 체크 (한 번만 쓰고 버릴 용도) */
const TEMP_SECRET = 'hhj3150-migrate-014'

router.post('/', async (req, res) => {
  const secret = req.query.secret || req.body?.secret
  if (secret !== TEMP_SECRET) {
    return res.status(403).json(apiError('FORBIDDEN', 'secret 키가 필요합니다'))
  }

  const steps = []

  try {
    // 1) subscriptions.status CHECK 확장
    await query(`ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check`)
    steps.push({ step: 'DROP status check', ok: true })

    await query(`
      ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_status_check
        CHECK (status IN ('ACTIVE','PAUSED','CANCELLED','EXPIRED','PENDING_RENEWAL','PENDING_SIGNUP'))
    `)
    steps.push({ step: 'ADD status check with PENDING_SIGNUP', ok: true })

    // 2) 신규 컬럼 추가
    const newCols = [
      ['shipping_fee', 'INTEGER DEFAULT 0'],
      ['delivery_note', 'TEXT'],
      ['signup_source', 'VARCHAR(30)'],
      ['signup_ip', 'VARCHAR(45)'],
      ['consent_sms', 'BOOLEAN DEFAULT false'],
      ['consent_privacy', 'BOOLEAN DEFAULT false'],
    ]
    for (const [col, type] of newCols) {
      await query(`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS ${col} ${type}`)
      steps.push({ step: `ADD COLUMN ${col}`, ok: true })
    }

    // 3) 인덱스
    await query(`
      CREATE INDEX IF NOT EXISTS idx_sub_pending_signup
        ON subscriptions(created_at DESC) WHERE status = 'PENDING_SIGNUP'
    `)
    steps.push({ step: 'CREATE INDEX idx_sub_pending_signup', ok: true })

    // 4) sms_logs 테이블
    await query(`
      CREATE TABLE IF NOT EXISTS sms_logs (
        id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        recipient_count INTEGER NOT NULL,
        message         TEXT NOT NULL,
        byte_length     INTEGER,
        sent_by         UUID,
        sent_at         TIMESTAMPTZ DEFAULT NOW(),
        provider        VARCHAR(30) DEFAULT 'MANUAL',
        memo            TEXT,
        created_at      TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    steps.push({ step: 'CREATE TABLE sms_logs', ok: true })

    await query(`CREATE INDEX IF NOT EXISTS idx_sms_logs_sent_at ON sms_logs(sent_at DESC)`)
    steps.push({ step: 'CREATE INDEX idx_sms_logs_sent_at', ok: true })

    // 5) _migrations 테이블 생성 + 014 기록
    await query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id         SERIAL PRIMARY KEY,
        filename   VARCHAR(255) UNIQUE NOT NULL,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    steps.push({ step: 'CREATE TABLE _migrations', ok: true })

    await query(`
      INSERT INTO _migrations (filename) VALUES ('014_public_signup_and_sms.sql')
      ON CONFLICT DO NOTHING
    `)
    steps.push({ step: 'REGISTER 014 in _migrations', ok: true })

    res.json(apiResponse({
      message: '014 마이그레이션 적용 완료',
      steps,
    }))
  } catch (err) {
    steps.push({ step: 'FAILED', ok: false, error: err.message })
    res.status(500).json(apiError('MIGRATION_FAILED', err.message, steps))
  }
})

module.exports = router
