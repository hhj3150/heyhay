/**
 * @fileoverview 공개 상품 정보 API (인증 불필요)
 * GET /api/v1/public/products — 랜딩 페이지용 상품 목록 + 최신 단가 + 배송비 정책
 */
const express = require('express')
const { query } = require('../../config/database')
const { apiResponse, SHIPPING } = require('../../lib/shared')

const router = express.Router()

/** 랜딩 페이지에 노출할 SKU 코드 */
const LANDING_SKU_CODES = ['A2-750', 'A2-180', 'YG-500']

/** SKU별 설명 (DB에 없는 프론트용 텍스트) */
const SKU_DESCRIPTIONS = {
  'A2-750': '저지종 A2 원유 100%',
  'A2-180': '1회 섭취 사이즈',
  'YG-500': '저지종 원유 요거트',
}

/** GET / — 랜딩 페이지 상품 + 최신 단가 */
router.get('/', async (req, res, next) => {
  try {
    // SKU 기본 정보 + RETAIL 채널 최신 단가 조회
    const result = await query(`
      SELECT
        s.code,
        s.name,
        COALESCE(sp.unit_price, 0) AS unit_price
      FROM skus s
      LEFT JOIN sku_prices sp ON sp.sku_code = s.code
        AND sp.channel = 'RETAIL'
        AND sp.effective_to IS NULL
      WHERE s.code = ANY($1)
        AND s.is_active = true
      ORDER BY array_position($1, s.code)
    `, [LANDING_SKU_CODES])

    const products = result.rows.map((r) => ({
      code: r.code,
      name: r.name,
      unit_price: parseInt(r.unit_price, 10),
      description: SKU_DESCRIPTIONS[r.code] || '',
    }))

    res.json(apiResponse({
      products,
      shipping: SHIPPING,
    }))
  } catch (err) {
    next(err)
  }
})

module.exports = router
