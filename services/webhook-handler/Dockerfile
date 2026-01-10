# Webhook Handler Dockerfile
# Built from project root: docker build -f services/webhook-handler/Dockerfile .

FROM node:24-slim AS builder

# Version passed at build time
ARG APP_VERSION=development

WORKDIR /app

# Copy shared types first
COPY shared/ ./shared/

# Copy service files
COPY services/webhook-handler/package*.json ./services/webhook-handler/
WORKDIR /app/services/webhook-handler

# Install all dependencies
RUN npm ci

# Copy service source
COPY services/webhook-handler/ ./

# Build TypeScript
RUN npm run build

# Production stage
FROM node:24-slim

ARG APP_VERSION=development

WORKDIR /app

# Copy built application (dist contains the compiled JS including shared)
COPY --from=builder /app/services/webhook-handler/dist ./dist
COPY --from=builder /app/services/webhook-handler/package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Set environment
ENV NODE_ENV=production
ENV PORT=8080
ENV APP_VERSION=${APP_VERSION}

# Expose port
EXPOSE 8080

# Run the application
CMD ["node", "dist/services/webhook-handler/src/index.js"]
