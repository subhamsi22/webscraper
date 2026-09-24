#!/usr/bin/env bash
# Exit immediately if a command exits with a non-zero status
set -o errexit

npm install

# Download Chrome binary into Render cache if running as native Node service
echo "Installing Chrome for Puppeteer..."
PUPPETEER_CACHE_DIR=/opt/render/project/src/.cache/puppeteer npx puppeteer browsers install chrome
