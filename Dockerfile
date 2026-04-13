FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY . .
RUN npm run build

ENTRYPOINT ["node", "dist/index.js", "mcp", "start"]
