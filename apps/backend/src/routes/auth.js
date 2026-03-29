/**
 * @fileoverview 인증 라우트 (로그인 / 토큰 갱신 / 비밀번호 변경)
 */
const express = require('express')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { z } = require('zod')
const env = require('../config/env')
const { query } = require('../config/database')
const { validate } = require('../middleware/validate')
const { authenticate } = require('../middleware/auth')
const { apiResponse, apiError } = require('../lib/shared')

const router = express.Router()

// --- 스키마 ---

const loginSchema = z.object({
  username: z.string().min(1, '아이디를 입력하세요'),
  password: z.string().min(1, '비밀번호를 입력하세요'),
})

const refreshSchema = z.object({
  refreshToken: z.string().min(1, '리프레시 토큰이 필요합니다'),
})

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, '현재 비밀번호를 입력하세요'),
  newPassword: z.string().min(8, '새 비밀번호는 8자 이상이어야 합니다'),
})

// --- 헬퍼 ---

/**
 * JWT 토큰 쌍 생성
 * @param {{ id: string, username: string, role: string, name: string }} payload
 * @returns {{ accessToken: string, refreshToken: string }}
 */
const generateTokens = (payload) => {
  const accessToken = jwt.sign(payload, env.jwt.secret, {
    expiresIn: env.jwt.expiresIn,
  })
  const refreshToken = jwt.sign(payload, env.jwt.refreshSecret, {
    expiresIn: env.jwt.refreshExpiresIn,
  })
  return { accessToken, refreshToken }
}

// --- 라우트 ---

/** POST /api/v1/auth/login */
router.post('/login', validate(loginSchema), async (req, res, next) => {
  try {
    const { username, password } = req.body

    const result = await query(
      'SELECT id, username, password_hash, role, name FROM users WHERE username = $1 AND deleted_at IS NULL',
      [username],
    )

    if (result.rows.length === 0) {
      return res.status(401).json(apiError('AUTH_FAILED', '아이디 또는 비밀번호가 잘못되었습니다'))
    }

    const user = result.rows[0]
    const isValid = await bcrypt.compare(password, user.password_hash)

    if (!isValid) {
      return res.status(401).json(apiError('AUTH_FAILED', '아이디 또는 비밀번호가 잘못되었습니다'))
    }

    const tokenPayload = {
      id: user.id,
      username: user.username,
      role: user.role,
      name: user.name,
    }

    const tokens = generateTokens(tokenPayload)

    // 리프레시 토큰 DB 저장
    await query(
      'UPDATE users SET refresh_token = $1, updated_at = NOW() WHERE id = $2',
      [tokens.refreshToken, user.id],
    )

    res.json(apiResponse({
      user: { id: user.id, username: user.username, role: user.role, name: user.name },
      ...tokens,
    }))
  } catch (err) {
    next(err)
  }
})

/** POST /api/v1/auth/refresh */
router.post('/refresh', validate(refreshSchema), async (req, res, next) => {
  try {
    const { refreshToken } = req.body

    let decoded
    try {
      decoded = jwt.verify(refreshToken, env.jwt.refreshSecret)
    } catch {
      return res.status(401).json(apiError('TOKEN_INVALID', '리프레시 토큰이 유효하지 않습니다'))
    }

    // DB에 저장된 리프레시 토큰과 비교
    const result = await query(
      'SELECT id, username, role, name FROM users WHERE id = $1 AND refresh_token = $2 AND deleted_at IS NULL',
      [decoded.id, refreshToken],
    )

    if (result.rows.length === 0) {
      return res.status(401).json(apiError('TOKEN_REVOKED', '리프레시 토큰이 폐기되었습니다'))
    }

    const user = result.rows[0]
    const tokenPayload = {
      id: user.id,
      username: user.username,
      role: user.role,
      name: user.name,
    }

    const tokens = generateTokens(tokenPayload)

    await query(
      'UPDATE users SET refresh_token = $1, updated_at = NOW() WHERE id = $2',
      [tokens.refreshToken, user.id],
    )

    res.json(apiResponse(tokens))
  } catch (err) {
    next(err)
  }
})

/** POST /api/v1/auth/change-password */
router.post('/change-password', authenticate, validate(changePasswordSchema), async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body

    const result = await query(
      'SELECT password_hash FROM users WHERE id = $1',
      [req.user.id],
    )

    if (result.rows.length === 0 || !result.rows[0].password_hash) {
      return res.status(400).json(apiError('USER_NOT_FOUND', '사용자를 찾을 수 없습니다'))
    }

    const isValid = await bcrypt.compare(currentPassword, result.rows[0].password_hash)
    if (!isValid) {
      return res.status(400).json(apiError('WRONG_PASSWORD', '현재 비밀번호가 잘못되었습니다'))
    }

    const newHash = await bcrypt.hash(newPassword, 12)
    await query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [newHash, req.user.id],
    )

    res.json(apiResponse({ message: '비밀번호가 변경되었습니다' }))
  } catch (err) {
    next(err)
  }
})

/** POST /api/v1/auth/logout */
router.post('/logout', authenticate, async (req, res, next) => {
  try {
    await query(
      'UPDATE users SET refresh_token = NULL, updated_at = NOW() WHERE id = $1',
      [req.user.id],
    )
    res.json(apiResponse({ message: '로그아웃 되었습니다' }))
  } catch (err) {
    next(err)
  }
})

module.exports = router
