-- ============================================================
-- 001: 확장 모듈 + 사용자 테이블
-- HEY HAY MILK ERP - Phase 0 기반 구축
-- ============================================================

-- UUID 생성
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- TimescaleDB (착유량·센서 시계열 데이터용)
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- ============================================================
-- 사용자 (인증/권한)
-- ============================================================
CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username    VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name        VARCHAR(100) NOT NULL,
  role        VARCHAR(20) NOT NULL CHECK (role IN ('ADMIN', 'FACTORY', 'CAFE', 'FARM')),
  phone       VARCHAR(20),
  email       VARCHAR(255),
  refresh_token TEXT,
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

-- 초기 관리자 계정 (비밀번호: admin1234 → bcrypt hash)
-- 실 운영 시 반드시 비밀번호 변경
INSERT INTO users (username, password_hash, name, role) VALUES
  ('admin', '$2a$12$LQv3c1yqBo9SkvXS7QTJPOoEJVoLFJ0BqF5RQo2B8xXE7H1Qa8GHy', '하원장', 'ADMIN');

CREATE INDEX idx_users_username ON users(username) WHERE deleted_at IS NULL;
