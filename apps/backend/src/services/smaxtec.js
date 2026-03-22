/**
 * @fileoverview smaXtec Cloud API 연동 서비스
 * 개체별 체온·활동량·반추·음수량 실시간 데이터 수집
 * @see https://api.smaxtec.com/api/v2
 *
 * 연동 대상: 갈전리목장 (송영신목장) 단일 조직
 * 볼루스 센서 → smaXtec Cloud → ERP 연동 흐름:
 * 1. API 키로 인증 → 토큰 발급
 * 2. 조직(org) → 그룹 → 개체 목록 조회
 * 3. 개체별 센서 데이터 (체온, 활동량, 반추, 음수) 시계열 조회
 * 4. ERP DB에 저장 + 이상치 감지
 */
const { query } = require('../config/database')

const SMAXTEC_API = 'https://api.smaxtec.com/api/v2'

/**
 * smaXtec API 인증
 * @returns {Promise<string>} 세션 토큰
 */
const authenticate = async () => {
  const apiKey = process.env.SMAXTEC_API_KEY
  if (!apiKey) {
    throw new Error('SMAXTEC_API_KEY 환경변수가 설정되지 않았습니다')
  }

  const res = await fetch(`${SMAXTEC_API}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: apiKey }),
  })

  if (!res.ok) {
    throw new Error(`smaXtec 인증 실패: ${res.status}`)
  }

  const data = await res.json()
  return data.token
}

/**
 * 조직 내 개체 목록 조회
 * @param {string} token - 세션 토큰
 * @param {string} orgId - 조직 ID
 * @returns {Promise<Array>} 개체 목록
 */
const getAnimals = async (token, orgId) => {
  const res = await fetch(`${SMAXTEC_API}/organisations/${orgId}/animals`, {
    headers: { 'Authorization': `Bearer ${token}` },
  })

  if (!res.ok) {
    throw new Error(`smaXtec 개체 조회 실패: ${res.status}`)
  }

  return await res.json()
}

/**
 * 개체별 센서 데이터 조회
 * @param {string} token - 세션 토큰
 * @param {string} animalId - smaXtec 개체 ID
 * @param {string} metric - 'temp' | 'act' | 'rum' | 'drink'
 * @param {string} fromDate - ISO 날짜
 * @param {string} toDate - ISO 날짜
 * @returns {Promise<Array>} 시계열 데이터 [{timestamp, value}]
 */
const getSensorData = async (token, animalId, metric, fromDate, toDate) => {
  const params = new URLSearchParams({ from: fromDate, to: toDate })

  const res = await fetch(
    `${SMAXTEC_API}/animals/${animalId}/data/${metric}?${params}`,
    { headers: { 'Authorization': `Bearer ${token}` } },
  )

  if (!res.ok) {
    throw new Error(`smaXtec 센서 데이터 조회 실패: ${res.status} (${metric})`)
  }

  return await res.json()
}

/**
 * 개체별 알림/이벤트 조회 (발정, 질병 등)
 * @param {string} token
 * @param {string} animalId
 * @returns {Promise<Array>} 이벤트 목록
 */
const getAnimalEvents = async (token, animalId) => {
  const res = await fetch(
    `${SMAXTEC_API}/animals/${animalId}/events?limit=50`,
    { headers: { 'Authorization': `Bearer ${token}` } },
  )

  if (!res.ok) {
    throw new Error(`smaXtec 이벤트 조회 실패: ${res.status}`)
  }

  return await res.json()
}

/**
 * 센서 데이터를 ERP DB에 저장
 * cow_id 매핑: smaXtec animal_id → ERP animals.cow_id
 * @param {string} cowId - ERP 이표번호
 * @param {Object} data - { temp, activity, rumination, drink_count }
 * @param {Date} timestamp
 */
const saveSensorReading = async (cowId, data, timestamp) => {
  // animals 테이블에서 UUID 조회
  const animalRes = await query(
    'SELECT id FROM animals WHERE cow_id = $1 AND deleted_at IS NULL',
    [cowId],
  )

  if (animalRes.rows.length === 0) return null

  const animalId = animalRes.rows[0].id

  // sensor_readings 테이블에 저장 (없으면 생성)
  await query(`
    INSERT INTO sensor_readings (animal_id, measured_at, temperature, activity, rumination, drink_count)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (animal_id, measured_at) DO UPDATE SET
      temperature = EXCLUDED.temperature,
      activity = EXCLUDED.activity,
      rumination = EXCLUDED.rumination,
      drink_count = EXCLUDED.drink_count,
      updated_at = NOW()
  `, [animalId, timestamp, data.temp, data.activity, data.rumination, data.drink_count])

  return animalId
}

/**
 * 전체 센서 데이터 동기화 배치
 * cron에서 호출 (1시간 간격)
 * @param {string} orgId - smaXtec 조직 ID
 * @returns {Promise<Object>} 동기화 결과
 */
const syncSensorData = async (orgId) => {
  const token = await authenticate()
  const animals = await getAnimals(token, orgId)

  const now = new Date()
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
  const fromDate = oneHourAgo.toISOString()
  const toDate = now.toISOString()

  const results = { total: animals.length, synced: 0, errors: [] }

  for (const animal of animals) {
    try {
      // 체온 데이터
      const tempData = await getSensorData(token, animal.id, 'temp', fromDate, toDate)
      // 활동량 데이터
      const actData = await getSensorData(token, animal.id, 'act', fromDate, toDate)

      // 최신 값 추출
      const latestTemp = tempData.length > 0 ? tempData[tempData.length - 1] : null
      const latestAct = actData.length > 0 ? actData[actData.length - 1] : null

      if (latestTemp || latestAct) {
        // ERP cow_id 매핑 (smaXtec name → ERP cow_id)
        const cowId = animal.name || animal.official_id
        await saveSensorReading(cowId, {
          temp: latestTemp?.value,
          activity: latestAct?.value,
          rumination: null,
          drink_count: null,
        }, latestTemp?.timestamp || now)
        results.synced++
      }
    } catch (err) {
      results.errors.push({ animal: animal.name, error: err.message })
    }
  }

  return results
}

/**
 * 체온 이상 감지
 * 정상 범위: 38.0~39.5°C (저지종 기준)
 * @param {string} cowId
 * @param {number} temperature
 * @returns {{isAbnormal: boolean, severity: string, message: string}}
 */
const checkTemperatureAnomaly = (cowId, temperature) => {
  if (temperature >= 40.0) {
    return { isAbnormal: true, severity: 'P1', message: `${cowId}: 고열 ${temperature}°C (기준 39.5°C 초과)` }
  }
  if (temperature >= 39.5) {
    return { isAbnormal: true, severity: 'P2', message: `${cowId}: 미열 ${temperature}°C (주의 필요)` }
  }
  if (temperature < 37.5) {
    return { isAbnormal: true, severity: 'P2', message: `${cowId}: 저체온 ${temperature}°C (기준 38.0°C 미달)` }
  }
  return { isAbnormal: false, severity: null, message: null }
}

module.exports = {
  authenticate,
  getAnimals,
  getSensorData,
  getAnimalEvents,
  saveSensorReading,
  syncSensorData,
  checkTemperatureAnomaly,
}
