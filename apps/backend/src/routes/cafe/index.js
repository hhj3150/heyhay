/**
 * @fileoverview 밀크카페 모듈 라우터 인덱스
 */
const express = require('express')
const router = express.Router()

router.use('/', require('./sales'))

module.exports = router
