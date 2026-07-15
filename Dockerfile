# ---- 前端 build ----
FROM node:22-alpine AS webbuild
WORKDIR /app/web
COPY web/package*.json ./
RUN npm install
COPY web/ ./
RUN npm run build

# ---- 後端 build ----
FROM node:22-alpine AS serverbuild
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY tsconfig.json ./
COPY server/ server/
RUN npm run build:server && npm prune --omit=dev

# ---- 執行 ----
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    CONFIG_PATH=/app/data/config.json
COPY --from=serverbuild /app/node_modules node_modules
COPY --from=serverbuild /app/dist dist
COPY --from=webbuild /app/web/dist web/dist
EXPOSE 3000
CMD ["node", "dist/index.js"]
