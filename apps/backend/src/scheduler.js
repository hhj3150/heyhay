/**
 * @fileoverview 자동 스케줄러 (node-cron)
 * 서버 시작 시 자동 등록, ENABLE_SCHEDULER=true 일 때만 실행
 *
 * 스케줄:
 * - 매 2시간 (06~22시): 스마트스토어 주문 동기화
 * - 매일 05:30: 배송 체크리스트 자동 생성
 * - 매일 06:00: 구독 결제 배치
 */
const cron = require('node-cron')
const { query, transaction } = require('./config/database')
const { broadcastAlert } = require('./routes/dashboard/sse')

// 스케줄러 활성화 여부
const isEnabled = () => process.env.ENABLE_SCHEDULER === 'true'

// 작업 실패 시 알림 생성 + SSE 실시간 push
const createAlert = async (title, message, priority = 'P2') => {
  try {
    await query(`
      INSERT INTO alerts (module, priority, alert_type, title, message, target_roles)
      VALUES ('system', $1, 'SCHEDULER_ERROR', $2, $3, '["ADMIN"]')
    `, [priority, title, message])

    broadcastAlert({ priority, alert_type: 'SCHEDULER_ERROR', title, message, module: 'system' })
  } catch (e) {
    console.error('[스케줄러] 알림 생성 실패:', e.message)
  }
}

/**
 * 스마트스토어 주문 동기화
 * naverCommerce 서비스 직접 호출 (라우트 거치지 않음)
 */
const syncNaverOrders = async () => {
  const tag = '[스케줄러:네이버동기화]'
  try {
    const clientId = process.env.NAVER_COMMERCE_CLIENT_ID
    if (!clientId) {
      return // API 키 미설정 시 건너뜀
    }

    const { fetchNewOrders, fetchOrderDetail, transformToERPOrder } = require('./services/naverCommerce')
    const lastChangedFrom = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()

    const naverOrders = await fetchNewOrders({ lastChangedFrom })
    if (naverOrders.length === 0) {
      console.log(`${tag} 신규 주문 없음`)
      return
    }

    let synced = 0
    let skipped = 0

    for (const naverOrder of naverOrders) {
      const productOrderId = naverOrder.productOrderId
      try {
        // 중복 확인
        const existing = await query(
          'SELECT id FROM orders WHERE external_order_id = $1 AND deleted_at IS NULL',
          [productOrderId],
        )
        if (existing.rows.length > 0) { skipped++; continue }

        // 상세 조회 + 변환
        const detail = await fetchOrderDetail(productOrderId)
        const erpData = transformToERPOrder(detail)

        // 고객 매칭/생성
        let customerId = null
        if (erpData.recipient_phone) {
          const custResult = await query(
            'SELECT id FROM customers WHERE phone = $1 AND deleted_at IS NULL',
            [erpData.recipient_phone],
          )
          if (custResult.rows.length > 0) {
            customerId = custResult.rows[0].id
          } else {
            const newCust = await query(`
              INSERT INTO customers (name, phone, channel, address_zip, address_main)
              VALUES ($1, $2, 'SMARTSTORE', $3, $4)
              RETURNING id
            `, [erpData.recipient_name, erpData.recipient_phone, erpData.shipping_zip, erpData.shipping_address])
            customerId = newCust.rows[0].id
          }
        }

        // 주문번호 생성
        const now = new Date()
        const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
        const dateStr = kst.toISOString().split('T')[0].replace(/-/g, '')
        const seqRes = await query(
          'SELECT COUNT(*) + 1 AS seq FROM orders WHERE order_number LIKE $1',
          [`HH-${dateStr}-%`],
        )
        const orderNumber = `HH-${dateStr}-${String(seqRes.rows[0].seq).padStart(4, '0')}`

        // 트랜잭션으로 주문 등록
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

          const orderId = orderRes.rows[0].id
          for (const item of erpData.items) {
            const skuMatch = await client.query(
              'SELECT id FROM skus WHERE name ILIKE $1 OR code ILIKE $1 LIMIT 1',
              [`%${item.product_name}%`],
            )
            if (skuMatch.rows.length > 0) {
              await client.query(`
                INSERT INTO order_items (order_id, sku_id, quantity, unit_price, subtotal)
                VALUES ($1, $2, $3, $4, $5)
              `, [orderId, skuMatch.rows[0].id, item.quantity, item.unit_price, item.quantity * item.unit_price])
            }
          }

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
        console.error(`${tag} 주문 ${productOrderId} 동기화 실패:`, orderErr.message)
      }
    }

    console.log(`${tag} 완료: ${synced}건 동기화, ${skipped}건 스킵`)
  } catch (err) {
    console.error(`${tag} 실패:`, err.message)
    await createAlert('스마트스토어 동기화 실패', err.message)
  }
}

