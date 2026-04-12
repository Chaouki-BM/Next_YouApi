# ---- Stage 1: Install dependencies ----
FROM node:20-alpine AS base

WORKDIR /app

# Copy package files first (better caching)
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production

# Copy all source code
COPY . .

# ---- Stage 2: Run the app ----
FROM node:20-alpine

WORKDIR /app

# Create a non-root user (security best practice)
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodeuser -u 1001

# Copy everything from stage 1
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app .

# Give ownership to our user
RUN chown -R nodeuser:nodejs /app
USER nodeuser

# Your app runs on port 5000
EXPOSE 5000

# Start the server
CMD ["node", "server.js"]