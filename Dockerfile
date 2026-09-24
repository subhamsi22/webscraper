# Use latest official Puppeteer image with modern Node (Node 22 LTS) and Chrome pre-installed
FROM ghcr.io/puppeteer/puppeteer:latest

# Environment variables
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable \
    NODE_ENV=production \
    PORT=3000

# Set working directory
WORKDIR /app

# Copy package files first for cached dependency installation
COPY --chown=pptruser:pptruser package*.json ./

# Install production dependencies cleanly without engine/config warnings
RUN npm install --omit=dev --no-audit --loglevel=error

# Copy application source code
COPY --chown=pptruser:pptruser . .

# Expose port
EXPOSE 3000

# Start server
CMD ["node", "server.js"]
