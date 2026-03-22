-- ============================================================
-- 008: B2B 거래처 관리 테이블
-- 밀크카페, 와인코리아 등 거래처별 제품 주문 관리
-- ============================================================

CREATE TABLE b2b_partners (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            VARCHAR(100) NOT NULL,
  contact_name    VARCHAR(50),
  contact_phone   VARCHAR(20),
  contact_email   VARCHAR(255),
  business_number VARCHAR(20),           -- 사업자등록번호
  address         VARCHAR(500),
  payment_terms   VARCHAR(50) DEFAULT 'MONTHLY',  -- MONTHLY, WEEKLY, COD
  delivery_day    VARCHAR(20) DEFAULT 'MON',       -- MON, TUE, ... 또는 DAILY
  notes           TEXT,
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX idx_b2b_active ON b2b_partners(is_active) WHERE deleted_at IS NULL;

-- B2B 거래처 정기 주문 (거래처별 제품·수량)
CREATE TABLE b2b_standing_orders (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  partner_id      UUID NOT NULL REFERENCES b2b_partners(id),
  sku_id          UUID NOT NULL REFERENCES skus(id),
  quantity        INTEGER NOT NULL,
  frequency       VARCHAR(10) NOT NULL DEFAULT 'WEEKLY'
                  CHECK (frequency IN ('DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY')),
  unit_price      NUMERIC(10, 0),
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_bso_partner ON b2b_standing_orders(partner_id) WHERE is_active = true;

-- B2B 출하 기록
CREATE TABLE b2b_shipments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  partner_id      UUID NOT NULL REFERENCES b2b_partners(id),
  shipment_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  status          VARCHAR(20) DEFAULT 'PREPARED'
                  CHECK (status IN ('PREPARED', 'SHIPPED', 'DELIVERED', 'INVOICED')),
  total_amount    NUMERIC(12, 0) DEFAULT 0,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE b2b_shipment_items (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shipment_id     UUID NOT NULL REFERENCES b2b_shipments(id) ON DELETE CASCADE,
  sku_id          UUID NOT NULL REFERENCES skus(id),
  quantity        INTEGER NOT NULL,
  unit_price      NUMERIC(10, 0) NOT NULL,
  subtotal        NUMERIC(12, 0) NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 초기 거래처 데이터
INSERT INTO b2b_partners (name, contact_name, contact_phone, address, delivery_day, notes) VALUES
  ('안성팜랜드 밀크카페', '카페 매니저', '031-8053-7979', '경기도 안성시 공도읍 대신두길 28 안성팜랜드', 'DAILY', '위탁 운영 / 소프트아이스크림·우유·발효유'),
  ('와인코리아', '담당자', '010-0000-0000', '', 'MON', 'B2B 거래처')
ON CONFLICT DO NOTHING;

-- 밀크카페 정기 주문 (기본값)
INSERT INTO b2b_standing_orders (partner_id, sku_id, quantity, frequency, unit_price)
SELECT p.id, s.id,
  CASE s.code
    WHEN 'A2-750' THEN 10
    WHEN 'A2-180' THEN 20
    WHEN 'YG-500' THEN 10
    WHEN 'YG-180' THEN 15
    WHEN 'SI-001' THEN 50
    WHEN 'KM-100' THEN 5
  END,
  CASE WHEN s.code = 'SI-001' THEN 'DAILY' ELSE 'WEEKLY' END,
  CASE s.code
    WHEN 'A2-750' THEN 7000
    WHEN 'A2-180' THEN 2500
    WHEN 'YG-500' THEN 5000
    WHEN 'YG-180' THEN 2000
    WHEN 'SI-001' THEN 3000
    WHEN 'KM-100' THEN 8000
  END
FROM b2b_partners p
CROSS JOIN skus s
WHERE p.name = '안성팜랜드 밀크카페'
  AND s.code IN ('A2-750', 'A2-180', 'YG-500', 'YG-180', 'SI-001', 'KM-100')
ON CONFLICT DO NOTHING;
