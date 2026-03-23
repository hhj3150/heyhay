-- ============================================================
-- 010: 통합 가격 관리 (sku_prices + system_settings)
-- 모든 가격·설정값을 DB 관리, 하드코딩 제거
-- ============================================================

-- ============================================================
-- (1) 제품 채널별 단가 테이블
-- effective_to IS NULL → 현재 적용 중인 가격
-- ============================================================
CREATE TABLE sku_prices (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sku_id         UUID REFERENCES skus(id),
  sku_code       VARCHAR(20),
  channel        VARCHAR(20) CHECK (channel IN ('RETAIL','SUBSCRIPTION','B2B','CAFE')),
  unit_price     INTEGER NOT NULL,
  effective_from DATE DEFAULT CURRENT_DATE,
  effective_to   DATE,
  created_by     VARCHAR(100),
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- 현재 적용 중인 가격 빠른 조회
CREATE INDEX idx_sku_prices_active
  ON sku_prices(sku_code, channel) WHERE effective_to IS NULL;

-- ============================================================
-- (2) 시스템 설정 테이블
-- category + key 로 원유단가, 배송비, 생산설정 등 관리
-- ============================================================
CREATE TABLE IF NOT EXISTS system_settings (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category    VARCHAR(50),
  key         VARCHAR(100) UNIQUE NOT NULL,
  value       VARCHAR(500) NOT NULL,
  label       VARCHAR(200),
  description TEXT,
  updated_by  VARCHAR(100),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- (3) 시드 데이터 — 채널별 단가
-- ============================================================
INSERT INTO sku_prices (sku_id, sku_code, channel, unit_price, created_by)
SELECT s.id, s.code, p.channel, p.unit_price, 'SYSTEM'
FROM skus s
JOIN (VALUES
  ('A2-750', 'RETAIL',       9000),
  ('A2-750', 'SUBSCRIPTION', 8000),
  ('A2-750', 'B2B',          7000),
  ('A2-750', 'CAFE',         9000),
  ('A2-180', 'RETAIL',       4000),
  ('A2-180', 'SUBSCRIPTION', 3000),
  ('A2-180', 'B2B',          2500),
  ('A2-180', 'CAFE',         4000),
  ('YG-500', 'RETAIL',       7000),
  ('YG-500', 'SUBSCRIPTION', 6000),
  ('YG-500', 'B2B',          5000),
  ('YG-500', 'CAFE',         7000),
  ('YG-180', 'RETAIL',       3500),
  ('YG-180', 'SUBSCRIPTION', 3000),
  ('YG-180', 'B2B',          2000),
  ('YG-180', 'CAFE',         3500),
  ('KM-100', 'RETAIL',       12000),
  ('KM-100', 'SUBSCRIPTION', 10000),
  ('KM-100', 'B2B',          8000),
  ('KM-100', 'CAFE',         12000),
  ('SI-001', 'RETAIL',       5000),
  ('SI-001', 'SUBSCRIPTION', 4000),
  ('SI-001', 'B2B',          3000),
  ('SI-001', 'CAFE',         5000)
) AS p(sku_code, channel, unit_price) ON s.code = p.sku_code;

-- ============================================================
-- (4) 시드 데이터 — 시스템 설정
-- ============================================================

-- 원유 매입 단가
INSERT INTO system_settings (category, key, value, label, description) VALUES
  ('MILK_PRICE', 'dairy_normal_rate',  '1130', '진흥회 정상유대 (원/L)', '낙농진흥회 정상 출하 기준 단가'),
  ('MILK_PRICE', 'dairy_excess_rate',  '1030', '진흥회 초과분 단가 (원/L)', '정상 기준량 초과 시 적용 단가'),
  ('MILK_PRICE', 'dairy_normal_limit', '180',  '진흥회 정상 기준량 (L/일)', '일일 정상가 적용 한도'),
  ('MILK_PRICE', 'd2o_rate',           '4000', 'D2O 자체 매입 단가 (원/L)', 'D2O 유가공 투입 원유 매입 단가');

-- 배송비
INSERT INTO system_settings (category, key, value, label, description) VALUES
  ('SHIPPING', 'default_shipping_fee',    '3000', '기본 배송비 (원)', '온라인 주문 기본 배송비'),
  ('SHIPPING', 'free_shipping_threshold', '0',    '무료배송 기준금액 (원)', '0이면 무료배송 없음'),
  ('SHIPPING', 'b2b_shipping_fee',        '0',    'B2B 배송비 (원)', 'B2B 거래처 배송비');

-- 생산 설정
INSERT INTO system_settings (category, key, value, label, description) VALUES
  ('PRODUCTION', 'loss_rate_pct',      '2',     '생산 로스율 (%)', '원유 투입 대비 손실률'),
  ('PRODUCTION', 'a2_750_milk_ml',     '765',   'A2 750ml 원유 소요량 (ml)', '로스 포함 실 투입량'),
  ('PRODUCTION', 'a2_180_milk_ml',     '184',   'A2 180ml 원유 소요량 (ml)', '로스 포함 실 투입량'),
  ('PRODUCTION', 'yg_500_milk_ml',     '510',   '발효유 500ml 원유 소요량 (ml)', '로스 포함 실 투입량'),
  ('PRODUCTION', 'yg_180_milk_ml',     '184',   '발효유 180ml 원유 소요량 (ml)', '로스 포함 실 투입량'),
  ('PRODUCTION', 'km_100_milk_ml',     '10000', '카이막 100g 원유 소요량 (ml)', '크림 분리 기준 투입량'),
  ('PRODUCTION', 'si_001_milk_ml',     '500',   '소프트아이스크림 원유 소요량 (ml)', '1회 제조 기준');
