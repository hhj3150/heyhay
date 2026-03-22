/**
 * @fileoverview 네이버 커머스 API 서비스
 * 스마트스토어 주문 자동 수집 + 발송 처리 연동
 * @see https://apicenter.commerce.naver.com
 *
 * 인증 흐름:
 * 1. client_id + client_secret → OAuth2 token 발급
 * 2. token으로 주문 조회/발송처리 API 호출
 */

const NAVER_API_BASE = 'https://api.commerce.naver.com/external'

/**
 * 네이버 커머스 API 인증 토큰 발급
 * @returns {Promise<string>} access_token
 */
const getAccessToken = async () => {
  const clientId = process.env.NAVER_COMMERCE_CLIENT_ID
  const clientSecret = process.env.NAVER_COMMERCE_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error('네이버 커머스 API 인증 정보가 설정되지 않았습니다 (NAVER_COMMERCE_CLIENT_ID, NAVER_COMMERCE_CLIENT_SECRET)')
  }

  // BCrypt 기반 시그니처 생성 (네이버 커머스 API 요구사항)
  const timestamp = Date.now()
  const crypto = require('crypto')
  const signature = crypto
    .createHmac('sha256', clientSecret)
    .update(`${clientId}_${timestamp}`)
    .digest('base64')

  const params = new URLSearchParams({
    client_id: clientId,
    timestamp: String(timestamp),
    client_secret_sign: signature,
    grant_type: 'client_credentials',
    type: 'SELF',
  })

  const res = await fetch(`${NAVER_API_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`네이버 토큰 발급 실패: ${res.status} - ${err}`)
  }

  const data = await res.json()
  return data.access_token
}

/**
 * 네이버 주문 목록 조회 (신규 발주 확인)
 * @param {Object} options
 * @param {string} options.lastChangedFrom - 조회 시작 시간 (ISO8601)
 * @param {string} [options.lastChangedTo] - 조회 종료 시간
 * @returns {Promise<Array>} 주문 목록
 */
const fetchNewOrders = async ({ lastChangedFrom, lastChangedTo }) => {
  const token = await getAccessToken()

  const body = {
    lastChangedFrom,
    lastChangedTo: lastChangedTo || new Date().toISOString(),
    lastChangedType: 'PAYED', // 결제 완료 상태
  }

  const res = await fetch(`${NAVER_API_BASE}/v1/pay-order/seller/product-orders/last-changed-statuses`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`네이버 주문 조회 실패: ${res.status} - ${err}`)
  }

  const data = await res.json()
  return data.data?.lastChangeStatuses || []
}

/**
 * 개별 주문 상세 조회
 * @param {string} productOrderId - 상품주문번호
 * @returns {Promise<Object>} 주문 상세
 */
const fetchOrderDetail = async (productOrderId) => {
  const token = await getAccessToken()

  const res = await fetch(`${NAVER_API_BASE}/v1/pay-order/seller/product-orders/${productOrderId}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`네이버 주문 상세 조회 실패: ${res.status} - ${err}`)
  }

  const data = await res.json()
  return data.data
}

/**
 * 발송 처리 (운송장 등록)
 * @param {Object} params
 * @param {string} params.productOrderId - 상품주문번호
 * @param {string} params.deliveryCompanyCode - 택배사 코드 (CJGLS, LOTTE 등)
 * @param {string} params.trackingNumber - 운송장 번호
 * @returns {Promise<Object>} 발송 처리 결과
 */
const shipOrder = async ({ productOrderId, deliveryCompanyCode, trackingNumber }) => {
  const token = await getAccessToken()

  const body = {
    dispatchProductOrders: [{
      productOrderId,
      deliveryMethod: 'DELIVERY',
      deliveryCompanyCode,
      trackingNumber,
    }],
  }

  const res = await fetch(`${NAVER_API_BASE}/v1/pay-order/seller/product-orders/dispatch`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`네이버 발송 처리 실패: ${res.status} - ${err}`)
  }

  return await res.json()
}

/**
 * 네이버 주문을 ERP 주문 형식으로 변환
 * @param {Object} naverOrder - 네이버 주문 상세
 * @returns {Object} ERP 주문 데이터
 */
const transformToERPOrder = (naverOrder) => {
  const order = naverOrder.productOrder || naverOrder
  const shipping = order.shippingAddress || {}

  return {
    channel: 'SMARTSTORE',
    external_order_id: order.productOrderId || order.orderId,
    recipient_name: shipping.name || order.ordererName,
    recipient_phone: shipping.tel1 || order.ordererTel,
    shipping_zip: shipping.zipCode,
    shipping_address: `${shipping.baseAddress || ''} ${shipping.detailedAddress || ''}`.trim(),
    shipping_memo: shipping.deliveryMemo || null,
    items: [{
      product_name: order.productName,
      quantity: order.quantity || 1,
      unit_price: order.unitPrice || order.totalPaymentAmount,
    }],
    subtotal: order.totalPaymentAmount,
    shipping_fee: order.deliveryFeeAmount || 0,
    discount: order.knowledgeShoppingSellingDiscountAmount || 0,
    total_amount: order.totalPaymentAmount,
  }
}

// 택배사 코드 매핑 (ERP → 네이버)
const COURIER_CODE_MAP = Object.freeze({
  'CJ대한통운': 'CJGLS',
  '롯데택배': 'LOTTE',
  '한진택배': 'HANJIN',
  '우체국': 'EPOST',
  '로젠택배': 'LOGEN',
})

module.exports = {
  getAccessToken,
  fetchNewOrders,
  fetchOrderDetail,
  shipOrder,
  transformToERPOrder,
  COURIER_CODE_MAP,
}
