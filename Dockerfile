FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm install --include=dev

COPY . .

ENV NODE_ENV=production

EXPOSE 5000

CMD ["npm", "run", "start"]
