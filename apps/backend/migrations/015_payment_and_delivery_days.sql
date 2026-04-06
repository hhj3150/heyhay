-- ============================================================
-- 015: 정기구독 결제 연동 + 배송 요일 선택
-- ============================================================

-- 1) subscriptions 배송 요일 + 결제 정보 컬럼 추가
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS delivery_days TEXT[];
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS payment_id VARCHAR(100);
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS pg_provider VARCHAR(30);
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS merchant_uid VARCHAR(100);

-- 2) status CHECK 확장: PAYMENT_PENDING 추가
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN ('ACTIVE', 'PAUSED', 'CANCELLED', 'EXPIRED', 'PENDING_RENEWAL', 'PENDING_SIGNUP', 'PAYMENT_PENDING'));

-- 3) 결제 이력 테이블
CREATE TABLE IF NOT EXISTS payments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subscription_id UUID REFERENCES subscriptions(id),
  customer_id     UUID,
  merchant_uid    VARCHAR(100) UNIQUE NOT NULL,
  imp_uid         VARCHAR(100),
  pg_provider     VARCHAR(30),
  amount          INTEGER NOT NULL,
  status          VARCHAR(20) DEFAULT 'PENDING'
                  CHECK (status IN ('PENDING', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED')),
  paid_at         TIMESTAMPTZ,
  failed_reason   TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_merchant_uid ON payments(merchant_uid);
CREATE INDEX IF NOT EXISTS idx_payments_subscription ON payments(subscription_id);
