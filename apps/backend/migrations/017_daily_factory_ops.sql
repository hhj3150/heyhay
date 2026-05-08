-- ============================================================
-- 017: 일일 공장 운영 통합 (Daily Factory Operations)
--
-- 핵심 흐름:
--   착유량 - 공장필요량 = 진흥회 납유량 (자동)
--   공장입고량 - 표준생산환산 = 로스량 (자동)
--   생산 - 출하 = 재고 (이미 동작)
-- ============================================================

-- ============================================================
-- SKU별 원유 환산비 (1단위 생산당 필요 원유 ml)
--   변경 이력: effective_from / effective_to 로 버전 관리
-- ============================================================
CREATE TABLE IF NOT EXISTS sku_milk_conversion (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sku_id            UUID NOT NULL REFERENCES skus(id),
  milk_per_unit_ml  INTEGER NOT NULL CHECK (milk_per_unit_ml > 0),
  effective_from    DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to      DATE,
  notes             TEXT,
  created_by        UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sku_conversion_sku
  ON sku_milk_conversion(sku_id, effective_from DESC);

-- 6종 초기 환산비 — effective_from을 '2024-01-01' 고정해 모든 과거 일자에서도 적용
INSERT INTO sku_milk_conversion (sku_id, milk_per_unit_ml, effective_from, notes)
SELECT id,
  CASE code
    WHEN 'A2-750' THEN 750
    WHEN 'A2-180' THEN 180
    WHEN 'YG-500' THEN 600   -- 발효유 농축 보정
    WHEN 'YG-180' THEN 220
    WHEN 'SI-001' THEN 80    -- 소프트아이스크림
    WHEN 'KM-100' THEN 1500  -- 카이막 (크림 농축)
    ELSE 500
  END,
  '2024-01-01'::date,
  '초기값 (실측 기반 보정 필요)'
FROM skus
WHERE code IN ('A2-750','A2-180','YG-500','YG-180','SI-001','KM-100')
  AND NOT EXISTS (SELECT 1 FROM sku_milk_conversion c WHERE c.sku_id = skus.id);


-- ============================================================
-- 일별 공장 운영 (날짜당 1건)
--   사용자 입력 2개:
--     - factory_intake_l (공장 필요량 = 입고량)
--     - 생산 실적은 production_batches 에 별도 등록
--   자동 산출:
--     - milking_total_l (daily_milk_totals 합산)
--     - dairy_promotion_l = milking - factory_intake
--     - expected_production_milk_l = SUM(qty * milk_per_unit_ml)
--     - actual_production_milk_l = SUM(production_batches.raw_milk_used_l)
--     - loss_l = factory_intake - expected_production_milk
-- ============================================================
CREATE TABLE IF NOT EXISTS daily_factory_ops (
  id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  op_date                     DATE UNIQUE NOT NULL,

  -- 송영신 착유 (daily_milk_totals 합산 — 갱신 시점에 동기화)
  milking_total_l             NUMERIC(10, 2) NOT NULL DEFAULT 0,

  -- 사용자 입력: 공장 필요량 (= 공장 입고량으로 사용)
  factory_intake_l            NUMERIC(10, 2),

  -- 자동: 진흥회 납유 (착유 - 공장필요량). 음수 가능 → 알림
  dairy_promotion_l           NUMERIC(10, 2)
                              GENERATED ALWAYS AS (milking_total_l - COALESCE(factory_intake_l, 0)) STORED,

  -- 자동: 생산 실적 환산 (production_batches × sku_milk_conversion)
  expected_production_milk_l  NUMERIC(10, 2) NOT NULL DEFAULT 0,
  actual_production_milk_l    NUMERIC(10, 2) NOT NULL DEFAULT 0,

  -- 자동: 로스 (입고 - 표준 환산)
  loss_l                      NUMERIC(10, 2)
                              GENERATED ALWAYS AS (
                                COALESCE(factory_intake_l, 0) - expected_production_milk_l
                              ) STORED,

  -- 마감
  is_closed                   BOOLEAN NOT NULL DEFAULT false,
  closed_at                   TIMESTAMPTZ,
  closed_by                   UUID REFERENCES users(id),

  notes                       TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_daily_ops_date
  ON daily_factory_ops(op_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_ops_closed
  ON daily_factory_ops(is_closed, op_date DESC);


-- ============================================================
-- 낙농진흥회 납유 실적 (자동 산출 + 단가 정산)
-- ============================================================
CREATE TABLE IF NOT EXISTS dairy_promotion_deliveries (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  delivery_date     DATE UNIQUE NOT NULL,
  amount_l          NUMERIC(10, 2) NOT NULL,
  unit_price        NUMERIC(10, 0),       -- 원/L (settings 또는 수동)
  total_amount      NUMERIC(14, 0),       -- amount_l × unit_price
  auto_calculated   BOOLEAN NOT NULL DEFAULT true,
  ops_id            UUID REFERENCES daily_factory_ops(id),
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_promotion_date
  ON dairy_promotion_deliveries(delivery_date DESC);
