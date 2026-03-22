/**
 * @fileoverview 헬스체크 라우트
 */
const express = require('express')
const { healthCheck } = require('../config/database')
const { apiResponse, apiError } = require('@heyhay/shared')

const router = express.Router()

/** GET /api/v1/health */
router.get('/', async (req, res) => {
  const dbOk = await healthCheck()

  if (!dbOk) {
    return res.status(503).json(apiError('DB_DOWN', '데이터베이스 연결 실패'))
  }

  res.json(apiResponse({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  }))
})

module.exports = router
