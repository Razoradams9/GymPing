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

# Hosted copies use the lightweight WhatsApp link (no hidden browser), so they
# fit on small servers and no browser is installed here.
ENV NODE_ENV=production \
    PUPPETEER_SKIP_DOWNLOAD=1 \
    GYMPING_WA_ENGINE=light

WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev
COPY backend/ ./
COPY --from=dashboard /app/frontend/dist /app/frontend/dist

CMD ["node", "index.js"]
