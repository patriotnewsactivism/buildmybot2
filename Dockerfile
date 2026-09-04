# Build stage — build the Vite frontend
FROM mirror.gcr.io/library/node:22-slim AS builder
WORKDIR /app
COPY package*.json ./
# package-lock currently resolves @vitejs/plugin-react 4.x alongside Vite 8.
# The plugin works for the existing build, but its older peer range causes npm 10
# to fail strict resolution inside a clean container. Keep deployment reproducible
# while the frontend dependency upgrade is handled separately.
RUN npm ci --legacy-peer-deps
COPY . .
RUN npm run build:client

# Runtime stage — serve API (tsx) + static frontend
FROM mirror.gcr.io/library/node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev --legacy-peer-deps
COPY --from=builder /app/dist ./dist
COPY api/ ./api/
COPY shared/ ./shared/
COPY constants.ts types.ts server.ts ./
EXPOSE 8080
CMD ["npx", "tsx", "server.ts"]
