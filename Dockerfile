FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Production image
FROM base AS runner
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NODE_ENV=production
EXPOSE ${PORT:-4000}

CMD ["bun", "run", "src/index.ts"]
