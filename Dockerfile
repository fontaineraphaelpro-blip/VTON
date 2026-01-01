FROM node:18-alpine
RUN apk add --no-cache openssl

EXPOSE 3000

WORKDIR /app

ENV NODE_ENV=production

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies (Prisma is in dependencies, so it will be installed)
RUN npm ci --omit=dev && npm cache clean --force

# Copy Prisma schema
COPY prisma ./prisma

# Generate Prisma Client (needed for build)
RUN npx prisma generate

# Copy the rest of the app
COPY . .

# Build the app (Prisma Client is now available)
RUN npm run build

# Prisma Client is already generated and will be used at runtime
# The docker-start script will regenerate it anyway, but it should already be there

CMD ["npm", "run", "docker-start"]
