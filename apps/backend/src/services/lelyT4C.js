/**
 * @fileoverview Lely Astronaut A3 로봇 착유기 데이터 연동
 * 갈전리목장(송영신목장) — Lely T4C 관리 소프트웨어 연동
 *
 * Lely A3 로봇 착유기 데이터 수집 방법 (3가지):
 *
 * [방법 1] T4C SQL Server 직접 연결 (권장 — 실시간)
 * - Lely T4C는 로컬 SQL Server에 데이터 저장
 * - 목장 PC의 T4C DB에 읽기 전용 접근
 * - 착유량, 전기전도도, 우유색상, 체중, 착유시간 등 전부 접근 가능
 * - 연결 정보: T4C 관리자에서 확인 (보통 localhost\T4C)
 *
 * [방법 2] Lely Horizon Cloud API
 * - Lely Horizon 웹 포탈 (horizon.lely.com)
 * - API 접근 시 Lely 딜러를 통한 별도 계약 필요
 * - 장점: 인터넷만 있으면 어디서든 접근
 *
 * [방법 3] T4C CSV/XML 자동 내보내기
 * - T4C 설정에서 자동 내보내기 활성화
 * - 지정 폴더에 CSV 파일 생성 → ERP가 주기적으로 읽기
 * - 가장 간단하지만 실시간성 떨어짐 (5분~1시간 간격)
 *
 * 현재 구현: 방법 3 (CSV 파싱) + 방법 1 준비 (T4C DB 연결 구조)
 */
const fs = require('fs')
const path = require('path')
const { query } = require('../config/database')

// T4C CSV 내보내기 경로 (목장 PC에서 설정)
const T4C_EXPORT_PATH = process.env.LELY_T4C_EXPORT_PATH || '/data/lely-t4c/exports'

/**
 * T4C CSV 파일 파싱 — 착유 데이터
 * T4C 내보내기 형식: cow_id, milking_time, duration_sec, yield_kg, conductivity, color, temperature
 * @param {string} filePath - CSV 파일 경로
 * @returns {Array<Object>} 파싱된 착유 데이터
 */
const parseMilkingCSV = (filePath) => {
  if (!fs.existsSync(filePath)) return []

  const content = fs.readFileSync(filePath, 'utf-8')
  const lines = content.split('\n').filter((l) => l.trim())

  // 헤더 스킵
  const dataLines = lines.slice(1)

  return dataLines.map((line) => {
    const cols = line.split(',').map((c) => c.trim())
    return {
      cow_id: cols[0],
      milked_at: cols[1],
      duration_sec: parseInt(cols[2]) || 0,
      amount_kg: parseFloat(cols[3]) || 0,
      amount_l: (parseFloat(cols[3]) || 0) / 1.032,  // kg → L 변환 (우유 비중 1.032)
      conductivity: parseFloat(cols[4]) || null,       // 전기전도도 (유방염 지표)
      milk_color: cols[5] || null,                     // 색상 코드
      milk_temp: parseFloat(cols[6]) || null,          // 착유 시 우유 온도
      robot_id: cols[7] || 'A3-001',                   // 로봇 번호
    }
  })
}

/**
 * 착유 데이터를 ERP DB에 저장
 * T4C cow_id → ERP animals.cow_id 매핑
 * @param {Array<Object>} milkings - parseMilkingCSV 결과
 * @returns {Promise<Object>} { saved, skipped, errors }
 */
