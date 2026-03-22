-- ============================================================
-- 003: 유가공 공장 관리 모듈 (Factory Manager)
-- 원유입고·공정(CCP)·SKU생산·재고·원가
-- ============================================================

-- ============================================================
-- SKU 마스터
-- ============================================================
CREATE TABLE skus (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code          VARCHAR(20) UNIQUE NOT NULL,        -- A2-750, YG-500 등
  name          VARCHAR(100) NOT NULL,
  volume_ml     INTEGER,
  product_type  VARCHAR(20) NOT NULL
                CHECK (product_type IN ('살균유', '발효유', '즉석제조', '크림')),
  shelf_days    INTEGER NOT NULL DEFAULT 7,         -- 소비기한 일수
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 초기 SKU 6종 삽입
INSERT INTO skus (code, name, volume_ml, product_type, shelf_days) VALUES
  ('A2-750', 'A2 저지우유 750ml', 750, '살균유', 7),
  ('A2-180', 'A2 저지우유 180ml', 180, '살균유', 7),
  ('YG-500', '발효유 500ml', 500, '발효유', 14),
  ('YG-180', '발효유 180ml', 180, '발효유', 14),
  ('SI-001', '소프트아이스크림', NULL, '즉석제조', 0),
  ('KM-100', '카이막 100g', NULL, '크림', 5);

-- ============================================================
-- 원유 입고
-- ============================================================
CREATE TABLE raw_milk_receipts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  received_date   DATE NOT NULL,
  amount_l        NUMERIC(8, 2) NOT NULL,           -- 수령량 (L)
  source          VARCHAR(50) DEFAULT 'INTERNAL',   -- INTERNAL(목장직접), EXTERNAL
  -- 품질 검사
  fat_pct         NUMERIC(4, 2),
  protein_pct     NUMERIC(4, 2),
  scc             INTEGER,                          -- 체세포 수
  bacteria_count  INTEGER,                          -- 세균 수
  grade           VARCHAR(10),                      -- 1등급, 2등급 등
  -- 검사 서류
  inspection_doc_url TEXT,                          -- 낙농진흥회 집유검사성적서
  -- 거부/폐기
  is_rejected     BOOLEAN DEFAULT false,
  reject_reason   TEXT,
  recorded_by     UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX idx_rawmilk_date ON raw_milk_receipts(received_date DESC);

-- ============================================================
-- 공정 기록 (CCP / HACCP)
-- ============================================================
CREATE TABLE process_records (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  batch_id        VARCHAR(30) NOT NULL,             -- YYYYMMDD-SKU코드-seq
  process_step    VARCHAR(30) NOT NULL
                  CHECK (process_step IN (
                    'RECEIVING', 'QUALITY_CHECK', 'CREAM_SEPARATION',
                    'FILTRATION_80', 'FILTRATION_120',
                    'PASTEURIZATION', 'HOMOGENIZATION', 'COOLING',
                    'FINAL_FILTRATION', 'FILLING',
                    'KAYMAK_HEATING'
                  )),
  started_at      TIMESTAMPTZ NOT NULL,
  ended_at        TIMESTAMPTZ,
  -- CCP 데이터
  is_ccp          BOOLEAN DEFAULT false,
  ccp_id          VARCHAR(10),                      -- CCP1, CCP2
  temperature     NUMERIC(5, 1),                    -- 온도 (°C)
  hold_seconds    INTEGER,                          -- 유지 시간 (초)
  pressure_bar    NUMERIC(6, 2),                    -- 균질기 압력 (bar)
  mesh_size       INTEGER,                          -- 여과 메쉬
  -- CCP 이탈
  is_deviated     BOOLEAN DEFAULT false,
  deviation_reason TEXT,
  corrective_action TEXT,
  -- 담당자
  operator_id     UUID REFERENCES users(id),
  operator_sign   BOOLEAN DEFAULT false,            -- 디지털 서명
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_process_batch ON process_records(batch_id);
CREATE INDEX idx_process_ccp ON process_records(is_ccp, is_deviated)
  WHERE is_ccp = true;

-- ============================================================
-- 생산 배치 (SKU별)
-- ============================================================
CREATE TABLE production_batches (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  batch_id        VARCHAR(30) UNIQUE NOT NULL,      -- YYYYMMDD-SKU코드-seq
  sku_id          UUID NOT NULL REFERENCES skus(id),
  produced_at     DATE NOT NULL,
  quantity        INTEGER NOT NULL,                 -- 생산 수량
  raw_milk_used_l NUMERIC(8, 2) NOT NULL,           -- 투입 원유량
  -- 원가 요소
  material_cost   NUMERIC(12, 0),                   -- 원재료비
  labor_cost      NUMERIC(12, 0),                   -- 인건비
  overhead_cost   NUMERIC(12, 0),                   -- 간접비 (전력, 포장재 등)
  unit_cost       NUMERIC(10, 0),                   -- 개당 원가 (자동 계산)
  -- 소비기한
  expiry_date     DATE NOT NULL,
  -- 상태
  status          VARCHAR(20) DEFAULT 'COMPLETED'
                  CHECK (status IN ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'REJECTED')),
  raw_milk_receipt_id UUID REFERENCES raw_milk_receipts(id),
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX idx_batch_date ON production_batches(produced_at DESC);
CREATE INDEX idx_batch_sku ON production_batches(sku_id, produced_at DESC);

-- ============================================================
-- 재고 관리
-- ============================================================
CREATE TABLE inventory (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sku_id          UUID NOT NULL REFERENCES skus(id),
  batch_id        UUID REFERENCES production_batches(id),
  location        VARCHAR(50) DEFAULT 'FACTORY_COLD'
                  CHECK (location IN ('FACTORY_COLD', 'CAFE', 'SHIPPING')),
  quantity        INTEGER NOT NULL DEFAULT 0,
  expiry_date     DATE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_inventory_sku ON inventory(sku_id, location);
CREATE INDEX idx_inventory_expiry ON inventory(expiry_date)
  WHERE quantity > 0;

-- 안전 재고 설정
CREATE TABLE inventory_thresholds (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sku_id          UUID NOT NULL REFERENCES skus(id),
  channel         VARCHAR(20) NOT NULL
                  CHECK (channel IN ('SMARTSTORE', 'OWN_MALL', 'CAFE', 'B2B', 'TOTAL')),
  min_quantity    INTEGER NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(sku_id, channel)
);

-- ============================================================
-- 재고 변동 이력 (입출고 추적)
-- ============================================================
CREATE TABLE inventory_movements (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sku_id          UUID NOT NULL REFERENCES skus(id),
  batch_id        UUID REFERENCES production_batches(id),
  movement_type   VARCHAR(20) NOT NULL
                  CHECK (movement_type IN ('PRODUCTION', 'SALE', 'CAFE_OUT', 'B2B_OUT', 'DISCARD', 'ADJUSTMENT')),
  quantity        INTEGER NOT NULL,                 -- 양수: 입고, 음수: 출고
  reference_id    UUID,                             -- 주문ID 또는 정산ID
  reference_type  VARCHAR(30),                      -- order, cafe_sale, b2b 등
  location        VARCHAR(50),
  reason          TEXT,
  recorded_by     UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_movement_sku ON inventory_movements(sku_id, created_at DESC);
