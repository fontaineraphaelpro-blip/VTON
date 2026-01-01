FROM node:18-alpine
RUN apk add --no-cache openssl

EXPOSE 3000

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json* ./

# Install all dependencies (including dev) to get Prisma CLI
RUN npm ci && npm cache clean --force

# Copy Prisma schema before generating client
COPY prisma ./prisma

# Generate Prisma Client
RUN npx prisma generate

# Now copy the rest of the app
COPY . .

# Build the app (Prisma Client is now available)
RUN npm run build

# Remove dev dependencies after build, but keep Prisma for migrations
RUN npm ci --omit=dev && npm cache clean --force

# Regenerate Prisma Client after reinstalling (it's needed at runtime)
RUN npx prisma generate

# Remove CLI packages since we don't need them in production by default.
# Remove this line if you want to run CLI commands in your container.
RUN npm remove @shopify/cli || true

CMD ["npm", "run", "docker-start"]
