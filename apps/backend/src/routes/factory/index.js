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

module.exports = router
