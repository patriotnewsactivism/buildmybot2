# Build stage — build the Vite frontend
FROM mirror.gcr.io/library/node:22-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build:client

# Runtime stage — serve API (tsx) + static frontend
FROM mirror.gcr.io/library/node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
RUN npm install --no-save express cookie-parser tsx
COPY --from=builder /app/dist ./dist
COPY api/ ./api/
COPY shared/ ./shared/
COPY constants.ts types.ts server.ts ./
EXPOSE 8080
CMD ["npx", "tsx", "server.ts"]
