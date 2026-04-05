-- ============================================================
-- 014: 공개 구독 신청 + SMS 발송 이력
-- ============================================================

-- 1) subscriptions.status CHECK 확장: PENDING_SIGNUP 추가
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN ('ACTIVE', 'PAUSED', 'CANCELLED', 'EXPIRED', 'PENDING_RENEWAL', 'PENDING_SIGNUP'));

-- 2) subscriptions 공개 신청 관련 컬럼 추가
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS shipping_fee INTEGER DEFAULT 0;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS delivery_note TEXT;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS signup_source VARCHAR(30);
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS signup_ip VARCHAR(45);
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS consent_sms BOOLEAN DEFAULT false;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS consent_privacy BOOLEAN DEFAULT false;

-- 3) PENDING_SIGNUP 조회 최적화 인덱스
CREATE INDEX IF NOT EXISTS idx_sub_pending_signup
  ON subscriptions(created_at DESC) WHERE status = 'PENDING_SIGNUP';

-- 4) SMS 발송 이력 테이블
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
);

CREATE INDEX IF NOT EXISTS idx_sms_logs_sent_at ON sms_logs(sent_at DESC);
