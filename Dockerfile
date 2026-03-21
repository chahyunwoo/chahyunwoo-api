FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# ─── Dependencies ─────────────────────────────────────────────────────────────
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# ─── Build ────────────────────────────────────────────────────────────────────
FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm db:generate
RUN pnpm build

# ─── Runtime ──────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
RUN corepack enable
WORKDIR /app

COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/prisma ./prisma
COPY package.json ./
COPY prisma.config.ts ./
COPY scripts/start.sh ./scripts/start.sh
RUN chmod +x ./scripts/start.sh

ENV NODE_ENV=production
EXPOSE 8000

CMD ["/bin/sh", "scripts/start.sh"]
