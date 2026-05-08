-- ============================================================
-- 016: 통합 출하 관리 (Shipments)
-- 채널(B2B / CAFE / SMARTSTORE / OWN_MALL) 통합 출하 지시서·실적
-- 기존 b2b_shipments는 호환 유지 (deprecate 예정)
-- ============================================================

-- ============================================================
-- 출하 헤더
-- ============================================================
CREATE TABLE IF NOT EXISTS shipments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shipment_no     VARCHAR(30) UNIQUE NOT NULL,         -- SHP-YYYYMMDD-NNN
  channel         VARCHAR(20) NOT NULL
                  CHECK (channel IN ('B2B', 'CAFE', 'SMARTSTORE', 'OWN_MALL')),
  partner_id      UUID REFERENCES b2b_partners(id),    -- B2B 출하 시
  order_id        UUID REFERENCES orders(id),          -- 온라인 주문 출하 시

  -- 상태
  status          VARCHAR(20) NOT NULL DEFAULT 'PLANNED'
                  CHECK (status IN ('PLANNED', 'PICKED', 'SHIPPED', 'DELIVERED', 'CANCELLED')),

  -- 일정
  planned_date    DATE NOT NULL,
  shipped_at      TIMESTAMPTZ,
  delivered_at    TIMESTAMPTZ,

  -- 배송 정보
  vehicle_no      VARCHAR(20),
  driver_name     VARCHAR(50),
  driver_phone    VARCHAR(20),
  destination     VARCHAR(500),
  delivery_memo   TEXT,

  -- 금액 (items.subtotal 합계 자동 계산)
  total_amount    NUMERIC(12, 0) NOT NULL DEFAULT 0,

  -- 메타
  notes           TEXT,
  created_by      UUID REFERENCES users(id),
  shipped_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_shipments_planned_date
  ON shipments(planned_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_shipments_channel
  ON shipments(channel, planned_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_shipments_partner
  ON shipments(partner_id) WHERE partner_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_shipments_order
  ON shipments(order_id) WHERE order_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_shipments_status
  ON shipments(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_shipments_no
  ON shipments(shipment_no);

-- ============================================================
-- 출하 품목
-- ============================================================
CREATE TABLE IF NOT EXISTS shipment_items (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shipment_id     UUID NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  sku_id          UUID NOT NULL REFERENCES skus(id),
  batch_id        UUID REFERENCES production_batches(id),  -- confirm 시 FIFO 차감 배치
  quantity        INTEGER NOT NULL CHECK (quantity > 0),
  unit_price      NUMERIC(10, 0) NOT NULL DEFAULT 0,
  subtotal        NUMERIC(12, 0) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shipment_items_shipment
  ON shipment_items(shipment_id);
CREATE INDEX IF NOT EXISTS idx_shipment_items_sku
  ON shipment_items(sku_id);
CREATE INDEX IF NOT EXISTS idx_shipment_items_batch
  ON shipment_items(batch_id) WHERE batch_id IS NOT NULL;
