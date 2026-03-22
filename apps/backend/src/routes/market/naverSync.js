/**
 * @fileoverview 네이버 스마트스토어 동기화 API
 * POST /api/v1/market/naver/sync    — 신규 주문 가져오기
 * POST /api/v1/market/naver/ship    — 발송 처리 (운송장 전송)
 * GET  /api/v1/market/naver/status  — 연동 상태 확인
 */
const express = require('express')
const { query, transaction } = require('../../config/database')
const { apiResponse, apiError } = require('../../lib/shared')
const {
  fetchNewOrders,
  fetchOrderDetail,
  shipOrder,
  transformToERPOrder,
  COURIER_CODE_MAP,
} = require('../../services/naverCommerce')

const router = express.Router()

/**
 * POST /sync — 스마트스토어 신규 주문 동기화
 * 최근 N시간 내 결제 완료 주문을 가져와 ERP에 자동 등록
 */
router.post('/sync', async (req, res, next) => {
  try {
    const { hours = 24 } = req.body
    const lastChangedFrom = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()

    // 네이버에서 신규 주문 목록 조회
    const naverOrders = await fetchNewOrders({ lastChangedFrom })

    if (naverOrders.length === 0) {
      return res.json(apiResponse({ synced: 0, skipped: 0, message: '신규 주문이 없습니다' }))
    }

    let synced = 0
    let skipped = 0
    const errors = []

    for (const naverOrder of naverOrders) {
      const productOrderId = naverOrder.productOrderId

      try {
        // 이미 등록된 주문인지 확인
        const existing = await query(
          'SELECT id FROM orders WHERE external_order_id = $1 AND deleted_at IS NULL',
          [productOrderId],
        )

        if (existing.rows.length > 0) {
          skipped++
          continue
        }

        // 상세 조회
        const detail = await fetchOrderDetail(productOrderId)
        const erpData = transformToERPOrder(detail)

        // 고객 조회 또는 생성
        let customerId = null
        if (erpData.recipient_phone) {
          const custResult = await query(
            'SELECT id FROM customers WHERE phone = $1 AND deleted_at IS NULL',
            [erpData.recipient_phone],
          )

          if (custResult.rows.length > 0) {
            customerId = custResult.rows[0].id
          } else {
            // 신규 고객 자동 등록
            const newCust = await query(`
              INSERT INTO customers (name, phone, channel, address_zip, address_main)
              VALUES ($1, $2, 'SMARTSTORE', $3, $4)
              RETURNING id
            `, [erpData.recipient_name, erpData.recipient_phone, erpData.shipping_zip, erpData.shipping_address])
            customerId = newCust.rows[0].id
          }
        }

        // 주문번호 생성
        const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '')
        const seqRes = await query(
          'SELECT COUNT(*) + 1 AS seq FROM orders WHERE order_number LIKE $1',
          [`HH-${dateStr}-%`],
        )
        const orderNumber = `HH-${dateStr}-${String(seqRes.rows[0].seq).padStart(4, '0')}`

        // 주문 등록 (결제 완료 상태로)
        await transaction(async (client) => {
          const orderRes = await client.query(`
            INSERT INTO orders (
              order_number, customer_id, channel, external_order_id, status,
              subtotal, shipping_fee, discount, total_amount,
              recipient_name, recipient_phone, shipping_zip, shipping_address, shipping_memo,
              paid_at
            ) VALUES ($1,$2,$3,$4,'PAID',$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())
            RETURNING id
          `, [
            orderNumber, customerId, 'SMARTSTORE', productOrderId,
            erpData.subtotal, erpData.shipping_fee, erpData.discount, erpData.total_amount,
            erpData.recipient_name, erpData.recipient_phone,
            erpData.shipping_zip, erpData.shipping_address, erpData.shipping_memo,
          ])

          // SKU 매칭 시도 (상품명 기반)
          const orderId = orderRes.rows[0].id
          for (const item of erpData.items) {
            const skuMatch = await client.query(
              'SELECT id, code FROM skus WHERE name ILIKE $1 OR code ILIKE $1 LIMIT 1',
              [`%${item.product_name}%`],
            )

            const skuId = skuMatch.rows.length > 0 ? skuMatch.rows[0].id : null
            if (skuId) {
              await client.query(`
                INSERT INTO order_items (order_id, sku_id, quantity, unit_price, subtotal)
                VALUES ($1, $2, $3, $4, $5)
              `, [orderId, skuId, item.quantity, item.unit_price, item.quantity * item.unit_price])
            }
          }

          // 고객 통계 업데이트
          if (customerId) {
            await client.query(`
              UPDATE customers SET
                total_orders = total_orders + 1,
                total_spent = total_spent + $1,
                last_order_at = NOW(),
                first_order_at = COALESCE(first_order_at, NOW()),
                updated_at = NOW()
              WHERE id = $2
            `, [erpData.total_amount, customerId])
          }
        })

        synced++
      } catch (orderErr) {
        errors.push({ productOrderId, error: orderErr.message })
      }
    }

    res.json(apiResponse({
      synced,
      skipped,
      errors: errors.length > 0 ? errors : undefined,
      message: `${synced}건 동기화 완료, ${skipped}건 이미 등록됨`,
    }))
  } catch (err) {
    next(err)
  }
})

