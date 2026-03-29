-- 011_milk_totals_and_settings.sql
-- 일별 착유량 합계 + 레거시 settings 테이블 정식 마이그레이션
-- (기존에 milking.js 라우트 내 ad-hoc CREATE TABLE로 처리되던 것을 정규화)

-- 일별 착유량 합계 (목장 전체)
CREATE TABLE IF NOT EXISTS daily_milk_totals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE UNIQUE NOT NULL,
  total_l NUMERIC(8,2) NOT NULL,
  dairy_assoc_l NUMERIC(8,2) DEFAULT 0,
  d2o_l NUMERIC(8,2) DEFAULT 0,
  recorded_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스: 날짜 범위 조회 최적화
CREATE INDEX IF NOT EXISTS idx_daily_milk_totals_date
  ON daily_milk_totals(date DESC);

-- 레거시 settings 테이블 (system_settings와 별도로 일부 라우트에서 사용)
CREATE TABLE IF NOT EXISTS settings (
  key VARCHAR(50) PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 기본 납유단가 시드 (이미 존재하면 무시)
INSERT INTO settings (key, value) VALUES
  ('dairy_unit_price', '1130'),
  ('d2o_unit_price', '1200')
ON CONFLICT (key) DO NOTHING;
