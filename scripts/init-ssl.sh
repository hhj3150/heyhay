#!/bin/bash
# SSL 인증서 초기 발급 스크립트
# 사용법: DOMAIN=erp.heyhay.kr EMAIL=admin@d2o.kr bash scripts/init-ssl.sh
set -e

DOMAIN=${DOMAIN:-erp.heyhay.kr}
EMAIL=${EMAIL:-admin@d2o.kr}

echo "🔒 SSL 인증서 발급: ${DOMAIN}"

# 1. HTTP 서버 먼저 시작 (인증서 발급에 필요)
docker compose up -d nginx

# 2. 인증서 발급
docker compose run --rm certbot certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  --email "${EMAIL}" \
  --agree-tos \
  --no-eff-email \
  -d "${DOMAIN}"

echo "✅ 인증서 발급 완료"
echo ""
echo "다음 단계:"
echo "1. nginx/default.conf 에서 HTTPS 블록 주석 해제"
echo "2. server_name을 ${DOMAIN}으로 변경"
echo "3. docker compose restart nginx"
