# sisfin-api (TO-BE): NestJS + Prisma
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json tsconfig.build.json ./
COPY prisma ./prisma
RUN npx prisma generate
COPY src ./src
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm i --no-save prisma@6.19.3
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/dist ./dist
COPY prisma ./prisma
# Volume de arquivos (logos — ADR-010): criado aqui para o volume nomeado nascer com o dono certo. A API roda sem root.
RUN mkdir -p /data/arquivos/banks/imagens && chown -R node:node /data/arquivos
USER node
EXPOSE 3000
# Aplica as migrations e sobe a API
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
