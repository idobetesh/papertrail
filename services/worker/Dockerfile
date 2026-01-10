# Worker Service Dockerfile
# Built from project root: docker build -f services/worker/Dockerfile .

FROM node:24-slim AS builder

# Version passed at build time
ARG APP_VERSION=development

WORKDIR /app

# Copy shared types first
COPY shared/ ./shared/

# Copy service files
COPY services/worker/package*.json ./services/worker/
WORKDIR /app/services/worker

# Install all dependencies
RUN npm ci

# Copy service source
COPY services/worker/ ./

# Build TypeScript
RUN npm run build

# Production stage
FROM node:24-slim

ARG APP_VERSION=development

WORKDIR /app

# Copy built application (dist contains the compiled JS including shared)
COPY --from=builder /app/services/worker/dist ./dist
COPY --from=builder /app/services/worker/package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Set environment
ENV NODE_ENV=production
ENV PORT=8080
ENV APP_VERSION=${APP_VERSION}

# Expose port
EXPOSE 8080

# Run the application
CMD ["node", "dist/services/worker/src/index.js"]
