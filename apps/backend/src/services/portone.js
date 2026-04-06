/**
 * @fileoverview PortOne (구 아임포트) 결제 검증 서비스
 * 결제 완료 후 서버 측 검증용
 * 환경변수: PORTONE_API_KEY, PORTONE_API_SECRET
 */

const PORTONE_API_URL = 'https://api.iamport.kr'

/**
 * PortOne 인증 토큰 발급
 * @returns {Promise<string>} access_token
 */
const getAccessToken = async () => {
  const apiKey = process.env.PORTONE_API_KEY
  const apiSecret = process.env.PORTONE_API_SECRET

  if (!apiKey || !apiSecret) {
    throw new Error('PORTONE_API_KEY 또는 PORTONE_API_SECRET이 설정되지 않았습니다')
  }

  const res = await fetch(`${PORTONE_API_URL}/users/getToken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imp_key: apiKey, imp_secret: apiSecret }),
  })

  const data = await res.json()
  if (data.code !== 0) {
    throw new Error(`PortOne 인증 실패: ${data.message}`)
  }

  return data.response.access_token
}

/**
 * 결제 정보 조회
 * @param {string} impUid - 아임포트 고유 결제번호
 * @returns {Promise<object>} 결제 상세 정보
 */
const getPaymentInfo = async (impUid) => {
  const accessToken = await getAccessToken()

  const res = await fetch(`${PORTONE_API_URL}/payments/${impUid}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  const data = await res.json()
  if (data.code !== 0) {
    throw new Error(`결제 조회 실패: ${data.message}`)
  }

  return data.response
}

/**
 * 결제 금액 검증
 * @param {string} impUid - 아임포트 고유 결제번호
 * @param {number} expectedAmount - 서버에서 계산한 예상 금액
 * @returns {Promise<{ verified: boolean, payment: object, reason?: string }>}
 */
const verifyPayment = async (impUid, expectedAmount) => {
  const payment = await getPaymentInfo(impUid)

  if (payment.status !== 'paid') {
    return {
      verified: false,
      payment,
      reason: `결제 상태가 'paid'가 아닙니다: ${payment.status}`,
    }
  }

  if (payment.amount !== expectedAmount) {
    return {
      verified: false,
      payment,
      reason: `결제 금액 불일치: 결제 ${payment.amount}원 ≠ 예상 ${expectedAmount}원`,
    }
  }

  return { verified: true, payment }
}

module.exports = {
  getAccessToken,
  getPaymentInfo,
  verifyPayment,
}
