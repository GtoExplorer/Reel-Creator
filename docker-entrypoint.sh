#!/usr/bin/env bash
set -e

# Forward localhost:<port> inside the container to the host's webapp dev server.
# The headless browser must see the SAME origin it would on the host
# (http://localhost:3000), because the webapp runs `next dev` with Turbopack,
# whose HMR WebSocket is rejected over a different origin (host.docker.internal) —
# leaving the page unhydrated/blank and the flowchart capture with nothing to click.
TARGET_HOST="${WEBAPP_HOST:-host.docker.internal}"
TARGET_PORT="${WEBAPP_PORT:-3000}"

echo "↪ forwarding localhost:${TARGET_PORT} → ${TARGET_HOST}:${TARGET_PORT} (socat)"
socat TCP-LISTEN:${TARGET_PORT},fork,reuseaddr TCP:"${TARGET_HOST}":${TARGET_PORT} &

exec "$@"
