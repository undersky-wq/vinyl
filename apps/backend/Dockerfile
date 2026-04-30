FROM node:24-alpine AS deps
WORKDIR /app/apps/backend
RUN apk add --no-cache ffmpeg

COPY apps/backend/package.json ./
RUN npm install

FROM node:24-alpine AS builder
WORKDIR /app/apps/backend
RUN apk add --no-cache ffmpeg

COPY --from=deps /app/apps/backend/node_modules ./node_modules
COPY apps/backend ./

RUN npm run prisma:generate
RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app/apps/backend
ENV NODE_ENV=production
RUN apk add --no-cache ffmpeg

COPY --from=builder /app/apps/backend/node_modules ./node_modules
COPY --from=builder /app/apps/backend/dist ./dist
COPY --from=builder /app/apps/backend/prisma ./prisma
COPY --from=builder /app/apps/backend/package.json ./package.json

CMD ["sh", "-c", "npm run prisma:push && node dist/main.js"]
