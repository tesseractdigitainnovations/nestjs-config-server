
# ---- Builder ----
FROM node:20-alpine AS builder

# Install pnpm (use --no-fund --no-optional for smaller install)
RUN npm install -g pnpm --no-fund --no-optional

WORKDIR /app

# Only copy dependency files first for cache efficiency
COPY package.json pnpm-lock.yaml ./

# Install all dependencies
RUN pnpm install --frozen-lockfile --no-optional

# Copy source code
COPY . .

# Build the project
RUN pnpm run build

# ---- Production ----
FROM node:20-alpine

# Set environment for production
ENV NODE_ENV=production

# Install pnpm (use --no-fund --no-optional for smaller install)
RUN npm install -g pnpm --no-fund --no-optional

WORKDIR /app

# Copy only production dependencies
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile --no-optional

# Copy built files from builder and any other necessary files like configs
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/configs ./configs


# Optionally copy .env.example for reference
COPY --from=builder /app/.env.* ./

# Expose port
EXPOSE 3333

# Limit RAM usage (Node.js memory limit)
ENV NODE_OPTIONS="--max-old-space-size=128"

# Start the app
CMD ["node", "dist/main.js"]