#!/usr/bin/env bash
set -e

# Forward localhost:<port> inside the container to the host's webapp dev server.
# This is only needed when EXPLORER_URL points at localhost so solver data can
# use the webapp's /api/gto proxy from inside Docker.
TARGET_HOST="${WEBAPP_HOST:-host.docker.internal}"
TARGET_PORT="${WEBAPP_PORT:-3000}"

echo "forwarding localhost:${TARGET_PORT} -> ${TARGET_HOST}:${TARGET_PORT} (socat)"
socat TCP-LISTEN:${TARGET_PORT},fork,reuseaddr TCP:"${TARGET_HOST}":${TARGET_PORT} &

exec "$@"
