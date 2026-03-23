/**
 * @fileoverview 날짜 포맷 유틸리티
 * ISO 날짜를 한국어 친화적으로 표시
 */

/** ISO 날짜 → '2026년 3월 24일' */
export const formatDate = (isoString) => {
  if (!isoString) return '-'
  const d = new Date(isoString)
  if (isNaN(d.getTime())) return '-'
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
}

/** ISO 날짜 → '3월 24일 오전 10:30' */
export const formatDateTime = (isoString) => {
  if (!isoString) return '-'
  const d = new Date(isoString)
  if (isNaN(d.getTime())) return '-'
  return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }) + ' ' +
    d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
}

/** ISO 날짜 → '3/24' 짧은 형식 */
export const formatShort = (isoString) => {
  if (!isoString) return '-'
  const d = new Date(isoString)
  if (isNaN(d.getTime())) return '-'
  return `${d.getMonth() + 1}/${d.getDate()}`
}

/** ISO 날짜 → D-day 계산 ('D-3', '오늘', 'D+2') */
export const formatDday = (isoString) => {
  if (!isoString) return '-'
  const target = new Date(isoString)
  const now = new Date()
  target.setHours(0, 0, 0, 0)
  now.setHours(0, 0, 0, 0)
  const diff = Math.ceil((target - now) / (1000 * 60 * 60 * 24))
  if (diff === 0) return '오늘'
  if (diff > 0) return `D-${diff}`
  return `D+${Math.abs(diff)}`
}

/** ISO 날짜 → 상대 시간 ('방금', '5분 전', '2시간 전', '어제') */
export const formatRelative = (isoString) => {
  if (!isoString) return '-'
  const d = new Date(isoString)
  const now = new Date()
  const diffMs = now - d
  const diffMin = Math.floor(diffMs / 60000)
  const diffHr = Math.floor(diffMs / 3600000)
  const diffDay = Math.floor(diffMs / 86400000)
  if (diffMin < 1) return '방금'
  if (diffMin < 60) return `${diffMin}분 전`
  if (diffHr < 24) return `${diffHr}시간 전`
  if (diffDay < 7) return `${diffDay}일 전`
  return formatDate(isoString)
}
