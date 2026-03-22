-- ============================================================
-- 009: 배송 체크리스트 테이블
-- 일별 자동 생성 → 포장확인 → 발송확인 → 완료
-- 구독자 주문 누락 방지의 핵심
-- ============================================================

CREATE TABLE delivery_checklist (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  delivery_date   DATE NOT NULL,
  -- 출처
  source_type     VARCHAR(20) NOT NULL CHECK (source_type IN ('SUBSCRIPTION', 'ORDER', 'B2B')),
  source_id       UUID,                            -- subscription_id / order_id / b2b_partner_id
  -- 고객 정보 (스냅샷 — 조회 속도)
  customer_name   VARCHAR(100) NOT NULL,
  customer_phone  VARCHAR(20),
  shipping_address VARCHAR(500),
  shipping_memo   TEXT,
  -- 제품 상세
  items           JSONB NOT NULL,                   -- [{sku_code, sku_name, quantity, unit_price}]
  total_amount    NUMERIC(12, 0) DEFAULT 0,
  ice_pack_count  INTEGER DEFAULT 1,
  -- 체크포인트
  is_packed       BOOLEAN DEFAULT false,            -- 포장 완료
  packed_by       VARCHAR(50),
  packed_at       TIMESTAMPTZ,
  is_shipped      BOOLEAN DEFAULT false,            -- 발송 완료
  shipped_by      VARCHAR(50),
  shipped_at      TIMESTAMPTZ,
  courier         VARCHAR(50),
  tracking_number VARCHAR(100),
  is_delivered    BOOLEAN DEFAULT false,            -- 배송 완료
  delivered_at    TIMESTAMPTZ,
  -- 검증
  qty_verified    BOOLEAN DEFAULT false,            -- 수량 검증 완료
  amount_verified BOOLEAN DEFAULT false,            -- 금액 검증 완료
  -- 이슈
  has_issue       BOOLEAN DEFAULT false,
  issue_note      TEXT,
  -- 메타
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_checklist_date ON delivery_checklist(delivery_date);
CREATE INDEX idx_checklist_source ON delivery_checklist(source_type, source_id);
CREATE INDEX idx_checklist_unpacked ON delivery_checklist(delivery_date)
  WHERE is_packed = false;
