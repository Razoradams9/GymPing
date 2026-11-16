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

ENV NODE_ENV=production

WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev
COPY backend/ ./
COPY --from=dashboard /app/frontend/dist /app/frontend/dist

CMD ["node", "index.js"]
