# Build stage
FROM oven/bun:1-alpine AS builder

WORKDIR /app

# Copy package files
COPY HB_Backend/api/package.json HB_Backend/api/bun.lock* ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY HB_Backend/api/ ./

# Generate Prisma client
RUN bunx prisma generate

# Build the application
RUN bun build src/index.ts --outdir=dist --target=bun --minify

# Production stage
FROM oven/bun:1-alpine AS runner

WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy built files and dependencies
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/generated ./generated
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/prisma ./prisma

# Set ownership
RUN chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 80

ENV NODE_ENV=production
ENV PORT=80

CMD ["bun", "run", "dist/index.js"]

