# GymPing in one container: the dashboard plus the backend that sends reminders.

# 1. Build the dashboard.
FROM node:22-bookworm-slim AS dashboard
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# 2. The app itself.
FROM node:22-bookworm-slim

# The browser that drives WhatsApp Web, plus fonts so emoji render.
RUN apt-get update \
 && apt-get install -y --no-install-recommends chromium fonts-liberation fonts-noto-color-emoji ca-certificates \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PUPPETEER_SKIP_DOWNLOAD=1 \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev
COPY backend/ ./
COPY --from=dashboard /app/frontend/dist /app/frontend/dist

CMD ["node", "index.js"]
