# syntax=docker/dockerfile:1.7
FROM node:22.22-alpine AS auth-build
WORKDIR /workspace/authentication
COPY authentication/package.json authentication/package-lock.json ./
RUN npm ci
COPY authentication/app.js ./app.js
RUN npm run build:app

FROM node:22.22-alpine AS backend-deps
WORKDIR /workspace/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:22.22-alpine AS runtime
ENV NODE_ENV=production PORT=5000
WORKDIR /app
RUN addgroup -S notin && adduser -S -G notin notin
COPY --from=backend-deps /workspace/backend/node_modules ./backend/node_modules
COPY backend ./backend
COPY authentication ./authentication
COPY --from=auth-build /workspace/authentication/app.bundle.js ./authentication/app.bundle.js
RUN mkdir -p /app/backend/uploads && chown -R notin:notin /app
USER notin
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:5000/health >/dev/null || exit 1
WORKDIR /app/backend
CMD ["node", "src/server.js"]
