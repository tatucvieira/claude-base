FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --production

COPY . .

# Create persistent data directory
RUN mkdir -p /data

ENV NODE_ENV=production
ENV DATABASE_PATH=/data/fintrack.db

EXPOSE 3000

CMD ["node", "server.js"]
