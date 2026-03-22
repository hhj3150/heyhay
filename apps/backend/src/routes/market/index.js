/**
 * @fileoverview 온라인 마켓 모듈 라우터 인덱스
 */
const express = require('express')
const router = express.Router()

router.use('/customers', require('./customers'))
router.use('/subscriptions', require('./subscriptions'))
router.use('/orders', require('./orders'))

module.exports = router
