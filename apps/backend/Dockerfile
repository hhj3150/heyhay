FROM node:20-alpine

WORKDIR /app

# 모노레포 루트 package.json + 워크스페이스
COPY package.json package-lock.json* ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/backend/package.json ./apps/backend/

RUN npm install --workspace=apps/backend --workspace=packages/shared

COPY packages/shared/ ./packages/shared/
COPY apps/backend/ ./apps/backend/

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/api/v1/health || exit 1

CMD ["node", "apps/backend/src/index.js"]
