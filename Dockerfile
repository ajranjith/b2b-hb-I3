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
RUN bun run build

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
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Set ownership
RUN chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 8181

ENV NODE_ENV=development
ENV PORT=8181
ENV AZURE_SSL=true
ENV AZURE_UPLOAD_MAX_CONN=5
ENV AZURE_CONNECTION_TIMEOUT_SECS=30
ENV AZURE_URL_EXPIRATION_SECS=none
ENV AZURE_OVERWRITE_FILES=false
ENV AZURE_CACHE_CONTROL=no-cache
ENV AZURE_ACCOUNT_NAME=stghbb2bdev1
ENV AZURE_CONTAINER=inbound

ENTRYPOINT ["./entrypoint.sh"]

CMD ["bun", "run", "start"]