/**
 * 배송 체크리스트 자동 생성
 * checklist.js의 POST /generate 로직과 동일
 */
const generateChecklist = async () => {
  const tag = '[스케줄러:체크리스트]'
  try {
    const now = new Date()
    const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
    const targetDate = kst.toISOString().split('T')[0]

    // 이미 생성된 건 확인
    const existing = await query(
      'SELECT COUNT(*) FROM delivery_checklist WHERE delivery_date = $1',
      [targetDate],
    )
    if (parseInt(existing.rows[0].count) > 0) {
      console.log(`${tag} ${targetDate} 이미 생성됨 (${existing.rows[0].count}건)`)
      return
    }

    let created = 0

    // 1. 구독 배송 (오늘 결제 예정 or 주기 일치)
    const subs = await query(`
      SELECT s.*, c.name AS customer_name, c.phone AS customer_phone,
             c.address_zip, c.address_main, c.address_detail
      FROM subscriptions s
      JOIN customers c ON s.customer_id = c.id
      WHERE s.status = 'ACTIVE' AND s.deleted_at IS NULL AND c.deleted_at IS NULL
        AND s.next_payment_at <= $1::date + 1
    `, [targetDate])

    for (const sub of subs.rows) {
      const items = typeof sub.items === 'string' ? JSON.parse(sub.items) : sub.items
      await query(`
        INSERT INTO delivery_checklist (delivery_date, source_type, source_id, customer_name, customer_phone, shipping_address, items, total_amount)
        VALUES ($1, 'SUBSCRIPTION', $2, $3, $4, $5, $6, $7)
        ON CONFLICT DO NOTHING
      `, [targetDate, sub.id, sub.customer_name, sub.customer_phone,
          `${sub.address_main || ''} ${sub.address_detail || ''}`.trim(),
          JSON.stringify(items), sub.price_per_cycle])
      created++
    }

    // 2. 일반 주문 (PAID 상태)
    const orders = await query(`
      SELECT o.*, c.name AS customer_name, c.phone AS customer_phone
      FROM orders o
      LEFT JOIN customers c ON o.customer_id = c.id
      WHERE o.status = 'PAID' AND o.deleted_at IS NULL
        AND DATE(o.paid_at) <= $1::date
    `, [targetDate])

    for (const ord of orders.rows) {
      const orderItems = await query('SELECT * FROM order_items WHERE order_id = $1', [ord.id])
      await query(`
        INSERT INTO delivery_checklist (delivery_date, source_type, source_id, customer_name, customer_phone, shipping_address, items, total_amount)
        VALUES ($1, 'ORDER', $2, $3, $4, $5, $6, $7)
        ON CONFLICT DO NOTHING
      `, [targetDate, ord.id, ord.recipient_name || ord.customer_name,
          ord.recipient_phone || ord.customer_phone, ord.shipping_address,
          JSON.stringify(orderItems.rows), ord.total_amount])
      created++
    }

    // 3. B2B 정기 주문 (오늘 배송 요일 일치)
    const dayOfWeek = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][kst.getDay()]
    const b2b = await query(`
      SELECT bp.name AS partner_name, bp.contact_phone, bp.address,
             bso.sku_id, bso.quantity, bso.unit_price, s.name AS sku_name, bp.id AS partner_id
      FROM b2b_standing_orders bso
      JOIN b2b_partners bp ON bso.partner_id = bp.id
      JOIN skus s ON bso.sku_id = s.id
      WHERE bso.is_active = true AND bp.is_active = true
        AND bp.deleted_at IS NULL
        AND (bp.delivery_day = 'DAILY' OR bp.delivery_day = $1)
    `, [dayOfWeek])

    // B2B는 거래처별로 묶어서 체크리스트 생성
    const b2bGrouped = {}
    for (const row of b2b.rows) {
      if (!b2bGrouped[row.partner_id]) {
        b2bGrouped[row.partner_id] = {
          partner_name: row.partner_name,
          contact_phone: row.contact_phone,
          address: row.address,
          items: [],
          total: 0,
        }
      }
      const subtotal = row.quantity * row.unit_price
      b2bGrouped[row.partner_id] = {
        ...b2bGrouped[row.partner_id],
        items: [
          ...b2bGrouped[row.partner_id].items,
          { sku_name: row.sku_name, quantity: row.quantity, unit_price: row.unit_price },
        ],
        total: b2bGrouped[row.partner_id].total + subtotal,
      }
    }

    for (const [partnerId, data] of Object.entries(b2bGrouped)) {
      await query(`
        INSERT INTO delivery_checklist (delivery_date, source_type, source_id, customer_name, customer_phone, shipping_address, items, total_amount)
        VALUES ($1, 'B2B', $2, $3, $4, $5, $6, $7)
        ON CONFLICT DO NOTHING
      `, [targetDate, partnerId, data.partner_name, data.contact_phone,
          data.address, JSON.stringify(data.items), data.total])
      created++
    }

    console.log(`${tag} ${targetDate} 체크리스트 ${created}건 생성`)
  } catch (err) {
    console.error(`${tag} 실패:`, err.message)
    await createAlert('배송 체크리스트 생성 실패', err.message)
  }
}

