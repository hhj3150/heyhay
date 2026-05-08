/**
 * @fileoverview Factory Shipments 통합 테스트
 * 채널 통합 출하 지시서 / 재고 차감 / 통계
 */
const {
  getAdminToken, authGet, authPost, authPatch,
} = require('./helpers/setup')
const { query } = require('../src/config/database')

let token = ''

beforeAll(async () => {
  token = await getAdminToken()
})

// ============================================================
// 목록 / 요약 / 통계 (조회 전용)
// ============================================================

describe('GET /api/v1/factory/shipments', () => {
  test('출하 목록 응답 (배열)', async () => {
    const res = await authGet('/api/v1/factory/shipments', token)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(Array.isArray(res.body.data)).toBe(true)
  })

  test('채널 필터 적용', async () => {
    const res = await authGet('/api/v1/factory/shipments?channel=B2B', token)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
    res.body.data.forEach((row) => expect(row.channel).toBe('B2B'))
  })
})

describe('GET /api/v1/factory/shipments/today', () => {
  test('당일 채널별 요약 + 합계 반환', async () => {
    const res = await authGet('/api/v1/factory/shipments/today', token)
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveProperty('by_channel')
    expect(res.body.data).toHaveProperty('total')
    expect(Array.isArray(res.body.data.by_channel)).toBe(true)
    expect(res.body.data.total).toHaveProperty('total_count')
    expect(res.body.data.total).toHaveProperty('shipped_amount')
  })
})

