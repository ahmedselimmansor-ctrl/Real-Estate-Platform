# syntax=docker/dockerfile:1
# =============================================================================
# TopChoice — api-core (NestJS 11)
#   development : hot-reloading dev server (target used by docker-compose)
#   production  : compiled dist, non-root user
# =============================================================================

FROM node:22-bookworm-slim AS base
ENV NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false
# openssl: Prisma query engine · python3/make/g++: argon2 native fallback build
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates openssl python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# --------------------------------------------------------------- dependencies
FROM base AS deps
COPY package.json ./
RUN npm install --no-audit --no-fund

# ---------------------------------------------------------------- development
FROM base AS development
ENV NODE_ENV=development
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN chmod +x /app/docker-entrypoint.sh
EXPOSE 4000
# The entrypoint runs `prisma generate` + `prisma migrate deploy` (tolerating a
# not-yet-ready database) before handing over to the dev server.
ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["npm", "run", "start:dev"]

# ---------------------------------------------------------------------- build
FROM deps AS build
ENV NODE_ENV=development
COPY . .
RUN npx prisma generate \
    && npm run build \
    && npm prune --omit=dev \
    && npx prisma generate

# ----------------------------------------------------------------- production
FROM node:22-bookworm-slim AS production
ENV NODE_ENV=production \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --chown=node:node docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=10 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]
