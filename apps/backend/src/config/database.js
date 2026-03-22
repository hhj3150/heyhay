/**
 * @fileoverview PostgreSQL 연결 풀 설정
 * TimescaleDB 확장 포함
 */
const { Pool } = require('pg')
const env = require('./env')

const pool = new Pool({
  host: env.db.host,
  port: env.db.port,
  database: env.db.name,
  user: env.db.user,
  password: env.db.password,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
})

pool.on('error', (err) => {
  console.error('PostgreSQL 연결 풀 에러:', err)
})

/**
 * 쿼리 실행 헬퍼
 * @param {string} text - SQL 쿼리
 * @param {Array} params - 파라미터 바인딩
 * @returns {Promise<import('pg').QueryResult>}
 */
const query = (text, params) => pool.query(text, params)

/**
 * 트랜잭션 실행 헬퍼
 * @param {function(import('pg').PoolClient): Promise<any>} callback
 * @returns {Promise<any>}
 */
const transaction = async (callback) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await callback(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

/**
 * DB 연결 확인
 * @returns {Promise<boolean>}
 */
const healthCheck = async () => {
  try {
    const result = await query('SELECT NOW() as now')
    return !!result.rows[0]
  } catch {
    return false
  }
}

module.exports = { pool, query, transaction, healthCheck }
