-- ============================================================
-- 004: 온라인 마켓 관리 모듈 (Market Manager)
-- 고객·구독·주문·배송·채널
-- ============================================================

-- ============================================================
-- 고객 (CRM)
-- ============================================================
CREATE TABLE customers (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            VARCHAR(100) NOT NULL,
  phone           VARCHAR(20),
  email           VARCHAR(255),
  channel         VARCHAR(20) NOT NULL
                  CHECK (channel IN ('SMARTSTORE', 'OWN_MALL', 'CAFE', 'B2B')),
  external_id     VARCHAR(255),                     -- 스마트스토어 회원번호 등
  -- 세그먼트
  segment         VARCHAR(20) DEFAULT 'NEW'
                  CHECK (segment IN ('NEW', 'ACTIVE', 'VIP', 'DORMANT', 'CHURNED')),
  -- 주소
  address_zip     VARCHAR(10),
  address_main    VARCHAR(255),
  address_detail  VARCHAR(255),
  -- 마케팅 동의
  marketing_sms   BOOLEAN DEFAULT false,
  marketing_email BOOLEAN DEFAULT false,
  marketing_push  BOOLEAN DEFAULT false,
  -- 통계
  total_orders    INTEGER DEFAULT 0,
  total_spent     NUMERIC(12, 0) DEFAULT 0,
  first_order_at  TIMESTAMPTZ,
  last_order_at   TIMESTAMPTZ,
  ltv             NUMERIC(12, 0) DEFAULT 0,         -- 고객 생애가치
  preferred_sku   VARCHAR(20),                      -- 선호 SKU 코드
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX idx_customer_channel ON customers(channel) WHERE deleted_at IS NULL;
CREATE INDEX idx_customer_segment ON customers(segment) WHERE deleted_at IS NULL;

-- ============================================================
-- 정기구독
-- ============================================================
CREATE TABLE subscriptions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id     UUID NOT NULL REFERENCES customers(id),
  -- 플랜 설정
  plan_name       VARCHAR(100),                     -- 구독 플랜명
  frequency       VARCHAR(10) NOT NULL
                  CHECK (frequency IN ('1W', '2W', '4W')),   -- 주 1/2/4회
  duration_months INTEGER,                          -- 1, 3, 6개월
  -- 구독 내용
  items           JSONB NOT NULL,                   -- [{sku_code, quantity}]
  -- 결제
  price_per_cycle NUMERIC(10, 0) NOT NULL,
  payment_method  VARCHAR(50),
  next_payment_at DATE,
  -- 상태
  status          VARCHAR(20) DEFAULT 'ACTIVE'
                  CHECK (status IN ('ACTIVE', 'PAUSED', 'CANCELLED', 'EXPIRED', 'PENDING_RENEWAL')),
  pause_reason    TEXT,
  pause_until     DATE,
  -- 기간
  started_at      DATE NOT NULL,
  expires_at      DATE,
  cancelled_at    TIMESTAMPTZ,
  cancel_reason   TEXT,
  -- 코호트 분석용
  cohort_month    DATE,                             -- 가입 월 (YYYY-MM-01)
  renewal_count   INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX idx_sub_customer ON subscriptions(customer_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_sub_status ON subscriptions(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_sub_next_payment ON subscriptions(next_payment_at)
  WHERE status = 'ACTIVE';

-- ============================================================
-- 주문
-- ============================================================
CREATE TABLE orders (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_number    VARCHAR(50) UNIQUE NOT NULL,       -- 채널별 주문번호
  customer_id     UUID REFERENCES customers(id),
  subscription_id UUID REFERENCES subscriptions(id),
  channel         VARCHAR(20) NOT NULL
                  CHECK (channel IN ('SMARTSTORE', 'OWN_MALL', 'B2B')),
  external_order_id VARCHAR(255),                    -- 스마트스토어 주문번호
  -- 상태
  status          VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                  CHECK (status IN (
                    'PENDING', 'PAID', 'PROCESSING', 'PACKED',
                    'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED'
                  )),
  -- 금액
  subtotal        NUMERIC(12, 0) NOT NULL DEFAULT 0,
  shipping_fee    NUMERIC(10, 0) DEFAULT 0,
  discount        NUMERIC(10, 0) DEFAULT 0,
  total_amount    NUMERIC(12, 0) NOT NULL DEFAULT 0,
  -- 배송
  recipient_name  VARCHAR(100),
  recipient_phone VARCHAR(20),
  shipping_zip    VARCHAR(10),
  shipping_address VARCHAR(500),
  shipping_memo   TEXT,
  courier         VARCHAR(50),                      -- CJ대한통운, 롯데택배 등
  tracking_number VARCHAR(100),
  shipped_at      TIMESTAMPTZ,
  delivered_at    TIMESTAMPTZ,
  -- 냉장 배송
  ice_pack_count  INTEGER DEFAULT 0,
  cool_box_size   VARCHAR(20),
  -- 결제
  paid_at         TIMESTAMPTZ,
  payment_method  VARCHAR(50),
  -- 반품·교환
  return_reason   TEXT,
  return_type     VARCHAR(20) CHECK (return_type IN ('COURIER_FAULT', 'CUSTOMER_FAULT', 'DEFECTIVE')),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX idx_order_customer ON orders(customer_id, created_at DESC);
CREATE INDEX idx_order_status ON orders(status, created_at DESC);
CREATE INDEX idx_order_channel ON orders(channel, created_at DESC);

-- ============================================================
-- 주문 상세
-- ============================================================
CREATE TABLE order_items (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  sku_id          UUID NOT NULL REFERENCES skus(id),
  quantity        INTEGER NOT NULL,
  unit_price      NUMERIC(10, 0) NOT NULL,
  subtotal        NUMERIC(12, 0) NOT NULL,
  batch_id        UUID REFERENCES production_batches(id),  -- 출고 배치 연결
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_orderitem_order ON order_items(order_id);
