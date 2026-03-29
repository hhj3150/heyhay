/**
 * @fileoverview Claude AI 이상 감지 서비스
 * 착유량 급감, CCP 이탈, 센서 이상치를 AI가 분석하고 자연어 보고서 생성
 *
 * 분석 대상:
 * 1. 착유량 트렌드 → 급감 감지 (전일 대비 -25% 이상)
 * 2. CCP 공정 데이터 → 온도/시간 이탈 감지
 * 3. 센서 데이터 → 체온/활동량 이상 패턴
 */
const { query } = require('../config/database')

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages'

/**
 * Claude API 호출
 * @param {string} systemPrompt - 시스템 프롬프트
 * @param {string} userMessage - 분석할 데이터
 * @returns {Promise<string>} AI 분석 결과
 */
const callClaude = async (systemPrompt, userMessage) => {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다')
  }

  const res = await fetch(CLAUDE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Claude API 호출 실패: ${res.status} - ${err}`)
  }

  const data = await res.json()
  return data.content[0].text
}

/**
 * 착유량 이상 감지 + AI 분석
 * @returns {Promise<Array>} 이상 감지 결과 목록
 */
const analyzeMilkProduction = async () => {
  // 최근 7일 착유량 데이터 조회
  const result = await query(`
    SELECT
      a.cow_id, a.name,
      DATE(mr.milked_at) AS milk_date,
      SUM(mr.amount_l) AS daily_total
    FROM milk_records mr
    JOIN animals a ON mr.animal_id = a.id
    WHERE mr.milked_at >= NOW() - INTERVAL '7 days'
      AND a.deleted_at IS NULL
    GROUP BY a.cow_id, a.name, DATE(mr.milked_at)
    ORDER BY a.cow_id, milk_date
  `)

  if (result.rows.length === 0) return []

  // 개체별 전일 대비 변화율 계산
  const byAnimal = {}
  result.rows.forEach((r) => {
    if (!byAnimal[r.cow_id]) byAnimal[r.cow_id] = { name: r.name, data: [] }
    byAnimal[r.cow_id].data.push({ date: r.milk_date, total: parseFloat(r.daily_total) })
  })

  const anomalies = []
  for (const [cowId, info] of Object.entries(byAnimal)) {
    const { data } = info
    if (data.length < 2) continue

    const yesterday = data[data.length - 2].total
    const today = data[data.length - 1].total

    if (yesterday === 0) continue

    const changePct = ((today - yesterday) / yesterday) * 100

    if (changePct <= -25) {
      anomalies.push({
        cow_id: cowId,
        cow_name: info.name,
        yesterday_l: yesterday,
        today_l: today,
        change_pct: Math.round(changePct * 10) / 10,
        severity: changePct <= -40 ? 'P1' : 'P2',
        trend: data.map((d) => ({ date: d.date, total: d.total })),
      })
    }
  }

  return anomalies
}

/**
 * CCP 공정 이탈 감지
 * @returns {Promise<Array>} CCP 이탈 목록
 */
const analyzeCCPDeviations = async () => {
  const result = await query(`
    SELECT
      ps.batch_id, ps.step_name, ps.temperature, ps.hold_seconds,
      ps.ccp_pass, ps.started_at,
      pb.batch_number
    FROM process_steps ps
    JOIN production_batches pb ON ps.batch_id = pb.id
    WHERE ps.started_at >= NOW() - INTERVAL '24 hours'
      AND ps.ccp_pass = false
    ORDER BY ps.started_at DESC
  `)

  return result.rows.map((r) => ({
    batch_number: r.batch_number,
    step: r.step_name,
    temperature: parseFloat(r.temperature),
    hold_seconds: r.hold_seconds,
    timestamp: r.started_at,
    severity: 'P1',
    message: `배치 ${r.batch_number}: ${r.step_name} CCP 이탈 (온도 ${r.temperature}°C)`,
  }))
}

/**
 * AI 종합 분석 보고서 생성
 * 착유량 + CCP + 센서를 통합 분석하여 자연어 보고서 작성
 * @returns {Promise<Object>} { report, anomalies, alerts_created }
 */
const generateDailyReport = async () => {
  const milkAnomalies = await analyzeMilkProduction()
  const ccpDeviations = await analyzeCCPDeviations()

  const hasIssues = milkAnomalies.length > 0 || ccpDeviations.length > 0

  // 이상치가 있으면 Claude에게 분석 요청
  let aiReport = null
  if (hasIssues && (process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY)) {
    const systemPrompt = `당신은 HEY HAY MILK 목장의 수의사이자 유가공 전문가입니다.
저지종 A2 우유를 생산하는 60두 규모 목장의 일일 보고서를 작성합니다.
한국어로 간결하게 작성하되, 긴급도가 높은 항목을 먼저 보고하세요.
결론 → 원인 추정 → 조치사항 순으로 작성합니다.`

    const dataStr = JSON.stringify({
      milk_anomalies: milkAnomalies,
      ccp_deviations: ccpDeviations,
      analysis_time: new Date().toISOString(),
    }, null, 2)

    try {
      aiReport = await callClaude(systemPrompt, `다음 데이터를 분석하여 일일 보고서를 작성해주세요:\n\n${dataStr}`)
    } catch (err) {
      aiReport = `AI 분석 불가: ${err.message}`
    }
  }

  // 알림 자동 생성
  let alertsCreated = 0

  for (const anomaly of milkAnomalies) {
    await query(`
      INSERT INTO alerts (module, priority, alert_type, title, message, target_roles)
      VALUES ('farm', $1, 'MILK_DROP', $2, $3, '["ADMIN","FARM"]')
    `, [
      anomaly.severity,
      `착유량 급감 — ${anomaly.cow_name}(${anomaly.cow_id})`,
      `${anomaly.cow_name} 착유량 ${anomaly.change_pct}% 변화 (어제 ${anomaly.yesterday_l}L → 오늘 ${anomaly.today_l}L). 건강 확인 필요.`,
    ])
    alertsCreated++
  }

  for (const dev of ccpDeviations) {
    await query(`
      INSERT INTO alerts (module, priority, alert_type, title, message, target_roles)
      VALUES ('factory', 'P1', 'CCP_DEVIATION', $1, $2, '["ADMIN","FACTORY"]')
    `, [
      `CCP 이탈 — ${dev.batch_number}`,
      dev.message,
    ])
    alertsCreated++
  }

  return {
    analyzed_at: new Date().toISOString(),
    milk_anomalies: milkAnomalies.length,
    ccp_deviations: ccpDeviations.length,
    alerts_created: alertsCreated,
    ai_report: aiReport,
    details: {
      milk: milkAnomalies,
      ccp: ccpDeviations,
    },
  }
}

module.exports = {
  callClaude,
  analyzeMilkProduction,
  analyzeCCPDeviations,
  generateDailyReport,
}
