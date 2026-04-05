/**
 * @fileoverview 공개 라우터 인덱스 (인증 불필요)
 * /api/v1/public/* 하위 모든 라우트
 */
const express = require('express')

const router = express.Router()

router.use('/subscribe', require('./subscribe'))

module.exports = router
