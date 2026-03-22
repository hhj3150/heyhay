/**
 * @fileoverview 공장 관리 모듈 라우터 인덱스
 * /api/v1/factory 하위 모든 라우트 통합
 */
const express = require('express')

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
    res.json({ success: true, data: plan, meta: {} })
  } catch (err) {
    next(err)
  }
})

module.exports = router
