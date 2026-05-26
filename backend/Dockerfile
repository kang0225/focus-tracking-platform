# syntax=docker/dockerfile:1.7

############################
# 1) deps — node_modules만 빌드
############################
FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# BuildKit 캐시 마운트: npm 캐시를 빌드 간 재사용
RUN --mount=type=cache,target=/root/.npm \
    npm ci --include=optional

############################
# 2) builder — Next.js 빌드
############################
FROM node:20-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

############################
# 3) runner — 최종 이미지
############################
FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# Next.js standalone 출력만 복사 (전체 node_modules 안 가져옴)
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# onnxruntime-node 같은 native 모듈은 standalone이 못 잡아낼 수 있어
# 보강용으로 facephys weights도 명시 복사
COPY --from=builder /app/facephys ./facephys

EXPOSE 3000
CMD ["node", "server.js"]