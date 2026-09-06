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

# Runtime stage — serve Vite static frontend. The production path is Vercel
# (api/gateway.ts serverless functions); this image is for local static preview
# only, so no API runtime is bundled.
FROM mirror.gcr.io/library/node:22-slim
WORKDIR /app
ENV NODE_ENV=production
RUN npm install -g serve@14 --no-audit --no-fund
COPY --from=builder /app/dist ./dist
EXPOSE 8080
CMD ["serve", "-s", "dist", "-l", "8080"]
