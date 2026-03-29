FROM node:22-slim AS builder
WORKDIR /app
COPY package.json ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npx tsc

FROM mcr.microsoft.com/playwright:v1.50.0-noble
RUN apt-get update && apt-get install -y dumb-init && rm -rf /var/lib/apt/lists/*
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
RUN groupadd -r scraper && useradd -r -g scraper -G audio,video scraper \
    && mkdir -p /home/scraper /app/data && chown -R scraper:scraper /home/scraper /app
USER scraper
ENV CHROMIUM_FLAGS="--disable-dev-shm-usage --no-sandbox --disable-setuid-sandbox --disable-gpu"
EXPOSE 3001
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
