FROM node:18-alpine
RUN apk add --no-cache openssl

EXPOSE 3000

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json* ./

# Install all dependencies (including devDependencies) for build
RUN npm ci && npm cache clean --force

COPY . .

# Generate Prisma Client before building (required for build to succeed)
RUN npx prisma generate

# Set default env vars for build (SHOPIFY_APP_URL needed by vite.config.ts)
ENV SHOPIFY_APP_URL=${SHOPIFY_APP_URL:-http://localhost:3000}

# Build the application
RUN npm run build

# Remove dev dependencies after build to reduce image size
RUN npm ci --omit=dev && npm cache clean --force
# Remove CLI packages since we don't need them in production by default.
RUN npm remove @shopify/cli || true

CMD ["npm", "run", "docker-start"]
