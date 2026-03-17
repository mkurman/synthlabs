# ── Stage 1: Install dependencies ────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable pnpm && pnpm install --frozen-lockfile

# ── Stage 2: Build frontend ─────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN corepack enable pnpm && pnpm run build

# ── Stage 3: Frontend (nginx) ───────────────────────────────────────
FROM nginx:alpine AS frontend
COPY --from=builder /app/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80

# ── Stage 4: Backend (Node.js) ──────────────────────────────────────
FROM node:22-alpine AS backend
WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY server ./server
COPY plugins ./plugins
COPY constants.ts ./constants.ts
COPY interfaces ./interfaces
COPY services ./services
COPY utils ./utils

EXPOSE 8900
CMD ["node", "server/index.js"]
