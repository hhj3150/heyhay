-- ============================================================
-- 005: 밀크카페 관리 모듈 (Cafe Manager)
-- 메뉴·POS·정산·카페재고
-- ============================================================

-- ============================================================
-- 카페 메뉴
-- ============================================================
CREATE TABLE cafe_menus (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            VARCHAR(100) NOT NULL,
  category        VARCHAR(50),                      -- 아이스크림, 음료, 유제품 등
  price           NUMERIC(10, 0) NOT NULL,
  cost            NUMERIC(10, 0),                   -- 제조원가 (자동 산출)
  is_seasonal     BOOLEAN DEFAULT false,
  season_start    DATE,
  season_end      DATE,
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

-- ============================================================
-- 레시피 (메뉴별 원재료 구성)
-- ============================================================
CREATE TABLE cafe_recipes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  menu_id         UUID NOT NULL REFERENCES cafe_menus(id),
  sku_id          UUID REFERENCES skus(id),         -- ERP SKU 연결
  ingredient_name VARCHAR(100) NOT NULL,            -- 원재료명 (SKU 외 재료 포함)
  amount          NUMERIC(8, 2) NOT NULL,
  unit            VARCHAR(20) NOT NULL,             -- ml, g, ea 등
  unit_cost       NUMERIC(10, 0),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_recipe_menu ON cafe_recipes(menu_id);

-- ============================================================
-- 메뉴 가격 변경 이력
-- ============================================================
CREATE TABLE cafe_price_history (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  menu_id         UUID NOT NULL REFERENCES cafe_menus(id),
  old_price       NUMERIC(10, 0) NOT NULL,
  new_price       NUMERIC(10, 0) NOT NULL,
  reason          TEXT,
  changed_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- POS 매출 (일별 Import)
-- ============================================================
CREATE TABLE cafe_sales (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sale_date       DATE NOT NULL,
  sale_time       TIME,
  menu_id         UUID REFERENCES cafe_menus(id),
  menu_name       VARCHAR(100),                     -- POS 원본 메뉴명 (매핑 실패 시)
  quantity        INTEGER NOT NULL DEFAULT 1,
  unit_price      NUMERIC(10, 0) NOT NULL,
  total_amount    NUMERIC(10, 0) NOT NULL,
  payment_method  VARCHAR(30)
                  CHECK (payment_method IN ('CASH', 'CARD', 'KAKAO_PAY', 'OTHER')),
  pos_ref         VARCHAR(100),                     -- POS 영수증 번호
  is_settled      BOOLEAN DEFAULT false,            -- 정산 완료 여부
  settlement_id   UUID,                             -- 정산 ID 연결
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_cafe_sale_date ON cafe_sales(sale_date DESC);
CREATE INDEX idx_cafe_unsettled ON cafe_sales(is_settled)
  WHERE is_settled = false;

-- ============================================================
-- 위탁판매 정산 (안성팜랜드)
-- ============================================================
CREATE TABLE cafe_settlements (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  period_start    DATE NOT NULL,
  period_end      DATE NOT NULL,
  -- 판매 집계
  total_sales     NUMERIC(12, 0) NOT NULL,          -- 총 판매액
  commission_rate NUMERIC(5, 2) NOT NULL,           -- 위탁 수수료율 (%)
  commission      NUMERIC(12, 0) NOT NULL,          -- 수수료 금액
  net_amount      NUMERIC(12, 0) NOT NULL,          -- D2O 수취액
  -- 상태
  status          VARCHAR(20) DEFAULT 'PENDING'
                  CHECK (status IN ('PENDING', 'CONFIRMED', 'PAID', 'DISPUTED')),
  confirmed_at    TIMESTAMPTZ,
  paid_at         TIMESTAMPTZ,
  -- 세금계산서
  tax_invoice_no  VARCHAR(100),
  tax_invoice_url TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_settlement_period ON cafe_settlements(period_start DESC);

-- ============================================================
-- 카페 재고 (D2O 출고 → 카페 입고)
-- ============================================================
CREATE TABLE cafe_inventory (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_type       VARCHAR(20) NOT NULL
                  CHECK (item_type IN ('SKU', 'SUPPLY')),   -- SKU 제품 vs 소모품
  sku_id          UUID REFERENCES skus(id),
  item_name       VARCHAR(100),                     -- 소모품명 (컵, 콘, 냅킨 등)
  quantity        NUMERIC(10, 2) NOT NULL DEFAULT 0,
  unit            VARCHAR(20) DEFAULT 'ea',
  min_quantity    NUMERIC(10, 2),                   -- 재주문 알림 기준
  expiry_date     DATE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_cafe_inv_sku ON cafe_inventory(sku_id)
  WHERE item_type = 'SKU';

-- ============================================================
-- 카페 납품 기록 (D2O → 안성팜랜드 B2B)
-- ============================================================
CREATE TABLE cafe_deliveries (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  delivery_date   DATE NOT NULL,
  sku_id          UUID NOT NULL REFERENCES skus(id),
  quantity        INTEGER NOT NULL,
  unit_price      NUMERIC(10, 0) NOT NULL,          -- 공급가
  total_amount    NUMERIC(12, 0) NOT NULL,
  received_by     VARCHAR(100),
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_cafe_delivery_date ON cafe_deliveries(delivery_date DESC);
