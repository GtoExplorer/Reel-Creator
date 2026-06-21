FROM node:20-bookworm-slim

WORKDIR /app

# socat forwards localhost:3000 to the host webapp when EXPLORER_URL points at a
# local /api/gto proxy. The remaining libraries support Remotion's headless
# renderer browser.
RUN apt-get update && apt-get install -y --no-install-recommends \
  ca-certificates \
  fonts-liberation \
  libasound2 \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libcups2 \
  libdrm2 \
  libgbm1 \
  libgtk-3-0 \
  libnss3 \
  libpangocairo-1.0-0 \
  libxcomposite1 \
  libxdamage1 \
  libxfixes3 \
  libxkbcommon0 \
  libxrandr2 \
  libxshmfence1 \
  socat \
  && rm -rf /var/lib/apt/lists/*

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
# public/reels/ at runtime (voice clips and generated assets the Player needs).
ENV PORT=4000
EXPOSE 4000
ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["npm", "run", "dev", "--", "-p", "4000", "-H", "0.0.0.0"]
