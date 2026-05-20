FROM node:20-alpine
RUN apk add --no-cache openssl

WORKDIR /app
ENV NODE_ENV=production

# Dependencies layer (cached until package-lock changes)
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps && npm cache clean --force

# Railway injects RAILWAY_GIT_COMMIT_SHA on each deploy — busts COPY/build cache
ARG RAILWAY_GIT_COMMIT_SHA=unknown
ARG SHOPIFY_APP_URL=https://vton-production-890a.up.railway.app
ENV SHOPIFY_APP_URL=$SHOPIFY_APP_URL
ENV RAILWAY_GIT_COMMIT_SHA=$RAILWAY_GIT_COMMIT_SHA
ENV APP_BUILD_ID=$RAILWAY_GIT_COMMIT_SHA

COPY . .

RUN npx prisma generate && npm run build

RUN npm ci --omit=dev --legacy-peer-deps && npm cache clean --force
RUN npm remove @shopify/cli || true

EXPOSE 3000
CMD ["npm", "run", "docker-start"]
