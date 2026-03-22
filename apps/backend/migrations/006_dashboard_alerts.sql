-- ============================================================
-- 006: 통합 대시보드 & 알림 시스템
-- ============================================================

-- ============================================================
-- 알림
-- ============================================================
CREATE TABLE alerts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  priority        VARCHAR(5) NOT NULL
                  CHECK (priority IN ('P1', 'P2', 'P3')),
  alert_type      VARCHAR(50) NOT NULL,             -- CCP_DEVIATION, MILK_DROP, LOW_STOCK 등
  title           VARCHAR(255) NOT NULL,
  message         TEXT NOT NULL,
  module          VARCHAR(20) NOT NULL
                  CHECK (module IN ('farm', 'factory', 'market', 'cafe')),
  reference_id    UUID,                             -- 관련 레코드 ID
  reference_type  VARCHAR(50),                      -- 관련 테이블명
  -- 상태
  is_read         BOOLEAN DEFAULT false,
  is_resolved     BOOLEAN DEFAULT false,
  resolved_by     UUID REFERENCES users(id),
  resolved_at     TIMESTAMPTZ,
  resolve_note    TEXT,
  -- 전달
  channels_sent   JSONB DEFAULT '[]',               -- ["push", "sms", "kakao"]
  sent_at         TIMESTAMPTZ,
  -- 대상
  target_roles    JSONB DEFAULT '["ADMIN"]',        -- 알림 수신 역할
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_alert_unread ON alerts(is_read, priority, created_at DESC)
  WHERE is_read = false;
CREATE INDEX idx_alert_module ON alerts(module, created_at DESC);

-- ============================================================
-- 보고서 생성 이력
-- ============================================================
CREATE TABLE reports (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  report_type     VARCHAR(50) NOT NULL
                  CHECK (report_type IN (
                    'MONTHLY_BUSINESS', 'HACCP_DAILY', 'WELFARE_CHECKLIST',
                    'BREEDING_QUARTERLY', 'TAX_MONTHLY'
                  )),
  title           VARCHAR(255) NOT NULL,
  period_start    DATE,
  period_end      DATE,
  file_url        TEXT,                             -- 생성된 PDF/Excel URL
  file_format     VARCHAR(10) DEFAULT 'PDF',
  generated_by    UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_report_type ON reports(report_type, created_at DESC);

-- ============================================================
-- 감사 로그 (주요 변경 이력 추적)
-- ============================================================
CREATE TABLE audit_logs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID REFERENCES users(id),
  action          VARCHAR(50) NOT NULL,             -- CREATE, UPDATE, DELETE, LOGIN, LOGOUT
  table_name      VARCHAR(100),
  record_id       UUID,
  old_values      JSONB,
  new_values      JSONB,
  ip_address      VARCHAR(45),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_user ON audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_table ON audit_logs(table_name, record_id);
