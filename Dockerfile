# Use official Puppeteer image with Chrome and all dependencies pre-installed
FROM ghcr.io/puppeteer/puppeteer:22.12.1

# Environment variables
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable \
    NODE_ENV=production \
    PORT=3000

# Set working directory
WORKDIR /app

# Copy package files first for cached dependency installation
COPY --chown=pptruser:pptruser package*.json ./

# Install production dependencies
RUN npm ci --only=production || npm install --production

# Copy application source code
COPY --chown=pptruser:pptruser . .

# Expose port
EXPOSE 3000

# Start server
CMD ["node", "server.js"]
