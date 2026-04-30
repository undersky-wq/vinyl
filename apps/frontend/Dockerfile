FROM node:24-alpine AS deps
WORKDIR /app/apps/frontend

COPY apps/frontend/package.json ./
RUN npm install

FROM node:24-alpine AS builder
WORKDIR /app/apps/frontend

COPY --from=deps /app/apps/frontend/node_modules ./node_modules
COPY apps/frontend ./

ARG NEXT_PUBLIC_API_URL
ARG API_URL_INTERNAL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV API_URL_INTERNAL=$API_URL_INTERNAL
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app/apps/frontend
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_API_URL
ARG API_URL_INTERNAL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV API_URL_INTERNAL=$API_URL_INTERNAL

COPY --from=builder /app/apps/frontend/node_modules ./node_modules
COPY --from=builder /app/apps/frontend/.next ./.next
COPY --from=builder /app/apps/frontend/public ./public
COPY --from=builder /app/apps/frontend/package.json ./package.json
COPY --from=builder /app/apps/frontend/next.config.ts ./next.config.ts

CMD ["npm", "run", "start"]
