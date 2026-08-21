# PharmaBridge production image — multi-stage, Next.js standalone output.
# Build:  docker build -t pharmabridge .
# Run:    docker run -p 3000:3000 --env-file <prod-env> pharmabridge
# Migrations run as a separate release step (npx prisma migrate deploy),
# never inside the app container at boot (docs PART L).

FROM node:24-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --ignore-scripts && npx prisma generate

FROM node:24-slim AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Build-time env: DATABASE_URL is only read at runtime; a placeholder keeps
# the zod env validation satisfied during static analysis.
ENV NODE_ENV=production
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
RUN npm run build

FROM node:24-slim AS runner
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/* \
  && groupadd -r nodejs && useradd -r -g nodejs nextjs
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
# Runtime data the file tracer cannot always see:
COPY --from=builder --chown=nextjs:nodejs /app/messages ./messages
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
