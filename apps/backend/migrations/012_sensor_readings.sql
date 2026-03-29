-- ============================================================
-- 008: 센서 데이터 저장 테이블
-- smaXtec 볼루스 센서 → 체온·활동량·반추·음수
-- ============================================================

CREATE TABLE IF NOT EXISTS sensor_readings (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  animal_id     UUID NOT NULL REFERENCES animals(id),
  measured_at   TIMESTAMPTZ NOT NULL,
  -- 센서 데이터
  temperature   NUMERIC(4, 1),      -- 체온 (°C)
  activity      NUMERIC(8, 2),      -- 활동량 (상대값)
  rumination    NUMERIC(8, 2),      -- 반추 시간 (분)
  drink_count   INTEGER,            -- 음수 횟수
  -- 메타
  source        VARCHAR(20) DEFAULT 'SMAXTEC',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(animal_id, measured_at)
);

CREATE INDEX IF NOT EXISTS idx_sensor_animal_time
  ON sensor_readings(animal_id, measured_at DESC);

CREATE INDEX IF NOT EXISTS idx_sensor_time
  ON sensor_readings(measured_at DESC);