describe('GET /api/v1/factory/shipments/stats', () => {
  test('필수 파라미터 누락 시 400', async () => {
    const res = await authGet('/api/v1/factory/shipments/stats', token)
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  test('잘못된 group_by 400', async () => {
    const res = await authGet(
      '/api/v1/factory/shipments/stats?date_from=2026-01-01&date_to=2026-12-31&group_by=invalid',
      token,
    )
    expect(res.status).toBe(400)
  })

  test('channel 그룹 통계 조회', async () => {
    const res = await authGet(
      '/api/v1/factory/shipments/stats?date_from=2026-01-01&date_to=2026-12-31&group_by=channel',
      token,
    )
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
    expect(res.body.meta.group_by).toBe('channel')
  })

  test('partner 그룹 통계 조회', async () => {
    const res = await authGet(
      '/api/v1/factory/shipments/stats?date_from=2026-01-01&date_to=2026-12-31&group_by=partner',
      token,
    )
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
  })

  test('sku 그룹 통계 조회', async () => {
    const res = await authGet(
      '/api/v1/factory/shipments/stats?date_from=2026-01-01&date_to=2026-12-31&group_by=sku',
      token,
    )
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
  })
})

// ============================================================
// 단건 조회 — 없는 ID
// ============================================================

describe('GET /api/v1/factory/shipments/:id', () => {
  test('존재하지 않는 ID는 404', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000'
    const res = await authGet(`/api/v1/factory/shipments/${fakeId}`, token)
    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('SHIPMENT_NOT_FOUND')
  })
})

// ============================================================
// 생성 검증 (스키마)
// ============================================================

describe('POST /api/v1/factory/shipments — 검증', () => {
  test('items 빈 배열 시 400', async () => {
    const res = await authPost('/api/v1/factory/shipments', {
      channel: 'B2B',
      partner_id: '11111111-1111-1111-1111-111111111111',
      planned_date: '2026-05-08',
      items: [],
    }, token)
    expect(res.status).toBe(400)
  })

  test('B2B 채널인데 partner_id 누락 시 400', async () => {
    const res = await authPost('/api/v1/factory/shipments', {
      channel: 'B2B',
      planned_date: '2026-05-08',
      items: [{
        sku_id: '11111111-1111-1111-1111-111111111111',
        quantity: 1,
      }],
    }, token)
    expect(res.status).toBe(400)
  })

  test('SMARTSTORE 채널인데 order_id 누락 시 400', async () => {
    const res = await authPost('/api/v1/factory/shipments', {
      channel: 'SMARTSTORE',
      planned_date: '2026-05-08',
      items: [{
        sku_id: '11111111-1111-1111-1111-111111111111',
        quantity: 1,
      }],
    }, token)
    expect(res.status).toBe(400)
  })

  test('잘못된 채널 값 400', async () => {
    const res = await authPost('/api/v1/factory/shipments', {
      channel: 'INVALID',
      planned_date: '2026-05-08',
      items: [{
        sku_id: '11111111-1111-1111-1111-111111111111',
        quantity: 1,
      }],
    }, token)
    expect(res.status).toBe(400)
  })
})

// ============================================================
// 인증
// ============================================================

describe('인증 검증', () => {
  test('토큰 없으면 401', async () => {
    const res = await authGet('/api/v1/factory/shipments', '')
    expect(res.status).toBe(401)
  })
})

// ============================================================
// 통합 시나리오: 생성 → 확정(재고 차감) → 취소(복구)
// 실제 DB seed 데이터(b2b_partners, skus, production_batches)에 의존
// ============================================================

describe('Shipment 통합 시나리오', () => {
  let partnerId = null
  let skuId = null
  let createdShipmentId = null

  beforeAll(async () => {
    // 시드 거래처(안성팜랜드 밀크카페) + 활성 SKU 1종 + 충분한 재고 확보
    const partnerRes = await query(
      `SELECT id FROM b2b_partners WHERE name = '안성팜랜드 밀크카페' LIMIT 1`,
    )
    const skuRes = await query(
      `SELECT id FROM skus WHERE code = 'A2-750' LIMIT 1`,
    )
    if (partnerRes.rows.length === 0 || skuRes.rows.length === 0) return
    partnerId = partnerRes.rows[0].id
    skuId = skuRes.rows[0].id

    // 테스트용 생산 배치 + 재고 100개 (FIFO 차감 가능하도록)
    const batchNo = `TEST-SHP-${Date.now()}`
    const batchRes = await query(`
      INSERT INTO production_batches (
        batch_id, sku_id, produced_at, quantity, raw_milk_used_l,
        unit_cost, expiry_date, status
      ) VALUES ($1, $2, CURRENT_DATE, 100, 50, 1000,
        CURRENT_DATE + INTERVAL '7 days', 'COMPLETED')
      RETURNING id
    `, [batchNo, skuId])

    await query(`
      INSERT INTO inventory (sku_id, batch_id, location, quantity, expiry_date)
      VALUES ($1, $2, 'FACTORY_COLD', 100, CURRENT_DATE + INTERVAL '7 days')
    `, [skuId, batchRes.rows[0].id])
  })

  test('B2B 출하 지시서 생성 (PLANNED, total_amount 자동 계산)', async () => {
    if (!partnerId || !skuId) {
      // 시드 미적용 환경에서는 skip
      return
    }
    const res = await authPost('/api/v1/factory/shipments', {
      channel: 'B2B',
      partner_id: partnerId,
      planned_date: new Date().toISOString().slice(0, 10),
      destination: '경기도 안성시 공도읍',
      vehicle_no: '12가3456',
      driver_name: '홍기사',
      items: [
        { sku_id: skuId, quantity: 5, unit_price: 7000 },
      ],
    }, token)

    expect(res.status).toBe(201)
    expect(res.body.data.status).toBe('PLANNED')
    expect(res.body.data.shipment_no).toMatch(/^SHP-\d{8}-\d{3}$/)
    expect(parseInt(res.body.data.total_amount, 10)).toBe(35000)
    expect(res.body.data.items).toHaveLength(1)

    createdShipmentId = res.body.data.id
  })

  test('단건 조회 시 partner_name / sku_code 포함', async () => {
    if (!createdShipmentId) return
    const res = await authGet(`/api/v1/factory/shipments/${createdShipmentId}`, token)
    expect(res.status).toBe(200)
    expect(res.body.data.partner_name).toBe('안성팜랜드 밀크카페')
    expect(res.body.data.items[0].sku_code).toBe('A2-750')
  })

  test('PATCH 로 배송정보 수정', async () => {
    if (!createdShipmentId) return
    const res = await authPatch(`/api/v1/factory/shipments/${createdShipmentId}`, {
      driver_name: '김기사',
      delivery_memo: '오전 배송',
    }, token)
    expect(res.status).toBe(200)
    expect(res.body.data.driver_name).toBe('김기사')
    expect(res.body.data.delivery_memo).toBe('오전 배송')
  })

  test('confirm 시 SHIPPED 전이 + 재고 차감', async () => {
    if (!createdShipmentId || !skuId) return

    const beforeRes = await query(
      `SELECT COALESCE(SUM(quantity),0)::int AS qty FROM inventory
       WHERE sku_id = $1 AND location = 'FACTORY_COLD'`,
      [skuId],
    )
    const beforeQty = beforeRes.rows[0].qty

    const res = await authPost(
      `/api/v1/factory/shipments/${createdShipmentId}/confirm`, {}, token,
    )
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('SHIPPED')
    expect(res.body.data.shipped_at).toBeTruthy()

    const afterRes = await query(
      `SELECT COALESCE(SUM(quantity),0)::int AS qty FROM inventory
       WHERE sku_id = $1 AND location = 'FACTORY_COLD'`,
      [skuId],
    )
    expect(afterRes.rows[0].qty).toBe(beforeQty - 5)

    const movRes = await query(
      `SELECT * FROM inventory_movements
       WHERE reference_id = $1 AND reference_type = 'shipment'`,
      [createdShipmentId],
    )
    expect(movRes.rows.length).toBeGreaterThan(0)
    expect(movRes.rows[0].movement_type).toBe('B2B_OUT')
    expect(movRes.rows[0].quantity).toBe(-5)
  })

  test('이미 SHIPPED 상태에서 confirm 재호출 시 INVALID_STATUS', async () => {
    if (!createdShipmentId) return
    const res = await authPost(
      `/api/v1/factory/shipments/${createdShipmentId}/confirm`, {}, token,
    )
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_STATUS')
  })

  test('cancel 시 재고 복구 + ADJUSTMENT movement 기록', async () => {
    if (!createdShipmentId || !skuId) return

    const beforeRes = await query(
      `SELECT COALESCE(SUM(quantity),0)::int AS qty FROM inventory
       WHERE sku_id = $1 AND location = 'FACTORY_COLD'`,
      [skuId],
    )
    const beforeQty = beforeRes.rows[0].qty

    const res = await authPost(
      `/api/v1/factory/shipments/${createdShipmentId}/cancel`,
      { reason: '테스트 취소' },
      token,
    )
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('CANCELLED')

    const afterRes = await query(
      `SELECT COALESCE(SUM(quantity),0)::int AS qty FROM inventory
       WHERE sku_id = $1 AND location = 'FACTORY_COLD'`,
      [skuId],
    )
    expect(afterRes.rows[0].qty).toBe(beforeQty + 5)

    const movRes = await query(
      `SELECT movement_type FROM inventory_movements
       WHERE reference_id = $1 AND reference_type = 'shipment_cancel'`,
      [createdShipmentId],
    )
    expect(movRes.rows.length).toBeGreaterThan(0)
    expect(movRes.rows[0].movement_type).toBe('ADJUSTMENT')
  })
})

// ============================================================
// 재고 부족 시나리오
// ============================================================

describe('Shipment confirm — 재고 부족', () => {
  test('재고 부족 시 INSUFFICIENT_STOCK 400', async () => {
    const partnerRes = await query(
      `SELECT id FROM b2b_partners WHERE name = '안성팜랜드 밀크카페' LIMIT 1`,
    )
    const skuRes = await query(
      `SELECT id FROM skus WHERE code = 'KM-100' LIMIT 1`,
    )
    if (partnerRes.rows.length === 0 || skuRes.rows.length === 0) return

    // 재고 보유량 조회
    const invRes = await query(
      `SELECT COALESCE(SUM(quantity),0)::int AS qty FROM inventory
       WHERE sku_id = $1 AND location = 'FACTORY_COLD'`,
      [skuRes.rows[0].id],
    )
    const oversize = invRes.rows[0].qty + 9999

    const createRes = await authPost('/api/v1/factory/shipments', {
      channel: 'B2B',
      partner_id: partnerRes.rows[0].id,
      planned_date: new Date().toISOString().slice(0, 10),
      items: [
        { sku_id: skuRes.rows[0].id, quantity: oversize, unit_price: 8000 },
      ],
    }, token)
    expect(createRes.status).toBe(201)

    const confirmRes = await authPost(
      `/api/v1/factory/shipments/${createRes.body.data.id}/confirm`, {}, token,
    )
    expect(confirmRes.status).toBe(400)
    expect(confirmRes.body.error.code).toBe('INSUFFICIENT_STOCK')

    // 정리: 취소 처리
    await authPost(
      `/api/v1/factory/shipments/${createRes.body.data.id}/cancel`,
      { reason: '테스트 정리' },
      token,
    )
  })
})