/**
 * POST /ship — ERP 발송 처리를 네이버에도 반영
 */
router.post('/ship', async (req, res, next) => {
  try {
    const { order_id, courier, tracking_number } = req.body

    if (!order_id || !courier || !tracking_number) {
      return res.status(400).json(apiError('MISSING_FIELDS', 'order_id, courier, tracking_number 필수'))
    }

    // ERP 주문 조회
    const orderRes = await query(
      'SELECT external_order_id, channel FROM orders WHERE id = $1 AND deleted_at IS NULL',
      [order_id],
    )

    if (orderRes.rows.length === 0) {
      return res.status(404).json(apiError('NOT_FOUND', '주문을 찾을 수 없습니다'))
    }

    const order = orderRes.rows[0]
    if (order.channel !== 'SMARTSTORE' || !order.external_order_id) {
      return res.status(400).json(apiError('NOT_NAVER', '스마트스토어 주문이 아닙니다'))
    }

    const deliveryCompanyCode = COURIER_CODE_MAP[courier]
    if (!deliveryCompanyCode) {
      return res.status(400).json(apiError('INVALID_COURIER', `지원하지 않는 택배사: ${courier}`))
    }

    // 네이버에 발송 처리
    const result = await shipOrder({
      productOrderId: order.external_order_id,
      deliveryCompanyCode,
      trackingNumber: tracking_number,
    })

    // ERP 주문도 SHIPPED 상태로 업데이트
    await query(`
      UPDATE orders SET
        status = 'SHIPPED', courier = $1, tracking_number = $2,
        shipped_at = NOW(), updated_at = NOW()
      WHERE id = $3
    `, [courier, tracking_number, order_id])

    res.json(apiResponse({ message: '네이버 발송 처리 완료', naver_result: result }))
  } catch (err) {
    next(err)
  }
})

/**
 * GET /status — 네이버 연동 상태 확인
 */
router.get('/status', async (req, res, next) => {
  try {
    const hasCredentials = !!(process.env.NAVER_COMMERCE_CLIENT_ID && process.env.NAVER_COMMERCE_CLIENT_SECRET)

    // 최근 동기화 주문 수
    const recentSync = await query(`
      SELECT COUNT(*) AS count
      FROM orders
      WHERE channel = 'SMARTSTORE' AND external_order_id IS NOT NULL
        AND created_at >= NOW() - INTERVAL '24 hours'
        AND deleted_at IS NULL
    `)

    const totalSync = await query(`
      SELECT COUNT(*) AS count
      FROM orders
      WHERE channel = 'SMARTSTORE' AND external_order_id IS NOT NULL
        AND deleted_at IS NULL
    `)

    res.json(apiResponse({
      connected: hasCredentials,
      credentials_set: hasCredentials,
      recent_synced_24h: parseInt(recentSync.rows[0].count),
      total_synced: parseInt(totalSync.rows[0].count),
    }))
  } catch (err) {
    next(err)
  }
})

module.exports = router
