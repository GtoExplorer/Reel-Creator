# Pin to the Playwright image whose bundled browsers match the `playwright`
# package version in package.json. This is what kills the host path / version
# skew problem: the matching chromium + chrome-headless-shell ship in the image.
ARG PLAYWRIGHT_VERSION=1.61.0
FROM mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble

WORKDIR /app

# socat forwards localhost:3000 → the host webapp (see docker-entrypoint.sh).
RUN apt-get update && apt-get install -y --no-install-recommends socat && rm -rf /var/lib/apt/lists/*

# Install node deps (cached unless lockfile changes).
COPY package.json package-lock.json ./
RUN npm ci

# Bake Remotion's headless renderer browser into the image so the first MP4
# render doesn't have to download it at runtime.
RUN npx remotion browser ensure

# App source (node_modules, .next, out, public/reels, .env are .dockerignored).
COPY . .

# Normalise line endings (Windows host) + make the entrypoint executable.
RUN sed -i 's/\r$//' /app/docker-entrypoint.sh && chmod +x /app/docker-entrypoint.sh

# Run the studio in dev mode: unlike `next start`, dev serves files written to
# public/reels/ at runtime (the captured flowchart images + voice clips the
# Player needs), which is exactly how this app generates assets on the fly.
ENV PORT=4000
EXPOSE 4000
ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["npm", "run", "dev", "--", "-p", "4000", "-H", "0.0.0.0"]
