#!/bin/bash
# ============================================================
# HEY HAY MILK ERP — VPS 배포 스크립트
# Ubuntu 22.04 서버에서 실행
#
# 사용법:
#   1. VPS 서버에 SSH 접속
#   2. 이 스크립트 실행: bash deploy.sh
# ============================================================

set -e

echo "==================================="
echo " HEY HAY MILK ERP 배포 시작"
echo "==================================="

# 1. 시스템 업데이트 + Docker 설치
echo "[1/6] 시스템 업데이트..."
apt-get update -y && apt-get upgrade -y

if ! command -v docker &> /dev/null; then
  echo "[1/6] Docker 설치..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
fi

if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
  echo "[1/6] Docker Compose 설치..."
  apt-get install -y docker-compose-plugin
fi

# 2. 프로젝트 클론
echo "[2/6] 프로젝트 클론..."
cd /opt
if [ -d "heyhay-erp" ]; then
  cd heyhay-erp && git pull
else
  git clone https://github.com/hhj3150/heyhay.git heyhay-erp
  cd heyhay-erp
fi

# 3. 환경변수 설정
echo "[3/6] 환경변수 설정..."
if [ ! -f .env ]; then
  cp .env.example .env
  # JWT 시크릿 자동 생성
  JWT_SECRET=$(openssl rand -hex 32)
  JWT_REFRESH_SECRET=$(openssl rand -hex 32)
  sed -i "s|your-jwt-secret-change-me-32chars-min|${JWT_SECRET}|g" .env
  sed -i "s|your-refresh-secret-change-me-32chars|${JWT_REFRESH_SECRET}|g" .env
  echo "⚠️  .env 파일이 생성되었습니다. 네이버 API 키 등은 직접 편집하세요:"
  echo "   nano /opt/heyhay-erp/.env"
fi

# 4. 프론트엔드 빌드
echo "[4/6] 프론트엔드 빌드..."
if command -v node &> /dev/null; then
  npm install && npm run build
else
  # Node 없으면 Docker로 빌드
  docker run --rm -v $(pwd):/app -w /app node:20-alpine sh -c "npm install && npm run build"
fi

# 5. Docker Compose 실행
echo "[5/6] Docker Compose 실행..."
docker compose down 2>/dev/null || true
docker compose up -d --build

# 6. 상태 확인
echo "[6/6] 상태 확인..."
sleep 10
docker compose ps

echo ""
echo "==================================="
echo " 배포 완료!"
echo "==================================="
echo ""
echo " 접속 주소: http://$(curl -s ifconfig.me)"
echo " 로그인: admin / admin1234"
echo ""
echo " ⚠️  반드시 비밀번호 변경하세요!"
echo " ⚠️  도메인 연결 후 SSL 설정:"
echo "     nano /opt/heyhay-erp/nginx/default.conf"
echo "     → HTTPS 섹션 주석 해제"
echo "==================================="
