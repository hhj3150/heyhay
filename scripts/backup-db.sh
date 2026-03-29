#!/bin/bash
# ============================================================
# HEY HAY MILK ERP — PostgreSQL 자동 백업 스크립트
# 사용법: ./scripts/backup-db.sh
# crontab: 0 3 * * * /opt/heyhay-erp/scripts/backup-db.sh >> /var/log/heyhay-backup.log 2>&1
# ============================================================

set -euo pipefail

# 설정
BACKUP_DIR="${BACKUP_DIR:-/opt/heyhay-erp/backups}"
DB_CONTAINER="${DB_CONTAINER:-heyhay-erp-db-1}"
DB_NAME="${DB_NAME:-heyhay_erp}"
DB_USER="${DB_USER:-postgres}"
RETENTION_DAYS=30

# 타임스탬프
TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
FILENAME="heyhay_erp_${TIMESTAMP}.sql.gz"

echo "===== HEY HAY MILK ERP 백업 시작 ====="
echo "시간: $(date '+%Y-%m-%d %H:%M:%S')"
echo "파일: ${FILENAME}"

# 백업 디렉토리 생성
mkdir -p "${BACKUP_DIR}"

# Docker 컨테이너 내부에서 pg_dump 실행 + gzip 압축
if command -v docker &> /dev/null; then
  # Docker 환경
  docker exec "${DB_CONTAINER}" pg_dump \
    -U "${DB_USER}" \
    -d "${DB_NAME}" \
    --no-owner \
    --no-acl \
    --clean \
    --if-exists \
    | gzip > "${BACKUP_DIR}/${FILENAME}"
else
  # 로컬 PostgreSQL 환경
  pg_dump \
    -U "${DB_USER}" \
    -d "${DB_NAME}" \
    --no-owner \
    --no-acl \
    --clean \
    --if-exists \
    | gzip > "${BACKUP_DIR}/${FILENAME}"
fi

# 백업 크기 확인
FILESIZE=$(du -h "${BACKUP_DIR}/${FILENAME}" | cut -f1)
echo "완료: ${FILESIZE}"

# 오래된 백업 삭제 (30일 이상)
DELETED=$(find "${BACKUP_DIR}" -name "heyhay_erp_*.sql.gz" -mtime +${RETENTION_DAYS} -print -delete | wc -l)
if [ "${DELETED}" -gt 0 ]; then
  echo "정리: ${RETENTION_DAYS}일 이상 백업 ${DELETED}건 삭제"
fi

# 현재 백업 목록
echo ""
echo "현재 백업 목록:"
ls -lh "${BACKUP_DIR}"/heyhay_erp_*.sql.gz 2>/dev/null | tail -5
echo ""
echo "===== 백업 완료 ====="
