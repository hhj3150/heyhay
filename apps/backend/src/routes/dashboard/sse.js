/**
 * @fileoverview SSE (Server-Sent Events) 실시간 알림
 * GET /api/v1/dashboard/sse?token=<access_token> — 클라이언트 SSE 연결
 * broadcastAlert(alert) — 모든 연결된 클라이언트에 알림 push
 *
 * 참고: EventSource API는 Authorization 헤더 설정 불가 → 쿼리스트링으로 토큰 전달
 */
const express = require('express')
const jwt = require('jsonwebtoken')
const env = require('../../config/env')

const router = express.Router()

// 연결된 SSE 클라이언트 관리
const clients = new Map()
let clientIdSeq = 0

/**
 * 모든 연결된 클라이언트에 알림 브로드캐스트
 * @param {Object} alert - { priority, alert_type, title, message, module }
 */
const broadcastAlert = (alert) => {
  const data = JSON.stringify(alert)
  const deadClients = []

  clients.forEach((res, id) => {
    try {
      res.write(`event: alert\ndata: ${data}\n\n`)
    } catch {
      deadClients.push(id)
    }
  })

  // 끊어진 연결 정리
  for (const id of deadClients) {
    clients.delete(id)
  }
}

/** GET / — SSE 연결 (쿼리스트링 토큰 인증) */
router.get('/', (req, res) => {
  // EventSource는 헤더 설정 불가 → ?token=<jwt> 방식으로 인증
  const token = req.query.token
  if (!token) {
    return res.status(401).json({ success: false, error: { code: 'AUTH_REQUIRED', message: '토큰이 필요합니다' } })
  }
  try {
    jwt.verify(token, env.jwt.secret)
  } catch {
    return res.status(401).json({ success: false, error: { code: 'TOKEN_INVALID', message: '유효하지 않은 토큰입니다' } })
  }

  // SSE 헤더 설정
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // Nginx 버퍼링 비활성화
  })

  // 초기 연결 확인 이벤트
  res.write(`event: connected\ndata: ${JSON.stringify({ message: '알림 연결됨' })}\n\n`)

  // 클라이언트 등록
  const id = ++clientIdSeq
  clients.set(id, res)

  // 30초 heartbeat (연결 유지)
  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n')
    } catch {
      clearInterval(heartbeat)
      clients.delete(id)
    }
  }, 30000)

  // 연결 종료 시 정리
  req.on('close', () => {
    clearInterval(heartbeat)
    clients.delete(id)
  })
})

/** 현재 연결 수 조회 (디버깅용) */
const getClientCount = () => clients.size

module.exports = { router, broadcastAlert, getClientCount }
