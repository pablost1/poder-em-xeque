# Imagem de produção do Poder em Xeque. O banco NÃO vai na imagem: monte um volume em /data com congresso.db.
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV NEXT_STANDALONE=1 NEXT_TELEMETRY_DISABLED=1 CONGRESSO_DB=/tmp/build.db
RUN npm run build

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 CONGRESSO_DB=/data/congresso.db
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
VOLUME ["/data"]
EXPOSE 3000
CMD ["node", "server.js"]
