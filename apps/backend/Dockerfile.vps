FROM node:20-alpine

WORKDIR /app

# package.json 복사 + 프로덕션 의존성만 설치
COPY apps/backend/package.json ./
RUN npm install --production --no-audit --no-fund

# 소스 코드 복사
COPY apps/backend/src ./src

EXPOSE 3001

CMD ["node", "src/index.js"]
