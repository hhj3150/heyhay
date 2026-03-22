/**
 * @fileoverview 환경변수 로딩 및 검증
 * Railway: DATABASE_URL 자동 감지
 * 로컬: .env 파일에서 개별 변수 로딩
 */
const dotenv = require('dotenv')
const path = require('path')

// .env 파일 로딩 (로컬 개발용)
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

// Railway는 DATABASE_URL을 자동 제공
const databaseUrl = process.env.DATABASE_URL

let dbConfig

if (databaseUrl) {
  // Railway/Heroku 스타일: DATABASE_URL 파싱
  const url = new URL(databaseUrl)
  dbConfig = {
    host: url.hostname,
    port: parseInt(url.port, 10),
    name: url.pathname.slice(1),
    user: url.username,
    password: url.password,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  }
} else {
  // 로컬 개발: 개별 환경변수
  const missing = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER']
    .filter((k) => !process.env[k])

  if (missing.length > 0 && process.env.NODE_ENV !== 'test') {
    throw new Error(`필수 환경변수 누락: ${missing.join(', ')}`)
  }

  dbConfig = {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    name: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: false,
  }
}

// JWT 시크릿 검증
if (!process.env.JWT_SECRET || !process.env.JWT_REFRESH_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('필수 환경변수 누락: JWT_SECRET, JWT_REFRESH_SECRET')
  }
}

const env = Object.freeze({
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  db: dbConfig,
  redis: {
    url: process.env.REDIS_URL || null,
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-me',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret',
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },
})

module.exports = env
