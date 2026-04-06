/**
 * @fileoverview HEY HAY MILK ERP 백엔드 서버 엔트리포인트
 */
const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')
const env = require('./config/env')
const { notFound, errorHandler } = require('./middleware/errorHandler')
const { authenticate, authorizeModule } = require('./middleware/auth')

const app = express()

// --- 글로벌 미들웨어 ---
app.use(helmet())
app.use(cors({
  origin: (origin, callback) => {
    // 허용 목록: 로컬 + Netlify + 커스텀 도메인
    const allowed = [
      'http://localhost:5173',
      'http://localhost:3000',
      process.env.CORS_ORIGIN,
    ].filter(Boolean)

    // Netlify 배포 주소, 커스텀 도메인 허용
    if (!origin || allowed.includes(origin) ||
        origin.endsWith('.netlify.app') ||
        origin.endsWith('송영신목장.com') ||
        origin.includes('xn--')) {
      callback(null, true)
    } else if (process.env.NODE_ENV === 'production') {
      callback(new Error(`CORS 미허용 origin: ${origin}`))
    } else {
      callback(null, true) // 개발 환경에서만 전체 허용
    }
  },
  credentials: true,
}))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

// API 레이트 리밋: 15분 당 300회
app.use('/api/', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: { success: false, error: { code: 'RATE_LIMITED', message: '요청이 너무 많습니다. 잠시 후 다시 시도하세요.' } },
}))

// --- 라우트 ---
app.use('/api/v1/health', require('./routes/health'))
app.use('/api/v1/auth', require('./routes/auth'))

// 공개 엔드포인트 (랜딩 페이지 신청 등) — 엄격한 레이트 리밋
const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, error: { code: 'RATE_LIMITED', message: '요청이 너무 많습니다. 잠시 후 다시 시도하세요.' } },
})
app.use('/api/v1/public', publicLimiter, require('./routes/public'))

// 모듈별 라우트
app.use('/api/v1/farm', authenticate, authorizeModule('farm'), require('./routes/farm'))
app.use('/api/v1/factory', authenticate, authorizeModule('factory'), require('./routes/factory'))
app.use('/api/v1/market', authenticate, authorizeModule('market'), require('./routes/market'))
app.use('/api/v1/cafe', authenticate, authorizeModule('cafe'), require('./routes/cafe'))
app.use('/api/v1/packaging', authenticate, authorizeModule('factory'), require('./routes/packaging'))
app.use('/api/v1/dashboard', authenticate, authorizeModule('dashboard'), require('./routes/dashboard'))
app.use('/api/v1/settings', authenticate, authorizeModule('dashboard'), require('./routes/settings'))

// --- 에러 핸들링 ---
app.use(notFound)
app.use(errorHandler)

// --- 서버 시작 ---
if (require.main === module) {
  app.listen(env.port, () => {
    console.log(`[HEY HAY MILK ERP] 서버 시작: http://localhost:${env.port}`)
    console.log(`[환경] ${env.nodeEnv}`)

    // 자동 스케줄러 시작 (ENABLE_SCHEDULER=true 일 때만)
    const scheduler = require('./scheduler')
    scheduler.init()
  })
}

module.exports = app
