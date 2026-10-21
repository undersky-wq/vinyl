FROM node:24-alpine AS deps
WORKDIR /app/apps/backend

COPY apps/backend/package.json apps/backend/package-lock.json ./
RUN npm ci

FROM node:24-alpine AS builder
WORKDIR /app/apps/backend

COPY --from=deps /app/apps/backend/node_modules ./node_modules
COPY tsconfig.base.json /app/tsconfig.base.json
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
COPY --from=builder /app/apps/backend/scripts ./scripts
COPY --from=builder /app/apps/backend/package.json ./package.json

# Schema changes are a separate deployment step, never a side effect of restart.
CMD ["node", "dist/main.js"]
