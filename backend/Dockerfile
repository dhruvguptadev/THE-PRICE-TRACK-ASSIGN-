# Backend image for Render (Docker runtime).
# Docker instead of Render's native Node runtime: Playwright's Chromium needs system
# libraries that `--with-deps` can only install as root, which Docker builds allow.
FROM node:24-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Dependencies first for layer caching. postinstall runs `prisma generate`,
# which needs the schema and config (but no database connection).
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci

# Headless Chromium + its OS libraries (the server never runs a headed browser).
RUN npx playwright install --with-deps --only-shell chromium

COPY . .

# Render injects PORT; the app reads it (defaults to 3000 locally).
EXPOSE 3000
CMD ["node", "src/server.js"]
