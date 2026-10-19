FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN DATABASE_URL=postgresql://build:build@localhost/build npx prisma generate --config prisma7.config.ts \
 && npx tsc

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json prisma7.config.ts ./
COPY prisma ./prisma
EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy --config prisma7.config.ts && node dist/server.js"]
