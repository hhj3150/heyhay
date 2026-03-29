/**
 * @fileoverview DB 마이그레이션 자동 실행
 * 서버 시작 시 미적용 SQL 파일을 순서대로 실행
 * migrations 테이블로 적용 여부 추적
 */
const fs = require('fs')
const path = require('path')
const { Pool } = require('pg')
const dotenv = require('dotenv')

dotenv.config({ path: path.resolve(__dirname, '../.env') })

// Railway는 DATABASE_URL, 로컬은 개별 환경변수
const poolConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    }
  : {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      database: process.env.DB_NAME || 'heyhay_erp',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD,
    }

const pool = new Pool(poolConfig)

const MIGRATIONS_DIR = path.resolve(__dirname, '../migrations')

const run = async () => {
  const client = await pool.connect()
  try {
    // 마이그레이션 추적 테이블 생성 (최초 1회)
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id        SERIAL PRIMARY KEY,
        filename  VARCHAR(255) UNIQUE NOT NULL,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)

    // 적용된 마이그레이션 목록 조회
    const { rows: applied } = await client.query('SELECT filename FROM _migrations')
    const appliedSet = new Set(applied.map((r) => r.filename))

    // SQL 파일 목록 (파일명 순 정렬)
    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort()

    let count = 0
    for (const file of files) {
      if (appliedSet.has(file)) continue

      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')
      console.log(`[migrate] 적용 중: ${file}`)

      await client.query('BEGIN')
      try {
        await client.query(sql)
        await client.query('INSERT INTO _migrations (filename) VALUES ($1)', [file])
        await client.query('COMMIT')
        console.log(`[migrate] 완료: ${file}`)
        count++
      } catch (err) {
        await client.query('ROLLBACK')
        throw new Error(`마이그레이션 실패 (${file}): ${err.message}`)
      }
    }

    if (count === 0) {
      console.log('[migrate] 적용할 마이그레이션 없음 (최신 상태)')
    } else {
      console.log(`[migrate] ${count}개 마이그레이션 적용 완료`)
    }
  } finally {
    client.release()
    await pool.end()
  }
}

run().catch((err) => {
  console.error('[migrate] 실패:', err.message)
  process.exit(1)
})
