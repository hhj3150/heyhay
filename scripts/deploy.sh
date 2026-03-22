#!/bin/bash
# HEY HAY MILK ERP — VPS 배포 스크립트
# 사용법: bash scripts/deploy.sh
set -e

echo "🥛 HEY HAY MILK ERP 배포 시작"

# 1. 최신 코드 Pull
echo "📥 코드 업데이트..."
git pull origin main

# 2. 프론트엔드 빌드
echo "🔨 프론트엔드 빌드..."
npm run build --workspace=apps/frontend

# 3. Docker 이미지 빌드 + 서비스 재시작
echo "🐳 Docker 빌드 + 재시작..."
docker compose build backend
docker compose up -d

# 4. 헬스체크 대기
echo "⏳ 서버 시작 대기..."
for i in $(seq 1 30); do
  if curl -sf http://localhost:3001/api/v1/health > /dev/null 2>&1; then
    echo "✅ 백엔드 정상 (${i}초)"
    break
  fi
  sleep 1
done

# 5. 최종 상태 확인
echo ""
echo "=== 서비스 상태 ==="
docker compose ps
echo ""
echo "=== 헬스체크 ==="
curl -s http://localhost:3001/api/v1/health | python3 -m json.tool
echo ""
echo "🎉 배포 완료!"
