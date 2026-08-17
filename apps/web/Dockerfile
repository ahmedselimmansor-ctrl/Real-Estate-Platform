# syntax=docker/dockerfile:1
# =============================================================================
# apps/web — Next.js 15 (App Router). Multi-stage:
#   base        → node runtime + workdir
#   deps        → node_modules (cached layer)
#   development → `next dev` on 0.0.0.0:3000 (target used by docker-compose)
#   builder     → `next build` with output: 'standalone'
#   production  → minimal standalone server, non-root
# =============================================================================

FROM node:26-alpine AS base
ENV NEXT_TELEMETRY_DISABLED=1
RUN apk add --no-cache libc6-compat curl
WORKDIR /app

# --------------------------------------------------------------------- deps --
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

# -------------------------------------------------------------- development --
FROM base AS development
ENV NODE_ENV=development
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV WATCHPACK_POLLING=true
ENV CHOKIDAR_USEPOLLING=true
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 3000
# docker-compose bind-mounts ./apps/web/src and ./apps/web/public over these paths.
CMD ["npm", "run", "dev"]

# ------------------------------------------------------------------ builder --
FROM base AS builder
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# --------------------------------------------------------------- production --
FROM base AS production
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 --ingroup nodejs nextjs

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --retries=10 --start-period=30s \
  CMD node -e "fetch('http://localhost:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