const saveMilkingData = async (milkings) => {
  const results = { saved: 0, skipped: 0, errors: [] }

  for (const m of milkings) {
    try {
      // ERP 개체 ID 조회
      const animalRes = await query(
        'SELECT id FROM animals WHERE cow_id = $1 AND deleted_at IS NULL',
        [m.cow_id],
      )

      if (animalRes.rows.length === 0) {
        results.skipped++
        continue
      }

      const animalId = animalRes.rows[0].id

      // 중복 체크 (같은 개체 + 같은 착유 시간)
      const existing = await query(
        'SELECT id FROM milk_records WHERE animal_id = $1 AND milked_at = $2',
        [animalId, m.milked_at],
      )

      if (existing.rows.length > 0) {
        results.skipped++
        continue
      }

      // 착유 기록 저장
      await query(`
        INSERT INTO milk_records (
          animal_id, milked_at, session, amount_l,
          fat_pct, protein_pct, somatic_cell_count, notes
        ) VALUES ($1, $2, $3, $4, NULL, NULL, NULL, $5)
      `, [
        animalId,
        m.milked_at,
        detectSession(m.milked_at),
        m.amount_l,
        `Lely A3 | ${m.duration_sec}초 | 전도도:${m.conductivity || '-'} | 온도:${m.milk_temp || '-'}°C`,
      ])

      // 전기전도도 이상 체크 (유방염 의심)
      if (m.conductivity && m.conductivity > 7.0) {
        await query(`
          INSERT INTO alerts (module, priority, alert_type, title, message, target_roles)
          VALUES ('farm', 'P2', 'MASTITIS_RISK', $1, $2, '["ADMIN","FARM"]')
        `, [
          `유방염 의심 — ${m.cow_id}`,
          `${m.cow_id} 전기전도도 ${m.conductivity}mS/cm (기준 7.0 초과). Lely A3 로봇 착유 시 감지. 수의사 확인 필요.`,
        ])
      }

      results.saved++
    } catch (err) {
      results.errors.push({ cow_id: m.cow_id, error: err.message })
    }
  }

  return results
}

/**
 * 착유 세션 판별 (시간 기반)
 * @param {string} milkedAt - ISO 타임스탬프
 * @returns {'AM'|'PM'|'NIGHT'} 세션
 */
const detectSession = (milkedAt) => {
  const hour = new Date(milkedAt).getHours()
  if (hour >= 4 && hour < 12) return 'AM'
  if (hour >= 12 && hour < 20) return 'PM'
  return 'NIGHT'
}

/**
 * T4C 동기화 배치 실행
 * 최신 CSV 파일을 읽어서 ERP에 저장
 * @returns {Promise<Object>} 동기화 결과
 */
const syncFromT4C = async () => {
  // 오늘 날짜 파일 찾기 (T4C 내보내기 파일명 패턴)
  const today = new Date().toISOString().split('T')[0].replace(/-/g, '')
  const possibleFiles = [
    path.join(T4C_EXPORT_PATH, `milking_${today}.csv`),
    path.join(T4C_EXPORT_PATH, `MilkData_${today}.csv`),
    path.join(T4C_EXPORT_PATH, 'latest_milking.csv'),
  ]

  let targetFile = null
  for (const f of possibleFiles) {
    if (fs.existsSync(f)) {
      targetFile = f
      break
    }
  }

  if (!targetFile) {
    return { synced: false, message: `T4C 내보내기 파일을 찾을 수 없습니다. 경로: ${T4C_EXPORT_PATH}` }
  }

  const milkings = parseMilkingCSV(targetFile)
  if (milkings.length === 0) {
    return { synced: false, message: '파싱된 착유 데이터가 없습니다' }
  }

  const result = await saveMilkingData(milkings)

  return {
    synced: true,
    file: targetFile,
    total_records: milkings.length,
    ...result,
  }
}

/**
 * Lely A3 로봇 상태 요약
 * @returns {Promise<Object>} 오늘 착유 통계
 */
const getRobotStatus = async () => {
  const result = await query(`
    SELECT
      COUNT(*) AS total_milkings,
      COUNT(DISTINCT animal_id) AS cows_milked,
      COALESCE(SUM(amount_l), 0) AS total_liters,
      COALESCE(AVG(amount_l), 0) AS avg_per_milking,
      MIN(milked_at) AS first_milking,
      MAX(milked_at) AS last_milking
    FROM milk_records
    WHERE DATE(milked_at) = CURRENT_DATE
  `)

  return {
    robot: 'Lely Astronaut A3',
    location: '갈전리목장 (송영신목장)',
    today: result.rows[0],
    t4c_export_path: T4C_EXPORT_PATH,
    connection_method: process.env.LELY_T4C_DB_HOST ? 'SQL_DIRECT' : 'CSV_IMPORT',
  }
}

module.exports = {
  parseMilkingCSV,
  saveMilkingData,
  syncFromT4C,
  getRobotStatus,
  detectSession,
}
