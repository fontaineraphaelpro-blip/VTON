FROM node:20-alpine
RUN apk add --no-cache openssl

EXPOSE 3000

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./

RUN npm ci --legacy-peer-deps && npm cache clean --force

COPY . .

RUN npx prisma generate

# vite.config.ts reads SHOPIFY_APP_URL at build time (override in Railway build args if needed)
ARG SHOPIFY_APP_URL=https://vton-production-890a.up.railway.app
ENV SHOPIFY_APP_URL=$SHOPIFY_APP_URL

RUN npm run build

RUN npm ci --omit=dev --legacy-peer-deps && npm cache clean --force
RUN npm remove @shopify/cli || true

CMD ["npm", "run", "docker-start"]
