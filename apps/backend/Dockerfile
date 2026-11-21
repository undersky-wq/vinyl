FROM node:24-bookworm-slim AS base
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/*

FROM base AS deps
WORKDIR /app/apps/backend

COPY apps/backend/package.json apps/backend/package-lock.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app/apps/backend

COPY --from=deps /app/apps/backend/node_modules ./node_modules
COPY tsconfig.base.json /app/tsconfig.base.json
COPY apps/backend ./

RUN npm run prisma:generate
RUN npm run build

FROM base AS runner
WORKDIR /app/apps/backend
ARG SOURCE_REVISION=unknown
LABEL org.opencontainers.image.revision=$SOURCE_REVISION
ENV NODE_ENV=production
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg python3-venv wget \
    && rm -rf /var/lib/apt/lists/* \
    && python3 -m venv /opt/track-source \
    && /opt/track-source/bin/pip install --no-cache-dir 'yt-dlp[default]==2026.10.26' 'curl-cffi==0.17.0'
ENV TRACK_SOURCE_PYTHON=/opt/track-source/bin/python

COPY --from=builder /app/apps/backend/node_modules ./node_modules
COPY --from=builder /app/apps/backend/dist ./dist
COPY --from=builder /app/apps/backend/prisma ./prisma
COPY --from=builder /app/apps/backend/scripts ./scripts
COPY --from=builder /app/apps/backend/package.json ./package.json

# Schema changes are a separate deployment step, never a side effect of restart.
CMD ["node", "dist/main.js"]
