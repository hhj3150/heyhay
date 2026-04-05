/**
 * @fileoverview 온라인 마켓 모듈 라우터 인덱스
 */
const express = require('express')
const router = express.Router()

router.use('/customers', require('./customers'))
router.use('/subscriptions', require('./subscriptions'))
router.use('/orders', require('./orders'))
router.use('/b2b', require('./b2bPartners'))
router.use('/checklist', require('./checklist'))
router.use('/naver', require('./naverSync'))
router.use('/sms', require('./sms'))

module.exports = router
