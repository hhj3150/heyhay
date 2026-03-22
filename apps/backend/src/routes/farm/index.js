/**
 * @fileoverview 목장 관리 모듈 라우터 인덱스
 * /api/v1/farm 하위 모든 라우트 통합
 */
const express = require('express')

const router = express.Router()

router.use('/animals', require('./animals'))
router.use('/milking', require('./milking'))
router.use('/breeding', require('./breeding'))
router.use('/health', require('./health'))
router.use('/feed', require('./feed'))

module.exports = router
