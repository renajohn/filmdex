# Stage 1: Build frontend
FROM node:20-alpine AS frontend-builder

WORKDIR /build

# Install frontend dependencies
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm ci --legacy-peer-deps

# Copy frontend source and build
COPY frontend/ ./frontend/
RUN cd frontend && npm run build

# Stage 2: Production image
FROM node:20-alpine

# Install build dependencies for native modules (sqlite3)
RUN apk add --no-cache python3 make g++ sqlite-dev

WORKDIR /app

# Install backend dependencies
COPY backend/package*.json ./backend/
RUN cd backend && npm install --omit=dev

# Copy backend source
COPY backend/index.js ./backend/
COPY backend/src/ ./backend/src/
COPY backend/migrations/ ./backend/migrations/

# Copy frontend builds from stage 1 (identical for normal and ingress)
COPY --from=frontend-builder /build/frontend/build/ ./frontend/
COPY --from=frontend-builder /build/frontend/build/ ./frontend-ingress/

# Copy deployment config
COPY deployment.prod.json ./deployment.json

# Create data directory
RUN mkdir -p /data

# Expose port
EXPOSE 3001

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

# Start the application
CMD ["node", "backend/index.js"]
