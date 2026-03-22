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

CMD ["node", "apps/backend/src/index.js"]
