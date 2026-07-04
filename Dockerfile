FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./n
RUN npm ci

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build:client
RUN npm run build:server

FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
COPY --from=build /app/public ./public
COPY --from=build /app/index.html ./index.html
EXPOSE 5000
CMD ["npm", "run", "start"]