/**
 * 구독 결제 배치
 */
const runSubscriptionPayment = async () => {
  const tag = '[스케줄러:구독결제]'
  try {
    const { runPaymentBatch } = require('./services/subscriptionPayment')
    const result = await runPaymentBatch()
    console.log(`${tag} 완료: ${result.success}건 성공, ${result.failed}건 실패 (총 ${result.total}건)`)

    if (result.failed > 0) {
      await createAlert(
        `구독 결제 실패 ${result.failed}건`,
        result.details
          .filter((d) => d.status !== 'SUCCESS')
          .map((d) => `${d.customer}: ${d.error || d.status}`)
          .join(', '),
      )
    }
  } catch (err) {
    console.error(`${tag} 실패:`, err.message)
    await createAlert('구독 결제 배치 실패', err.message, 'P1')
  }
}

/**
 * 스케줄러 초기화 — 서버 시작 시 호출
 */
const init = () => {
  if (!isEnabled()) {
    console.log('[스케줄러] 비활성화 상태 (ENABLE_SCHEDULER=true 로 활성화)')
    return
  }

  console.log('[스케줄러] 자동 스케줄러 시작')

  // 매 2시간 (06, 08, 10, 12, 14, 16, 18, 20, 22시) — 스마트스토어 주문 동기화
  cron.schedule('0 6,8,10,12,14,16,18,20,22 * * *', () => {
    console.log('[스케줄러] 스마트스토어 주문 동기화 시작')
    syncNaverOrders()
  }, { timezone: 'Asia/Seoul' })

  // 매일 05:30 — 배송 체크리스트 자동 생성
  cron.schedule('30 5 * * *', () => {
    console.log('[스케줄러] 배송 체크리스트 생성 시작')
    generateChecklist()
  }, { timezone: 'Asia/Seoul' })

  // 매일 06:00 — 구독 결제 배치
  cron.schedule('0 6 * * *', () => {
    console.log('[스케줄러] 구독 결제 배치 시작')
    runSubscriptionPayment()
  }, { timezone: 'Asia/Seoul' })

  console.log('[스케줄러] 등록 완료: 네이버동기화(2h), 체크리스트(05:30), 구독결제(06:00)')
}

module.exports = { init, syncNaverOrders, generateChecklist, runSubscriptionPayment }
