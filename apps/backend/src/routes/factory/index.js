/**
 * @fileoverview 공장 관리 모듈 라우터 인덱스
 * /api/v1/factory 하위 모든 라우트 통합
 */
const express = require('express')
const { apiResponse, apiError } = require('../../lib/shared')

const router = express.Router()

router.use('/raw-milk', require('./rawMilk'))
router.use('/process', require('./process'))

// production.js 에서 SKU, 배치, 재고를 모두 처리
router.use('/', require('./production'))

/** GET /production-plan — 주문 기반 생산 계획 (원유 수요 역산) */
router.get('/production-plan', async (req, res, next) => {
  try {
    const { generateProductionPlan } = require('../../services/milkDemand')
    const plan = await generateProductionPlan()
    res.json(apiResponse(plan))
  } catch (err) {
    next(err)
  }
})

/** GET /plan/demand — 프론트엔드 착유량 페이지용 수요 요약 */
router.get('/plan/demand', async (req, res, next) => {
  try {
    const { generateProductionPlan } = require('../../services/milkDemand')
    const plan = await generateProductionPlan()
    res.json(apiResponse({
      total_milk_needed_l: plan.raw_milk.daily_need_l,
      daily_to_factory_l: plan.milk_allocation.daily_to_factory_l,
      daily_to_dairy_l: plan.milk_allocation.daily_to_dairy_l,
      breakdown: plan.raw_milk.breakdown,
      demand_by_sku: plan.demand_by_sku,
    }))
  } catch (err) {
    // 데이터 없어도 기본값 반환
    res.json(apiResponse({ total_milk_needed_l: 0, daily_to_factory_l: 0, daily_to_dairy_l: 550, breakdown: [] }))
  }
})

module.exports = router
