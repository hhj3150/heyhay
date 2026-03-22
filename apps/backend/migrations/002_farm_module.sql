-- ============================================================
-- 002: 목장 관리 모듈 (Farm Manager)
-- 개체·착유·번식·건강·센서·사료·인증
-- ============================================================

-- ============================================================
-- 개체 관리
-- ============================================================
CREATE TABLE animals (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cow_id        VARCHAR(20) UNIQUE NOT NULL,       -- 이표번호
  name          VARCHAR(50),
  birthdate     DATE,
  breed         VARCHAR(50) DEFAULT 'Jersey',
  a2_genotype   VARCHAR(10) CHECK (a2_genotype IN ('A2A2', 'A2A1', 'A1A1')),
  status        VARCHAR(20) NOT NULL DEFAULT 'MILKING'
                CHECK (status IN ('MILKING', 'DRY', 'PREGNANT', 'HEIFER', 'BULL', 'CULL')),
  sex           VARCHAR(10) DEFAULT 'F' CHECK (sex IN ('F', 'M')),
  dam_id        UUID REFERENCES animals(id),       -- 모 개체
  sire_info     VARCHAR(255),                       -- 부 정액 카탈로그 정보
  acquisition_source VARCHAR(255),                  -- 도입처
  acquisition_cost   NUMERIC(12, 0),                -- 취득가액
  group_tag     VARCHAR(50),                        -- 에코축산단지 등 그룹 태그
  photo_url     TEXT,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);

CREATE INDEX idx_animals_status ON animals(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_animals_group ON animals(group_tag) WHERE deleted_at IS NULL;

-- ============================================================
-- 착유 기록 (TimescaleDB 시계열)
-- ============================================================
CREATE TABLE milk_records (
  id            UUID DEFAULT uuid_generate_v4(),
  animal_id     UUID NOT NULL REFERENCES animals(id),
  milked_at     TIMESTAMPTZ NOT NULL,               -- 착유 시각
  session       VARCHAR(5) NOT NULL CHECK (session IN ('AM', 'PM')),
  amount_l      NUMERIC(6, 2) NOT NULL,             -- 착유량 (L)
  fat_pct       NUMERIC(4, 2),                      -- 유지방 %
  protein_pct   NUMERIC(4, 2),                      -- 유단백 %
  scc           INTEGER,                            -- 체세포 수 (×1000/ml)
  destination   VARCHAR(20) DEFAULT 'FACTORY'
                CHECK (destination IN ('FACTORY', 'DAIRY_ASSOC', 'DISCARD')),
  recorded_by   UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (id, milked_at)
);

-- TimescaleDB 하이퍼테이블 변환
SELECT create_hypertable('milk_records', 'milked_at');

CREATE INDEX idx_milk_animal ON milk_records(animal_id, milked_at DESC);

-- ============================================================
-- 번식 관리 (AI/ET/IVF 포함)
-- ============================================================
CREATE TABLE breeding_records (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  animal_id       UUID NOT NULL REFERENCES animals(id),
  event_type      VARCHAR(20) NOT NULL
                  CHECK (event_type IN ('HEAT', 'AI', 'ET', 'IVF', 'PREG_CHECK', 'CALVING')),
  event_date      DATE NOT NULL,
  -- 수정 관련
  semen_code      VARCHAR(100),                     -- 정액 코드
  donor_cow_id    UUID REFERENCES animals(id),      -- ET 공란우
  recipient_cow_id UUID REFERENCES animals(id),     -- ET 수란우
  embryo_id       VARCHAR(100),                     -- IVF 배아 ID
  veterinarian    VARCHAR(100) DEFAULT '하원장',
  -- 임신 감정
  preg_result     VARCHAR(20) CHECK (preg_result IN ('POSITIVE', 'NEGATIVE', 'RECHECK')),
  preg_method     VARCHAR(20) CHECK (preg_method IN ('RECTAL', 'ULTRASOUND')),
  expected_calving DATE,                            -- 분만 예정일
  -- 분만
  calving_ease    VARCHAR(20) CHECK (calving_ease IN ('NORMAL', 'ASSISTED', 'DYSTOCIA')),
  calf_id         UUID REFERENCES animals(id),
  retained_placenta BOOLEAN DEFAULT false,
  notes           TEXT,
  ultrasound_url  TEXT,                             -- 초음파 사진 URL
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX idx_breeding_animal ON breeding_records(animal_id, event_date DESC);

-- ============================================================
-- 건강·의료 기록
-- ============================================================
CREATE TABLE health_records (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  animal_id       UUID NOT NULL REFERENCES animals(id),
  record_type     VARCHAR(20) NOT NULL
                  CHECK (record_type IN ('TREATMENT', 'VACCINATION', 'MASTITIS', 'CULL_EVAL')),
  occurred_at     DATE NOT NULL,
  diagnosis       VARCHAR(255),                     -- 상병명
  icd_code        VARCHAR(20),                      -- ICD-10 대동물 코드
  treatment       TEXT,                             -- 처방·치료 내용
  medications     JSONB,                            -- [{name, dosage, route, withdrawal_days}]
  withdrawal_end  DATE,                             -- 휴약기간 종료일
  cost            NUMERIC(12, 0),                   -- 치료비
  veterinarian    VARCHAR(100),
  -- 유방염 전용
  cmt_result      VARCHAR(10) CHECK (cmt_result IN ('N', 'T', '1', '2', '3')),
  affected_quarter VARCHAR(10),                     -- LF, RF, LR, RR
  -- 도태 판단
  cull_score      NUMERIC(4, 1),                    -- 종합 점수 (자동 산출)
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX idx_health_animal ON health_records(animal_id, occurred_at DESC);
CREATE INDEX idx_health_withdrawal ON health_records(withdrawal_end)
  WHERE withdrawal_end IS NOT NULL AND withdrawal_end >= CURRENT_DATE;

-- ============================================================
-- 사료·사양 관리
-- ============================================================
CREATE TABLE feed_types (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          VARCHAR(100) NOT NULL,
  category      VARCHAR(50),                        -- TMR 원료 카테고리
  unit_price    NUMERIC(10, 0),                     -- 단가 (원/kg)
  supplier      VARCHAR(255),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);

CREATE TABLE feed_records (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  feed_date     DATE NOT NULL,
  feed_type_id  UUID NOT NULL REFERENCES feed_types(id),
  group_tag     VARCHAR(50),                        -- 급여 그룹 (착유우, 건유우 등)
  amount_kg     NUMERIC(8, 2) NOT NULL,
  dm_intake_kg  NUMERIC(8, 2),                      -- DM 섭취량
  head_count    INTEGER,                            -- 급여 두수
  recorded_by   UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_feed_date ON feed_records(feed_date DESC);

-- ============================================================
-- 동물복지·인증 관리
-- ============================================================
CREATE TABLE certifications (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cert_type       VARCHAR(50) NOT NULL,             -- 동물복지, 저탄소 등
  cert_number     VARCHAR(100),
  issued_at       DATE,
  expires_at      DATE,
  status          VARCHAR(20) DEFAULT 'ACTIVE'
                  CHECK (status IN ('ACTIVE', 'EXPIRING', 'EXPIRED', 'RENEWED')),
  document_url    TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE welfare_checklists (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  check_month     DATE NOT NULL,                    -- 점검 월 (YYYY-MM-01)
  items           JSONB NOT NULL,                   -- [{category, item, result, notes}]
  inspector       VARCHAR(100),
  score           NUMERIC(5, 1),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
