# HEY HAY MILK 통합 ERP — Claude Code 작업 지침
## 프로젝트 개요
송영신목장(A2 저지 60두+) → D2O 농업회사법인(유가공) → 안성팜랜드 밀크카페 +
온라인 스마트스토어/자사몰로 이어지는 Farm-to-Consumer ERP 시스템.
## 사업 구조 (코드 작성 시 항상 참고)
- 원유 생산: 송영신목장 / 일 착유량 ~145L → D2O 공장 투입
- 낙농진흥회 납유: 쿼터 200L/일 → ERP 제외 (별도 집계)
- 유가공: D2O 농업회사법인 / 경기도청 허가 / 300L hr 설비
- 판매 채널 3개: ①온라인(스마트스토어+자사몰) ②안성팜랜드 카페(위탁) ③B2B
- 배아 수출(㈜제네틱스) 연동: 공란우 선발 데이터 활용
## SKU 목록 (6종)
1. A2 저지우유 750ml
2. A2 저지우유 180ml
3. 발효유 500ml
4. 발효유 180ml
5. 소프트아이스크림 (즉석제조)
6. 카이막 100g
## 핵심 공정 (CCP 자동 기록 필수)
원유수령 → 품질검사 → 크림분리 → 바켓여과(80→120mesh) →
살균 CCP1(HTST 72°C/15초) → 균질(APV Rannie 5) → 냉각 →
여과 CCP2(120mesh) → 충진 / 카이막: 별도탱크 85~90°C
## 기술 스택
- Frontend: React 18 + Vite + TailwindCSS + shadcn/ui + Recharts + Zustand
- Backend: Node.js 20 + Express.js + PostgreSQL 16 + TimescaleDB + Redis
- Auth: JWT (access 15분 / refresh 7일)
- 외부 연동: smaXtec Cloud API, Naver Commerce API
- AI: Claude Sonnet API (이상 감지·자연어 보고)
- 배포: Docker + Nginx on VPS
## 데이터베이스 원칙
- 착유량·센서 시계열 데이터: TimescaleDB hypertable 사용
- 모든 테이블에 created_at, updated_at, deleted_at(soft delete) 포함
- 개체 ID: cow_id (UUID), 배치 ID: batch_id (YYYYMMDD-SKU-seq)
## 코딩 컨벤션
- 언어: JavaScript (JSDoc으로 타입 명시) — TypeScript 전환은 Phase 5
- API 응답 형식: { success: true, data: {}, meta: {} }
- 에러 응답: { success: false, error: { code, message } }
- 라우트 네이밍: /api/v1/{module}/{resource}
- 환경변수: .env 파일, 절대 하드코딩 금지
## 4개 모듈 (라우트 prefix)
- /api/v1/farm      ← 목장 관리 (개체·착유·번식·건강·센서)
- /api/v1/factory   ← 공장 관리 (원유입고·공정·생산·재고·원가)
- /api/v1/market    ← 온라인 마켓 (주문·구독·고객·채널)
- /api/v1/cafe      ← 밀크카페 (POS·정산·재고)
- /api/v1/dashboard ← 통합 대시보드
## 사용자 역할
- ADMIN: 하원장님 (전체 접근 + 재무)
- FACTORY: 공장 담당자 (공장+재고)
- CAFE: 카페 담당자 (카페+재고조회)
- FARM: 목장 작업자 (착유입력+목장)
## 알림 우선순위
- P1 (즉시): CCP 이탈, 착유량 -25% 이상
- P2 (1시간내): 재고 안전선 이하, 결제 실패
- P3 (당일): 분만예정 D-7, 인증 만료 D-30
## 현재 Phase
Phase 0: 기반 구축 (DB 스키마, 인증, 프로젝트 구조)
## 작업 요청 방식
- 항상 전체 파일 단위로 생성
- 주석은 한국어로 작성
- 테스트 파일도 함께 생성 (Jest)
- DB 마이그레이션은 /apps/backend/migrations/ 에 날짜_설명.sql 형식
